from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


def write_audit_log(
    db: Session,
    actor_user_id: int | None,
    action: str,
    entity_type: str,
    entity_id: int | str | None = None,
    details: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    client_ip = None
    user_agent = None

    if request is not None:
        if request.client is not None:
            client_ip = request.client.host

        user_agent = request.headers.get("user-agent")

    db.add(
        AuditLog(
            actor_user_id=actor_user_id,
            action=action,
            entity_type=entity_type,
            entity_id=(
                str(entity_id)
                if entity_id is not None
                else None
            ),
            details=details,
            ip_address=client_ip,
            user_agent=(
                user_agent[:500]
                if user_agent
                else None
            ),
        )
    )