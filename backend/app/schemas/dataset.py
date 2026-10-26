from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class DatasetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    version_number: int
    original_filename: str
    target_column: str
    total_rows: int
    valid_rows: int
    failed_rows: int
    feature_columns: list[str] | None
    validation_summary: dict[str, Any] | None
    model_metrics: dict[str, Any] | None
    status: str
    error_message: str | None
    uploaded_by: int | None
    created_at: datetime


class FailedDatasetRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    dataset_version_id: int
    row_number: int
    error_message: str
    row_data: dict[str, Any] | None
    created_at: datetime