import asyncio
import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db.session import engine

# Authentication and user management
from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.users import router as users_router

# Core HR management
from app.api.v1.endpoints.departments import router as departments_router
from app.api.v1.endpoints.employees import router as employees_router
from app.api.v1.endpoints.shifts import router as shifts_router
from app.api.v1.endpoints.attendance import router as attendance_router
from app.api.v1.endpoints.leaves import router as leaves_router
from app.api.v1.endpoints.payroll import router as payroll_router

# Communication and documents
from app.api.v1.endpoints.notifications import (
    router as notifications_router,
)
from app.api.v1.endpoints.chat import router as chat_router
from app.api.v1.endpoints.documents import router as documents_router

# AI and workforce intelligence
from app.api.v1.endpoints.datasets import router as datasets_router
from app.api.v1.endpoints.attrition import router as attrition_router
from app.api.v1.endpoints.alerts import router as alerts_router
from app.api.v1.endpoints.forecasting import router as forecasting_router
from app.api.v1.endpoints.interventions import router as interventions_router
from app.api.v1.endpoints.recommendations import (
    router as recommendations_router,
)
from app.api.v1.endpoints.dashboard import router as dashboard_router

# Auditing, tasks and performance
from app.api.v1.endpoints.audit import router as audit_router
from app.api.v1.endpoints.tasks import router as tasks_router
from app.api.v1.endpoints.performance_reviews import (
    router as performance_reviews_router,
)
from app.api.v1.endpoints.reports import router as reports_router

# Workforce activity and advanced search
from app.api.v1.endpoints.workforce_activities import (
    router as workforce_activities_router,
)
from app.api.v1.endpoints.search import router as search_router

# Application middleware and background worker
from app.middleware.workforce_activity import (
    WorkforceActivityMiddleware,
)
from app.services.notification_escalation_service import (
    notification_escalation_loop,
)


# Load backend/.env
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

logger = logging.getLogger(__name__)


def get_cors_origins() -> list[str]:
    """Read allowed frontend origins from the environment."""
    raw_origins = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    )

    return [
        origin.strip().rstrip("/")
        for origin in raw_origins.split(",")
        if origin.strip()
    ]


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start and stop the notification escalation worker."""
    escalation_task = asyncio.create_task(
        notification_escalation_loop(),
        name="notification-escalation-worker",
    )

    logger.info("WorkForce AI Pro started")

    try:
        yield
    finally:
        escalation_task.cancel()

        try:
            await escalation_task
        except asyncio.CancelledError:
            pass

        logger.info("Notification escalation worker stopped")


app = FastAPI(
    title="WorkForce AI Pro API",
    description=(
        "HR Attrition Prediction and "
        "Workforce Intelligence Platform"
    ),
    version="1.0.0",
    lifespan=lifespan,
)

API_PREFIX = "/api/v1"


# Record successful authenticated business mutations.
app.add_middleware(WorkforceActivityMiddleware)

# Allow the local React/Vite frontend to call the API.
# CORS is placed outside the activity middleware so browser
# preflight requests are handled before activity processing.
app.add_middleware(
    CORSMiddleware,
    allow_origins=get_cors_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Authentication and user management
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(users_router, prefix=API_PREFIX)

# Core HR operations
app.include_router(departments_router, prefix=API_PREFIX)
app.include_router(employees_router, prefix=API_PREFIX)
app.include_router(shifts_router, prefix=API_PREFIX)
app.include_router(attendance_router, prefix=API_PREFIX)
app.include_router(leaves_router, prefix=API_PREFIX)
app.include_router(payroll_router, prefix=API_PREFIX)

# Communication and documents
app.include_router(notifications_router, prefix=API_PREFIX)
app.include_router(chat_router, prefix=API_PREFIX)
app.include_router(documents_router, prefix=API_PREFIX)

# AI and workforce intelligence
app.include_router(datasets_router, prefix=API_PREFIX)
app.include_router(attrition_router, prefix=API_PREFIX)
app.include_router(alerts_router, prefix=API_PREFIX)
app.include_router(forecasting_router, prefix=API_PREFIX)
app.include_router(interventions_router, prefix=API_PREFIX)
app.include_router(recommendations_router, prefix=API_PREFIX)
app.include_router(dashboard_router, prefix=API_PREFIX)

# Audit, tasks and performance reviews
app.include_router(audit_router, prefix=API_PREFIX)
app.include_router(tasks_router, prefix=API_PREFIX)
app.include_router(performance_reviews_router, prefix=API_PREFIX)
app.include_router(reports_router, prefix=API_PREFIX)

# Activity feed and advanced search
app.include_router(
    workforce_activities_router,
    prefix=API_PREFIX,
)
app.include_router(search_router, prefix=API_PREFIX)


@app.get("/", tags=["System"])
async def root():
    return {
        "message": "Welcome to WorkForce AI Pro",
        "status": "running",
        "version": "1.0.0",
    }


@app.get("/health", tags=["System"])
async def health_check():
    return {
        "status": "ok",
        "service": "WorkForce AI Pro API",
    }


@app.get("/health/db", tags=["System"])
async def database_health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))

        return {
            "status": "ok",
            "database": "connected",
        }

    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        )