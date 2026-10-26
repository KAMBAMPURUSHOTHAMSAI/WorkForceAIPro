from datetime import datetime, timezone
from decimal import Decimal
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.employee import Employee
from app.models.payroll import PayrollRecord
from app.schemas.payroll import (
    PayrollGenerate,
    PayrollPage,
    PayrollResponse,
    PayrollUpdate,
)
from app.services.payroll_service import calculate_payroll


router = APIRouter(prefix="/payroll", tags=["Payroll"])


def employee_for_user(db: Session, user_id: int):
    return (
        db.query(Employee)
        .filter(Employee.user_id == user_id)
        .first()
    )


def get_authorized_record(
    db: Session,
    payroll_id: int,
    current_user,
) -> PayrollRecord:
    record = db.get(PayrollRecord, payroll_id)

    if record is None:
        raise HTTPException(404, "Payroll record not found")

    if current_user.role in {"ADMIN", "HR"}:
        return record

    employee = employee_for_user(db, current_user.id)

    if employee is None or record.employee_id != employee.id:
        raise HTTPException(403, "You cannot access this payroll record")

    return record


@router.post(
    "/generate",
    response_model=PayrollResponse,
    status_code=status.HTTP_201_CREATED,
)
def generate_payroll(
    payload: PayrollGenerate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    employee = db.get(Employee, payload.employee_id)

    if employee is None or employee.employment_status != "ACTIVE":
        raise HTTPException(404, "Active employee not found")

    if employee.base_salary <= 0:
        raise HTTPException(
            400,
            "Employee must have an annual base salary greater than zero",
        )

    existing = (
        db.query(PayrollRecord)
        .filter(
            PayrollRecord.employee_id == employee.id,
            PayrollRecord.period_year == payload.period_year,
            PayrollRecord.period_month == payload.period_month,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            409,
            "Payroll has already been generated for this employee and period",
        )

    try:
        amounts = calculate_payroll(
            annual_base_salary=Decimal(employee.base_salary),
            allowances=payload.allowances,
            bonus=payload.bonus,
            tax_deduction=payload.tax_deduction,
            other_deductions=payload.other_deductions,
            period_year=payload.period_year,
            period_month=payload.period_month,
            date_of_joining=employee.date_of_joining,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    record = PayrollRecord(
        employee_id=employee.id,
        period_year=payload.period_year,
        period_month=payload.period_month,
        annual_base_salary=employee.base_salary,
        generated_by=current_user.id,
        status="GENERATED",
        **amounts,
    )

    db.add(record)

    try:
        db.commit()
        db.refresh(record)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409,
            "Payroll record conflicts with an existing payroll",
        )

    return record


@router.get("/me", response_model=list[PayrollResponse])
def my_payroll(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    employee = employee_for_user(db, current_user.id)

    if employee is None:
        raise HTTPException(
            403,
            "Your account is not linked to an employee profile",
        )

    return (
        db.query(PayrollRecord)
        .filter(PayrollRecord.employee_id == employee.id)
        .order_by(
            PayrollRecord.period_year.desc(),
            PayrollRecord.period_month.desc(),
        )
        .all()
    )


@router.get("/summary")
def payroll_summary(
    period_year: int = Query(ge=2000, le=2100),
    period_month: int = Query(ge=1, le=12),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    records = (
        db.query(PayrollRecord)
        .filter(
            PayrollRecord.period_year == period_year,
            PayrollRecord.period_month == period_month,
        )
        .all()
    )

    return {
        "period_year": period_year,
        "period_month": period_month,
        "employee_count": len(records),
        "gross_pay": str(
            sum((r.gross_pay for r in records), Decimal("0.00"))
        ),
        "total_deductions": str(
            sum(
                (r.total_deductions for r in records),
                Decimal("0.00"),
            )
        ),
        "net_pay": str(
            sum((r.net_pay for r in records), Decimal("0.00"))
        ),
        "generated_count": sum(
            r.status == "GENERATED" for r in records
        ),
        "approved_count": sum(
            r.status == "APPROVED" for r in records
        ),
        "paid_count": sum(
            r.status == "PAID" for r in records
        ),
    }


@router.get("", response_model=PayrollPage)
def list_payroll(
    period_year: int | None = Query(default=None, ge=2000, le=2100),
    period_month: int | None = Query(default=None, ge=1, le=12),
    employee_id: int | None = None,
    payroll_status: str | None = Query(default=None, alias="status"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    query = db.query(PayrollRecord)

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

    if payroll_status is not None:
        normalized_status = payroll_status.upper()

        if normalized_status not in {"GENERATED", "APPROVED", "PAID"}:
            raise HTTPException(422, "Invalid payroll status")

        query = query.filter(
            PayrollRecord.status == normalized_status
        )

    total = query.count()

    items = (
        query.order_by(
            PayrollRecord.period_year.desc(),
            PayrollRecord.period_month.desc(),
            PayrollRecord.id.desc(),
        )
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


@router.get("/{payroll_id}", response_model=PayrollResponse)
def get_payroll(
    payroll_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    return get_authorized_record(db, payroll_id, current_user)


@router.patch("/{payroll_id}", response_model=PayrollResponse)
def update_payroll(
    payroll_id: int,
    payload: PayrollUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    record = db.get(PayrollRecord, payroll_id)

    if record is None:
        raise HTTPException(404, "Payroll record not found")

    if record.status != "GENERATED":
        raise HTTPException(
            409,
            "Only generated payroll can be adjusted",
        )

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return record

    if any(value is None for value in changes.values()):
        raise HTTPException(
            422,
            "Payroll amounts cannot be null",
        )

    employee = db.get(Employee, record.employee_id)
    if employee is None:
        raise HTTPException(404, "Employee not found for this payroll record")

    try:
        amounts = calculate_payroll(
            annual_base_salary=Decimal(record.annual_base_salary),
            allowances=changes.get("allowances", record.allowances),
            bonus=changes.get("bonus", record.bonus),
            tax_deduction=changes.get(
                "tax_deduction", record.tax_deduction
            ),
            other_deductions=changes.get(
                "other_deductions", record.other_deductions
            ),
            period_year=record.period_year,
            period_month=record.period_month,
            date_of_joining=employee.date_of_joining,
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc))

    for field, value in amounts.items():
        setattr(record, field, value)

    try:
        db.commit()
        db.refresh(record)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Unable to update payroll")

    return record


@router.post("/{payroll_id}/approve", response_model=PayrollResponse)
def approve_payroll(
    payroll_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    record = db.get(PayrollRecord, payroll_id)

    if record is None:
        raise HTTPException(404, "Payroll record not found")

    if record.status != "GENERATED":
        raise HTTPException(
            409,
            "Only generated payroll can be approved",
        )

    record.status = "APPROVED"
    db.commit()
    db.refresh(record)

    return record


@router.post("/{payroll_id}/mark-paid", response_model=PayrollResponse)
def mark_payroll_paid(
    payroll_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("ADMIN", "HR")),
):
    record = db.get(PayrollRecord, payroll_id)

    if record is None:
        raise HTTPException(404, "Payroll record not found")

    if record.status != "APPROVED":
        raise HTTPException(
            409,
            "Payroll must be approved before marking it paid",
        )

    record.status = "PAID"
    record.paid_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.commit()
    db.refresh(record)

    return record


@router.get("/{payroll_id}/payslip")
def download_payslip(
    payroll_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    record = get_authorized_record(db, payroll_id, current_user)

    if (
        current_user.role not in {"ADMIN", "HR"}
        and record.status not in {"APPROVED", "PAID"}
    ):
        raise HTTPException(
            403,
            "Payslip is available after payroll approval",
        )

    employee = db.get(Employee, record.employee_id)

    if employee is None:
        raise HTTPException(404, "Employee not found")

    buffer = BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=letter)

    pdf.setTitle(f"Payslip {record.period_year}-{record.period_month:02d}")

    pdf.setFont("Helvetica-Bold", 20)
    pdf.drawString(50, 750, "WorkForce AI Pro")

    pdf.setFont("Helvetica-Bold", 14)
    pdf.drawString(50, 720, "Employee Payslip")

    pdf.setFont("Helvetica", 10)

    lines = [
        f"Employee Code: {employee.employee_code}",
        f"Employee Name: {employee.first_name} {employee.last_name}",
        f"Employee Email: {employee.email}",
        f"Payroll Period: {record.period_year}-{record.period_month:02d}",
        f"Payroll Status: {record.status}",
        "",
        f"Annual Base Salary: {record.annual_base_salary}",
        f"Monthly Base Salary: {record.monthly_base_salary}",
        f"Allowances: {record.allowances}",
        f"Bonus / Incentives: {record.bonus}",
        f"Gross Pay: {record.gross_pay}",
        f"Tax Deduction: {record.tax_deduction}",
        f"Other Deductions: {record.other_deductions}",
        f"Total Deductions: {record.total_deductions}",
        f"Net Pay: {record.net_pay}",
    ]

    y = 680

    for line in lines:
        pdf.drawString(50, y, line)
        y -= 25

    pdf.save()
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={
            "Content-Disposition": (
                f'attachment; filename="payslip-{record.id}.pdf"'
            )
        },
    )