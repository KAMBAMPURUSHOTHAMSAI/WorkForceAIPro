from datetime import date, datetime

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AttendanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    shift_id: int | None
    attendance_date: date
    check_in: datetime
    check_out: datetime | None
    working_minutes: int
    overtime_minutes: int
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime


class AttendancePage(BaseModel):
    items: list[AttendanceResponse]
    total: int
    page: int
    page_size: int

class AttendanceCorrection(BaseModel):
    """Admin/HR correction payload. A reason is required for auditability."""

    check_in: datetime | None = None
    check_out: datetime | None = None
    status: Literal["PRESENT", "LATE", "HALF_DAY", "MISSED_CHECKOUT"] | None = None
    notes: str | None = Field(default=None, max_length=2000)
    correction_reason: str = Field(min_length=5, max_length=500)
