"""OpenAPI smoke tests: prove core routers are registered in the FastAPI app."""
from app.main import app


def test_openapi_document_is_generated():
    schema = app.openapi()
    assert schema["info"]["title"] == "WorkForce AI Pro API"
    assert schema["info"]["version"]
    assert isinstance(schema["paths"], dict)
    assert len(schema["paths"]) >= 30


def test_core_and_ai_modules_have_registered_api_routes():
    paths = set(app.openapi()["paths"])
    expected_prefixes = {
        "/api/v1/auth",
        "/api/v1/users",
        "/api/v1/departments",
        "/api/v1/employees",
        "/api/v1/shifts",
        "/api/v1/attendance",
        "/api/v1/leaves",
        "/api/v1/payroll",
        "/api/v1/notifications",
        "/api/v1/chat",
        "/api/v1/documents",
        "/api/v1/datasets",
        "/api/v1/attrition",
        "/api/v1/alerts",
        "/api/v1/forecasting",
        "/api/v1/interventions",
        "/api/v1/recommendations",
        "/api/v1/dashboard",
        "/api/v1/audit-logs",
        "/api/v1/tasks",
        "/api/v1/performance-reviews",
        "/api/v1/reports",
        "/api/v1/workforce-activities",
        "/api/v1/search",
    }
    missing = sorted(prefix for prefix in expected_prefixes if not any(path == prefix or path.startswith(prefix + "/") for path in paths))
    assert not missing, f"API router path prefixes are missing from OpenAPI: {missing}"


def test_key_workflow_routes_are_registered():
    paths = set(app.openapi()["paths"])
    expected_paths = {
        "/api/v1/auth/login",
        "/api/v1/employees",
        "/api/v1/attendance/check-in",
        "/api/v1/leaves",
        "/api/v1/payroll",
        "/api/v1/notifications",
        "/api/v1/documents",
        "/api/v1/datasets",
        "/api/v1/attrition/predict",
        "/api/v1/tasks",
        "/api/v1/performance-reviews",
        "/api/v1/reports/employees",
        "/api/v1/search",
    }
    missing = sorted(expected_paths - paths)
    assert not missing, f"Key API routes are missing from OpenAPI: {missing}"
