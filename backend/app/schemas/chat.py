from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class ChatSend(BaseModel):
    recipient_id: int
    message: str = Field(min_length=1, max_length=4000)

    @model_validator(mode="after")
    def validate_message(self):
        self.message = self.message.strip()

        if not self.message:
            raise ValueError("Message cannot be empty")

        return self


class ChatMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    sender_id: int
    recipient_id: int
    message: str
    sent_at: datetime
    read_at: datetime | None