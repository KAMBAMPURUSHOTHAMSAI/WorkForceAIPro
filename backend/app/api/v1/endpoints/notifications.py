import jwt

from datetime import datetime, timezone

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from jwt.exceptions import InvalidTokenError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.core.security import ALGORITHM, SECRET_KEY
from app.db.session import SessionLocal, get_db
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import (
    NotificationCreate,
    NotificationResponse,
)
from app.services.notification_escalation_service import (
    run_notification_escalation,
)
from app.services.notification_service import (
    notification_manager,
    notification_payload,
)


router = APIRouter(
    prefix="/notifications",
    tags=["Notifications"],
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Notification).filter(
        Notification.user_id == current_user.id
    )

    if unread_only:
        query = query.filter(
            Notification.read_status.is_(False)
        )

    return (
        query.order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/unread-count")
def get_unread_notification_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.read_status.is_(False),
        )
        .count()
    )

    return {"unread_count": count}


@router.post(
    "/escalation/run",
)
async def trigger_notification_escalation(
    current_user: User = Depends(
        require_roles("ADMIN", "HR")
    ),
):
    """Allow Admin/HR to trigger an immediate escalation sweep."""
    count = await run_notification_escalation()

    return {
        "message": "Notification escalation sweep completed",
        "created_count": count,
    }


@router.post(
    "",
    response_model=NotificationResponse,
    status_code=201,
)
async def create_notification(
    payload: NotificationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "HR")
    ),
):
    target = db.get(User, payload.target_user_id)

    if target is None or not target.is_active:
        raise HTTPException(
            status_code=404,
            detail="Active target user not found",
        )

    notification = Notification(
        user_id=target.id,
        notification_type=payload.notification_type,
        title=payload.title,
        message=payload.message,
        priority=payload.priority,
        read_status=False,
    )

    try:
        db.add(notification)
        db.commit()
        db.refresh(notification)
    except Exception:
        db.rollback()
        raise

    await notification_manager.send_to_user(
        target.id,
        {
            "event": "new_notification",
            "data": notification_payload(notification),
        },
    )

    return notification


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationResponse,
)
async def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = db.get(Notification, notification_id)

    if (
        notification is None
        or notification.user_id != current_user.id
    ):
        raise HTTPException(
            status_code=404,
            detail="Notification not found",
        )

    if not notification.read_status:
        notification.read_status = True
        notification.read_at = utc_now()

        try:
            db.commit()
            db.refresh(notification)
        except Exception:
            db.rollback()
            raise

        await notification_manager.send_to_user(
            current_user.id,
            {
                "event": "notification_updated",
                "data": notification_payload(notification),
            },
        )

    return notification


@router.post("/read-all")
async def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    now = utc_now()

    try:
        updated = (
            db.query(Notification)
            .filter(
                Notification.user_id == current_user.id,
                Notification.read_status.is_(False),
            )
            .update(
                {
                    Notification.read_status: True,
                    Notification.read_at: now,
                },
                synchronize_session=False,
            )
        )

        db.commit()

    except Exception:
        db.rollback()
        raise

    await notification_manager.send_to_user(
        current_user.id,
        {
            "event": "notifications_read_all",
            "data": {
                "updated_count": updated,
                "unread_count": 0,
            },
        },
    )

    return {
        "updated_count": updated,
        "unread_count": 0,
    }


@router.websocket("/ws")
async def notification_websocket(
    websocket: WebSocket,
    token: str = Query(...),
):
    db = SessionLocal()
    user = None
    connected = False

    try:
        try:
            payload = jwt.decode(
                token,
                SECRET_KEY,
                algorithms=[ALGORITHM],
            )

            subject = payload.get("sub")
            token_version = payload.get("ver", 0)

            if subject is None:
                await websocket.close(code=4401)
                return

            if (
                type(token_version) is not int
                or token_version < 0
            ):
                await websocket.close(code=4401)
                return

            user_id = int(subject)
            user = db.get(User, user_id)

        except (
            InvalidTokenError,
            ValueError,
            TypeError,
            KeyError,
        ):
            await websocket.close(code=4401)
            return

        if (
            user is None
            or not user.is_active
            or int(user.token_version or 0) != token_version
        ):
            await websocket.close(code=4401)
            return

        await notification_manager.connect(
            user.id,
            websocket,
        )
        connected = True

        await websocket.send_json(
            {
                "event": "connected",
                "data": {"user_id": user.id},
            }
        )

        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        pass

    finally:
        if user is not None and connected:
            notification_manager.disconnect(
                user.id,
                websocket,
            )

        db.close()