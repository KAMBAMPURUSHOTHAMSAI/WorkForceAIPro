import logging

import jwt

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from jwt.exceptions import InvalidTokenError

from app.core.security import ALGORITHM, SECRET_KEY
from app.db.session import SessionLocal
from app.models.user import User
from app.models.workforce_activity import WorkforceActivity
from app.services.activity_service import (
    activity_manager,
    activity_payload,
)

logger = logging.getLogger(__name__)

TRACKED_RESOURCES = {
    "users": "User",
    "departments": "Department",
    "employees": "Employee",
    "shifts": "Shift",
    "attendance": "Attendance",
    "leaves": "Leave",
    "payroll": "Payroll",
    "documents": "Employee document",
    "datasets": "Dataset",
    "attrition": "Attrition",
    "alerts": "Alert",
    "forecasting": "Forecast",
    "interventions": "HR intervention",
    "recommendations": "Recommendation",
    "tasks": "HR task",
    "performance-reviews": "Performance review",
}

MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


def describe_action(method: str, path: str, label: str) -> tuple[str, str]:
    normalized_path = path.lower()

    special_actions = {
        "/api/v1/attendance/check-in": (
            "ATTENDANCE_CHECK_IN",
            "Employee checked in",
        ),
        "/api/v1/attendance/check-out": (
            "ATTENDANCE_CHECK_OUT",
            "Employee checked out",
        ),
        "/api/v1/attrition/predict": (
            "ATTRITION_PREDICTION",
            "Attrition prediction generated",
        ),
        "/api/v1/payroll/generate": (
            "PAYROLL_GENERATED",
            "Payroll generation requested",
        ),
        "/api/v1/forecasting/generate": (
            "FORECAST_GENERATED",
            "Workforce forecast generated",
        ),
        "/api/v1/forecasting/generate-year": (
            "YEARLY_FORECAST_GENERATED",
            "Yearly workforce forecast generated",
        ),
    }

    if normalized_path in special_actions:
        return special_actions[normalized_path]

    action_names = {
        "POST": "CREATED",
        "PUT": "UPDATED",
        "PATCH": "UPDATED",
        "DELETE": "DELETED",
    }

    action = action_names.get(method, "CHANGED")

    return (
        f"{action}_{label.upper().replace(' ', '_')}"[:80],
        f"{label} record {action.lower()}",
    )


def record_activity(
    token: str,
    method: str,
    path: str,
    status_code: int,
) -> dict | None:
    """Persist one successful authenticated business action."""

    db = SessionLocal()

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        subject = payload.get("sub")
        token_version = payload.get("ver", 0)

        if subject is None:
            return None

        if type(token_version) is not int or token_version < 0:
            return None

        user = db.get(User, int(subject))

        if (
            user is None
            or not user.is_active
            or int(user.token_version or 0) != token_version
        ):
            return None

        path_parts = path.strip("/").split("/")

        if len(path_parts) < 3:
            return None

        resource = path_parts[2]
        label = TRACKED_RESOURCES.get(resource)

        if label is None:
            return None

        activity_type, description = describe_action(
            method,
            path,
            label,
        )

        employee = user.employee

        activity = WorkforceActivity(
            employee_id=employee.id if employee else None,
            actor_user_id=user.id,
            activity_type=activity_type,
            description=description,
            activity_data={
                "method": method,
                "endpoint": path,
                "status_code": status_code,
            },
            source="HTTP_MIDDLEWARE",
        )

        db.add(activity)
        db.commit()
        db.refresh(activity)

        return activity_payload(activity)

    except InvalidTokenError:
        db.rollback()
        return None

    except (ValueError, TypeError, KeyError):
        db.rollback()
        return None

    except Exception:
        db.rollback()
        logger.exception("Could not record workforce activity")
        return None

    finally:
        db.close()


class WorkforceActivityMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next,
    ) -> Response:
        response = await call_next(request)

        if request.method not in MUTATING_METHODS:
            return response

        if response.status_code < 200 or response.status_code >= 300:
            return response

        path = request.url.path

        if not path.startswith("/api/v1/"):
            return response

        authorization = request.headers.get("Authorization", "")
        scheme, separator, token = authorization.partition(" ")

        if (
            not separator
            or scheme.lower() != "bearer"
            or not token.strip()
        ):
            return response

        try:
            activity = await __import__("asyncio").to_thread(
                record_activity,
                token.strip(),
                request.method,
                path,
                response.status_code,
            )

            if activity is not None:
                await activity_manager.broadcast(activity)

        except Exception:
            # Activity logging should not turn a successful business
            # response into a failed API request.
            logger.exception("Workforce activity middleware failed")

        return response