from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.attendance import Attendance
from app.models.audit_log import AuditLog
from app.models.employee import Employee
from app.models.shift import Shift
from app.models.shift_assignment import ShiftAssignment
from app.schemas.attendance import (
    AttendanceCorrection,
    AttendancePage,
    AttendanceResponse,
)


router = APIRouter(prefix="/attendance", tags=["Attendance"])

BUSINESS_TIMEZONE = ZoneInfo("Asia/Kolkata")
MAX_SESSION = timedelta(hours=24)
MAX_SESSION_MINUTES = 24 * 60


def business_today() -> date:
    return datetime.now(BUSINESS_TIMEZONE).date()


def utc_now_naive() -> datetime:
    # MySQL DATETIME values are stored as UTC without timezone metadata.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_linked_employee(db: Session, user_id: int) -> Employee:
    employee = (
        db.query(Employee)
        .filter(Employee.user_id == user_id)
        .first()
    )

    if employee is None:
        raise HTTPException(
            403,
            "Your user account is not linked to an employee profile",
        )

    if employee.employment_status != "ACTIVE":
        raise HTTPException(403, "Your employee profile is not active")

    return employee


def normalize_to_utc_naive(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def request_datetime_to_utc_naive(value: datetime) -> datetime:
    """Treat naive admin-entered datetimes as India local time; store UTC-naive."""
    if value.tzinfo is None:
        value = value.replace(tzinfo=BUSINESS_TIMEZONE)
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def append_note(existing: str | None, note: str) -> str:
    return f"{existing.strip()}\n{note}".strip() if existing and existing.strip() else note


def expire_stale_sessions(
    db: Session,
    employee_id: int,
    current_user_id: int | None,
    now: datetime | None = None,
) -> list[Attendance]:
    """Flag sessions open for 24h or longer without inventing a checkout time."""
    now = now or utc_now_naive()
    open_records = (
        db.query(Attendance)
        .filter(
            Attendance.employee_id == employee_id,
            Attendance.check_out.is_(None),
            Attendance.status != "MISSED_CHECKOUT",
        )
        .all()
    )
    expired: list[Attendance] = []

    local_now = now.replace(tzinfo=timezone.utc).astimezone(BUSINESS_TIMEZONE)

    for record in open_records:
        started_at = normalize_to_utc_naive(record.check_in)
        elapsed = now - started_at
        expired_reason = None

        # Absolute protection: no attendance session may remain open for 24h.
        if elapsed >= MAX_SESSION:
            expired_reason = "Open attendance session exceeded 24 hours"
        elif record.attendance_date < local_now.date():
            # At a new business date, expire a missed day-shift checkout after
            # the scheduled shift end. For an overnight shift, preserve the
            # session until that shift's end, while still enforcing the 24h cap.
            shift = db.get(Shift, record.shift_id) if record.shift_id else None
            if shift is None:
                expired_reason = "Previous-day attendance had no assigned shift to keep the session open"
            else:
                shift_crosses_midnight = shift.end_time <= shift.start_time
                shift_end_date = (
                    record.attendance_date + timedelta(days=1)
                    if shift_crosses_midnight
                    else record.attendance_date
                )
                shift_end_local = datetime.combine(
                    shift_end_date,
                    shift.end_time,
                    tzinfo=BUSINESS_TIMEZONE,
                )
                if local_now >= shift_end_local:
                    expired_reason = "Scheduled shift end passed without a checkout"

        if expired_reason:
            record.status = "MISSED_CHECKOUT"
            record.working_minutes = 0
            record.overtime_minutes = 0
            record.notes = append_note(
                record.notes,
                f"Automatically flagged MISSED_CHECKOUT: {expired_reason}. "
                "No checkout timestamp was fabricated; HR/Admin can correct this record.",
            )
            db.add(
                AuditLog(
                    actor_user_id=current_user_id,
                    action="ATTENDANCE_SESSION_EXPIRED",
                    entity_type="ATTENDANCE",
                    entity_id=str(record.id),
                    details={
                        "employee_id": record.employee_id,
                        "attendance_date": record.attendance_date.isoformat(),
                        "check_in": started_at.isoformat(),
                        "elapsed_hours": round(elapsed.total_seconds() / 3600, 2),
                        "reason": expired_reason,
                    },
                )
            )
            expired.append(record)

    if expired:
        db.commit()
        for record in expired:
            db.refresh(record)

    return expired


def calculate_work_minutes(
    check_in: datetime,
    check_out: datetime | None,
    shift: Shift | None,
) -> tuple[int, int]:
    if check_out is None:
        return 0, 0

    start = normalize_to_utc_naive(check_in)
    end = normalize_to_utc_naive(check_out)
    elapsed = int((end - start).total_seconds() // 60)
    if elapsed < 0:
        raise HTTPException(422, "Check-out must be after check-in")
    if elapsed >= MAX_SESSION_MINUTES:
        raise HTTPException(422, "An attendance session cannot exceed 24 hours")

    scheduled_minutes = shift_minutes(shift) if shift else 0
    configured_break_minutes = max(0, int(shift.break_minutes or 0)) if shift else 0

    # Do not deduct the entire scheduled break from a very short attendance
    # session. There is no break start/end data to calculate an actual break,
    # so only apply the configured break once the session reaches the shift's
    # net scheduled-work threshold. This keeps a 3-minute test session at
    # 3 minutes instead of incorrectly clamping it to 0, while preserving the
    # normal full-shift calculation (e.g. 9h elapsed - 60m break = 8h worked).
    break_to_deduct = (
        configured_break_minutes
        if configured_break_minutes > 0 and elapsed >= scheduled_minutes
        else 0
    )
    working_minutes = max(0, elapsed - break_to_deduct)
    overtime_minutes = max(0, working_minutes - scheduled_minutes)
    return working_minutes, overtime_minutes


def shift_minutes(shift: Shift) -> int:
    start = (
        shift.start_time.hour * 60
        + shift.start_time.minute
        + shift.start_time.second / 60
    )
    end = (
        shift.end_time.hour * 60
        + shift.end_time.minute
        + shift.end_time.second / 60
    )

    duration = end - start

    # Night shifts can end after midnight.
    if duration <= 0:
        duration += 24 * 60

    return max(0, int(duration) - shift.break_minutes)


@router.post("/check-in", response_model=AttendanceResponse)
def check_in(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    employee = get_linked_employee(db, current_user.id)
    today = business_today()

    # Expire abandoned sessions after 24 hours; do not fabricate checkout time.
    expire_stale_sessions(db, employee.id, current_user.id)

    open_record = (
        db.query(Attendance)
        .filter(
            Attendance.employee_id == employee.id,
            Attendance.check_out.is_(None),
            Attendance.status != "MISSED_CHECKOUT",
        )
        .order_by(Attendance.attendance_date.desc())
        .first()
    )

    if open_record:
        raise HTTPException(
            409,
            "An attendance session is already open and has not reached the 24-hour limit. Please check out first.",
        )

    existing_today = (
        db.query(Attendance)
        .filter(
            Attendance.employee_id == employee.id,
            Attendance.attendance_date == today,
        )
        .first()
    )

    if existing_today:
        raise HTTPException(
            409,
            "Attendance is already recorded for today",
        )

    assignment = (
        db.query(ShiftAssignment)
        .filter(
            ShiftAssignment.employee_id == employee.id,
            ShiftAssignment.is_active.is_(True),
            ShiftAssignment.effective_from <= today,
            (
                (ShiftAssignment.effective_to.is_(None))
                | (ShiftAssignment.effective_to >= today)
            ),
        )
        .order_by(ShiftAssignment.effective_from.desc())
        .first()
    )

    if assignment is None:
        raise HTTPException(
            400,
            "No active shift is assigned for today",
        )

    record = Attendance(
        employee_id=employee.id,
        shift_id=assignment.shift_id,
        attendance_date=today,
        check_in=utc_now_naive(),
        working_minutes=0,
        overtime_minutes=0,
        status="PRESENT",
    )

    db.add(record)

    try:
        db.commit()
        db.refresh(record)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409,
            "Attendance already exists for today",
        )

    return record


@router.post("/check-out", response_model=AttendanceResponse)
def check_out(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    employee = get_linked_employee(db, current_user.id)

    expired_records = expire_stale_sessions(db, employee.id, current_user.id)

    record = (
        db.query(Attendance)
        .filter(
            Attendance.employee_id == employee.id,
            Attendance.check_out.is_(None),
            Attendance.status != "MISSED_CHECKOUT",
        )
        .order_by(Attendance.attendance_date.desc())
        .first()
    )

    if record is None:
        if expired_records:
            raise HTTPException(
                409,
                "Your attendance session exceeded 24 hours and was marked MISSED_CHECKOUT. Please ask HR/Admin to correct the historical record.",
            )
        raise HTTPException(
            400,
            "No open attendance session was found for check-out",
        )

    now = utc_now_naive()
    start = normalize_to_utc_naive(record.check_in)
    elapsed = int((now - start).total_seconds() // 60)

    if elapsed < 0:
        raise HTTPException(400, "Invalid check-in timestamp")

    if elapsed >= MAX_SESSION_MINUTES:
        expire_stale_sessions(db, employee.id, current_user.id, now=now)
        raise HTTPException(
            409,
            "Attendance session exceeded 24 hours and was marked MISSED_CHECKOUT. HR/Admin must review it.",
        )

    shift = db.get(Shift, record.shift_id) if record.shift_id else None
    record.check_out = now
    record.working_minutes, record.overtime_minutes = calculate_work_minutes(
        record.check_in,
        record.check_out,
        shift,
    )

    try:
        db.commit()
        db.refresh(record)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Unable to finalize attendance")

    return record


@router.patch("/{attendance_id}", response_model=AttendanceResponse)
def correct_attendance(
    attendance_id: int,
    payload: AttendanceCorrection,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    """Correct a historical attendance record with a required audit reason."""
    record = db.get(Attendance, attendance_id)
    if record is None:
        raise HTTPException(404, "Attendance record not found")

    provided = payload.model_dump(exclude_unset=True)
    correction_reason = provided.pop("correction_reason")

    old_values = {
        "attendance_date": record.attendance_date.isoformat(),
        "check_in": normalize_to_utc_naive(record.check_in).isoformat(),
        "check_out": normalize_to_utc_naive(record.check_out).isoformat() if record.check_out else None,
        "working_minutes": record.working_minutes,
        "overtime_minutes": record.overtime_minutes,
        "status": record.status,
        "notes": record.notes,
    }

    if "check_in" in provided:
        if provided["check_in"] is None:
            raise HTTPException(422, "Check-in timestamp cannot be empty")
        provided["check_in"] = request_datetime_to_utc_naive(provided["check_in"])

    if "check_out" in provided and provided["check_out"] is not None:
        provided["check_out"] = request_datetime_to_utc_naive(provided["check_out"])

    new_check_in = provided.get("check_in", record.check_in)
    new_check_out = provided.get("check_out", record.check_out)

    if "check_out" in provided and new_check_out is None and provided.get("status") is None:
        provided["status"] = record.status or "MISSED_CHECKOUT"

    start_utc = normalize_to_utc_naive(new_check_in)
    end_utc = normalize_to_utc_naive(new_check_out) if new_check_out else None
    now_utc = utc_now_naive()
    start_business_date = start_utc.replace(tzinfo=timezone.utc).astimezone(BUSINESS_TIMEZONE).date()
    if start_business_date != record.attendance_date:
        raise HTTPException(422, "Corrected check-in must fall on the record's attendance date in India time")
    if start_utc > now_utc:
        raise HTTPException(422, "Check-in cannot be in the future")
    if end_utc is not None and end_utc > now_utc:
        raise HTTPException(422, "Check-out cannot be in the future")
    if end_utc is not None:
        elapsed_minutes = int((end_utc - start_utc).total_seconds() // 60)
        if elapsed_minutes < 0:
            raise HTTPException(422, "Check-out must be after check-in")
        if elapsed_minutes >= MAX_SESSION_MINUTES:
            raise HTTPException(422, "An attendance session cannot exceed 24 hours")
        if "status" not in provided and record.status == "MISSED_CHECKOUT":
            provided["status"] = "PRESENT"

    if "status" in provided and provided["status"] is None:
        raise HTTPException(422, "Attendance status cannot be empty")

    shift = db.get(Shift, record.shift_id) if record.shift_id else None
    working_minutes, overtime_minutes = calculate_work_minutes(start_utc, end_utc, shift)

    for field, value in provided.items():
        if field in {"check_in", "check_out", "status", "notes"}:
            setattr(record, field, value)

    record.working_minutes = working_minutes
    record.overtime_minutes = overtime_minutes
    new_values = {
        "attendance_date": record.attendance_date.isoformat(),
        "check_in": start_utc.isoformat(),
        "check_out": end_utc.isoformat() if end_utc else None,
        "working_minutes": working_minutes,
        "overtime_minutes": overtime_minutes,
        "status": record.status,
        "notes": record.notes,
    }

    db.add(
        AuditLog(
            actor_user_id=current_user.id,
            action="ATTENDANCE_CORRECTED",
            entity_type="ATTENDANCE",
            entity_id=str(record.id),
            details={"reason": correction_reason.strip(), "before": old_values, "after": new_values},
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent", "")[:500] or None,
        )
    )

    try:
        db.commit()
        db.refresh(record)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Attendance correction conflicts with existing data")

    return record


@router.get("/me", response_model=AttendancePage)
def my_attendance(
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    employee = get_linked_employee(db, current_user.id)

    query = db.query(Attendance).filter(
        Attendance.employee_id == employee.id
    )

    if date_from:
        query = query.filter(Attendance.attendance_date >= date_from)

    if date_to:
        query = query.filter(Attendance.attendance_date <= date_to)

    total = query.count()

    items = (
        query.order_by(Attendance.attendance_date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return AttendancePage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("", response_model=AttendancePage)
def attendance_report(
    employee_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    attendance_status: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR", "MANAGER")),
):
    query = db.query(Attendance).join(
        Employee,
        Employee.id == Attendance.employee_id,
    )

    if current_user.role == "MANAGER":
        manager_employee = (
            db.query(Employee)
            .filter(Employee.user_id == current_user.id)
            .first()
        )

        if manager_employee is None:
            raise HTTPException(403, "Manager employee profile is missing")

        query = query.filter(Employee.manager_id == manager_employee.id)

    if employee_id is not None:
        query = query.filter(Attendance.employee_id == employee_id)

    if date_from:
        query = query.filter(Attendance.attendance_date >= date_from)

    if date_to:
        query = query.filter(Attendance.attendance_date <= date_to)

    if attendance_status:
        query = query.filter(
            Attendance.status == attendance_status.upper()
        )

    total = query.count()

    items = (
        query.order_by(Attendance.attendance_date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return AttendancePage(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )