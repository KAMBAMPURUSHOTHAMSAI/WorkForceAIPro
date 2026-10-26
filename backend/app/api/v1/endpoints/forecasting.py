from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.session import get_db
from app.models.attrition_prediction import AttritionPrediction
from app.models.department import Department
from app.models.employee import Employee
from app.models.workforce_forecast import WorkforceForecast
from app.schemas.forecast import ForecastRequest, ForecastResponse


router = APIRouter(
    prefix="/forecasting",
    tags=["Workforce Forecasting"],
)


def create_forecast(
    db: Session,
    forecast_year: int,
    forecast_month: int,
    department_id: int | None,
    user_id: int,
    horizon: str,
):
    query = db.query(Employee).filter(
        Employee.employment_status == "ACTIVE"
    )

    if department_id is not None:
        department = db.get(Department, department_id)

        if department is None or not department.is_active:
            raise HTTPException(404, "Active department not found")

        query = query.filter(
            Employee.department_id == department_id
        )

    employees = query.all()

    if not employees:
        raise HTTPException(
            409,
            "No active employees are available for forecasting",
        )

    employee_ids = [employee.id for employee in employees]

    predictions = (
        db.query(AttritionPrediction)
        .filter(
            AttritionPrediction.employee_id.in_(employee_ids)
        )
        .order_by(AttritionPrediction.id.desc())
        .all()
    )

    # Keep the most recently recorded prediction per employee.
    latest_predictions = {}

    for prediction in predictions:
        latest_predictions.setdefault(
            prediction.employee_id,
            prediction,
        )

    if not latest_predictions:
        raise HTTPException(
            409,
            "Generate employee attrition predictions before forecasting",
        )

    estimated_exits = sum(
        (
            Decimal(str(item.risk_probability))
            for item in latest_predictions.values()
        ),
        Decimal("0"),
    )

    active_headcount = len(employees)
    coverage_count = len(latest_predictions)

    attrition_rate = (
        estimated_exits
        / Decimal(active_headcount)
        * Decimal("100")
    )

    stability_score = max(
        Decimal("0"),
        Decimal("100") - attrition_rate,
    )

    estimated_exits = min(
        Decimal(active_headcount),
        estimated_exits,
    )

    projected_exits_count = min(
        active_headcount,
        int(
            estimated_exits.quantize(
                Decimal("1"),
                rounding=ROUND_HALF_UP,
            )
        ),
    )

    forecast = WorkforceForecast(
        forecast_year=forecast_year,
        forecast_month=forecast_month,
        department_id=department_id,
        forecast_scope=(
            f"{'DEPARTMENT' if department_id else 'COMPANY'}_{horizon}"
        ),
        predicted_headcount=max(
            0,
            active_headcount - projected_exits_count,
        ),
        predicted_attrition_count=projected_exits_count,
        attrition_rate_percent=attrition_rate.quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        ),
        stability_score=stability_score.quantize(
            Decimal("0.01"),
            rounding=ROUND_HALF_UP,
        ),
        model_version="risk-weighted-baseline-v1",
        forecast_data={
            "method": "risk_weighted_snapshot_baseline",
            "horizon": horizon,
            "active_headcount": active_headcount,
            "employees_with_predictions": coverage_count,
            "employees_without_predictions": (
                active_headcount - coverage_count
            ),
            "estimated_expected_exits": float(estimated_exits),
            "assumptions": [
                "Uses the latest available prediction per employee",
                "Expected exits are the sum of individual risk probabilities",
                "This is a baseline scenario, not a validated time-series forecast",
            ],
        },
        created_by=user_id,
    )

    db.add(forecast)
    db.commit()
    db.refresh(forecast)

    return forecast


@router.post(
    "/generate",
    response_model=ForecastResponse,
    status_code=201,
)
def generate_monthly_forecast(
    payload: ForecastRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    return create_forecast(
        db=db,
        forecast_year=payload.forecast_year,
        forecast_month=payload.forecast_month,
        department_id=payload.department_id,
        user_id=current_user.id,
        horizon="MONTHLY",
    )


@router.post(
    "/generate-year",
    response_model=ForecastResponse,
    status_code=201,
)
def generate_yearly_forecast(
    forecast_year: int = Query(ge=2000, le=2100),
    department_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    return create_forecast(
        db=db,
        forecast_year=forecast_year,
        forecast_month=12,
        department_id=department_id,
        user_id=current_user.id,
        horizon="YEARLY",
    )


@router.get("", response_model=list[ForecastResponse])
def list_forecasts(
    forecast_year: int | None = Query(default=None, ge=2000, le=2100),
    forecast_month: int | None = Query(default=None, ge=1, le=12),
    department_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    query = db.query(WorkforceForecast)

    if forecast_year is not None:
        query = query.filter(
            WorkforceForecast.forecast_year == forecast_year
        )

    if forecast_month is not None:
        query = query.filter(
            WorkforceForecast.forecast_month == forecast_month
        )

    if department_id is not None:
        query = query.filter(
            WorkforceForecast.department_id == department_id
        )

    return (
        query.order_by(WorkforceForecast.id.desc())
        .limit(limit)
        .all()
    )