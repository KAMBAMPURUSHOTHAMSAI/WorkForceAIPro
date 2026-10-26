from datetime import date, datetime, timezone
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.employee import Employee
from app.models.leave_policy import LeavePolicy
from app.models.leave_request import LeaveRequest
from app.models.notification import Notification
from app.models.user import User
from app.schemas.leave import (
    LeaveApply,
    LeaveBalanceResponse,
    LeaveDecision,
    LeavePage,
    LeavePolicyCreate,
    LeavePolicyResponse,
    LeavePolicyUpdate,
    LeaveResponse,
)
from app.services.email_service import send_leave_notification_email
from app.services.notification_service import (
    notification_manager,
    notification_payload,
)


router = APIRouter(prefix="/leaves", tags=["Leave Management"])


logger = logging.getLogger(__name__)


def active_leave_reviewers(db: Session, employee: Employee) -> list[User]:
    """Return active ADMIN/HR users plus the employee's linked manager, deduplicated."""
    recipients = (
        db.query(User)
        .filter(
            User.is_active.is_(True),
            User.role.in_(["ADMIN", "HR"]),
        )
        .all()
    )

    if employee.manager_id is not None:
        manager_employee = db.get(Employee, employee.manager_id)
        if manager_employee and manager_employee.user_id:
            manager_user = db.get(User, manager_employee.user_id)
            if manager_user and manager_user.is_active:
                recipients.append(manager_user)

    unique: dict[int, User] = {}
    for recipient in recipients:
        unique[recipient.id] = recipient
    return list(unique.values())


def persist_leave_notifications(
    db: Session,
    specs: list[tuple[int, str, str, str, str]],
) -> list[Notification]:
    """Persist in-app notifications without rolling back a completed leave action."""
    if not specs:
        return []

    notifications: list[Notification] = []
    for user_id, notification_type, title, message, priority in specs:
        if not user_id:
            continue
        notifications.append(
            Notification(
                user_id=user_id,
                notification_type=notification_type,
                title=title[:150],
                message=message,
                priority=priority,
                read_status=False,
            )
        )

    if not notifications:
        return []

    try:
        db.add_all(notifications)
        db.commit()
        for notification in notifications:
            db.refresh(notification)
        return notifications
    except Exception:
        db.rollback()
        logger.exception(
            "Leave action succeeded, but in-app notification persistence failed"
        )
        return []


async def dispatch_leave_messages(
    db: Session,
    notification_specs: list[tuple[int, str, str, str, str]],
    email_jobs: list[tuple[str, str, str]],
) -> None:
    """Persist in-app notifications, publish live events, and send best-effort email."""
    notifications = persist_leave_notifications(db, notification_specs)

    for notification in notifications:
        try:
            await notification_manager.send_to_user(
                notification.user_id,
                {
                    "event": "new_notification",
                    "data": notification_payload(notification),
                },
            )
        except Exception:
            logger.exception(
                "Could not publish live leave notification id=%s",
                notification.id,
            )

    # Email is best-effort: missing/invalid SMTP settings must not undo a leave
    # submission or approval. Failures are logged for diagnosis.
    seen_emails: set[tuple[str, str]] = set()
    for recipient, subject, body in email_jobs:
        recipient = (recipient or "").strip()
        if not recipient:
            continue
        key = (recipient.lower(), subject)
        if key in seen_emails:
            continue
        seen_emails.add(key)
        try:
            await run_in_threadpool(
                send_leave_notification_email,
                recipient,
                subject,
                body,
            )
        except Exception as exc:
            logger.warning(
                "Leave email delivery failed for %s (%s). Check backend/.env SMTP settings.",
                recipient,
                type(exc).__name__,
            )



def working_days(start_date: date, end_date: date) -> int:
    """Count weekdays inclusively; public holidays are not yet excluded."""
    count = 0
    current = start_date

    while current <= end_date:
        if current.weekday() < 5:
            count += 1

        from datetime import timedelta
        current += timedelta(days=1)

    return count


def get_employee(db: Session, user_id: int) -> Employee:
    employee = (
        db.query(Employee)
        .filter(Employee.user_id == user_id)
        .first()
    )

    if employee is None:
        raise HTTPException(
            status_code=403,
            detail="Your account is not linked to an employee profile",
        )

    if employee.employment_status != "ACTIVE":
        raise HTTPException(
            status_code=403,
            detail="Your employee profile is not active",
        )

    return employee


def annual_requests(
    db: Session,
    employee_id: int,
    policy_id: int,
    year: int,
    statuses: list[str],
    exclude_request_id: int | None = None,
) -> list[LeaveRequest]:
    query = db.query(LeaveRequest).filter(
        LeaveRequest.employee_id == employee_id,
        LeaveRequest.policy_id == policy_id,
        LeaveRequest.status.in_(statuses),
        LeaveRequest.start_date >= date(year, 1, 1),
        LeaveRequest.end_date <= date(year, 12, 31),
    )

    if exclude_request_id is not None:
        query = query.filter(LeaveRequest.id != exclude_request_id)

    return query.all()


@router.get("/policies", response_model=list[LeavePolicyResponse])
def list_leave_policies(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return (
        db.query(LeavePolicy)
        .filter(LeavePolicy.is_active.is_(True))
        .order_by(LeavePolicy.name)
        .all()
    )


@router.post(
    "/policies",
    response_model=LeavePolicyResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_leave_policy(
    payload: LeavePolicyCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    name = payload.name.strip()

    existing = (
        db.query(LeavePolicy)
        .filter(func.lower(LeavePolicy.name) == name.lower())
        .first()
    )

    if existing:
        raise HTTPException(409, "Leave policy name already exists")

    policy = LeavePolicy(
        name=name,
        description=payload.description,
        annual_quota=payload.annual_quota,
        is_paid=payload.is_paid,
        is_active=True,
    )

    db.add(policy)

    try:
        db.commit()
        db.refresh(policy)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Leave policy name already exists")

    return policy


@router.patch("/policies/{policy_id}", response_model=LeavePolicyResponse)
def update_leave_policy(
    policy_id: int,
    payload: LeavePolicyUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    policy = db.get(LeavePolicy, policy_id)

    if policy is None:
        raise HTTPException(404, "Leave policy not found")

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return policy

    if "name" in changes:
        if changes["name"] is None:
            raise HTTPException(422, "Policy name cannot be null")

        changes["name"] = changes["name"].strip()

        duplicate = (
            db.query(LeavePolicy)
            .filter(
                func.lower(LeavePolicy.name) == changes["name"].lower(),
                LeavePolicy.id != policy_id,
            )
            .first()
        )

        if duplicate:
            raise HTTPException(409, "Leave policy name already exists")

    for field, value in changes.items():
        setattr(policy, field, value)

    try:
        db.commit()
        db.refresh(policy)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Leave policy update conflict")

    return policy


@router.post(
    "",
    response_model=LeaveResponse,
    status_code=status.HTTP_201_CREATED,
)
async def apply_leave(
    payload: LeaveApply,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    employee = get_employee(db, current_user.id)

    policy = db.get(LeavePolicy, payload.policy_id)
    if policy is None or not policy.is_active:
        raise HTTPException(404, "Active leave policy not found")

    days = working_days(payload.start_date, payload.end_date)
    if days == 0:
        raise HTTPException(
            400,
            "The selected date range contains no working days",
        )

    overlap = (
        db.query(LeaveRequest)
        .filter(
            LeaveRequest.employee_id == employee.id,
            LeaveRequest.status.in_(["PENDING", "APPROVED"]),
            LeaveRequest.start_date <= payload.end_date,
            LeaveRequest.end_date >= payload.start_date,
        )
        .first()
    )
    if overlap:
        raise HTTPException(
            409,
            "This date range overlaps another pending or approved leave",
        )

    reserved = annual_requests(
        db,
        employee.id,
        policy.id,
        payload.start_date.year,
        ["PENDING", "APPROVED"],
    )
    reserved_days = sum(item.total_days for item in reserved)
    if reserved_days + days > policy.annual_quota:
        raise HTTPException(400, "Insufficient leave balance for this policy")

    leave = LeaveRequest(
        employee_id=employee.id,
        policy_id=policy.id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        total_days=days,
        reason=payload.reason.strip(),
        status="PENDING",
    )
    db.add(leave)

    try:
        db.commit()
        db.refresh(leave)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Unable to submit leave request")

    employee_name = f"{employee.first_name} {employee.last_name}".strip()
    date_range = f"{leave.start_date.isoformat()} to {leave.end_date.isoformat()}"
    employee_message = (
        f"Your {policy.name} leave request (#{leave.id}) for {date_range}, "
        f"{days} working day(s), has been submitted and is pending review."
    )
    reviewer_message = (
        f"{employee_name} submitted a {policy.name} leave request (#{leave.id}) "
        f"for {date_range} ({days} working day(s)). Reason: {leave.reason}"
    )

    reviewers = active_leave_reviewers(db, employee)
    notification_specs = [
        (
            current_user.id,
            "LEAVE_REQUEST",
            "Leave request submitted",
            employee_message,
            "NORMAL",
        )
    ]
    email_jobs = [
        (
            current_user.email,
            f"Leave request submitted - WorkForce AI Pro (#{leave.id})",
            employee_message,
        )
    ]

    for reviewer in reviewers:
        if reviewer.id == current_user.id:
            continue
        notification_specs.append(
            (
                reviewer.id,
                "LEAVE_REQUEST",
                "Leave request awaiting review",
                reviewer_message,
                "HIGH",
            )
        )
        email_jobs.append(
            (
                reviewer.email,
                f"Leave request awaiting review - WorkForce AI Pro (#{leave.id})",
                reviewer_message,
            )
        )

    await dispatch_leave_messages(db, notification_specs, email_jobs)
    return leave


@router.get("/me", response_model=list[LeaveResponse])
def my_leave_requests(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    employee = get_employee(db, current_user.id)

    return (
        db.query(LeaveRequest)
        .filter(LeaveRequest.employee_id == employee.id)
        .order_by(LeaveRequest.created_at.desc())
        .all()
    )


@router.get("/balance/me", response_model=LeaveBalanceResponse)
def my_leave_balance(
    year: int = Query(default_factory=lambda: date.today().year, ge=2000, le=2100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    employee = get_employee(db, current_user.id)

    policies = (
        db.query(LeavePolicy)
        .filter(LeavePolicy.is_active.is_(True))
        .order_by(LeavePolicy.name)
        .all()
    )

    items = []

    for policy in policies:
        approved = annual_requests(
            db, employee.id, policy.id, year, ["APPROVED"]
        )
        pending = annual_requests(
            db, employee.id, policy.id, year, ["PENDING"]
        )

        approved_days = sum(item.total_days for item in approved)
        pending_days = sum(item.total_days for item in pending)

        items.append(
            {
                "policy_id": policy.id,
                "policy_name": policy.name,
                "annual_quota": policy.annual_quota,
                "approved_days": approved_days,
                "pending_days": pending_days,
                "available_days": max(
                    0,
                    policy.annual_quota - approved_days - pending_days,
                ),
            }
        )

    return {"year": year, "items": items}


@router.get("", response_model=LeavePage)
def list_leave_requests(
    request_status: str | None = Query(default=None, alias="status"),
    employee_id: int | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR", "MANAGER")),
):
    query = db.query(LeaveRequest).join(
        Employee,
        Employee.id == LeaveRequest.employee_id,
    )

    if current_user.role == "MANAGER":
        manager_employee = (
            db.query(Employee)
            .filter(Employee.user_id == current_user.id)
            .first()
        )

        if manager_employee is None:
            raise HTTPException(403, "Manager employee profile not found")

        query = query.filter(Employee.manager_id == manager_employee.id)

    if employee_id is not None:
        query = query.filter(LeaveRequest.employee_id == employee_id)

    if request_status is not None:
        normalized = request_status.upper()

        if normalized not in {"PENDING", "APPROVED", "REJECTED", "CANCELLED"}:
            raise HTTPException(422, "Invalid leave status")

        query = query.filter(LeaveRequest.status == normalized)

    total = query.count()

    items = (
        query.order_by(LeaveRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.patch("/{leave_id}/decision", response_model=LeaveResponse)
async def review_leave(
    leave_id: int,
    payload: LeaveDecision,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR", "MANAGER")),
):
    leave = db.get(LeaveRequest, leave_id)
    if leave is None:
        raise HTTPException(404, "Leave request not found")
    if leave.status != "PENDING":
        raise HTTPException(409, "Only pending leave requests can be reviewed")

    employee = db.get(Employee, leave.employee_id)
    if employee is None:
        raise HTTPException(404, "Employee profile not found")
    if employee.user_id == current_user.id:
        raise HTTPException(403, "You cannot review your own leave request")

    if current_user.role == "MANAGER":
        manager_employee = (
            db.query(Employee)
            .filter(Employee.user_id == current_user.id)
            .first()
        )
        if manager_employee is None or employee.manager_id != manager_employee.id:
            raise HTTPException(
                403,
                "Managers can review leave only for direct reports",
            )

    policy = db.get(LeavePolicy, leave.policy_id)
    if payload.decision == "APPROVED":
        if policy is None:
            raise HTTPException(404, "Leave policy not found")
        other_requests = annual_requests(
            db,
            leave.employee_id,
            leave.policy_id,
            leave.start_date.year,
            ["APPROVED", "PENDING"],
            exclude_request_id=leave.id,
        )
        reserved_days = sum(item.total_days for item in other_requests)
        if reserved_days + leave.total_days > policy.annual_quota:
            raise HTTPException(409, "Leave quota is no longer available for approval")

    leave.status = payload.decision
    leave.reviewer_id = current_user.id
    leave.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    leave.reviewer_comments = payload.comments

    try:
        db.commit()
        db.refresh(leave)
    except Exception:
        db.rollback()
        raise

    employee_user = db.get(User, employee.user_id) if employee.user_id else None
    if employee_user and employee_user.is_active:
        policy_name = policy.name if policy else "Leave"
        status_label = "approved" if leave.status == "APPROVED" else "rejected"
        message = (
            f"Your {policy_name} leave request (#{leave.id}) for "
            f"{leave.start_date.isoformat()} to {leave.end_date.isoformat()} "
            f"was {status_label} by {current_user.full_name}."
        )
        if leave.reviewer_comments:
            message += f" Reviewer comments: {leave.reviewer_comments}"

        notification_specs = [
            (
                employee_user.id,
                "LEAVE_DECISION",
                f"Leave request {status_label}",
                message,
                "HIGH" if leave.status == "REJECTED" else "NORMAL",
            )
        ]
        email_jobs = [
            (
                employee_user.email,
                f"Your leave request was {status_label} - WorkForce AI Pro (#{leave.id})",
                message,
            )
        ]
        await dispatch_leave_messages(db, notification_specs, email_jobs)

    return leave
@router.post("/{leave_id}/cancel", response_model=LeaveResponse)
async def cancel_leave(
    leave_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    leave = db.get(LeaveRequest, leave_id)
    if leave is None:
        raise HTTPException(404, "Leave request not found")

    is_hr = current_user.role in {"ADMIN", "HR"}
    employee = None if is_hr else get_employee(db, current_user.id)
    is_owner = employee is not None and leave.employee_id == employee.id
    if not is_owner and not is_hr:
        raise HTTPException(403, "You cannot cancel this leave request")
    if leave.status != "PENDING":
        raise HTTPException(409, "Only pending leave requests can be cancelled")

    leave.status = "CANCELLED"
    db.commit()
    db.refresh(leave)

    policy = db.get(LeavePolicy, leave.policy_id)
    policy_name = policy.name if policy else "Leave"
    date_range = f"{leave.start_date.isoformat()} to {leave.end_date.isoformat()}"
    subject_employee = employee or db.get(Employee, leave.employee_id)
    employee_name = (
        f"{subject_employee.first_name} {subject_employee.last_name}".strip()
        if subject_employee is not None
        else f"Employee #{leave.employee_id}"
    )
    message_to_employee = f"Your {policy_name} leave request (#{leave.id}) for {date_range} has been cancelled."
    specs = [
        (current_user.id, "LEAVE_CANCELLED", "Leave request cancelled", message_to_employee, "NORMAL")
    ]
    jobs = [
        (current_user.email, f"Leave request cancelled - WorkForce AI Pro (#{leave.id})", message_to_employee)
    ]

    reviewer_message = f"{employee_name} cancelled leave request (#{leave.id}) for {date_range}."
    for reviewer in active_leave_reviewers(db, subject_employee):
        if reviewer.id == current_user.id:
            continue
        specs.append((reviewer.id, "LEAVE_CANCELLED", "Leave request cancelled", reviewer_message, "NORMAL"))
        jobs.append((reviewer.email, f"Leave request cancelled - WorkForce AI Pro (#{leave.id})", reviewer_message))

    await dispatch_leave_messages(db, specs, jobs)
    return leave
