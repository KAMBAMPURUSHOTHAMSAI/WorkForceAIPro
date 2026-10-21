from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


EmploymentType = Literal[
    "FULL_TIME",
    "PART_TIME",
    "CONTRACT",
    "INTERN",
]

EmploymentStatus = Literal[
    "ACTIVE",
    "INACTIVE",
    "ON_LEAVE",
    "TERMINATED",
]


class EmployeeCreate(BaseModel):
    employee_code: str = Field(min_length=2, max_length=30)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    email: EmailStr

    phone: str | None = Field(default=None, max_length=25)
    job_title: str | None = Field(default=None, max_length=120)

    employment_type: EmploymentType = "FULL_TIME"
    employment_status: EmploymentStatus = "ACTIVE"

    date_of_joining: date | None = None
    base_salary: Decimal = Field(default=0, ge=0)

    department_id: int | None = None
    manager_id: int | None = None
    user_id: int | None = None


class EmployeeUpdate(BaseModel):
    employee_code: str | None = Field(
        default=None, min_length=2, max_length=30
    )
    first_name: str | None = Field(
        default=None, min_length=1, max_length=100
    )
    last_name: str | None = Field(
        default=None, min_length=1, max_length=100
    )
    email: EmailStr | None = None

    phone: str | None = Field(default=None, max_length=25)
    job_title: str | None = Field(default=None, max_length=120)

    employment_type: EmploymentType | None = None
    employment_status: EmploymentStatus | None = None

    date_of_joining: date | None = None
    base_salary: Decimal | None = Field(default=None, ge=0)

    department_id: int | None = None
    manager_id: int | None = None
    user_id: int | None = None


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_code: str
    first_name: str
    last_name: str
    email: EmailStr

    phone: str | None
    job_title: str | None

    employment_type: str
    employment_status: str

    date_of_joining: date | None
    base_salary: Decimal

    department_id: int | None
    manager_id: int | None
    user_id: int | None

    created_at: datetime
    updated_at: datetime


class EmployeePage(BaseModel):
    items: list[EmployeeResponse]
    total: int
    page: int
    page_size: int