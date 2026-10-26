from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class DashboardOverview(BaseModel):
    total_employees: int
    active_employees: int
    inactive_employees: int
    active_departments: int
    attendance_records_today: int
    pending_leave_requests: int
    high_risk_employees: int
    open_tasks: int
    open_interventions: int
    unresolved_alerts: int


class AttendanceSummary(BaseModel):
    report_date: date
    total_records: int
    checked_in: int
    checked_out: int
    average_working_hours: float
    total_overtime_hours: float


class PayrollSummary(BaseModel):
    period_year: int
    period_month: int
    employee_count: int
    gross_pay: Decimal
    total_deductions: Decimal
    net_pay: Decimal
    generated_count: int
    approved_count: int
    paid_count: int


class DepartmentAnalytics(BaseModel):
    department_id: int
    department_name: str
    active_employees: int
    employees_with_predictions: int
    predicted_attrition_count: int
    average_risk_percent: float


class AttritionSummary(BaseModel):
    employees_with_predictions: int
    predicted_attrition_count: int
    low_risk_count: int
    medium_risk_count: int
    high_risk_count: int
    critical_risk_count: int
    average_risk_percent: float