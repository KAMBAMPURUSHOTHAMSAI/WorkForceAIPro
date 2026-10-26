"""Validation tests for leave, shift, payroll, task and review workflows."""
from datetime import date

import pytest
from pydantic import ValidationError

from app.schemas.leave import LeaveApply, LeaveDecision, LeavePolicyCreate
from app.schemas.shift import ShiftCreate, ShiftAssignmentCreate
from app.schemas.payroll import PayrollGenerate, PayrollUpdate
from app.schemas.task import TaskCreate, TaskUpdate
from app.schemas.performance_review import ReviewCreate, ReviewUpdate
from app.schemas.intervention import InterventionCreate, InterventionUpdate


def test_leave_apply_accepts_valid_date_range():
    leave = LeaveApply(
        policy_id=1,
        start_date=date(2026, 10, 20),
        end_date=date(2026, 10, 21),
        reason="Personal appointment",
    )
    assert leave.end_date >= leave.start_date


def test_leave_apply_rejects_end_date_before_start_date():
    with pytest.raises(ValidationError):
        LeaveApply(
            policy_id=1,
            start_date=date(2026, 10, 21),
            end_date=date(2026, 10, 20),
            reason="Personal appointment",
        )


def test_leave_apply_rejects_cross_calendar_year():
    with pytest.raises(ValidationError):
        LeaveApply(
            policy_id=1,
            start_date=date(2026, 12, 31),
            end_date=date(2027, 1, 1),
            reason="Personal appointment",
        )


def test_leave_policy_quota_is_bounded():
    with pytest.raises(ValidationError):
        LeavePolicyCreate(name="Casual", annual_quota=366)


def test_leave_decision_only_accepts_supported_decisions():
    assert LeaveDecision(decision="APPROVED").decision == "APPROVED"
    with pytest.raises(ValidationError):
        LeaveDecision(decision="PENDING")


def test_shift_create_accepts_regular_shift():
    shift = ShiftCreate(
        name="Day Shift",
        start_time="09:00:00",
        end_time="18:00:00",
        break_minutes=60,
    )
    assert shift.break_minutes == 60


def test_shift_create_rejects_identical_start_and_end():
    with pytest.raises(ValidationError):
        ShiftCreate(
            name="Invalid Shift",
            start_time="09:00:00",
            end_time="09:00:00",
            break_minutes=0,
        )


def test_shift_assignment_rejects_invalid_effective_dates():
    with pytest.raises(ValidationError):
        ShiftAssignmentCreate(
            employee_id=1,
            effective_from=date(2026, 10, 20),
            effective_to=date(2026, 10, 19),
        )


def test_payroll_generate_accepts_valid_month_and_amounts():
    payroll = PayrollGenerate(
        employee_id=1,
        period_year=2026,
        period_month=10,
        allowances="1000.00",
        bonus="500.00",
        tax_deduction="200.00",
    )
    assert payroll.period_month == 10


@pytest.mark.parametrize("month", [0, 13])
def test_payroll_generate_rejects_invalid_month(month):
    with pytest.raises(ValidationError):
        PayrollGenerate(employee_id=1, period_year=2026, period_month=month)


def test_payroll_update_rejects_negative_deduction():
    with pytest.raises(ValidationError):
        PayrollUpdate(other_deductions="-1.00")


def test_task_create_accepts_supported_priority():
    task = TaskCreate(title="Review workforce report", priority="HIGH")
    assert task.priority == "HIGH"


def test_task_update_rejects_empty_patch():
    with pytest.raises(ValidationError):
        TaskUpdate()


def test_task_update_rejects_invalid_status():
    with pytest.raises(ValidationError):
        TaskUpdate(status="DONE")


def test_review_create_accepts_valid_rating_and_period():
    review = ReviewCreate(
        employee_id=1,
        review_period_start=date(2026, 10, 1),
        review_period_end=date(2026, 10, 31),
        rating="4.0",
    )
    assert review.rating == 4


def test_review_create_rejects_reversed_period():
    with pytest.raises(ValidationError):
        ReviewCreate(
            employee_id=1,
            review_period_start=date(2026, 10, 31),
            review_period_end=date(2026, 10, 1),
        )


def test_review_update_rejects_out_of_range_rating():
    with pytest.raises(ValidationError):
        ReviewUpdate(rating="6")


def test_intervention_update_accepts_completed_status():
    intervention = InterventionUpdate(status="COMPLETED", outcome_notes="Action completed")
    assert intervention.status == "COMPLETED"


def test_intervention_create_rejects_non_positive_employee_id():
    with pytest.raises(ValidationError):
        InterventionCreate(
            employee_id=0,
            title="Career discussion",
            category="ENGAGEMENT",
            recommendation="Arrange a career development conversation.",
        )
