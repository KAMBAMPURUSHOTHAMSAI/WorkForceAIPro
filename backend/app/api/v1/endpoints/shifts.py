from datetime import date, time
from datetime import datetime as DateTime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.department import Department
from app.models.employee import Employee
from app.models.shift import Shift
from app.models.shift_assignment import ShiftAssignment
from app.schemas.shift import (
    ShiftAssignmentCreate,
    ShiftAssignmentResponse,
    ShiftCreate,
    ShiftResponse,
    ShiftUpdate,
)


router = APIRouter(prefix="/shifts", tags=["Shifts"])


@router.get("", response_model=list[ShiftResponse])
def list_shifts(
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(Shift)

    if active_only:
        query = query.filter(Shift.is_active.is_(True))

    return query.order_by(Shift.start_time, Shift.name).all()


@router.post(
    "",
    response_model=ShiftResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_shift(
    payload: ShiftCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    name = payload.name.strip()

    existing = (
        db.query(Shift)
        .filter(func.lower(Shift.name) == name.lower())
        .first()
    )

    if existing:
        raise HTTPException(409, "Shift name already exists")

    shift = Shift(
        name=name,
        start_time=payload.start_time,
        end_time=payload.end_time,
        break_minutes=payload.break_minutes,
        is_active=True,
    )

    db.add(shift)

    try:
        db.commit()
        db.refresh(shift)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Shift name already exists")

    return shift


@router.get("/{shift_id}", response_model=ShiftResponse)
def get_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    shift = db.get(Shift, shift_id)

    if shift is None:
        raise HTTPException(404, "Shift not found")

    return shift


@router.patch("/{shift_id}", response_model=ShiftResponse)
def update_shift(
    shift_id: int,
    payload: ShiftUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    shift = db.get(Shift, shift_id)

    if shift is None:
        raise HTTPException(404, "Shift not found")

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return shift

    if "name" in changes:
        if changes["name"] is None:
            raise HTTPException(422, "Shift name cannot be null")

        changes["name"] = changes["name"].strip()

        duplicate = (
            db.query(Shift)
            .filter(
                func.lower(Shift.name) == changes["name"].lower(),
                Shift.id != shift_id,
            )
            .first()
        )

        if duplicate:
            raise HTTPException(409, "Shift name already exists")

    start = changes.get("start_time", shift.start_time)
    end = changes.get("end_time", shift.end_time)

    if start is None or end is None or start == end:
        raise HTTPException(
            422,
            "Shift start and end times must be different",
        )

    for field, value in changes.items():
        setattr(shift, field, value)

    try:
        db.commit()
        db.refresh(shift)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Shift update conflicts with existing data")

    return shift


@router.delete("/{shift_id}")
def deactivate_shift(
    shift_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    shift = db.get(Shift, shift_id)

    if shift is None:
        raise HTTPException(404, "Shift not found")

    shift.is_active = False
    db.commit()

    return {
        "message": "Shift deactivated successfully",
        "shift_id": shift_id,
    }


@router.post(
    "/{shift_id}/assignments",
    response_model=ShiftAssignmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def assign_shift(
    shift_id: int,
    payload: ShiftAssignmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR", "MANAGER")),
):
    shift = db.get(Shift, shift_id)

    if shift is None or not shift.is_active:
        raise HTTPException(404, "Active shift not found")

    employee = db.get(Employee, payload.employee_id)

    if employee is None or employee.employment_status != "ACTIVE":
        raise HTTPException(404, "Active employee not found")

    # Managers may assign shifts only to their direct reports.
    if current_user.role == "MANAGER":
        manager_employee = (
            db.query(Employee)
            .filter(Employee.user_id == current_user.id)
            .first()
        )

        if manager_employee is None or employee.manager_id != manager_employee.id:
            raise HTTPException(403, "You can assign shifts only to your direct reports")

    # Do not permit overlapping assignments for the same employee.
    new_end = payload.effective_to or date.max

    overlapping = (
        db.query(ShiftAssignment)
        .filter(
            ShiftAssignment.employee_id == payload.employee_id,
            ShiftAssignment.is_active.is_(True),
            ShiftAssignment.effective_from <= new_end,
            or_(
                ShiftAssignment.effective_to.is_(None),
                ShiftAssignment.effective_to >= payload.effective_from,
            ),
        )
        .first()
    )

    if overlapping:
        raise HTTPException(
            409,
            "Employee already has a shift assignment during these dates",
        )

    assignment = ShiftAssignment(
        employee_id=payload.employee_id,
        shift_id=shift_id,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        is_active=True,
    )

    db.add(assignment)

    try:
        db.commit()
        db.refresh(assignment)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Conflicting shift assignment")

    return assignment


@router.get(
    "/{shift_id}/assignments",
    response_model=list[ShiftAssignmentResponse],
)
def list_shift_assignments(
    shift_id: int,
    active_only: bool = True,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR", "MANAGER")),
):
    if db.get(Shift, shift_id) is None:
        raise HTTPException(404, "Shift not found")

    query = db.query(ShiftAssignment).filter(
        ShiftAssignment.shift_id == shift_id
    )

    if active_only:
        query = query.filter(ShiftAssignment.is_active.is_(True))

    return query.order_by(ShiftAssignment.effective_from.desc()).all()