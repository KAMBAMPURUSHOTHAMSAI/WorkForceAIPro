from pathlib import Path
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.employee import Employee
from app.models.employee_document import EmployeeDocument
from app.schemas.document import DocumentResponse


router = APIRouter(prefix="/documents", tags=["Documents"])

STORAGE_DIR = Path(__file__).resolve().parents[4] / "storage" / "documents"
MAX_FILE_SIZE = 5 * 1024 * 1024

ALLOWED_TYPES = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
}


def check_file_signature(extension: str, content: bytes) -> bool:
    if extension == ".pdf":
        return content.startswith(b"%PDF-")
    if extension == ".png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in {".jpg", ".jpeg"}:
        return content.startswith(b"\xff\xd8\xff")
    return False


def get_employee_for_user(db: Session, user_id: int):
    return (
        db.query(Employee)
        .filter(Employee.user_id == user_id)
        .first()
    )


def get_document_access(
    document: EmployeeDocument,
    current_user,
    db: Session,
):
    if current_user.role in {"ADMIN", "HR"}:
        return True

    employee = get_employee_for_user(db, current_user.id)

    if employee and employee.id == document.employee_id:
        return True

    if current_user.role == "MANAGER" and employee:
        target = db.get(Employee, document.employee_id)
        return target is not None and target.manager_id == employee.id

    return False


@router.get("", response_model=list[DocumentResponse])
def list_documents(
    employee_id: int | None = None,
    document_type: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(EmployeeDocument).filter(
        EmployeeDocument.is_deleted.is_(False)
    )

    if current_user.role in {"ADMIN", "HR"}:
        if employee_id is not None:
            query = query.filter(
                EmployeeDocument.employee_id == employee_id
            )
    else:
        own_employee = get_employee_for_user(db, current_user.id)

        if own_employee is None:
            raise HTTPException(
                403,
                "Account is not linked to an employee profile",
            )

        if current_user.role == "MANAGER":
            query = query.join(
                Employee,
                Employee.id == EmployeeDocument.employee_id,
            ).filter(
                (Employee.id == own_employee.id)
                | (Employee.manager_id == own_employee.id)
            )
        else:
            query = query.filter(
                EmployeeDocument.employee_id == own_employee.id
            )

        if employee_id is not None:
            query = query.filter(
                EmployeeDocument.employee_id == employee_id
            )

    if document_type:
        query = query.filter(
            EmployeeDocument.document_type == document_type.upper()
        )

    return (
        query.order_by(EmployeeDocument.uploaded_at.desc())
        .limit(limit)
        .all()
    )


@router.post("", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    document_type: str = Form(default="GENERAL"),
    employee_id: int | None = Form(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if not file.filename:
        raise HTTPException(400, "Filename is required")

    extension = Path(file.filename).suffix.lower()

    if extension not in ALLOWED_TYPES:
        raise HTTPException(
            415,
            "Only PDF, PNG, JPG, and JPEG documents are supported",
        )

    content = await file.read(MAX_FILE_SIZE + 1)
    await file.close()

    if not content:
        raise HTTPException(400, "Uploaded file is empty")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(413, "File exceeds the 5 MB limit")

    if not check_file_signature(extension, content):
        raise HTTPException(
            415,
            "File content does not match its extension",
        )

    # Do not trust the MIME type supplied by the browser.
    content_type = ALLOWED_TYPES[extension]

    if current_user.role in {"ADMIN", "HR"}:
        if employee_id is None:
            raise HTTPException(
                422,
                "ADMIN/HR must provide the target employee_id",
            )
        target_employee = db.get(Employee, employee_id)
    else:
        target_employee = get_employee_for_user(
            db,
            current_user.id,
        )

        if employee_id is not None and (
            target_employee is None
            or employee_id != target_employee.id
        ):
            raise HTTPException(
                403,
                "You can upload documents only for your own profile",
            )

    if (
        target_employee is None
        or target_employee.employment_status != "ACTIVE"
    ):
        raise HTTPException(404, "Active employee not found")

    safe_name = f"{uuid4().hex}{extension}"
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    destination = STORAGE_DIR / safe_name

    try:
        destination.write_bytes(content)

        record = EmployeeDocument(
            employee_id=target_employee.id,
            uploaded_by=current_user.id,
            original_filename=Path(file.filename).name[:255],
            stored_filename=safe_name,
            document_type=document_type.strip().upper()[:50] or "GENERAL",
            content_type=content_type,
            file_size=len(content),
            is_deleted=False,
        )

        db.add(record)
        db.commit()
        db.refresh(record)

    except Exception:
        db.rollback()
        if destination.exists():
            destination.unlink()
        raise

    return record


@router.get("/{document_id}/download")
def download_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    document = db.get(EmployeeDocument, document_id)

    if document is None or document.is_deleted:
        raise HTTPException(404, "Document not found")

    if not get_document_access(document, current_user, db):
        raise HTTPException(403, "You cannot access this document")

    path = STORAGE_DIR / document.stored_filename

    if not path.is_file():
        raise HTTPException(404, "Stored file was not found")

    return FileResponse(
        path,
        media_type=document.content_type,
        filename=document.original_filename,
    )


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    document = db.get(EmployeeDocument, document_id)

    if document is None or document.is_deleted:
        raise HTTPException(404, "Document not found")

    path = STORAGE_DIR / document.stored_filename

    document.is_deleted = True
    db.commit()

    if path.is_file():
        path.unlink()

    return {
        "message": "Document deleted successfully",
        "document_id": document_id,
    }