import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.notification import Notification
from app.models.user import User
from app.services.notification_service import (
    notification_manager,
    notification_payload,
)

logger = logging.getLogger(__name__)

ESCALATION_PRIORITIES = ("HIGH", "CRITICAL", "URGENT")


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def get_escalation_threshold_minutes() -> int:
    try:
        value = int(
            os.getenv("NOTIFICATION_ESCALATION_MINUTES", "30")
        )
        return max(1, value)
    except (TypeError, ValueError):
        return 30


def get_poll_interval_seconds() -> int:
    try:
        value = int(
            os.getenv("NOTIFICATION_ESCALATION_INTERVAL_SECONDS", "60")
        )
        return max(15, value)
    except (TypeError, ValueError):
        return 60


def run_escalation_sweep(
) -> tuple[int, list[tuple[int, dict]]]:
    """
    Find overdue unread notifications and create one escalation
    notification per source notification and recipient.
    """
    db: Session = SessionLocal()
    deliveries: list[tuple[int, dict]] = []

    try:
        now = utc_now()
        threshold = get_escalation_threshold_minutes()
        cutoff = now - timedelta(minutes=threshold)

        overdue_notifications = (
            db.query(Notification)
            .filter(
                Notification.read_status.is_(False),
                func.upper(Notification.priority).in_(
                    ESCALATION_PRIORITIES
                ),
                Notification.created_at <= cutoff,
                func.upper(Notification.notification_type)
                != "ESCALATION",
            )
            .order_by(Notification.created_at.asc())
            .limit(500)
            .all()
        )

        if not overdue_notifications:
            return 0, []

        recipients = (
            db.query(User)
            .filter(
                User.role.in_(["ADMIN", "HR"]),
                User.is_active.is_(True),
            )
            .all()
        )

        if not recipients:
            logger.warning(
                "Notification escalation skipped: "
                "no active Admin or HR recipients"
            )
            return 0, []

        created_notifications = []

        for source in overdue_notifications:
            marker = f"Original notification ID: {source.id}"

            for recipient in recipients:
                # Do not escalate an alert back to its own recipient.
                if recipient.id == source.user_id:
                    continue

                existing = (
                    db.query(Notification.id)
                    .filter(
                        Notification.user_id == recipient.id,
                        Notification.notification_type == "ESCALATION",
                        Notification.message.like(f"%{marker}%"),
                    )
                    .first()
                )

                if existing:
                    continue

                escalation = Notification(
                    user_id=recipient.id,
                    notification_type="ESCALATION",
                    title=f"Escalation: {source.title}"[:150],
                    message=(
                        f"An unread {source.priority} notification "
                        f"has remained unread for at least "
                        f"{threshold} minutes.\n"
                        f"{marker}\n"
                        f"Original recipient user ID: {source.user_id}\n"
                        f"Original notification title: {source.title}"
                    ),
                    priority="CRITICAL",
                    read_status=False,
                )

                db.add(escalation)
                created_notifications.append(
                    (recipient.id, escalation)
                )

        if not created_notifications:
            return 0, []

        # Persist all escalations before notifying connected clients.
        db.commit()

        for recipient_id, notification in created_notifications:
            db.refresh(notification)
            deliveries.append(
                (
                    recipient_id,
                    notification_payload(notification),
                )
            )

        return len(created_notifications), deliveries

    except Exception:
        db.rollback()
        logger.exception("Notification escalation sweep failed")
        raise

    finally:
        db.close()


async def run_notification_escalation() -> int:
    """Run one escalation sweep and broadcast newly created items."""
    count, deliveries = await asyncio.to_thread(
        run_escalation_sweep
    )

    for recipient_id, payload in deliveries:
        await notification_manager.send_to_user(
            recipient_id,
            {
                "event": "new_notification",
                "data": payload,
            },
        )

    return count


async def notification_escalation_loop() -> None:
    """Periodically process overdue notifications."""
    logger.info("Notification escalation worker started")

    while True:
        try:
            count = await run_notification_escalation()

            if count:
                logger.info(
                    "Created %s escalation notifications",
                    count,
                )

        except asyncio.CancelledError:
            raise

        except Exception:
            logger.exception(
                "Notification escalation worker iteration failed"
            )

        await asyncio.sleep(get_poll_interval_seconds())