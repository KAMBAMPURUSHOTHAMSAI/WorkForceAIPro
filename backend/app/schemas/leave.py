from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LeavePolicyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str | None = None
    annual_quota: int = Field(default=12, ge=0, le=365)
    is_paid: bool = True


class LeavePolicyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = None
    annual_quota: int | None = Field(default=None, ge=0, le=365)
    is_paid: bool | None = None
    is_active: bool | None = None


class LeavePolicyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    annual_quota: int
    is_paid: bool
    is_active: bool
    created_at: datetime


class LeaveApply(BaseModel):
    policy_id: int = Field(gt=0)
    start_date: date
    end_date: date
    reason: str = Field(min_length=5, max_length=2000)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.end_date < self.start_date:
            raise ValueError("End date cannot be before start date")

        if self.start_date.year != self.end_date.year:
            raise ValueError(
                "Leave dates must be within the same calendar year"
            )

        return self


class LeaveDecision(BaseModel):
    decision: Literal["APPROVED", "REJECTED"]
    comments: str | None = Field(default=None, max_length=2000)


class LeaveResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    policy_id: int
    start_date: date
    end_date: date
    total_days: int
    reason: str
    status: str
    reviewer_id: int | None
    reviewed_at: datetime | None
    reviewer_comments: str | None
    created_at: datetime
    updated_at: datetime


class LeavePage(BaseModel):
    items: list[LeaveResponse]
    total: int
    page: int
    page_size: int


class LeaveBalanceItem(BaseModel):
    policy_id: int
    policy_name: str
    annual_quota: int
    approved_days: int
    pending_days: int
    available_days: int


class LeaveBalanceResponse(BaseModel):
    year: int
    items: list[LeaveBalanceItem]