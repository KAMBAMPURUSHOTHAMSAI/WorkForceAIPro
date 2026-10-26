from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.session import get_db

from app.models.attendance import Attendance
from app.models.attrition_prediction import AttritionPrediction
from app.models.department import Department
from app.models.employee import Employee
from app.models.payroll import PayrollRecord

from app.services.report_export import export_report


router = APIRouter(prefix="/reports", tags=["Reports & Export"])

ExportFormat = Literal["csv", "xlsx", "pdf"]
MAX_EXPORT_ROWS = 10000


def validate_date_range(
    date_from: date | None,
    date_to: date | None,
):
    if date_from and date_to and date_from > date_to:
        raise HTTPException(
            status_code=422,
            detail="date_from must not be after date_to",
        )


@router.get("/employees")
def employee_report(
    export_format: ExportFormat = Query(default="xlsx", alias="format"),
    q: str | None = Query(default=None, max_length=120),
    department_id: int | None = None,
    employment_status: str | None = None,
    limit: int = Query(default=5000, ge=1, le=MAX_EXPORT_ROWS),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    query = (
        db.query(Employee, Department.name)
        .outerjoin(
            Department,
            Department.id == Employee.department_id,
        )
    )

    if q:
        term = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Employee.employee_code.ilike(term),
                Employee.first_name.ilike(term),
                Employee.last_name.ilike(term),
                Employee.email.ilike(term),
                Employee.job_title.ilike(term),
            )
        )

    if department_id is not None:
        query = query.filter(
            Employee.department_id == department_id
        )

    if employment_status:
        query = query.filter(
            Employee.employment_status == employment_status.upper()
        )

    records = (
        query.order_by(Employee.id.desc())
        .limit(limit)
        .all()
    )

    rows = [
        {
            "employee_code": employee.employee_code,
            "first_name": employee.first_name,
            "last_name": employee.last_name,
            "email": employee.email,
            "phone": employee.phone,
            "job_title": employee.job_title,
            "department": department_name,
            "employment_type": employee.employment_type,
            "employment_status": employee.employment_status,
            "date_of_joining": employee.date_of_joining,
            "annual_base_salary": employee.base_salary,
        }
        for employee, department_name in records
    ]

    columns = [
        ("employee_code", "Employee Code"),
        ("first_name", "First Name"),
        ("last_name", "Last Name"),
        ("email", "Email"),
        ("phone", "Phone"),
        ("job_title", "Job Title"),
        ("department", "Department"),
        ("employment_type", "Employment Type"),
        ("employment_status", "Employment Status"),
        ("date_of_joining", "Date of Joining"),
        ("annual_base_salary", "Annual Base Salary"),
    ]

    return export_report(
        "Employee Report",
        "workforce-employees",
        columns,
        rows,
        export_format,
    )


@router.get("/attendance")
def attendance_report(
    export_format: ExportFormat = Query(default="xlsx", alias="format"),
    date_from: date | None = None,
    date_to: date | None = None,
    employee_id: int | None = None,
    attendance_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=5000, ge=1, le=MAX_EXPORT_ROWS),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    validate_date_range(date_from, date_to)

    query = (
        db.query(Attendance, Employee)
        .join(
            Employee,
            Employee.id == Attendance.employee_id,
        )
    )

    if date_from:
        query = query.filter(
            Attendance.attendance_date >= date_from
        )

    if date_to:
        query = query.filter(
            Attendance.attendance_date <= date_to
        )

    if employee_id is not None:
        query = query.filter(
            Attendance.employee_id == employee_id
        )

    if attendance_status:
        query = query.filter(
            Attendance.status == attendance_status.upper()
        )

    records = (
        query.order_by(Attendance.attendance_date.desc())
        .limit(limit)
        .all()
    )

    rows = [
        {
            "employee_code": employee.employee_code,
            "employee_name": (
                f"{employee.first_name} {employee.last_name}"
            ),
            "attendance_date": attendance.attendance_date,
            "check_in": attendance.check_in,
            "check_out": attendance.check_out,
            "working_hours": round(
                attendance.working_minutes / 60, 2
            ),
            "overtime_hours": round(
                attendance.overtime_minutes / 60, 2
            ),
            "status": attendance.status,
        }
        for attendance, employee in records
    ]

    columns = [
        ("employee_code", "Employee Code"),
        ("employee_name", "Employee Name"),
        ("attendance_date", "Attendance Date"),
        ("check_in", "Check-In"),
        ("check_out", "Check-Out"),
        ("working_hours", "Working Hours"),
        ("overtime_hours", "Overtime Hours"),
        ("status", "Status"),
    ]

    return export_report(
        "Attendance Report",
        "workforce-attendance",
        columns,
        rows,
        export_format,
    )


