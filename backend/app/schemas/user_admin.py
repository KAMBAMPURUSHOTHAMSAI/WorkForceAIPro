from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


AllowedRole = Literal["ADMIN", "HR", "MANAGER", "EMPLOYEE"]


class UserAdminUpdate(BaseModel):
    full_name: str | None = Field(
        default=None,
        min_length=2,
        max_length=150,
    )
    email: EmailStr | None = None
    role: AllowedRole | None = None
    is_active: bool | None = None


class UserAdminResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    role: str
    is_active: bool
    created_at: datetime