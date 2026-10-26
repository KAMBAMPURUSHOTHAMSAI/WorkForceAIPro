from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


TaskStatus = Literal[
    "OPEN",
    "IN_PROGRESS",
    "COMPLETED",
    "CANCELLED",
]

TaskPriority = Literal[
    "LOW",
    "MEDIUM",
    "HIGH",
    "URGENT",
]


class TaskCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    assigned_to: int | None = Field(default=None, gt=0)
    related_employee_id: int | None = Field(default=None, gt=0)
    priority: TaskPriority = "MEDIUM"
    due_date: date | None = None


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=3, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    assigned_to: int | None = Field(default=None, gt=0)
    related_employee_id: int | None = Field(default=None, gt=0)
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    due_date: date | None = None

    @model_validator(mode="after")
    def validate_update(self):
        if not self.model_fields_set:
            raise ValueError("At least one field is required")
        return self


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None
    created_by: int
    assigned_to: int | None
    related_employee_id: int | None
    status: str
    priority: str
    due_date: date | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime