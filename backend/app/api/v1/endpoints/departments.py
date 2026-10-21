from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.department import Department
from app.models.employee import Employee
from app.schemas.department import (
    DepartmentCreate,
    DepartmentResponse,
    DepartmentStat,
    DepartmentUpdate,
)


router = APIRouter(
    prefix="/departments",
    tags=["Departments"],
)


@router.get("", response_model=list[DepartmentResponse])
def list_departments(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return (
        db.query(Department)
        .filter(Department.is_active.is_(True))
        .order_by(Department.name)
        .all()
    )


@router.get("/stats", response_model=list[DepartmentStat])
def department_statistics(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR", "MANAGER")),
):
    rows = (
        db.query(
            Department.id,
            Department.name,
            func.count(Employee.id).label("employee_count"),
        )
        .outerjoin(
            Employee,
            (Employee.department_id == Department.id)
            & (Employee.employment_status == "ACTIVE"),
        )
        .filter(Department.is_active.is_(True))
        .group_by(Department.id, Department.name)
        .order_by(Department.name)
        .all()
    )

    return [
        {
            "id": row.id,
            "name": row.name,
            "employee_count": row.employee_count,
        }
        for row in rows
    ]


@router.post(
    "",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_department(
    payload: DepartmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    name = payload.name.strip()

    existing = (
        db.query(Department)
        .filter(func.lower(Department.name) == name.lower())
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Department name already exists",
        )

    department = Department(
        name=name,
        description=payload.description,
        is_active=True,
    )

    db.add(department)

    try:
        db.commit()
        db.refresh(department)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Department name already exists",
        )

    return department


@router.get("/{department_id}", response_model=DepartmentResponse)
def get_department(
    department_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    department = db.get(Department, department_id)

    if department is None or not department.is_active:
        raise HTTPException(
            status_code=404,
            detail="Department not found",
        )

    return department


@router.patch("/{department_id}", response_model=DepartmentResponse)
def update_department(
    department_id: int,
    payload: DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    department = db.get(Department, department_id)

    if department is None or not department.is_active:
        raise HTTPException(
            status_code=404,
            detail="Department not found",
        )

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return department

    if "name" in changes:
        if changes["name"] is None:
            raise HTTPException(
                status_code=422,
                detail="Department name cannot be null",
            )

        changes["name"] = changes["name"].strip()

        duplicate = (
            db.query(Department)
            .filter(
                func.lower(Department.name) == changes["name"].lower(),
                Department.id != department_id,
            )
            .first()
        )

        if duplicate:
            raise HTTPException(
                status_code=409,
                detail="Department name already exists",
            )

    for field, value in changes.items():
        setattr(department, field, value)

    try:
        db.commit()
        db.refresh(department)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Department update conflicts with existing data",
        )

    return department


@router.delete("/{department_id}")
def deactivate_department(
    department_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    department = db.get(Department, department_id)

    if department is None or not department.is_active:
        raise HTTPException(
            status_code=404,
            detail="Department not found",
        )

    department.is_active = False
    db.commit()

    return {
        "message": "Department deactivated successfully",
        "department_id": department_id,
    }