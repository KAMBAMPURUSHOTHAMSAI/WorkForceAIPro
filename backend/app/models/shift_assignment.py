from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)

from app.db.session import Base


class ShiftAssignment(Base):
    __tablename__ = "shift_assignments"

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "effective_from",
            name="uq_shift_assignment_employee_start",
        ),
        CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_shift_assignment_date_range",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    shift_id = Column(
        Integer,
        ForeignKey("shifts.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    effective_from = Column(Date, nullable=False)
    effective_to = Column(Date, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )