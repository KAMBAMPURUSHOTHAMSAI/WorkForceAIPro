from datetime import datetime

from pydantic import BaseModel, ConfigDict


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: int
    uploaded_by: int | None
    original_filename: str
    document_type: str
    content_type: str
    file_size: int
    is_deleted: bool
    uploaded_at: datetime