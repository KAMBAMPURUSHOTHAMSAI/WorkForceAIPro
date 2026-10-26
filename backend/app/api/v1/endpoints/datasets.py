import json
from pathlib import Path
from uuid import uuid4

import pandas as pd
from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    UploadFile,
    status,
)
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.session import get_db
from app.ml.attrition import (
    DATASET_DIR,
    MODEL_DIR,
    train_attrition_model,
)
from app.models.dataset_failed_record import DatasetFailedRecord
from app.models.dataset_version import DatasetVersion
from app.models.user import User
from app.schemas.dataset import (
    DatasetResponse,
    FailedDatasetRecordResponse,
)


router = APIRouter(prefix="/datasets", tags=["Dataset Management"])

MAX_UPLOAD_BYTES = 15 * 1024 * 1024
MAX_ROWS = 100_000
MAX_COLUMNS = 200


def json_safe_row(row: pd.Series) -> dict:
    return json.loads(
        row.to_json(date_format="iso", default_handler=str)
    )


def require_csv_file(file: UploadFile):
    if not file.filename:
        raise HTTPException(400, "Filename is required")

    if Path(file.filename).suffix.lower() != ".csv":
        raise HTTPException(
            415,
            "Only CSV dataset files are supported",
        )


@router.post(
    "/upload",
    response_model=DatasetResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_dataset(
    file: UploadFile = File(...),
    target_column: str = Form(default="Attrition"),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "HR")
    ),
):
    require_csv_file(file)

    content = await file.read(MAX_UPLOAD_BYTES + 1)
    await file.close()

    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            413,
            "Dataset exceeds the 15 MB upload limit",
        )

    if not content:
        raise HTTPException(400, "Uploaded dataset is empty")

    try:
        from io import BytesIO

        dataframe = pd.read_csv(BytesIO(content))
    except Exception:
        raise HTTPException(
            422,
            "Unable to parse CSV dataset",
        )

    dataframe.columns = [
        str(column).strip()
        for column in dataframe.columns
    ]

    if (
        dataframe.empty
        or len(dataframe.columns) == 0
        or any(not column for column in dataframe.columns)
    ):
        raise HTTPException(
            422,
            "Dataset must contain named columns and data rows",
        )

    if dataframe.columns.duplicated().any():
        raise HTTPException(
            422,
            "Dataset contains duplicate column names",
        )

    if len(dataframe) > MAX_ROWS or len(dataframe.columns) > MAX_COLUMNS:
        raise HTTPException(
            413,
            "Dataset exceeds the maximum supported rows or columns",
        )

    requested_target = target_column.strip().lower()

    actual_target = next(
        (
            column
            for column in dataframe.columns
            if column.lower() == requested_target
        ),
        None,
    )

    if actual_target is None:
        raise HTTPException(
            422,
            f"Target column '{target_column}' was not found",
        )

    target_column = actual_target

    duplicate_mask = dataframe.duplicated(keep="first")

    target_missing = (
        dataframe[target_column].isna()
        | dataframe[target_column].astype(str).str.strip().eq("")
    )

    invalid_mask = duplicate_mask | target_missing

    total_rows = int(len(dataframe))
    failed_rows = int(invalid_mask.sum())
    valid_rows = total_rows - failed_rows

    next_version = (
        db.query(func.max(DatasetVersion.version_number)).scalar()
        or 0
    ) + 1

    stored_filename = f"{uuid4().hex}.csv"

    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    stored_path = DATASET_DIR / stored_filename

    stored_path.write_bytes(content)

    dataset = DatasetVersion(
        version_number=next_version,
        original_filename=Path(file.filename).name[:255],
        stored_filename=stored_filename,
        target_column=target_column,
        total_rows=total_rows,
        valid_rows=valid_rows,
        failed_rows=failed_rows,
        feature_columns=[
            str(column)
            for column in dataframe.columns
            if column != target_column
        ],
        validation_summary={
            "total_rows": total_rows,
            "valid_rows": valid_rows,
            "failed_rows": failed_rows,
            "duplicate_rows": int(duplicate_mask.sum()),
            "missing_target_rows": int(target_missing.sum()),
            "target_column": target_column,
        },
        model_metrics=None,
        status="VALIDATED" if valid_rows > 0 else "FAILED",
        error_message=(
            None if valid_rows > 0 else "No valid rows were found"
        ),
        uploaded_by=current_user.id,
    )

    try:
        db.add(dataset)
        db.flush()

        failed_records = []

        for position, (_, row) in enumerate(
            dataframe.iterrows()
        ):
            reasons = []

            if bool(duplicate_mask.iloc[position]):
                reasons.append("Duplicate row")

            if bool(target_missing.iloc[position]):
                reasons.append("Missing target value")

            if reasons:
                failed_records.append(
                    DatasetFailedRecord(
                        dataset_version_id=dataset.id,
                        row_number=position + 2,
                        error_message="; ".join(reasons),
                        row_data=json_safe_row(row),
                    )
                )

        db.add_all(failed_records)
        db.commit()
        db.refresh(dataset)

    except Exception:
        db.rollback()
        if stored_path.exists():
            stored_path.unlink()
        raise

    return dataset


@router.get("", response_model=list[DatasetResponse])
def list_datasets(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    return (
        db.query(DatasetVersion)
        .order_by(DatasetVersion.version_number.desc())
        .all()
    )


@router.get(
    "/{dataset_id}",
    response_model=DatasetResponse,
)
def get_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    dataset = db.get(DatasetVersion, dataset_id)

    if dataset is None:
        raise HTTPException(404, "Dataset version not found")

    return dataset


@router.get(
    "/{dataset_id}/failed-records",
    response_model=list[FailedDatasetRecordResponse],
)
def get_failed_records(
    dataset_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    dataset = db.get(DatasetVersion, dataset_id)

    if dataset is None:
        raise HTTPException(404, "Dataset version not found")

    return (
        db.query(DatasetFailedRecord)
        .filter(
            DatasetFailedRecord.dataset_version_id == dataset_id
        )
        .order_by(DatasetFailedRecord.row_number)
        .all()
    )


@router.post("/{dataset_id}/train")
def train_dataset(
    dataset_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "HR")
    ),
):
    dataset = db.get(DatasetVersion, dataset_id)

    if dataset is None:
        raise HTTPException(404, "Dataset version not found")

    if dataset.valid_rows < 20:
        raise HTTPException(
            422,
            "At least 20 valid dataset rows are required",
        )

    csv_path = DATASET_DIR / dataset.stored_filename

    if not csv_path.is_file():
        raise HTTPException(
            404,
            "Stored dataset file is missing",
        )

    try:
        result = train_attrition_model(
            csv_path=csv_path,
            target_column=dataset.target_column,
            dataset_id=dataset.id,
        )
    except ValueError as exc:
        dataset.status = "TRAINING_FAILED"
        dataset.error_message = str(exc)
        db.commit()

        raise HTTPException(
            422,
            detail=str(exc),
        )

    dataset.feature_columns = result["feature_columns"]
    dataset.valid_rows = result["valid_rows"]
    dataset.model_metrics = result["metrics"]
    dataset.status = "TRAINED"
    dataset.error_message = None

    db.commit()
    db.refresh(dataset)

    return {
        "message": "Attrition model trained successfully",
        "dataset_id": dataset.id,
        "status": dataset.status,
        "valid_rows": dataset.valid_rows,
        "feature_columns": dataset.feature_columns,
        "metrics": dataset.model_metrics,
    }