"""API-level smoke tests for unauthenticated access and request validation."""
import pytest
from fastapi.testclient import TestClient

from app.main import app


client = TestClient(app)


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/employees",
        "/api/v1/leaves",
        "/api/v1/payroll",
        "/api/v1/notifications",
        "/api/v1/audit-logs",
        "/api/v1/tasks",
    ],
)
def test_protected_hr_routes_reject_requests_without_access_token(path):
    response = client.get(path)
    assert response.status_code == 401, f"{path} should require authentication"


def test_registration_rejects_missing_required_fields():
    response = client.post("/api/v1/auth/register", json={})
    assert response.status_code == 422
