from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)

from app.db.session import Base


class RefreshSession(Base):
    __tablename__ = "refresh_sessions"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Store only a SHA-256 hash of the refresh token.
    token_hash = Column(
        String(64),
        nullable=False,
        unique=True,
        index=True,
    )

    # Tokens in the same family belong to one rotating session.
    family_id = Column(
        String(36),
        nullable=False,
        index=True,
    )

    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )