from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ForecastRequest(BaseModel):
    forecast_year: int = Field(ge=2000, le=2100)
    forecast_month: int = Field(default=12, ge=1, le=12)
    department_id: int | None = Field(default=None, gt=0)


class ForecastResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    forecast_year: int
    forecast_month: int
    department_id: int | None
    forecast_scope: str
    predicted_headcount: int
    predicted_attrition_count: int
    attrition_rate_percent: Decimal
    stability_score: Decimal
    model_version: str
    forecast_data: dict | None
    created_by: int | None
    created_at: datetime