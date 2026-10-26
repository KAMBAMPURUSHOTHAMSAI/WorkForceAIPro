# Installation and Setup Guide

## Prerequisites

- Windows 10/11 or a compatible development environment.
- A Python version compatible with `backend/requirements.txt` (Python 3.11 is a practical baseline to verify).
- Node.js/npm compatible with the committed frontend lockfile and Vite version.
- MySQL Server and a database/user dedicated to this application.
- SMTP credentials only if email delivery is being tested.

## Environment files

Do not copy real secrets into a submission. Use the templates in `config-templates/`.

1. Copy `config-templates/backend.env.example` to `backend/.env`.
2. Set `DATABASE_URL` to your local MySQL database. SQLAlchemy expects the `mysql+pymysql://` driver form.
3. Set `JWT_SECRET` to a unique, long random secret.
4. Set `CORS_ALLOWED_ORIGINS` to the exact frontend origin shown by Vite.
5. Configure SMTP values if password-reset and email notifications are in scope.
6. Copy `config-templates/frontend.env.example` to `frontend/.env` and verify `VITE_API_BASE_URL`.

## Backend commands

Run these from the project backend folder:

```powershell
cd "C:\Users\k.Purushotham Sai\Documents\WorkForceAIPro\backend"
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

If `.venv` does not exist, create it with `python -m venv .venv` before running the commands above. If PowerShell blocks activation, use the virtual-environment Python executable directly; avoid changing system execution policy without understanding device restrictions.

## Frontend commands (second terminal)

```powershell
cd "C:\Users\k.Purushotham Sai\Documents\WorkForceAIPro\frontend"
npm ci
npm run dev
```

Open the URL printed by Vite. If Vite uses port 5174 or 5175 instead of 5173, add that exact origin to `CORS_ALLOWED_ORIGINS`, restart the backend, and reload the browser.

## Health and API checks

- `GET http://127.0.0.1:8010/health`
- `GET http://127.0.0.1:8010/health/db`
- Swagger UI: `http://127.0.0.1:8010/docs`
- OpenAPI JSON: `http://127.0.0.1:8010/openapi.json`

## Quality commands

```powershell
# From frontend folder
npm run lint
npm run build

# From backend folder
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic heads
```

The current run recorded in `docs/TEST_RESULTS.md` reports frontend lint/build success, 79 backend tests passing, and matching Alembic current/head revisions. The production build still emits a bundle-size optimization warning, and pytest emits one non-blocking dependency deprecation warning.

## Generate final runtime API/schema artefacts

With the backend running on port 8010, run from the repository root:

```powershell
.\scripts\capture_submission_artifacts.ps1
```

The script saves the actual runtime OpenAPI definition to `docs/openapi.json`. If `mysqldump` is installed and the backend `.env` has a parseable MySQL `DATABASE_URL`, it also exports table definitions without application rows to `docs/database_schema.sql`. It prompts for the MySQL password instead of saving or printing it. Review the generated files before submission.
