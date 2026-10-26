from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
    func,
)

from app.db.session import Base


class PayrollRecord(Base):
    __tablename__ = "payroll_records"

    __table_args__ = (
        UniqueConstraint(
            "employee_id",
            "period_year",
            "period_month",
            name="uq_payroll_employee_period",
        ),
        CheckConstraint(
            "period_month BETWEEN 1 AND 12",
            name="ck_payroll_period_month",
        ),
        CheckConstraint(
            "gross_pay >= 0 AND total_deductions >= 0 "
            "AND net_pay >= 0",
            name="ck_payroll_amounts_nonnegative",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    period_year = Column(Integer, nullable=False)
    period_month = Column(Integer, nullable=False)

    annual_base_salary = Column(
        Numeric(12, 2), nullable=False
    )
    monthly_base_salary = Column(
        Numeric(12, 2), nullable=False
    )

    allowances = Column(
        Numeric(12, 2), nullable=False, default=0
    )
    bonus = Column(
        Numeric(12, 2), nullable=False, default=0
    )
    tax_deduction = Column(
        Numeric(12, 2), nullable=False, default=0
    )
    other_deductions = Column(
        Numeric(12, 2), nullable=False, default=0
    )

    gross_pay = Column(
        Numeric(12, 2), nullable=False
    )
    total_deductions = Column(
        Numeric(12, 2), nullable=False
    )
    net_pay = Column(
        Numeric(12, 2), nullable=False
    )

    status = Column(
        String(20), nullable=False, default="GENERATED", index=True
    )

    generated_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    paid_at = Column(DateTime(timezone=True), nullable=True)

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