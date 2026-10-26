from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    func,
)

from app.db.session import Base


class WorkforceForecast(Base):
    __tablename__ = "workforce_forecasts"

    __table_args__ = (
        Index(
            "ix_workforce_forecast_period",
            "forecast_year",
            "forecast_month",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    forecast_year = Column(Integer, nullable=False)
    forecast_month = Column(Integer, nullable=False)

    department_id = Column(
        Integer,
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    forecast_scope = Column(
        String(30),
        nullable=False,
        default="COMPANY",
    )

    predicted_headcount = Column(Integer, nullable=False)
    predicted_attrition_count = Column(Integer, nullable=False, default=0)

    attrition_rate_percent = Column(Numeric(5, 2), nullable=False, default=0)
    stability_score = Column(Numeric(5, 2), nullable=False, default=0)

    model_version = Column(String(100), nullable=False)
    forecast_data = Column(JSON, nullable=True)

    created_by = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )