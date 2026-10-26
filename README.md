# WorkForce AI Pro

**HR Attrition Prediction & Workforce Intelligence Platform**

WorkForce AI Pro is a full-stack workforce management application combining core HR workflows with attrition-risk prediction and workforce analytics.

## Technology stack

- **Frontend:** React, Vite, React Router, Tailwind CSS, Axios, Recharts
- **Backend:** FastAPI, SQLAlchemy ORM, Pydantic
- **Database:** MySQL through PyMySQL; Alembic migrations
- **Authentication:** JWT access/refresh tokens, password hashing, role-based access control
- **AI/analytics:** Python, Pandas, scikit-learn
- **Exports:** PDF/CSV and other report formats supported by the relevant module

## Main capabilities

- Authentication, session management, profile updates and password recovery
- Employee, department, shift, attendance, leave and payroll management
- Leave policies and approval workflows; payroll generation, approval, payment state and payslips
- Tasks, performance reviews and employee documents
- In-app notifications, email notifications, direct chat and read receipts
- Dataset upload/validation, attrition prediction, risk monitoring and department analytics
- Monthly/yearly workforce forecasts, recommendations and HR interventions
- Workforce activity feed, audit history, advanced search and reporting/export

## Repository structure

```text
WorkForceAIPro/
├── backend/
│   ├── app/
│   │   ├── api/v1/endpoints/  # FastAPI routers
│   │   ├── core/              # auth dependencies and security helpers
│   │   ├── db/                # SQLAlchemy engine/session
│   │   ├── ml/                # attrition model logic
│   │   ├── middleware/         # activity tracking middleware
│   │   ├── models/            # SQLAlchemy database models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── services/          # business logic and integrations
│   │   └── main.py             # FastAPI application/router registration
│   ├── alembic/               # database migrations
│   ├── tests/                 # automated tests
│   └── requirements.txt
├── frontend/
│   ├── src/api/               # Axios API clients
│   ├── src/components/        # shared UI components
│   ├── src/context/           # app state/context
│   ├── src/pages/             # feature pages
│   ├── src/App.jsx             # application routes
│   └── package.json
├── docs/                      # technical/user documentation and generated artifacts
├── scripts/                   # submission helper scripts
└── README.md
```

## Local setup (Windows PowerShell)

Use your actual project location. The commands below use the current development path as an example.

### 1. Prerequisites

Install a compatible Python version, Node.js/npm and MySQL Server. Create a MySQL database and a least-privilege application user. Do not commit passwords or other secrets.

### 2. Configure backend environment

Create `backend/.env` using `config-templates/backend.env.example` as a key template. Set `DATABASE_URL` to the local MySQL connection string and generate a strong `JWT_SECRET`. Configure SMTP only if email delivery is required.

Example database URL format:

```text
mysql+pymysql://DB_USER:DB_PASSWORD@127.0.0.1:3306/DATABASE_NAME
```

### 3. Install dependencies and apply migrations

```powershell
cd "C:\Users\k.Purushotham Sai\Documents\WorkForceAIPro\backend"
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m alembic upgrade head
```

If the virtual environment has not been created yet, create it first using `python -m venv .venv`, then install dependencies.

### 4. Start backend

```powershell
cd "C:\Users\k.Purushotham Sai\Documents\WorkForceAIPro\backend"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

Endpoints:

- API health: `http://127.0.0.1:8010/health`
- Database health: `http://127.0.0.1:8010/health/db`
- Swagger UI: `http://127.0.0.1:8010/docs`
- OpenAPI JSON: `http://127.0.0.1:8010/openapi.json`

### 5. Start frontend in a second terminal

Create `frontend/.env` from `config-templates/frontend.env.example` and confirm `VITE_API_BASE_URL` points to `http://127.0.0.1:8010/api/v1`.

```powershell
cd "C:\Users\k.Purushotham Sai\Documents\WorkForceAIPro\frontend"
npm ci
npm run dev
```

Use the URL Vite prints. If it selects port 5174 or 5175, ensure that exact origin is allowed by backend CORS configuration.

## Quality and test commands

```powershell
# Frontend
npm run lint
npm run build

# Backend, from backend folder
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic heads
```

## Documentation and handover files

- [Project overview](docs/PROJECT_OVERVIEW.md)
- [Installation and setup](docs/INSTALLATION_AND_SETUP.md)
- [API endpoint index](docs/API_DOCUMENTATION.md)
- Runtime OpenAPI JSON: `docs/openapi.json` — generate locally with `scripts/capture_submission_artifacts.ps1`
- [Database schema reference](docs/DATABASE_SCHEMA.md)
- Runtime schema export: `docs/database_schema.sql` — generated locally by the same script if `mysqldump` is available
- [User guide](docs/USER_GUIDE.md)
- [Requirements traceability](docs/REQUIREMENTS_TRACEABILITY.md)
- [Test plan](docs/TEST_PLAN.md)
- [Executed test results](docs/TEST_RESULTS.md)
- [Screenshot index](docs/SCREENSHOTS.md)
- [Submission checklist](docs/SUBMISSION_CHECKLIST.md)

## Current verification status (reported 26 October 2026)

The following results were provided from the local Windows project terminals:

- `npm run lint`: passed with no lint errors.
- `npm run build`: passed. Vite reports a large minified JavaScript chunk (approximately 1.1 MB); this is an optimization warning, not a build failure.
- `python -m pytest -q`: **79 passed, 0 failed**, with one non-blocking Starlette/httpx deprecation warning.
- Alembic current revision and head both reported `9f74883e2e58`.
- The developer has also reported successful manual UI tests for the core HR workflows; see `docs/TEST_RESULTS.md` for the scope and known follow-up items.

These results do not mean every possible role/API combination or performance/load scenario has automated end-to-end coverage. The targeted 79-test suite, manual browser tests and production build are different forms of evidence and are reported separately.

## Known follow-up items

- Audit Logs: a previous UI test did not show an `UPDATED_HR_INTERVENTION` event after an intervention update. Re-test after the audit patch is applied; keep this open until a new event is visible.
- HR intervention completion: the earlier UI workflow required manually editing the intervention status to `COMPLETED`; verify whether the dedicated Complete/Record Outcome action now updates the status automatically.
- Optimize the large frontend JavaScript chunk if time allows; the current production build succeeds.
- Generate `docs/openapi.json` and `docs/database_schema.sql` from the current local runtime before making the final source submission ZIP.

## Security and repository hygiene

- Never submit `backend/.env`, `frontend/.env`, JWT secrets, database passwords, SMTP credentials, reset tokens, or API tokens.
- Do not include `.venv/`, `node_modules/`, caches, or confidential production records in the source ZIP.
- Use the environment templates with placeholders instead of credentials.
- Before any public deployment, review HTTPS, CORS, secret rotation, backups, upload limits, email provider configuration and role permissions.
