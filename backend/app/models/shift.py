from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    String,
    Time,
    func,
)

from app.db.session import Base


class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(
        String(100),
        unique=True,
        nullable=False,
        index=True,
    )

    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    break_minutes = Column(Integer, nullable=False, default=60)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )