from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.employee import Employee
from app.models.performance_review import PerformanceReview
from app.schemas.performance_review import (
    ReviewCreate,
    ReviewResponse,
    ReviewUpdate,
)
from app.services.audit_service import write_audit_log


router = APIRouter(
    prefix="/performance-reviews",
    tags=["Performance Reviews"],
)


def linked_employee(db: Session, user_id: int):
    return (
        db.query(Employee)
        .filter(Employee.user_id == user_id)
        .first()
    )


def may_review_employee(db: Session, user, employee: Employee) -> bool:
    if user.role in {"ADMIN", "HR"}:
        return True

    if user.role == "MANAGER":
        manager_employee = linked_employee(db, user.id)

        return (
            manager_employee is not None
            and employee.manager_id == manager_employee.id
        )

    return False


def can_read_review(db: Session, user, review: PerformanceReview) -> bool:
    employee = db.get(Employee, review.employee_id)

    if employee is None:
        return False

    return (
        user.role in {"ADMIN", "HR"}
        or employee.user_id == user.id
        or review.reviewer_id == user.id
        or may_review_employee(db, user, employee)
    )


@router.post("", response_model=ReviewResponse, status_code=201)
def create_review(
    payload: ReviewCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    employee = db.get(Employee, payload.employee_id)

    if employee is None:
        raise HTTPException(404, "Employee not found")

    if not may_review_employee(db, current_user, employee):
        raise HTTPException(
            403,
            "You cannot create a review for this employee",
        )

    review = PerformanceReview(
        employee_id=employee.id,
        reviewer_id=current_user.id,
        review_period_start=payload.review_period_start,
        review_period_end=payload.review_period_end,
        rating=payload.rating,
        strengths=payload.strengths,
        improvement_areas=payload.improvement_areas,
        goals=payload.goals,
        reviewer_comments=payload.reviewer_comments,
        status="DRAFT",
    )

    db.add(review)

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409,
            "A review already exists for this employee and period",
        )

    write_audit_log(
        db,
        actor_user_id=current_user.id,
        action="CREATE",
        entity_type="PERFORMANCE_REVIEW",
        entity_id=review.id,
        details={
            "employee_id": employee.id,
            "status": "DRAFT",
        },
        request=request,
    )

    try:
        db.commit()
        db.refresh(review)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            409,
            "Review conflicts with an existing record",
        )

    return review


@router.get("", response_model=list[ReviewResponse])
def list_reviews(
    employee_id: int | None = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    query = db.query(PerformanceReview)

    if current_user.role in {"ADMIN", "HR"}:
        if employee_id is not None:
            query = query.filter(
                PerformanceReview.employee_id == employee_id
            )

    elif current_user.role == "MANAGER":
        manager_employee = linked_employee(db, current_user.id)

        if manager_employee is None:
            raise HTTPException(403, "Manager employee profile not found")

        report_ids = (
            db.query(Employee.id)
            .filter(Employee.manager_id == manager_employee.id)
        )

        query = query.filter(
            PerformanceReview.employee_id.in_(report_ids)
            | (PerformanceReview.reviewer_id == current_user.id)
        )

        if employee_id is not None:
            query = query.filter(
                PerformanceReview.employee_id == employee_id
            )

    else:
        employee = linked_employee(db, current_user.id)

        if employee is None:
            raise HTTPException(403, "Employee profile not found")

        query = query.filter(
            PerformanceReview.employee_id == employee.id
        )

    return query.order_by(PerformanceReview.id.desc()).all()


@router.get("/{review_id}", response_model=ReviewResponse)
def get_review(
    review_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    review = db.get(PerformanceReview, review_id)

    if review is None or not can_read_review(db, current_user, review):
        raise HTTPException(404, "Performance review not found")

    return review


@router.patch("/{review_id}", response_model=ReviewResponse)
def update_review(
    review_id: int,
    payload: ReviewUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    review = db.get(PerformanceReview, review_id)

    if review is None:
        raise HTTPException(404, "Performance review not found")

    employee = db.get(Employee, review.employee_id)

    if employee is None:
        raise HTTPException(404, "Employee not found")

    if review.reviewer_id != current_user.id:
        if not may_review_employee(db, current_user, employee):
            raise HTTPException(403, "You cannot update this review")

    if review.status != "DRAFT":
        raise HTTPException(
            409,
            "Only draft reviews can be edited",
        )

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return review

    if "rating" in changes and changes["rating"] is None:
        # Allow removing a rating while the review is still a draft.
        pass

    for field, value in changes.items():
        setattr(review, field, value)

    write_audit_log(
        db,
        actor_user_id=current_user.id,
        action="UPDATE",
        entity_type="PERFORMANCE_REVIEW",
        entity_id=review.id,
        details={"changed_fields": list(changes.keys())},
        request=request,
    )

    db.commit()
    db.refresh(review)

    return review


@router.post("/{review_id}/submit", response_model=ReviewResponse)
def submit_review(
    review_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    review = db.get(PerformanceReview, review_id)

    if review is None:
        raise HTTPException(404, "Performance review not found")

    employee = db.get(Employee, review.employee_id)

    if employee is None:
        raise HTTPException(404, "Employee not found")

    if review.reviewer_id != current_user.id:
        if not may_review_employee(db, current_user, employee):
            raise HTTPException(403, "You cannot submit this review")

    if review.status != "DRAFT":
        raise HTTPException(409, "Review is not in draft status")

    review.status = "SUBMITTED"
    review.submitted_at = datetime.now(timezone.utc).replace(
        tzinfo=None
    )

    write_audit_log(
        db,
        actor_user_id=current_user.id,
        action="SUBMIT",
        entity_type="PERFORMANCE_REVIEW",
        entity_id=review.id,
        details={"status": "SUBMITTED"},
        request=request,
    )

    db.commit()
    db.refresh(review)

    return review


@router.post("/{review_id}/acknowledge", response_model=ReviewResponse)
def acknowledge_review(
    review_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    review = db.get(PerformanceReview, review_id)

    if review is None:
        raise HTTPException(404, "Performance review not found")

    employee = db.get(Employee, review.employee_id)

    if employee is None or employee.user_id != current_user.id:
        raise HTTPException(
            403,
            "Only the employee being reviewed can acknowledge it",
        )

    if review.status != "SUBMITTED":
        raise HTTPException(
            409,
            "Only submitted reviews can be acknowledged",
        )

    review.status = "ACKNOWLEDGED"
    review.acknowledged_at = datetime.now(timezone.utc).replace(
        tzinfo=None
    )

    write_audit_log(
        db,
        actor_user_id=current_user.id,
        action="ACKNOWLEDGE",
        entity_type="PERFORMANCE_REVIEW",
        entity_id=review.id,
        details={"status": "ACKNOWLEDGED"},
        request=request,
    )

    db.commit()
    db.refresh(review)

    return review