@router.get("/payroll")
def payroll_report(
    export_format: ExportFormat = Query(default="xlsx", alias="format"),
    period_year: int | None = Query(default=None, ge=2000, le=2100),
    period_month: int | None = Query(default=None, ge=1, le=12),
    employee_id: int | None = None,
    payroll_status: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=5000, ge=1, le=MAX_EXPORT_ROWS),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    query = (
        db.query(PayrollRecord, Employee)
        .join(Employee, Employee.id == PayrollRecord.employee_id)
    )

    if period_year is not None:
        query = query.filter(
            PayrollRecord.period_year == period_year
        )

    if period_month is not None:
        query = query.filter(
            PayrollRecord.period_month == period_month
        )

    if employee_id is not None:
        query = query.filter(
            PayrollRecord.employee_id == employee_id
        )

    if payroll_status:
        status_value = payroll_status.upper()

        if status_value not in {"GENERATED", "APPROVED", "PAID"}:
            raise HTTPException(422, "Invalid payroll status")

        query = query.filter(
            PayrollRecord.status == status_value
        )

    records = (
        query.order_by(
            PayrollRecord.period_year.desc(),
            PayrollRecord.period_month.desc(),
        )
        .limit(limit)
        .all()
    )

    rows = [
        {
            "employee_code": employee.employee_code,
            "employee_name": (
                f"{employee.first_name} {employee.last_name}"
            ),
            "period_year": payroll.period_year,
            "period_month": payroll.period_month,
            "monthly_base_salary": payroll.monthly_base_salary,
            "allowances": payroll.allowances,
            "bonus": payroll.bonus,
            "gross_pay": payroll.gross_pay,
            "tax_deduction": payroll.tax_deduction,
            "other_deductions": payroll.other_deductions,
            "total_deductions": payroll.total_deductions,
            "net_pay": payroll.net_pay,
            "status": payroll.status,
        }
        for payroll, employee in records
    ]

    columns = [
        ("employee_code", "Employee Code"),
        ("employee_name", "Employee Name"),
        ("period_year", "Year"),
        ("period_month", "Month"),
        ("monthly_base_salary", "Monthly Base Salary"),
        ("allowances", "Allowances"),
        ("bonus", "Bonus"),
        ("gross_pay", "Gross Pay"),
        ("tax_deduction", "Tax Deduction"),
        ("other_deductions", "Other Deductions"),
        ("total_deductions", "Total Deductions"),
        ("net_pay", "Net Pay"),
        ("status", "Payroll Status"),
    ]

    return export_report(
        "Payroll Report",
        "workforce-payroll",
        columns,
        rows,
        export_format,
    )


@router.get("/attrition")
def attrition_report(
    export_format: ExportFormat = Query(default="xlsx", alias="format"),
    employee_id: int | None = None,
    risk_level: str | None = None,
    limit: int = Query(default=5000, ge=1, le=MAX_EXPORT_ROWS),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    query = (
        db.query(
            AttritionPrediction,
            Employee.employee_code,
            Employee.first_name,
            Employee.last_name,
            Department.name.label("department_name"),
        )
        .outerjoin(
            Employee,
            Employee.id == AttritionPrediction.employee_id,
        )
        .outerjoin(
            Department,
            Department.id == Employee.department_id,
        )
    )

    if employee_id is not None:
        query = query.filter(
            AttritionPrediction.employee_id == employee_id
        )

    if risk_level:
        normalized = risk_level.upper()

        if normalized not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}:
            raise HTTPException(422, "Invalid risk level")

        query = query.filter(
            AttritionPrediction.risk_level == normalized
        )

    records = (
        query.order_by(AttritionPrediction.id.desc())
        .limit(limit)
        .all()
    )

    rows = [
        {
            "employee_code": employee_code or "",
            "employee_name": " ".join(
                value for value in [first_name, last_name] if value
            ),
            "department": department_name or "",
            "predicted_attrition": prediction.predicted_attrition,
            "risk_percent": round(
                float(prediction.risk_probability) * 100,
                2,
            ),
            "confidence_percent": round(
                float(prediction.confidence_score) * 100,
                2,
            ),
            "risk_level": prediction.risk_level,
            "model_version": prediction.model_version,
            "prediction_date": prediction.created_at,
        }
        for (
            prediction,
            employee_code,
            first_name,
            last_name,
            department_name,
        ) in records
    ]

    columns = [
        ("employee_code", "Employee Code"),
        ("employee_name", "Employee Name"),
        ("department", "Department"),
        ("predicted_attrition", "Predicted Attrition"),
        ("risk_percent", "Risk (%)"),
        ("confidence_percent", "Confidence (%)"),
        ("risk_level", "Risk Level"),
        ("model_version", "Model Version"),
        ("prediction_date", "Prediction Date"),
    ]

    return export_report(
        "Attrition Report",
        "workforce-attrition",
        columns,
        rows,
        export_format,
    )