import json
from decimal import Decimal, ROUND_HALF_UP

import joblib
import pandas as pd

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.session import get_db
from app.ml.attrition import MODEL_DIR
from app.models.attrition_prediction import AttritionPrediction
from app.models.dataset_version import DatasetVersion
from app.models.department import Department
from app.models.employee import Employee
from app.models.hr_intervention import HRIntervention
from app.models.notification import Notification
from app.models.risk_monitoring_log import RiskMonitoringLog
from app.models.user import User
from app.models.workforce_alert import WorkforceAlert
from app.schemas.attrition import (
    AttritionPredictRequest,
    AttritionPredictionResponse,
    DepartmentAttritionAnalytics,
    PredictionPage,
    RiskMonitoringResponse,
)


router = APIRouter(prefix="/attrition", tags=["AI Attrition"])


def money_percent(value: float) -> Decimal:
    return Decimal(str(value)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )


def probability_decimal(value: float) -> Decimal:
    return Decimal(str(value)).quantize(
        Decimal("0.00001"),
        rounding=ROUND_HALF_UP,
    )


def classify_risk(probability: float) -> str:
    if probability >= 0.80:
        return "CRITICAL"
    if probability >= 0.60:
        return "HIGH"
    if probability >= 0.30:
        return "MEDIUM"
    return "LOW"


def numeric_columns_from_model(model) -> list[str]:
    preprocessor = model.named_steps["preprocessor"]
    numeric_columns = []

    for name, transformer, columns in preprocessor.transformers_:
        if name == "numeric":
            numeric_columns.extend(list(columns))

    return numeric_columns


def get_previous_prediction(
    db: Session,
    employee_id: int,
):
    return (
        db.query(AttritionPrediction)
        .filter(AttritionPrediction.employee_id == employee_id)
        .order_by(
            AttritionPrediction.id.desc()
        )
        .first()
    )


def create_risk_alerts(
    db: Session,
    employee: Employee,
    prediction: AttritionPrediction,
    risk_level: str,
    previous_percent: Decimal | None,
    current_percent: Decimal,
):
    recipients = (
        db.query(User)
        .filter(
            User.is_active.is_(True),
            User.role.in_(["ADMIN", "HR"]),
        )
        .all()
    )

    priority = (
        "CRITICAL"
        if risk_level == "CRITICAL"
        else "HIGH"
    )

    title = f"Employee attrition risk: {risk_level}"

    message = (
        f"Employee {employee.employee_code} has an estimated "
        f"attrition risk of {current_percent}%."
    )

    if previous_percent is not None:
        message += (
            f" Previous risk: {previous_percent}%;"
            f" change: {current_percent - previous_percent}%."
        )

    # Retain a system-level alert even if no HR recipient is active.
    if not recipients:
        db.add(
            WorkforceAlert(
                employee_id=employee.id,
                prediction_id=prediction.id,
                recipient_user_id=None,
                title=title,
                message=message,
                priority=priority,
                status="NEW",
            )
        )
        return

    for recipient in recipients:
        db.add(
            WorkforceAlert(
                employee_id=employee.id,
                prediction_id=prediction.id,
                recipient_user_id=recipient.id,
                title=title,
                message=message,
                priority=priority,
                status="NEW",
            )
        )

        db.add(
            Notification(
                user_id=recipient.id,
                notification_type="ATTRITION_RISK",
                title=title,
                message=message,
                priority=priority,
                read_status=False,
            )
        )


