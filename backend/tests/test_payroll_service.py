"""Unit tests for the pure payroll calculation service; no database writes."""
from datetime import date
from decimal import Decimal

import pytest

from app.services.payroll_service import (
    calculate_monthly_base_salary,
    calculate_payroll,
    money,
)


def test_monthly_salary_is_annual_salary_divided_by_twelve():
    result = calculate_payroll(
        annual_base_salary=Decimal("450000.00"),
        allowances=Decimal("0.00"),
        bonus=Decimal("0.00"),
        tax_deduction=Decimal("0.00"),
        other_deductions=Decimal("0.00"),
    )
    assert result["monthly_base_salary"] == Decimal("37500.00")
    assert result["gross_pay"] == Decimal("37500.00")
    assert result["net_pay"] == Decimal("37500.00")


def test_payroll_calculates_allowances_bonus_and_deductions():
    result = calculate_payroll(
        annual_base_salary=Decimal("450000.00"),
        allowances=Decimal("1000.00"),
        bonus=Decimal("500.00"),
        tax_deduction=Decimal("200.00"),
        other_deductions=Decimal("100.00"),
    )
    assert result["gross_pay"] == Decimal("39000.00")
    assert result["total_deductions"] == Decimal("300.00")
    assert result["net_pay"] == Decimal("38700.00")


def test_money_uses_two_decimal_places_and_half_up_rounding():
    assert money(Decimal("1.005")) == Decimal("1.01")
    assert money(Decimal("1.004")) == Decimal("1.00")


def test_payroll_rejects_deductions_above_gross():
    with pytest.raises(ValueError, match="cannot exceed gross pay"):
        calculate_payroll(
            annual_base_salary=Decimal("120000.00"),
            allowances=Decimal("0.00"),
            bonus=Decimal("0.00"),
            tax_deduction=Decimal("9000.00"),
            other_deductions=Decimal("2000.00"),
        )


def test_joining_date_prorates_october_salary_by_calendar_days():
    result = calculate_payroll(
        annual_base_salary=Decimal("450000.00"),
        allowances=Decimal("0.00"),
        bonus=Decimal("0.00"),
        tax_deduction=Decimal("0.00"),
        other_deductions=Decimal("0.00"),
        period_year=2026,
        period_month=10,
        date_of_joining=date(2026, 10, 21),
    )
    assert result["monthly_base_salary"] == Decimal("13306.45")
    assert result["gross_pay"] == Decimal("13306.45")


def test_joining_date_proration_matches_45000_annual_salary_case():
    prorated = calculate_monthly_base_salary(
        annual_base_salary=Decimal("45000.00"),
        period_year=2026,
        period_month=10,
        date_of_joining=date(2026, 10, 21),
    )
    assert prorated == Decimal("1330.65")


def test_joining_before_period_gets_full_month_base_salary():
    amount = calculate_monthly_base_salary(
        annual_base_salary=Decimal("450000.00"),
        period_year=2026,
        period_month=10,
        date_of_joining=date(2026, 9, 30),
    )
    assert amount == Decimal("37500.00")


def test_payroll_before_joining_date_is_rejected():
    with pytest.raises(ValueError, match="before the employee's joining date"):
        calculate_monthly_base_salary(
            annual_base_salary=Decimal("450000.00"),
            period_year=2026,
            period_month=9,
            date_of_joining=date(2026, 10, 21),
        )
