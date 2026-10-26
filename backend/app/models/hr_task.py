from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)

from app.db.session import Base


class HRTask(Base):
    __tablename__ = "hr_tasks"

    __table_args__ = (
        CheckConstraint(
            "status IN "
            "('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')",
            name="ck_hr_task_status",
        ),
        CheckConstraint(
            "priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')",
            name="ck_hr_task_priority",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)

    created_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    assigned_to = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    related_employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    status = Column(
        String(20),
        nullable=False,
        default="OPEN",
        index=True,
    )

    priority = Column(
        String(20),
        nullable=False,
        default="MEDIUM",
        index=True,
    )

    due_date = Column(Date, nullable=True, index=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )