from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class PayrollGenerate(BaseModel):
    employee_id: int = Field(gt=0)
    period_year: int = Field(ge=2000, le=2100)
    period_month: int = Field(ge=1, le=12)

    allowances: Decimal = Field(
        default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2
    )
    bonus: Decimal = Field(
        default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2
    )
    tax_deduction: Decimal = Field(
        default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2
    )
    other_deductions: Decimal = Field(
        default=Decimal("0.00"), ge=0, max_digits=12, decimal_places=2
    )


class PayrollUpdate(BaseModel):
    allowances: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    bonus: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    tax_deduction: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    other_deductions: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )


class PayrollResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    period_year: int
    period_month: int

    annual_base_salary: Decimal
    monthly_base_salary: Decimal
    allowances: Decimal
    bonus: Decimal
    tax_deduction: Decimal
    other_deductions: Decimal

    gross_pay: Decimal
    total_deductions: Decimal
    net_pay: Decimal

    status: str
    generated_by: int | None
    paid_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PayrollPage(BaseModel):
    items: list[PayrollResponse]
    total: int
    page: int
    page_size: int