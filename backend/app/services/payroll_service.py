from calendar import monthrange
from datetime import date
from decimal import Decimal, ROUND_HALF_UP


CENT = Decimal("0.01")


def money(value: Decimal) -> Decimal:
    return Decimal(value).quantize(
        CENT,
        rounding=ROUND_HALF_UP,
    )


def calculate_monthly_base_salary(
    annual_base_salary: Decimal,
    period_year: int,
    period_month: int,
    date_of_joining: date | None,
) -> Decimal:
    """
    Calendar-day salary proration for the requested payroll period.

    The joining date counts as a paid day. If an employee joined before the
    payroll month, the full monthly base is used. If they join during that
    month, monthly base is prorated from joining date through month-end.
    A payroll period before the employee's joining date is invalid.

    For legacy records without a joining date, preserve the prior full-month
    behavior instead of inventing an employment date.
    """
    year = int(period_year)
    month = int(period_month)
    days_in_month = monthrange(year, month)[1]
    monthly_base = money(Decimal(annual_base_salary) / Decimal("12"))

    if date_of_joining is None:
        return monthly_base

    period_start = date(year, month, 1)
    period_end = date(year, month, days_in_month)

    if date_of_joining > period_end:
        raise ValueError(
            "Cannot generate payroll for a period before the employee's joining date"
        )

    if date_of_joining <= period_start:
        return monthly_base

    payable_days = (period_end - date_of_joining).days + 1
    prorated = (
        monthly_base
        * Decimal(payable_days)
        / Decimal(days_in_month)
    )
    return money(prorated)


def calculate_payroll(
    annual_base_salary: Decimal,
    allowances: Decimal,
    bonus: Decimal,
    tax_deduction: Decimal,
    other_deductions: Decimal,
    period_year: int | None = None,
    period_month: int | None = None,
    date_of_joining: date | None = None,
) -> dict[str, Decimal]:
    # Existing callers that omit period information retain the previous
    # full-month calculation; API generation/adjustment passes these fields.
    if period_year is None and period_month is None:
        monthly_base = money(
            Decimal(annual_base_salary) / Decimal("12")
        )
    elif period_year is None or period_month is None:
        raise ValueError("Both period_year and period_month are required")
    else:
        monthly_base = calculate_monthly_base_salary(
            annual_base_salary=Decimal(annual_base_salary),
            period_year=period_year,
            period_month=period_month,
            date_of_joining=date_of_joining,
        )

    allowances = money(allowances)
    bonus = money(bonus)
    tax_deduction = money(tax_deduction)
    other_deductions = money(other_deductions)

    gross = money(monthly_base + allowances + bonus)

    deductions = money(tax_deduction + other_deductions)
    net = money(gross - deductions)

    if deductions > gross:
        raise ValueError("Total deductions cannot exceed gross pay")

    return {
        "monthly_base_salary": monthly_base,
        "allowances": allowances,
        "bonus": bonus,
        "tax_deduction": tax_deduction,
        "other_deductions": other_deductions,
        "gross_pay": gross,
        "total_deductions": deductions,
        "net_pay": net,
    }
