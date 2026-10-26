from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    func,
)

from app.db.session import Base


class WorkforceRecommendation(Base):
    __tablename__ = "workforce_recommendations"

    __table_args__ = (
        Index(
            "ix_workforce_recommendation_created",
            "created_at",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    department_id = Column(
        Integer,
        ForeignKey("departments.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    prediction_id = Column(
        Integer,
        ForeignKey("attrition_predictions.id", ondelete="SET NULL"),
        nullable=True,
    )

    category = Column(String(50), nullable=False)
    title = Column(String(180), nullable=False)
    recommendation = Column(Text, nullable=False)
    priority = Column(String(20), nullable=False, default="NORMAL")

    recommendation_data = Column(JSON, nullable=True)

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