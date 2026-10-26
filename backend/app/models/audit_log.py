from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    func,
)

from app.db.session import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"

    __table_args__ = (
        Index(
            "ix_audit_entity",
            "entity_type",
            "entity_id",
        ),
        Index(
            "ix_audit_actor_created",
            "actor_user_id",
            "created_at",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    actor_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    action = Column(String(100), nullable=False, index=True)
    entity_type = Column(String(100), nullable=False)
    entity_id = Column(String(100), nullable=True)

    details = Column(JSON, nullable=True)

    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )