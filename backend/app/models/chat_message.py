from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Text,
    func,
)

from app.db.session import Base


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    __table_args__ = (
        Index(
            "ix_chat_sender_recipient_time",
            "sender_id",
            "recipient_id",
            "sent_at",
        ),
        Index(
            "ix_chat_recipient_sender_time",
            "recipient_id",
            "sender_id",
            "sent_at",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    sender_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    recipient_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    message = Column(Text, nullable=False)

    sent_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    read_at = Column(DateTime(timezone=True), nullable=True)