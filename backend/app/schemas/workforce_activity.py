from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class WorkforceActivityCreate(BaseModel):
    employee_id: int | None = Field(default=None, gt=0)
    activity_type: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=1, max_length=2000)
    activity_data: dict[str, Any] | None = None


class WorkforceActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int | None
    actor_user_id: int | None
    activity_type: str
    description: str
    activity_data: dict[str, Any] | None
    source: str
    created_at: datetime