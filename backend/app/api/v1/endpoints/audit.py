from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.session import get_db
from app.models.audit_log import AuditLog
from app.schemas.audit import AuditLogResponse


router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=list[AuditLogResponse])
def list_audit_logs(
    action: str | None = None,
    entity_type: str | None = None,
    actor_user_id: int | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=422,
            detail="date_from must not be after date_to",
        )

    query = db.query(AuditLog)

    if action:
        query = query.filter(AuditLog.action == action.upper())

    if entity_type:
        query = query.filter(
            AuditLog.entity_type == entity_type.upper()
        )

    if actor_user_id is not None:
        query = query.filter(
            AuditLog.actor_user_id == actor_user_id
        )

    if date_from:
        query = query.filter(AuditLog.created_at >= date_from)

    if date_to:
        query = query.filter(AuditLog.created_at <= date_to)

    return (
        query.order_by(AuditLog.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )