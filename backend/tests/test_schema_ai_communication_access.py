"""Validation tests for AI, notifications, chat and role-based input schemas."""
import pytest
from pydantic import ValidationError

from app.schemas.attrition import AttritionPredictRequest
from app.schemas.forecast import ForecastRequest
from app.schemas.notification import NotificationCreate
from app.schemas.chat import ChatSend
from app.schemas.user_admin import UserAdminUpdate
from app.schemas.workforce_activity import WorkforceActivityCreate


def test_attrition_request_accepts_features():
    request = AttritionPredictRequest(
        dataset_version_id=1,
        employee_id=7,
        features={"Age": 32, "OverTime": "Yes"},
    )
    assert request.features["Age"] == 32


def test_attrition_request_rejects_non_positive_dataset_id():
    with pytest.raises(ValidationError):
        AttritionPredictRequest(dataset_version_id=0, features={"Age": 32})


def test_forecast_request_accepts_monthly_forecast():
    request = ForecastRequest(forecast_year=2026, forecast_month=10)
    assert request.forecast_month == 10


def test_forecast_request_rejects_month_13():
    with pytest.raises(ValidationError):
        ForecastRequest(forecast_year=2026, forecast_month=13)


def test_notification_create_accepts_critical_priority():
    notification = NotificationCreate(
        target_user_id=2,
        title="High-risk alert",
        message="Review the employee risk prediction.",
        priority="CRITICAL",
    )
    assert notification.priority == "CRITICAL"


def test_notification_create_rejects_unknown_priority():
    with pytest.raises(ValidationError):
        NotificationCreate(
            target_user_id=2,
            title="Alert",
            message="Check this notification.",
            priority="URGENT",
        )


def test_chat_message_is_trimmed():
    message = ChatSend(recipient_id=1, message="  Hello Sai  ")
    assert message.message == "Hello Sai"


def test_chat_rejects_whitespace_only_message():
    with pytest.raises(ValidationError):
        ChatSend(recipient_id=1, message="   ")


def test_user_admin_update_accepts_defined_role():
    user = UserAdminUpdate(role="MANAGER")
    assert user.role == "MANAGER"


def test_user_admin_update_rejects_unknown_role():
    with pytest.raises(ValidationError):
        UserAdminUpdate(role="SUPERUSER")


def test_workforce_activity_rejects_non_positive_employee_id():
    with pytest.raises(ValidationError):
        WorkforceActivityCreate(employee_id=0, activity_type="UPDATE", description="Updated profile")