@router.post(
    "/predict",
    response_model=AttritionPredictionResponse,
)
def predict_attrition(
    payload: AttritionPredictRequest,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    dataset = db.get(
        DatasetVersion,
        payload.dataset_version_id,
    )

    if dataset is None:
        raise HTTPException(
            status_code=404,
            detail="Dataset version not found",
        )

    if dataset.status != "TRAINED":
        raise HTTPException(
            status_code=409,
            detail="The selected dataset has no trained model",
        )

    feature_columns = dataset.feature_columns or []

    if not feature_columns:
        raise HTTPException(
            status_code=422,
            detail="Dataset has no registered feature columns",
        )

    supplied_features = payload.features

    missing = sorted(
        set(feature_columns) - set(supplied_features)
    )
    unexpected = sorted(
        set(supplied_features) - set(feature_columns)
    )

    if missing or unexpected:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Input features do not match the trained model",
                "missing_features": missing,
                "unexpected_features": unexpected,
            },
        )

    employee = None

    if payload.employee_id is not None:
        employee = db.get(Employee, payload.employee_id)

        if employee is None:
            raise HTTPException(
                status_code=404,
                detail="Employee not found",
            )

        if employee.employment_status != "ACTIVE":
            raise HTTPException(
                status_code=409,
                detail="Predictions are restricted to active employee profiles",
            )

    artifact_path = (
        MODEL_DIR / f"attrition_dataset_{dataset.id}.joblib"
    )

    if not artifact_path.is_file():
        raise HTTPException(
            status_code=404,
            detail="Trained model artifact was not found",
        )

    try:
        model = joblib.load(artifact_path)
    except Exception:
        raise HTTPException(
            status_code=500,
            detail="Unable to load the trained model artifact",
        )

    frame = pd.DataFrame(
        [
            {
                column: supplied_features[column]
                for column in feature_columns
            }
        ],
        columns=feature_columns,
    )

    # Validate numeric values instead of silently accepting bad input.
    for column in numeric_columns_from_model(model):
        original = frame[column]
        converted = pd.to_numeric(
            original,
            errors="coerce",
        )

        invalid = original.notna() & converted.isna()

        if invalid.any():
            raise HTTPException(
                status_code=422,
                detail=f"Feature '{column}' must be numeric",
            )

        frame[column] = converted

    try:
        raw_prediction = model.predict(frame)[0]
        probabilities = model.predict_proba(frame)[0]

        classes = list(
            model.named_steps["classifier"].classes_
        )

        if 1 not in classes:
            raise ValueError(
                "The trained model has no positive attrition class"
            )

        positive_index = classes.index(1)

        probability = float(
            probabilities[positive_index]
        )

        # Maximum class probability is used as a simple confidence
        # proxy; it is not a guarantee that the model is calibrated.
        confidence = float(max(probabilities))

    except Exception:
        raise HTTPException(
            status_code=422,
            detail="The supplied features could not be processed by this model",
        )

    risk_level = classify_risk(probability)

    # Avoid storing non-JSON-native values in the database.
    safe_features = json.loads(
        json.dumps(supplied_features, default=str)
    )

    previous = None

    if employee is not None:
        previous = get_previous_prediction(
            db,
            employee.id,
        )

    prediction = AttritionPrediction(
        employee_id=employee.id if employee else None,
        dataset_version_id=dataset.id,
        predicted_attrition=bool(int(raw_prediction) == 1),
        risk_probability=probability_decimal(probability),
        confidence_score=probability_decimal(confidence),
        risk_level=risk_level,
        model_version=(
            dataset.model_metrics.get(
                "model_version",
                f"random-forest-v1-dataset-{dataset.id}",
            )
            if dataset.model_metrics
            else f"random-forest-v1-dataset-{dataset.id}"
        ),
        input_features=safe_features,
        created_by_user_id=current_user.id,
    )

    try:
        db.add(prediction)
        db.flush()

        if employee is not None:
            current_percent = money_percent(
                probability * 100
            )

            previous_percent = (
                money_percent(
                    float(previous.risk_probability) * 100
                )
                if previous is not None
                else None
            )

            change = (
                current_percent - previous_percent
                if previous_percent is not None
                else None
            )

            db.add(
                RiskMonitoringLog(
                    employee_id=employee.id,
                    prediction_id=prediction.id,
                    previous_risk_percent=previous_percent,
                    current_risk_percent=current_percent,
                    risk_change_percent=change,
                    risk_level=risk_level,
                    reason="New ML attrition prediction",
                )
            )

            # Alert on new high/critical risk, or a substantial
            # increase in risk. Alerts do not make employment decisions.
            should_alert = (
                risk_level in {"HIGH", "CRITICAL"}
                and (
                    previous is None
                    or previous.risk_level not in {"HIGH", "CRITICAL"}
                    or (
                        change is not None
                        and change >= Decimal("15.00")
                    )
                )
            )

            if should_alert:
                create_risk_alerts(
                    db=db,
                    employee=employee,
                    prediction=prediction,
                    risk_level=risk_level,
                    previous_percent=previous_percent,
                    current_percent=current_percent,
                )

        db.commit()
        db.refresh(prediction)

    except Exception:
        db.rollback()
        raise

    return prediction


