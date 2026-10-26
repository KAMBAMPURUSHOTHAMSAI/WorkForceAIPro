from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class InterventionCreate(BaseModel):
    employee_id: int = Field(gt=0)
    prediction_id: int | None = Field(default=None, gt=0)
    title: str = Field(min_length=3, max_length=180)
    category: str = Field(min_length=2, max_length=50)
    recommendation: str = Field(min_length=5, max_length=5000)
    assigned_to: int | None = Field(default=None, gt=0)
    follow_up_date: date | None = None


class InterventionUpdate(BaseModel):
    status: Literal[
        "OPEN",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
    ] | None = None

    assigned_to: int | None = Field(default=None, gt=0)
    follow_up_date: date | None = None
    outcome_notes: str | None = Field(default=None, max_length=5000)


class InterventionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    prediction_id: int | None
    title: str
    category: str
    recommendation: str
    assigned_to: int | None
    follow_up_date: date | None
    status: str
    outcome_notes: str | None
    completed_at: datetime | None
    created_by: int | None
    created_at: datetime