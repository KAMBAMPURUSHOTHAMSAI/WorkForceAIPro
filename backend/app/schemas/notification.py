from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class NotificationCreate(BaseModel):
    target_user_id: int = Field(gt=0)
    notification_type: str = Field(
        default="GENERAL",
        min_length=2,
        max_length=50,
    )
    title: str = Field(min_length=2, max_length=150)
    message: str = Field(min_length=1, max_length=5000)
    priority: Literal["LOW", "NORMAL", "HIGH", "CRITICAL"] = "NORMAL"


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    notification_type: str
    title: str
    message: str
    priority: str
    read_status: bool
    read_at: datetime | None
    created_at: datetime