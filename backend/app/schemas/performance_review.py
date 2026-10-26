from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ReviewCreate(BaseModel):
    employee_id: int = Field(gt=0)
    review_period_start: date
    review_period_end: date
    rating: Decimal | None = Field(default=None, ge=1, le=5)

    strengths: str | None = Field(default=None, max_length=5000)
    improvement_areas: str | None = Field(default=None, max_length=5000)
    goals: str | None = Field(default=None, max_length=5000)
    reviewer_comments: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def validate_period(self):
        if self.review_period_end < self.review_period_start:
            raise ValueError("Review end date cannot precede start date")
        return self


class ReviewUpdate(BaseModel):
    rating: Decimal | None = Field(default=None, ge=1, le=5)
    strengths: str | None = Field(default=None, max_length=5000)
    improvement_areas: str | None = Field(default=None, max_length=5000)
    goals: str | None = Field(default=None, max_length=5000)
    reviewer_comments: str | None = Field(default=None, max_length=5000)


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    reviewer_id: int
    review_period_start: date
    review_period_end: date
    rating: Decimal | None
    strengths: str | None
    improvement_areas: str | None
    goals: str | None
    reviewer_comments: str | None
    status: str
    submitted_at: datetime | None
    acknowledged_at: datetime | None
    created_at: datetime
    updated_at: datetime