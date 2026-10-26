"""Validation tests for authentication, employee, and department schemas."""
from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.auth import UserRegister, UserProfileUpdate, RefreshTokenRequest
from app.schemas.employee import EmployeeCreate, EmployeeUpdate
from app.schemas.department import DepartmentCreate, DepartmentUpdate


def test_user_registration_accepts_valid_input():
    user = UserRegister(
        full_name="Sai Purushotham",
        email="sai@example.com",
        password="StrongPass123!",
    )
    assert user.email == "sai@example.com"
    assert user.full_name == "Sai Purushotham"


def test_user_registration_rejects_short_password():
    with pytest.raises(ValidationError):
        UserRegister(
            full_name="Sai",
            email="sai@example.com",
            password="short",
        )


def test_user_registration_rejects_invalid_email():
    with pytest.raises(ValidationError):
        UserRegister(
            full_name="Sai",
            email="not-an-email",
            password="StrongPass123!",
        )


def test_refresh_token_must_have_minimum_length():
    with pytest.raises(ValidationError):
        RefreshTokenRequest(refresh_token="tiny")


def test_profile_update_accepts_name_and_email():
    update = UserProfileUpdate(full_name="Sai Updated", email="sai2@example.com")
    assert update.full_name == "Sai Updated"


def test_employee_create_accepts_valid_record():
    employee = EmployeeCreate(
        employee_code="EMP-QA-01",
        first_name="Sai",
        last_name="Test",
        email="employee.qa@example.com",
        base_salary="450000.00",
        date_of_joining=date(2026, 10, 21),
    )
    assert employee.employee_code == "EMP-QA-01"
    assert employee.base_salary == 450000
    assert employee.date_of_joining == date(2026, 10, 21)


def test_employee_create_rejects_negative_salary():
    with pytest.raises(ValidationError):
        EmployeeCreate(
            employee_code="EMP-QA-02",
            first_name="Sai",
            last_name="Test",
            email="employee.qa2@example.com",
            base_salary=-1,
        )


def test_employee_create_rejects_unknown_employment_status():
    with pytest.raises(ValidationError):
        EmployeeCreate(
            employee_code="EMP-QA-03",
            first_name="Sai",
            last_name="Test",
            email="employee.qa3@example.com",
            employment_status="SUSPENDED",
        )


def test_employee_update_accepts_partial_fields():
    update = EmployeeUpdate(employment_status="INACTIVE")
    assert update.employment_status == "INACTIVE"
    assert update.first_name is None


def test_department_create_requires_meaningful_name():
    with pytest.raises(ValidationError):
        DepartmentCreate(name="A")


def test_department_update_can_toggle_active_flag():
    update = DepartmentUpdate(is_active=False)
    assert update.is_active is False
