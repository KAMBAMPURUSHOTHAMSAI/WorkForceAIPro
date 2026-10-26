from datetime import date, datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, or_
from sqlalchemy.orm import Session

from app.core.deps import require_roles
from app.db.session import get_db
from app.models.department import Department
from app.models.employee import Employee
from app.models.hr_task import HRTask
from app.models.leave_request import LeaveRequest
from app.models.performance_review import PerformanceReview
from app.models.shift import Shift
from app.models.user import User


router = APIRouter(
    prefix="/search",
    tags=["Advanced Search"],
)


# Only these fields may be returned in search results.
# Password hashes, salary amounts and other sensitive fields
# are intentionally excluded.
SEARCH_CONFIG = {
    "employees": {
        "model": Employee,
        "fields": (
            "id",
            "employee_code",
            "full_name",
            "first_name",
            "last_name",
            "email",
            "designation",
            "job_title",
            "employment_status",
            "status",
            "department_id",
        ),
    },
    "departments": {
        "model": Department,
        "fields": (
            "id",
            "name",
            "department_name",
            "code",
            "description",
        ),
    },
    "shifts": {
        "model": Shift,
        "fields": (
            "id",
            "name",
            "shift_name",
            "start_time",
            "end_time",
        ),
    },
    "tasks": {
        "model": HRTask,
        "fields": (
            "id",
            "title",
            "task_title",
            "status",
            "priority",
            "due_date",
        ),
    },
    "leaves": {
        "model": LeaveRequest,
        "fields": (
            "id",
            "employee_id",
            "leave_type",
            "status",
            "start_date",
            "end_date",
            "reason",
        ),
    },
    "reviews": {
        "model": PerformanceReview,
        "fields": (
            "id",
            "employee_id",
            "status",
            "review_period",
            "rating",
        ),
    },
    "users": {
        "model": User,
        "fields": (
            "id",
            "full_name",
            "email",
            "role",
            "is_active",
        ),
    },
}

DEFAULT_ENTITIES = (
    "employees,departments,shifts,tasks,leaves,reviews"
)

ALLOWED_ENTITIES = set(SEARCH_CONFIG.keys())


def serialize_value(value):
    """Convert values into JSON-compatible output."""
    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, Decimal):
        return float(value)

    return value


def serialize_record(entity_type: str, record) -> dict:
    config = SEARCH_CONFIG[entity_type]

    available_columns = {
        column.name
        for column in record.__table__.columns
    }

    fields = {}

    for field_name in config["fields"]:
        if field_name not in available_columns:
            continue

        value = getattr(record, field_name, None)

        # Do not expose complex ORM relationships.
        if value is None or isinstance(
            value,
            (str, int, float, bool, datetime, date, Decimal),
        ):
            fields[field_name] = serialize_value(value)

    label = None

    for candidate in (
        "full_name",
        "employee_name",
        "name",
        "department_name",
        "title",
        "task_title",
        "shift_name",
        "employee_code",
        "email",
    ):
        if fields.get(candidate):
            label = str(fields[candidate])
            break

    if not label:
        first_name = fields.get("first_name") or ""
        last_name = fields.get("last_name") or ""
        label = f"{first_name} {last_name}".strip()

    if not label:
        label = f"{entity_type.title()} #{record.id}"

    return {
        "entity_type": entity_type,
        "id": record.id,
        "label": label,
        "fields": fields,
    }


@router.get("")
def advanced_search(
    q: str = Query(min_length=2, max_length=120),
    entities: str = Query(
        default=DEFAULT_ENTITIES,
        max_length=200,
    ),
    limit_per_type: int = Query(default=10, ge=1, le=25),
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles("ADMIN", "HR", "MANAGER")
    ),
):
    """
    Search across supported workforce entities.

    Search fields are detected dynamically from the model's
    string columns. Returned fields are restricted to allowlists.
    """
    search_text = q.strip()

    if len(search_text) < 2:
        raise HTTPException(
            status_code=422,
            detail="Search query must contain at least 2 characters",
        )

    requested_entities = {
        item.strip().lower()
        for item in entities.split(",")
        if item.strip()
    }

    if not requested_entities:
        raise HTTPException(
            status_code=422,
            detail="Select at least one entity to search",
        )

    unknown_entities = requested_entities - ALLOWED_ENTITIES

    if unknown_entities:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Unsupported search entity",
                "entities": sorted(unknown_entities),
            },
        )

    # Managers cannot search the user directory.
    if current_user.role == "MANAGER":
        requested_entities.discard("users")

    search_pattern = f"%{search_text}%"
    results = []

    for entity_type in sorted(requested_entities):
        model = SEARCH_CONFIG[entity_type]["model"]

        # Search through textual database columns only.
        searchable_columns = [
            column
            for column in model.__table__.columns
            if isinstance(column.type, String)
        ]

        if not searchable_columns:
            continue

        conditions = [
            getattr(model, column.name).ilike(search_pattern)
            for column in searchable_columns
        ]

        query = db.query(model).filter(or_(*conditions))

        if "id" in model.__table__.columns.keys():
            query = query.order_by(model.id.desc())

        records = query.limit(limit_per_type).all()

        results.extend(
            serialize_record(entity_type, record)
            for record in records
        )

    return {
        "query": search_text,
        "entities_searched": sorted(requested_entities),
        "limit_per_type": limit_per_type,
        "result_count": len(results),
        "results": results,
    }