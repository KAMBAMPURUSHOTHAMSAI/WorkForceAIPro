from datetime import datetime, timezone

import jwt

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from jwt.exceptions import InvalidTokenError
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import ALGORITHM, SECRET_KEY
from app.db.session import SessionLocal, get_db
from app.models.chat_message import ChatMessage
from app.models.user import User
from app.schemas.chat import ChatMessageResponse, ChatSend
from app.services.chat_service import chat_manager


router = APIRouter(
    prefix="/chat",
    tags=["Chat"],
)


def utc_now() -> datetime:
    """Return the current UTC time as a naive datetime for MySQL."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def validate_recipient(
    db: Session,
    recipient_id: int,
    sender_id: int,
) -> User:
    """Validate that the recipient exists and is active."""
    if recipient_id == sender_id:
        raise HTTPException(
            status_code=400,
            detail="You cannot message yourself",
        )

    recipient = db.get(User, recipient_id)

    if recipient is None or not recipient.is_active:
        raise HTTPException(
            status_code=404,
            detail="Active recipient not found",
        )

    return recipient


def message_payload(message: ChatMessage) -> dict:
    """Convert a chat message into a WebSocket event."""
    return {
        "event": "message",
        "data": {
            "id": message.id,
            "sender_id": message.sender_id,
            "recipient_id": message.recipient_id,
            "message": message.message,
            "sent_at": (
                message.sent_at.isoformat()
                if message.sent_at
                else None
            ),
            "read_at": (
                message.read_at.isoformat()
                if message.read_at
                else None
            ),
        },
    }


@router.post(
    "/messages",
    response_model=ChatMessageResponse,
    status_code=201,
)
async def send_message(
    payload: ChatSend,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message through the REST API."""
    recipient = validate_recipient(
        db,
        payload.recipient_id,
        current_user.id,
    )

    record = ChatMessage(
        sender_id=current_user.id,
        recipient_id=recipient.id,
        message=payload.message,
        sent_at=utc_now(),
    )

    try:
        db.add(record)
        db.commit()
        db.refresh(record)
    except Exception:
        db.rollback()
        raise

    event = message_payload(record)

    await chat_manager.send_to_user(
        recipient.id,
        event,
    )

    await chat_manager.send_to_user(
        current_user.id,
        event,
    )

    return record


@router.get(
    "/conversations/{other_user_id}",
    response_model=list[ChatMessageResponse],
)
def get_conversation(
    other_user_id: int,
    limit: int = Query(default=50, ge=1, le=100),
    before_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retrieve the conversation between the current user and another user."""
    validate_recipient(
        db,
        other_user_id,
        current_user.id,
    )

    query = db.query(ChatMessage).filter(
        or_(
            and_(
                ChatMessage.sender_id == current_user.id,
                ChatMessage.recipient_id == other_user_id,
            ),
            and_(
                ChatMessage.sender_id == other_user_id,
                ChatMessage.recipient_id == current_user.id,
            ),
        )
    )

    if before_id is not None:
        query = query.filter(
            ChatMessage.id < before_id,
        )

    rows = (
        query
        .order_by(ChatMessage.id.desc())
        .limit(limit)
        .all()
    )

    # Return messages oldest-first within the selected page.
    return list(reversed(rows))


@router.post(
    "/conversations/{other_user_id}/read",
)
async def mark_conversation_read(
    other_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Mark incoming messages from another user as read."""
    validate_recipient(
        db,
        other_user_id,
        current_user.id,
    )

    now = utc_now()

    updated = (
        db.query(ChatMessage)
        .filter(
            ChatMessage.sender_id == other_user_id,
            ChatMessage.recipient_id == current_user.id,
            ChatMessage.read_at.is_(None),
        )
        .update(
            {ChatMessage.read_at: now},
            synchronize_session=False,
        )
    )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    await chat_manager.send_to_user(
        other_user_id,
        {
            "event": "read_receipt",
            "data": {
                "reader_id": current_user.id,
                "read_at": now.isoformat(),
                "updated_count": updated,
            },
        },
    )

    return {
        "updated_count": updated,
    }


@router.websocket("/ws")
async def chat_websocket(
    websocket: WebSocket,
    token: str = Query(...),
):
    """
    Authenticate a WebSocket connection using an access token.
    Support live messaging and token-version validation.
    """
    db = SessionLocal()
    user = None

    try:
        # Authenticate before accepting the WebSocket connection.
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

            # Reject invalid token-version claims.
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

        # Reject missing, inactive, or invalidated user sessions.
        if (
            user is None
            or not user.is_active
            or int(user.token_version or 0) != token_version
        ):
            await websocket.close(code=4401)
            return

        await chat_manager.connect(
            user.id,
            websocket,
        )

        await websocket.send_json(
            {
                "event": "connected",
                "data": {
                    "user_id": user.id,
                },
            }
        )

        # Process messages received over the WebSocket.
        while True:
            incoming = await websocket.receive_json()

            try:
                message = ChatSend.model_validate(incoming)

                recipient = validate_recipient(
                    db,
                    message.recipient_id,
                    user.id,
                )

            except (ValueError, HTTPException) as exc:
                detail = (
                    exc.detail
                    if isinstance(exc, HTTPException)
                    else str(exc)
                )

                await websocket.send_json(
                    {
                        "event": "error",
                        "message": detail,
                    }
                )
                continue

            record = ChatMessage(
                sender_id=user.id,
                recipient_id=recipient.id,
                message=message.message,
                sent_at=utc_now(),
            )

            try:
                db.add(record)
                db.commit()
                db.refresh(record)
            except Exception:
                db.rollback()

                await websocket.send_json(
                    {
                        "event": "error",
                        "message": "Unable to save the message",
                    }
                )
                continue

            event = message_payload(record)

            # Notify both sender and recipient.
            await chat_manager.send_to_user(
                recipient.id,
                event,
            )

            await chat_manager.send_to_user(
                user.id,
                event,
            )

    except WebSocketDisconnect:
        pass

    finally:
        # Clean up the connection and database session.
        if user is not None:
            chat_manager.disconnect(
                user.id,
                websocket,
            )

        db.close()