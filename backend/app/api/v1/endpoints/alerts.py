from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.workforce_alert import WorkforceAlert
from app.schemas.alert import WorkforceAlertResponse


router = APIRouter(prefix="/alerts", tags=["Smart Alerts"])


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def can_manage_alert(alert: WorkforceAlert, user) -> bool:
    if user.role == "ADMIN":
        return True

    if alert.recipient_user_id == user.id:
        return True

    return (
        user.role == "HR"
        and alert.recipient_user_id is None
    )


@router.get("", response_model=list[WorkforceAlertResponse])
def list_alerts(
    status: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(WorkforceAlert)

    if current_user.role == "ADMIN":
        pass
    elif current_user.role == "HR":
        query = query.filter(
            or_(
                WorkforceAlert.recipient_user_id == current_user.id,
                WorkforceAlert.recipient_user_id.is_(None),
            )
        )
    else:
        query = query.filter(
            WorkforceAlert.recipient_user_id == current_user.id
        )

    if status:
        query = query.filter(
            WorkforceAlert.status == status.upper()
        )

    return (
        query.order_by(WorkforceAlert.id.desc())
        .limit(limit)
        .all()
    )


@router.patch(
    "/{alert_id}/acknowledge",
    response_model=WorkforceAlertResponse,
)
def acknowledge_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    alert = db.get(WorkforceAlert, alert_id)

    if alert is None or not can_manage_alert(alert, current_user):
        raise HTTPException(404, "Alert not found")

    if alert.status == "RESOLVED":
        raise HTTPException(
            409,
            "Resolved alerts cannot be acknowledged again",
        )

    if alert.status == "NEW":
        alert.status = "ACKNOWLEDGED"
        alert.acknowledged_at = utc_now()

        db.commit()
        db.refresh(alert)

    return alert


@router.patch(
    "/{alert_id}/resolve",
    response_model=WorkforceAlertResponse,
)
def resolve_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    alert = db.get(WorkforceAlert, alert_id)

    if alert is None or not can_manage_alert(alert, current_user):
        raise HTTPException(404, "Alert not found")

    if alert.status != "RESOLVED":
        alert.status = "RESOLVED"
        alert.resolved_at = utc_now()

        db.commit()
        db.refresh(alert)

    return alert