from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.session import get_db
from app.models.attendance import Attendance
from app.models.attrition_prediction import AttritionPrediction
from app.models.department import Department
from app.models.employee import Employee
from app.models.hr_intervention import HRIntervention
from app.models.hr_task import HRTask
from app.models.leave_request import LeaveRequest
from app.models.payroll import PayrollRecord
from app.models.workforce_alert import WorkforceAlert
from app.schemas.dashboard import (
    AttendanceSummary,
    AttritionSummary,
    DashboardOverview,
    DepartmentAnalytics,
    PayrollSummary,
)


router = APIRouter(
    prefix="/dashboard",
    tags=["Workforce Dashboard"],
)

BUSINESS_TIMEZONE = ZoneInfo("Asia/Kolkata")


def today_in_business_timezone() -> date:
    return datetime.now(BUSINESS_TIMEZONE).date()


def latest_prediction_subquery(db: Session):
    return (
        db.query(
            AttritionPrediction.employee_id.label("employee_id"),
            func.max(AttritionPrediction.id).label("prediction_id"),
        )
        .filter(AttritionPrediction.employee_id.isnot(None))
        .group_by(AttritionPrediction.employee_id)
        .subquery()
    )


@router.get("/overview", response_model=DashboardOverview)
def dashboard_overview(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    today = today_in_business_timezone()

    total_employees = db.query(Employee).count()

    active_employees = (
        db.query(Employee)
        .filter(Employee.employment_status == "ACTIVE")
        .count()
    )

    inactive_employees = total_employees - active_employees

    active_departments = (
        db.query(Department)
        .filter(Department.is_active.is_(True))
        .count()
    )

    attendance_today = (
        db.query(Attendance)
        .filter(Attendance.attendance_date == today)
        .count()
    )

    pending_leaves = (
        db.query(LeaveRequest)
        .filter(LeaveRequest.status == "PENDING")
        .count()
    )

    latest = latest_prediction_subquery(db)

    high_risk_employees = (
        db.query(AttritionPrediction)
        .join(
            latest,
            AttritionPrediction.id == latest.c.prediction_id,
        )
        .filter(
            AttritionPrediction.risk_level.in_(
                ["HIGH", "CRITICAL"]
            )
        )
        .count()
    )

    open_tasks = (
        db.query(HRTask)
        .filter(
            HRTask.status.in_(["OPEN", "IN_PROGRESS"])
        )
        .count()
    )

    open_interventions = (
        db.query(HRIntervention)
        .filter(
            HRIntervention.status.in_(
                ["OPEN", "IN_PROGRESS"]
            )
        )
        .count()
    )

    unresolved_alerts = (
        db.query(WorkforceAlert)
        .filter(
            WorkforceAlert.status.in_(
                ["NEW", "ACKNOWLEDGED"]
            )
        )
        .count()
    )

    return DashboardOverview(
        total_employees=total_employees,
        active_employees=active_employees,
        inactive_employees=inactive_employees,
        active_departments=active_departments,
        attendance_records_today=attendance_today,
        pending_leave_requests=pending_leaves,
        high_risk_employees=high_risk_employees,
        open_tasks=open_tasks,
        open_interventions=open_interventions,
        unresolved_alerts=unresolved_alerts,
    )


@router.get(
    "/attendance-summary",
    response_model=AttendanceSummary,
)
def attendance_summary(
    report_date: date | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    target_date = report_date or today_in_business_timezone()

    query = db.query(Attendance).filter(
        Attendance.attendance_date == target_date
    )

    total_records = query.count()

    checked_out = query.filter(
        Attendance.check_out.isnot(None)
    ).count()

    checked_in = query.filter(
        Attendance.check_out.is_(None)
    ).count()

    result = query.with_entities(
        func.avg(Attendance.working_minutes),
        func.sum(Attendance.overtime_minutes),
    ).one()

    average_working_minutes = result[0] or 0
    total_overtime_minutes = result[1] or 0

    return AttendanceSummary(
        report_date=target_date,
        total_records=total_records,
        checked_in=checked_in,
        checked_out=checked_out,
        average_working_hours=round(
            float(average_working_minutes) / 60,
            2,
        ),
        total_overtime_hours=round(
            float(total_overtime_minutes) / 60,
            2,
        ),
    )


@router.get(
    "/payroll-summary",
    response_model=PayrollSummary,
)
def payroll_summary(
    period_year: int = Query(ge=2000, le=2100),
    period_month: int = Query(ge=1, le=12),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    result = db.query(
        func.count(PayrollRecord.id),
        func.coalesce(func.sum(PayrollRecord.gross_pay), 0),
        func.coalesce(func.sum(PayrollRecord.total_deductions), 0),
        func.coalesce(func.sum(PayrollRecord.net_pay), 0),
        func.coalesce(
            func.sum(
                case(
                    (
                        PayrollRecord.status == "GENERATED",
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
        func.coalesce(
            func.sum(
                case(
                    (
                        PayrollRecord.status == "APPROVED",
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
        func.coalesce(
            func.sum(
                case(
                    (
                        PayrollRecord.status == "PAID",
                        1,
                    ),
                    else_=0,
                )
            ),
            0,
        ),
    ).filter(
        PayrollRecord.period_year == period_year,
        PayrollRecord.period_month == period_month,
    ).one()

    return PayrollSummary(
        period_year=period_year,
        period_month=period_month,
        employee_count=result[0],
        gross_pay=result[1],
        total_deductions=result[2],
        net_pay=result[3],
        generated_count=result[4],
        approved_count=result[5],
        paid_count=result[6],
    )


@router.get(
    "/department-analytics",
    response_model=list[DepartmentAnalytics],
)
def department_analytics(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    latest = latest_prediction_subquery(db)

    rows = (
        db.query(
            Department.id.label("department_id"),
            Department.name.label("department_name"),
            func.count(
                func.distinct(Employee.id)
            ).label("active_employees"),
            func.count(
                func.distinct(AttritionPrediction.employee_id)
            ).label("employees_with_predictions"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            AttritionPrediction.predicted_attrition.is_(
                                True
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("predicted_attrition_count"),
            func.avg(
                AttritionPrediction.risk_probability
            ).label("average_risk"),
        )
        .select_from(Department)
        .outerjoin(
            Employee,
            and_(
                Employee.department_id == Department.id,
                Employee.employment_status == "ACTIVE",
            ),
        )
        .outerjoin(
            latest,
            latest.c.employee_id == Employee.id,
        )
        .outerjoin(
            AttritionPrediction,
            AttritionPrediction.id == latest.c.prediction_id,
        )
        .filter(Department.is_active.is_(True))
        .group_by(Department.id, Department.name)
        .order_by(Department.name)
        .all()
    )

    return [
        DepartmentAnalytics(
            department_id=row.department_id,
            department_name=row.department_name,
            active_employees=row.active_employees,
            employees_with_predictions=row.employees_with_predictions,
            predicted_attrition_count=row.predicted_attrition_count,
            average_risk_percent=round(
                float(row.average_risk or 0) * 100,
                2,
            ),
        )
        for row in rows
    ]


@router.get(
    "/attrition-summary",
    response_model=AttritionSummary,
)
def attrition_summary(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    latest = latest_prediction_subquery(db)

    result = (
        db.query(
            func.count(AttritionPrediction.id),
            func.coalesce(
                func.sum(
                    case(
                        (
                            AttritionPrediction.predicted_attrition.is_(
                                True
                            ),
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            AttritionPrediction.risk_level == "LOW",
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            AttritionPrediction.risk_level == "MEDIUM",
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            AttritionPrediction.risk_level == "HIGH",
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            AttritionPrediction.risk_level == "CRITICAL",
                            1,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.avg(AttritionPrediction.risk_probability),
        )
        .select_from(AttritionPrediction)
        .join(
            latest,
            AttritionPrediction.id == latest.c.prediction_id,
        )
        .one()
    )

    return AttritionSummary(
        employees_with_predictions=result[0],
        predicted_attrition_count=result[1],
        low_risk_count=result[2],
        medium_risk_count=result[3],
        high_risk_count=result[4],
        critical_risk_count=result[5],
        average_risk_percent=round(
            float(result[6] or 0) * 100,
            2,
        ),
    )