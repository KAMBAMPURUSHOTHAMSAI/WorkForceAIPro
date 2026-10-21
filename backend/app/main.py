from fastapi import FastAPI, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.endpoints.auth import router as auth_router
from app.api.v1.endpoints.departments import (
    router as departments_router,
)
from app.api.v1.endpoints.employees import (
    router as employees_router,
)
from app.db.session import engine


app = FastAPI(
    title="WorkForce AI Pro API",
    description=(
        "HR Attrition Prediction and "
        "Workforce Intelligence Platform"
    ),
    version="1.0.0",
)


app.include_router(auth_router, prefix="/api/v1")
app.include_router(departments_router, prefix="/api/v1")
app.include_router(employees_router, prefix="/api/v1")


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