@router.get(
    "/predictions",
    response_model=PredictionPage,
)
def list_predictions(
    employee_id: int | None = None,
    risk_level: str | None = None,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    query = db.query(AttritionPrediction)

    if employee_id is not None:
        query = query.filter(
            AttritionPrediction.employee_id == employee_id
        )

    if risk_level is not None:
        normalized = risk_level.upper()

        if normalized not in {
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL",
        }:
            raise HTTPException(
                status_code=422,
                detail="Invalid risk level",
            )

        query = query.filter(
            AttritionPrediction.risk_level == normalized
        )

    total = query.count()

    items = (
        query.order_by(AttritionPrediction.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get(
    "/monitoring",
    response_model=list[RiskMonitoringResponse],
)
def risk_monitoring_logs(
    employee_id: int | None = None,
    risk_level: str | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    query = db.query(RiskMonitoringLog)

    if employee_id is not None:
        query = query.filter(
            RiskMonitoringLog.employee_id == employee_id
        )

    if risk_level:
        normalized = risk_level.upper()

        if normalized not in {
            "LOW",
            "MEDIUM",
            "HIGH",
            "CRITICAL",
        }:
            raise HTTPException(
                status_code=422,
                detail="Invalid risk level",
            )

        query = query.filter(
            RiskMonitoringLog.risk_level == normalized
        )

    return (
        query.order_by(RiskMonitoringLog.id.desc())
        .limit(limit)
        .all()
    )


@router.get(
    "/analytics/departments",
    response_model=list[DepartmentAttritionAnalytics],
)
def department_attrition_analytics(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    # Choose the most recently inserted prediction for each employee.
    latest = (
        db.query(
            AttritionPrediction.employee_id.label("employee_id"),
            func.max(AttritionPrediction.id).label("prediction_id"),
        )
        .filter(AttritionPrediction.employee_id.isnot(None))
        .group_by(AttritionPrediction.employee_id)
        .subquery()
    )

    rows = (
        db.query(
            Department.id.label("department_id"),
            Department.name.label("department_name"),
            func.count(AttritionPrediction.id).label(
                "employees_with_predictions"
            ),
            func.sum(
                case(
                    (
                        AttritionPrediction.predicted_attrition.is_(True),
                        1,
                    ),
                    else_=0,
                )
            ).label("predicted_attrition_count"),
            func.avg(
                AttritionPrediction.risk_probability
            ).label("average_probability"),
        )
        .join(
            Employee,
            Employee.department_id == Department.id,
        )
        .join(
            latest,
            latest.c.employee_id == Employee.id,
        )
        .join(
            AttritionPrediction,
            AttritionPrediction.id == latest.c.prediction_id,
        )
        .group_by(Department.id, Department.name)
        .order_by(Department.name)
        .all()
    )

    return [
        {
            "department_id": row.department_id,
            "department_name": row.department_name,
            "employees_with_predictions": row.employees_with_predictions,
            "predicted_attrition_count": (
                row.predicted_attrition_count or 0
            ),
            "average_risk_percent": round(
                float(row.average_probability or 0) * 100,
                2,
            ),
        }
        for row in rows
    ]