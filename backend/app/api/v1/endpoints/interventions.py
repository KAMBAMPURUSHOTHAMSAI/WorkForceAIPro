from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.session import get_db
from app.models.attrition_prediction import AttritionPrediction
from app.models.employee import Employee
from app.models.hr_intervention import HRIntervention
from app.models.user import User
from app.schemas.intervention import (
    InterventionCreate,
    InterventionResponse,
    InterventionUpdate,
)
from app.services.audit_service import write_audit_log


router = APIRouter(
    prefix="/interventions",
    tags=["HR Interventions"],
)

def _audit_value(value):
    """Convert common Python values into JSON-safe audit detail values."""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


@router.post("", response_model=InterventionResponse, status_code=201)
def create_intervention(
    payload: InterventionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    employee = db.get(Employee, payload.employee_id)

    if employee is None:
        raise HTTPException(404, "Employee not found")

    if payload.prediction_id is not None:
        prediction = db.get(
            AttritionPrediction,
            payload.prediction_id,
        )

        if (
            prediction is None
            or prediction.employee_id != employee.id
        ):
            raise HTTPException(
                400,
                "Prediction does not belong to the selected employee",
            )

    if payload.assigned_to is not None:
        assignee = db.get(User, payload.assigned_to)

        if assignee is None or not assignee.is_active:
            raise HTTPException(404, "Active assignee not found")

    intervention = HRIntervention(
        employee_id=employee.id,
        prediction_id=payload.prediction_id,
        title=payload.title.strip(),
        category=payload.category.strip().upper(),
        recommendation=payload.recommendation.strip(),
        assigned_to=payload.assigned_to,
        follow_up_date=payload.follow_up_date,
        status="OPEN",
        created_by=current_user.id,
    )

    db.add(intervention)
    db.flush()

    write_audit_log(
        db,
        actor_user_id=current_user.id,
        action="CREATE",
        entity_type="HR_INTERVENTION",
        entity_id=intervention.id,
        details={
            "employee_id": intervention.employee_id,
            "prediction_id": intervention.prediction_id,
            "title": intervention.title,
            "category": intervention.category,
            "status": intervention.status,
        },
        request=request,
    )

    db.commit()
    db.refresh(intervention)

    return intervention


@router.get("", response_model=list[InterventionResponse])
def list_interventions(
    employee_id: int | None = None,
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    query = db.query(HRIntervention)

    if employee_id is not None:
        query = query.filter(
            HRIntervention.employee_id == employee_id
        )

    if status is not None:
        normalized = status.upper()

        if normalized not in {
            "OPEN",
            "IN_PROGRESS",
            "COMPLETED",
            "CANCELLED",
        }:
            raise HTTPException(422, "Invalid intervention status")

        query = query.filter(
            HRIntervention.status == normalized
        )

    return (
        query.order_by(HRIntervention.id.desc())
        .limit(limit)
        .all()
    )


@router.patch(
    "/{intervention_id}",
    response_model=InterventionResponse,
)
def update_intervention(
    intervention_id: int,
    payload: InterventionUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    intervention = db.get(
        HRIntervention,
        intervention_id,
    )

    if intervention is None:
        raise HTTPException(404, "Intervention not found")

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return intervention

    if "assigned_to" in changes and changes["assigned_to"] is not None:
        assignee = db.get(User, changes["assigned_to"])

        if assignee is None or not assignee.is_active:
            raise HTTPException(404, "Active assignee not found")

    before = {
        field: _audit_value(getattr(intervention, field, None))
        for field in changes
    }
    old_status = intervention.status
    new_status = changes.get("status", intervention.status)

    if (
        new_status == "COMPLETED"
        and intervention.status != "COMPLETED"
    ):
        intervention.completed_at = datetime.now(
            timezone.utc
        ).replace(tzinfo=None)

    if (
        "status" in changes
        and changes["status"] is None
    ):
        raise HTTPException(422, "Status cannot be null")

    for field, value in changes.items():
        setattr(intervention, field, value)

    after = {
        field: _audit_value(getattr(intervention, field, None))
        for field in changes
    }
    if new_status == "COMPLETED" and old_status != "COMPLETED":
        before["completed_at"] = None
        after["completed_at"] = _audit_value(intervention.completed_at)

    write_audit_log(
        db,
        actor_user_id=current_user.id,
        action="UPDATE",
        entity_type="HR_INTERVENTION",
        entity_id=intervention.id,
        details={
            "employee_id": intervention.employee_id,
            "changed_fields": list(changes.keys()),
            "before": before,
            "after": after,
        },
        request=request,
    )

    db.commit()
    db.refresh(intervention)

    return intervention