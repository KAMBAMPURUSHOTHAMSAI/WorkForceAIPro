from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class AttritionPredictRequest(BaseModel):
    dataset_version_id: int = Field(gt=0)
    employee_id: int | None = Field(default=None, gt=0)
    features: dict[str, Any]


class AttritionPredictionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int | None
    dataset_version_id: int | None
    predicted_attrition: bool
    risk_probability: Decimal
    confidence_score: Decimal
    risk_level: str
    model_version: str
    input_features: dict[str, Any]
    created_by_user_id: int | None
    created_at: datetime


class PredictionPage(BaseModel):
    items: list[AttritionPredictionResponse]
    total: int
    page: int
    page_size: int


class RiskMonitoringResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    prediction_id: int | None
    previous_risk_percent: Decimal | None
    current_risk_percent: Decimal
    risk_change_percent: Decimal | None
    risk_level: str
    reason: str | None
    detected_at: datetime


class DepartmentAttritionAnalytics(BaseModel):
    department_id: int
    department_name: str
    employees_with_predictions: int
    predicted_attrition_count: int
    average_risk_percent: float