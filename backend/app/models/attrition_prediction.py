from sqlalchemy import (
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Boolean,
    func,
)

from app.db.session import Base


class AttritionPrediction(Base):
    __tablename__ = "attrition_predictions"

    __table_args__ = (
        CheckConstraint(
            "risk_probability >= 0 AND risk_probability <= 1",
            name="ck_prediction_probability",
        ),
        CheckConstraint(
            "confidence_score >= 0 AND confidence_score <= 1",
            name="ck_prediction_confidence",
        ),
        Index(
            "ix_prediction_employee_date",
            "employee_id",
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

    dataset_version_id = Column(
        Integer,
        ForeignKey("dataset_versions.id", ondelete="SET NULL"),
        nullable=True,
    )

    predicted_attrition = Column(Boolean, nullable=False)

    # Probability values range from 0 to 1.
    risk_probability = Column(Numeric(6, 5), nullable=False)
    confidence_score = Column(Numeric(6, 5), nullable=False)

    risk_level = Column(
        String(20),
        nullable=False,
        index=True,
    )

    model_version = Column(String(100), nullable=False)
    input_features = Column(JSON, nullable=False)

    created_by_user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )