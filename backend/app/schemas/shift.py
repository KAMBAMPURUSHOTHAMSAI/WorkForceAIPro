from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ShiftCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    start_time: time
    end_time: time
    break_minutes: int = Field(default=60, ge=0, le=240)

    @model_validator(mode="after")
    def validate_shift(self):
        if self.start_time == self.end_time:
            raise ValueError("Start and end times must be different")
        return self


class ShiftUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=100)
    start_time: time | None = None
    end_time: time | None = None
    break_minutes: int | None = Field(default=None, ge=0, le=240)
    is_active: bool | None = None


class ShiftResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    start_time: time
    end_time: time
    break_minutes: int
    is_active: bool
    created_at: datetime


class ShiftAssignmentCreate(BaseModel):
    employee_id: int = Field(gt=0)
    effective_from: date
    effective_to: date | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        if (
            self.effective_to is not None
            and self.effective_to < self.effective_from
        ):
            raise ValueError("End date cannot be before start date")
        return self


class ShiftAssignmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    shift_id: int
    effective_from: date
    effective_to: date | None
    is_active: bool
    created_at: datetime