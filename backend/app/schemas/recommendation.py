from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class RecommendationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int | None
    department_id: int | None
    prediction_id: int | None
    category: str
    title: str
    recommendation: str
    priority: str
    recommendation_data: dict[str, Any] | None
    created_by: int | None
    created_at: datetime