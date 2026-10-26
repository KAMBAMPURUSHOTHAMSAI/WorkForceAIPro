# Project Overview and Architecture

## Purpose

WorkForce AI Pro brings together HR operations and workforce intelligence. The main objective is to keep employee lifecycle workflows in one system and provide decision support using employee, attendance, leave, payroll, dataset and attrition-related records.

## Architecture

```text
Browser (React + Vite)
  ├─ React Router + ProtectedRoute + AppLayout
  ├─ Feature pages and reusable ModulePage
  └─ Axios API client (Bearer token + refresh retry)
          │ HTTP/JSON and WebSocket connections
          ▼
FastAPI application (/api/v1)
  ├─ Authentication and role dependencies
  ├─ HR endpoints (employees, departments, attendance, shifts, leave, payroll)
  ├─ Collaboration (chat, notifications, documents, tasks, reviews)
  ├─ Intelligence (datasets, ML attrition, risk logs, alerts, forecasting, recommendations)
  ├─ Reporting, dashboard, activity, audit and search
  └─ Services and activity middleware
          │ SQLAlchemy ORM / Alembic migrations
          ▼
MySQL database
```

## Important design choices

- **API prefix:** `/api/v1`.
- **Frontend API configuration:** `VITE_API_BASE_URL`, default in the API client is `http://127.0.0.1:8010/api/v1`.
- **Authentication:** the Axios client adds a bearer access token; on eligible 401 responses, it attempts a refresh-token flow and clears tokens if refresh fails.
- **Role access:** frontend `ProtectedRoute` improves navigation UX; backend role dependencies remain authoritative.
- **Data layer:** SQLAlchemy models map to relational tables; Alembic migrations are stored under `backend/alembic/versions`.
- **Live events:** chat, notification and workforce-activity routers expose WebSocket paths.
- **Activity and alerts:** successful authenticated mutations can be recorded by the activity middleware; a notification-escalation loop is started by the FastAPI lifespan.

## Main functional areas

1. Account registration/login/session refresh/password recovery.
2. Employee and department records, shifts, attendance and leave.
3. Payroll generation, approval, payment marking, summaries and payslips.
4. Tasks, performance reviews, employee documents, direct chat and in-app notifications.
5. Dataset versioning and validation, ML-based attrition predictions, risk monitoring, alerts and interventions.
6. Monthly/yearly workforce forecasts, recommendations, reports, audit logs, workforce activity and advanced search.

## User roles

- **ADMIN:** system administration and protected workforce-wide actions.
- **HR:** HR operations and workforce intelligence features allowed by backend rules.
- **MANAGER:** team/workflow access where explicitly allowed.
- **EMPLOYEE:** self-service endpoints for linked employee accounts.

The precise capabilities vary by endpoint. For example, a user account must be linked to an employee record to use employee-specific attendance operations.

## Current UI note

The client uses a mix of dedicated feature pages and an OpenAPI-driven generic CRUD page (`ModulePage.jsx`) for modules that do not currently have a separate page component. Use the route table and the live `/docs` contract as the source of truth for the checked-out version.
