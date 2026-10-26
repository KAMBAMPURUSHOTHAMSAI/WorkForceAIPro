from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.session import get_db
from app.models.attrition_prediction import AttritionPrediction
from app.models.department import Department
from app.models.employee import Employee
from app.models.workforce_recommendation import WorkforceRecommendation
from app.schemas.recommendation import RecommendationResponse


router = APIRouter(
    prefix="/recommendations",
    tags=["AI Recommendations"],
)


@router.get("", response_model=list[RecommendationResponse])
def list_recommendations(
    employee_id: int | None = None,
    department_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    query = db.query(WorkforceRecommendation)

    if employee_id is not None:
        query = query.filter(
            WorkforceRecommendation.employee_id == employee_id
        )

    if department_id is not None:
        query = query.filter(
            WorkforceRecommendation.department_id == department_id
        )

    return (
        query.order_by(WorkforceRecommendation.id.desc())
        .limit(limit)
        .all()
    )


@router.post("/generate")
def generate_recommendations(
    department_id: int | None = None,
    minimum_risk: float = Query(default=0.60, ge=0, le=1),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    if department_id is not None:
        department = db.get(Department, department_id)

        if department is None or not department.is_active:
            raise HTTPException(404, "Active department not found")

    latest_predictions = (
        db.query(
            AttritionPrediction.employee_id.label("employee_id"),
            __import__("sqlalchemy").func.max(
                AttritionPrediction.id
            ).label("prediction_id"),
        )
        .filter(
            AttritionPrediction.employee_id.isnot(None)
        )
        .group_by(AttritionPrediction.employee_id)
        .subquery()
    )

    query = (
        db.query(AttritionPrediction, Employee)
        .join(
            latest_predictions,
            AttritionPrediction.id == latest_predictions.c.prediction_id,
        )
        .join(
            Employee,
            Employee.id == AttritionPrediction.employee_id,
        )
        .filter(
            Employee.employment_status == "ACTIVE",
            AttritionPrediction.risk_probability
            >= Decimal(str(minimum_risk)),
        )
    )

    if department_id is not None:
        query = query.filter(
            Employee.department_id == department_id
        )

    rows = query.all()
    created_count = 0
    skipped_count = 0

    for prediction, employee in rows:
        existing = (
            db.query(WorkforceRecommendation)
            .filter(
                WorkforceRecommendation.prediction_id == prediction.id,
                WorkforceRecommendation.category == "RETENTION",
            )
            .first()
        )

        if existing:
            skipped_count += 1
            continue

        risk = float(prediction.risk_probability) * 100

        title = f"HR review recommended: {prediction.risk_level} risk"

        recommendation = (
            "Conduct a confidential, supportive HR conversation; "
            "validate the available information with the employee, "
            "review workload, career development and support needs, "
            "and agree on an appropriate follow-up. "
            "Do not use the model score alone to make employment decisions."
        )

        db.add(
            WorkforceRecommendation(
                employee_id=employee.id,
                department_id=employee.department_id,
                prediction_id=prediction.id,
                category="RETENTION",
                title=title,
                recommendation=recommendation,
                priority=(
                    "CRITICAL"
                    if prediction.risk_level == "CRITICAL"
                    else "HIGH"
                ),
                recommendation_data={
                    "risk_level": prediction.risk_level,
                    "risk_probability_percent": round(risk, 2),
                    "model_version": prediction.model_version,
                    "requires_human_review": True,
                },
                created_by=current_user.id,
            )
        )

        created_count += 1

    db.commit()

    return {
        "message": "Recommendation generation completed",
        "created_count": created_count,
        "skipped_existing_count": skipped_count,
    }