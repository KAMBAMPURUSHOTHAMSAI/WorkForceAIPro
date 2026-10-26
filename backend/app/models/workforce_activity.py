from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    func,
)

from app.db.session import Base


class WorkforceActivity(Base):
    __tablename__ = "workforce_activities"

    __table_args__ = (
        Index(
            "ix_workforce_activity_created",
            "created_at",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    actor_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    activity_type = Column(String(80), nullable=False, index=True)
    description = Column(Text, nullable=False)
    activity_data = Column(JSON, nullable=True)

    source = Column(String(50), nullable=False, default="APPLICATION")

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )