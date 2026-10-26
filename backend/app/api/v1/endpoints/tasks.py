from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.employee import Employee
from app.models.hr_task import HRTask
from app.models.user import User
from app.schemas.task import TaskCreate, TaskResponse, TaskUpdate
from app.services.audit_service import write_audit_log


router = APIRouter(prefix="/tasks", tags=["Workflow Tasks"])


def get_manager_employee(db: Session, user_id: int):
    return (
        db.query(Employee)
        .filter(Employee.user_id == user_id)
        .first()
    )


def can_manage_task(db: Session, user, task: HRTask) -> bool:
    if user.role in {"ADMIN", "HR"}:
        return True

    manager = get_manager_employee(db, user.id)

    if manager is not None and task.assigned_to is not None:
        assigned_employee = (
            db.query(Employee)
            .filter(Employee.user_id == task.assigned_to)
            .first()
        )

        if (
            assigned_employee is not None
            and assigned_employee.manager_id == manager.id
        ):
            return True

    return task.created_by == user.id and user.role == "MANAGER"


@router.post("", response_model=TaskResponse, status_code=201)
def create_task(
    payload: TaskCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR", "MANAGER")),
):
    assigned_user = None

    if payload.assigned_to is not None:
        assigned_user = db.get(User, payload.assigned_to)

        if assigned_user is None or not assigned_user.is_active:
            raise HTTPException(404, "Active assignee not found")

    if payload.related_employee_id is not None:
        related = db.get(Employee, payload.related_employee_id)

        if related is None:
            raise HTTPException(404, "Related employee not found")

    if current_user.role == "MANAGER":
        manager = get_manager_employee(db, current_user.id)

        if manager is None:
            raise HTTPException(
                403,
                "Manager account must be linked to an employee profile",
            )

        if assigned_user is not None:
            assigned_employee = (
                db.query(Employee)
                .filter(Employee.user_id == assigned_user.id)
                .first()
            )

            if (
                assigned_employee is None
                or assigned_employee.manager_id != manager.id
            ):
                raise HTTPException(
                    403,
                    "Managers can assign tasks only to their direct reports",
                )

    task = HRTask(
        title=payload.title.strip(),
        description=payload.description,
        created_by=current_user.id,
        assigned_to=payload.assigned_to,
        related_employee_id=payload.related_employee_id,
        priority=payload.priority,
        due_date=payload.due_date,
        status="OPEN",
    )

    db.add(task)
    db.flush()

    write_audit_log(
        db,
        actor_user_id=current_user.id,
        action="CREATE",
        entity_type="HR_TASK",
        entity_id=task.id,
        details={
            "title": task.title,
            "assigned_to": task.assigned_to,
            "priority": task.priority,
        },
        request=request,
    )

    db.commit()
    db.refresh(task)

    return task


@router.get("", response_model=list[TaskResponse])
def list_tasks(
    task_status: str | None = Query(default=None, alias="status"),
    assigned_to: int | None = None,
    due_before: date | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(HRTask)

    if current_user.role == "ADMIN" or current_user.role == "HR":
        pass

    elif current_user.role == "MANAGER":
        manager = get_manager_employee(db, current_user.id)

        if manager is None:
            raise HTTPException(403, "Manager profile not found")

        report_user_ids = (
            db.query(Employee.user_id)
            .filter(
                Employee.manager_id == manager.id,
                Employee.user_id.isnot(None),
            )
        )

        query = query.filter(
            or_(
                HRTask.created_by == current_user.id,
                HRTask.assigned_to == current_user.id,
                HRTask.assigned_to.in_(report_user_ids),
            )
        )

    else:
        query = query.filter(HRTask.assigned_to == current_user.id)

    if assigned_to is not None:
        # Non-admins cannot widen their access scope through this filter.
        if current_user.role in {"ADMIN", "HR"}:
            query = query.filter(HRTask.assigned_to == assigned_to)
        elif assigned_to != current_user.id:
            raise HTTPException(403, "You cannot filter tasks for another user")

    if task_status:
        normalized = task_status.upper()

        if normalized not in {
            "OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"
        }:
            raise HTTPException(422, "Invalid task status")

        query = query.filter(HRTask.status == normalized)

    if due_before:
        query = query.filter(HRTask.due_date <= due_before)

    return (
        query.order_by(HRTask.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    task = db.get(HRTask, task_id)

    if task is None:
        raise HTTPException(404, "Task not found")

    is_admin_hr = current_user.role in {"ADMIN", "HR"}
    is_assignee = task.assigned_to == current_user.id
    can_manage = can_manage_task(db, current_user, task)

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return task

    if is_assignee and not is_admin_hr and not can_manage:
        if set(changes) - {"status"}:
            raise HTTPException(
                403,
                "Assignees may update task status only",
            )

        if changes.get("status") not in {"IN_PROGRESS", "COMPLETED"}:
            raise HTTPException(422, "Invalid status transition")

    elif not can_manage:
        raise HTTPException(403, "You cannot update this task")

    old_status = task.status

    for field, value in changes.items():
        setattr(task, field, value)

    if task.status == "COMPLETED":
        if task.completed_at is None:
            task.completed_at = datetime.now(timezone.utc).replace(
                tzinfo=None
            )
    else:
        task.completed_at = None

    write_audit_log(
        db,
        actor_user_id=current_user.id,
        action="UPDATE",
        entity_type="HR_TASK",
        entity_id=task.id,
        details={
            "previous_status": old_status,
            "new_status": task.status,
            "changed_fields": list(changes.keys()),
        },
        request=request,
    )

    db.commit()
    db.refresh(task)

    return task