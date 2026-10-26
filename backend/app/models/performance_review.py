from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)

from app.db.session import Base


class PerformanceReview(Base):
    __tablename__ = "performance_reviews"

    __table_args__ = (
        CheckConstraint(
            "review_period_end >= review_period_start",
            name="ck_review_period",
        ),
        CheckConstraint(
            "rating IS NULL OR (rating >= 1 AND rating <= 5)",
            name="ck_performance_rating",
        ),
        CheckConstraint(
            "status IN ('DRAFT', 'SUBMITTED', 'ACKNOWLEDGED')",
            name="ck_performance_review_status",
        ),
        UniqueConstraint(
            "employee_id",
            "review_period_start",
            "review_period_end",
            name="uq_employee_review_period",
        ),
    )

    id = Column(Integer, primary_key=True, index=True)

    employee_id = Column(
        Integer,
        ForeignKey("employees.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    reviewer_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    review_period_start = Column(Date, nullable=False)
    review_period_end = Column(Date, nullable=False)

    rating = Column(Numeric(3, 2), nullable=True)

    strengths = Column(Text, nullable=True)
    improvement_areas = Column(Text, nullable=True)
    goals = Column(Text, nullable=True)
    reviewer_comments = Column(Text, nullable=True)

    status = Column(
        String(20),
        nullable=False,
        default="DRAFT",
        index=True,
    )

    submitted_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )