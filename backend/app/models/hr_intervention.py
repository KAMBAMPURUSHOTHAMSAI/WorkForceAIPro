from sqlalchemy import (
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)

from app.db.session import Base


class HRIntervention(Base):
    __tablename__ = "hr_interventions"

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

    title = Column(String(180), nullable=False)
    category = Column(String(50), nullable=False)
    recommendation = Column(Text, nullable=False)

    assigned_to = Column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    follow_up_date = Column(Date, nullable=True)

    status = Column(
        String(20),
        nullable=False,
        default="OPEN",
        index=True,
    )

    outcome_notes = Column(Text, nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

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