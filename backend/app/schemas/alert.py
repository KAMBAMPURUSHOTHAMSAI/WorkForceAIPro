from datetime import datetime

from pydantic import BaseModel, ConfigDict


class WorkforceAlertResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int | None
    prediction_id: int | None
    recipient_user_id: int | None
    title: str
    message: str
    priority: str
    status: str
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime