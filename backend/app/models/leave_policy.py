from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Integer,
    String,
    Text,
    func,
)

from app.db.session import Base


class LeavePolicy(Base):
    __tablename__ = "leave_policies"

    __table_args__ = (
        CheckConstraint(
            "annual_quota >= 0",
            name="ck_leave_policy_annual_quota",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String(80), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)

    annual_quota = Column(Integer, nullable=False, default=12)
    is_paid = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )