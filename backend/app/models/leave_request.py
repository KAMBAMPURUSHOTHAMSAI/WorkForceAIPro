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


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    __table_args__ = (
        CheckConstraint(
            "end_date >= start_date",
            name="ck_leave_request_date_range",
        ),
        CheckConstraint(
            "total_days >= 1",
            name="ck_leave_request_total_days",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    policy_id = Column(
        Integer,
        ForeignKey("leave_policies.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    start_date = Column(Date, nullable=False, index=True)
    end_date = Column(Date, nullable=False, index=True)
    total_days = Column(Integer, nullable=False)

    reason = Column(Text, nullable=False)

    status = Column(
        String(20),
        nullable=False,
        default="PENDING",
        index=True,
    )

    reviewer_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    reviewer_comments = Column(Text, nullable=True)

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