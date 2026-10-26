from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)

from app.db.session import Base


class Attendance(Base):
    __tablename__ = "attendance"

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "attendance_date",
            name="uq_attendance_employee_date",
        ),
        CheckConstraint(
            "check_out IS NULL OR check_out >= check_in",
            name="ck_attendance_checkout_after_checkin",
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
        ForeignKey("shifts.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    attendance_date = Column(Date, nullable=False, index=True)

    check_in = Column(DateTime(timezone=True), nullable=False)
    check_out = Column(DateTime(timezone=True), nullable=True)

    working_minutes = Column(Integer, nullable=False, default=0)
    overtime_minutes = Column(Integer, nullable=False, default=0)

    status = Column(
        String(20),
        nullable=False,
        default="PRESENT",
    )

    notes = Column(Text, nullable=True)

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