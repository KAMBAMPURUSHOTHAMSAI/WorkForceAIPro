from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.department import Department
from app.models.employee import Employee
from app.models.user import User
from app.schemas.employee import (
    EmployeeCreate,
    EmployeePage,
    EmployeeResponse,
    EmployeeUpdate,
)


router = APIRouter(
    prefix="/employees",
    tags=["Employees"],
)


def validate_employee_links(
    db: Session,
    department_id: int | None,
    manager_id: int | None,
    user_id: int | None,
    employee_id: int | None = None,
):
    if department_id is not None:
        department = db.get(Department, department_id)

        if department is None or not department.is_active:
            raise HTTPException(
                status_code=400,
                detail="Department does not exist or is inactive",
            )

    if manager_id is not None:
        if manager_id == employee_id:
            raise HTTPException(
                status_code=400,
                detail="An employee cannot be their own manager",
            )

        manager = db.get(Employee, manager_id)

        if manager is None or manager.employment_status != "ACTIVE":
            raise HTTPException(
                status_code=400,
                detail="Manager does not exist or is inactive",
            )

    if user_id is not None:
        user = db.get(User, user_id)

        if user is None:
            raise HTTPException(
                status_code=400,
                detail="Linked user account not found",
            )

        linked_employee = db.query(Employee).filter(
            Employee.user_id == user_id,
            Employee.id != employee_id if employee_id is not None else True,
        ).first()

        if linked_employee:
            raise HTTPException(
                status_code=409,
                detail="User account is already linked to an employee",
            )


@router.get("", response_model=EmployeePage)
def list_employees(
    q: str | None = Query(default=None, max_length=120),
    department_id: int | None = None,
    employment_status: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    query = db.query(Employee)

    if q:
        search = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Employee.employee_code.ilike(search),
                Employee.first_name.ilike(search),
                Employee.last_name.ilike(search),
                Employee.email.ilike(search),
                Employee.job_title.ilike(search),
            )
        )

    if department_id is not None:
        query = query.filter(Employee.department_id == department_id)

    if employment_status is not None:
        query = query.filter(
            Employee.employment_status == employment_status.upper()
        )

    total = query.count()

    employees = (
        query.order_by(Employee.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return EmployeePage(
        items=employees,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/me", response_model=EmployeeResponse)
def get_my_employee_profile(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    employee = (
        db.query(Employee)
        .filter(Employee.user_id == current_user.id)
        .first()
    )

    if employee is None:
        raise HTTPException(
            status_code=404,
            detail="No employee profile is linked to this account",
        )

    return employee


@router.post(
    "",
    response_model=EmployeeResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_employee(
    payload: EmployeeCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    normalized_email = str(payload.email).lower()
    normalized_code = payload.employee_code.strip()

    existing = db.query(Employee).filter(
        or_(
            Employee.employee_code == normalized_code,
            func.lower(Employee.email) == normalized_email,
        )
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Employee code or email already exists",
        )

    validate_employee_links(
        db,
        department_id=payload.department_id,
        manager_id=payload.manager_id,
        user_id=payload.user_id,
    )

    data = payload.model_dump()
    data["employee_code"] = normalized_code
    data["email"] = normalized_email

    employee = Employee(**data)
    db.add(employee)

    try:
        db.commit()
        db.refresh(employee)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Employee code, email, or user link already exists",
        )

    return employee


@router.get("/{employee_id}", response_model=EmployeeResponse)
def get_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    employee = db.get(Employee, employee_id)

    if employee is None:
        raise HTTPException(
            status_code=404,
            detail="Employee not found",
        )

    return employee


@router.patch("/{employee_id}", response_model=EmployeeResponse)
def update_employee(
    employee_id: int,
    payload: EmployeeUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    employee = db.get(Employee, employee_id)

    if employee is None:
        raise HTTPException(
            status_code=404,
            detail="Employee not found",
        )

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return employee

    required_fields = [
        "employee_code",
        "first_name",
        "last_name",
        "email",
        "employment_type",
        "employment_status",
        "base_salary",
    ]

    for field in required_fields:
        if field in changes and changes[field] is None:
            raise HTTPException(
                status_code=422,
                detail=f"{field} cannot be null",
            )

    if "employee_code" in changes:
        changes["employee_code"] = changes["employee_code"].strip()

    if "email" in changes and changes["email"] is not None:
        changes["email"] = str(changes["email"]).lower()

    if "employee_code" in changes or "email" in changes:
        duplicate_query = db.query(Employee).filter(
            Employee.id != employee_id
        )

        conditions = []

        if changes.get("employee_code") is not None:
            conditions.append(
                Employee.employee_code == changes["employee_code"]
            )

        if changes.get("email") is not None:
            conditions.append(
                func.lower(Employee.email) == changes["email"]
            )

        if conditions:
            duplicate = duplicate_query.filter(or_(*conditions)).first()

            if duplicate:
                raise HTTPException(
                    status_code=409,
                    detail="Employee code or email already exists",
                )

    validate_employee_links(
        db,
        department_id=changes.get(
            "department_id", employee.department_id
        ),
        manager_id=changes.get("manager_id", employee.manager_id),
        user_id=changes.get("user_id", employee.user_id),
        employee_id=employee_id,
    )

    for field, value in changes.items():
        setattr(employee, field, value)

    try:
        db.commit()
        db.refresh(employee)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Employee update conflicts with existing data",
        )

    return employee


@router.delete("/{employee_id}")
def deactivate_employee(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    employee = db.get(Employee, employee_id)

    if employee is None:
        raise HTTPException(
            status_code=404,
            detail="Employee not found",
        )

    employee.employment_status = "INACTIVE"
    db.commit()

    return {
        "message": "Employee deactivated successfully",
        "employee_id": employee_id,
    }