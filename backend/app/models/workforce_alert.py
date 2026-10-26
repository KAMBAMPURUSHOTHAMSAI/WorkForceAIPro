from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)

from app.db.session import Base


class WorkforceAlert(Base):
    __tablename__ = "workforce_alerts"

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    prediction_id = Column(
        Integer,
        ForeignKey("attrition_predictions.id", ondelete="SET NULL"),
        nullable=True,
    )

    recipient_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title = Column(String(180), nullable=False)
    message = Column(Text, nullable=False)

    priority = Column(
        String(20),
        nullable=False,
        default="NORMAL",
        index=True,
    )

    status = Column(
        String(20),
        nullable=False,
        default="NEW",
        index=True,
    )

    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )