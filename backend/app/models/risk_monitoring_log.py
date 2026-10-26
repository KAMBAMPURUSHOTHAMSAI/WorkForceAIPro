from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
)

from app.db.session import Base


class RiskMonitoringLog(Base):
    __tablename__ = "risk_monitoring_logs"

    __table_args__ = (
        Index(
            "ix_risk_employee_detected",
            "employee_id",
            "detected_at",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    prediction_id = Column(
        Integer,
        ForeignKey("attrition_predictions.id", ondelete="SET NULL"),
        nullable=True,
    )

    previous_risk_percent = Column(Numeric(5, 2), nullable=True)
    current_risk_percent = Column(Numeric(5, 2), nullable=False)
    risk_change_percent = Column(Numeric(6, 2), nullable=True)

    risk_level = Column(String(20), nullable=False, index=True)
    reason = Column(Text, nullable=True)

    detected_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )