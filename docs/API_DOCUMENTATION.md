# API Documentation Index

## Base URL

Local default: `http://127.0.0.1:8010/api/v1` (confirm `VITE_API_BASE_URL` and backend port). All normal HTTP endpoints are under `/api/v1`; WebSocket routes are shown separately. The live OpenAPI definition at `/openapi.json` and Swagger UI at `/docs` are authoritative for request/response schemas and required query/body fields.

## Authentication

Use `/auth/login` to obtain tokens. Send `Authorization: Bearer <access_token>` to protected APIs. The frontend Axios interceptor attempts `/auth/refresh` for eligible 401 responses. Do not place secrets or real tokens in tickets, screenshots, or repository files.

## Endpoints

| Area | Method | Path | Purpose |
|---|---|---|---|
| Authentication | `POST` | `/auth/register` | Create an account (subject to backend registration rules) |
| Authentication | `POST` | `/auth/login` | Authenticate and receive access/refresh tokens |
| Authentication | `POST` | `/auth/refresh` | Refresh the access token |
| Authentication | `POST` | `/auth/logout` | Logout/revoke session |
| Authentication | `POST` | `/auth/forgot-password` | Request a password reset |
| Authentication | `POST` | `/auth/reset-password` | Reset password using token |
| Authentication | `GET` | `/auth/me` | Read current account |
| Authentication | `PATCH` | `/auth/me` | Update current account profile |
| User Administration | `GET` | `/users` | List users |
| User Administration | `GET` | `/users/{user_id}` | Read user |
| User Administration | `PATCH` | `/users/{user_id}` | Update permitted user fields |
| Departments | `GET` | `/departments` | List active departments |
| Departments | `GET` | `/departments/stats` | Department employee statistics |
| Departments | `POST` | `/departments` | Create department |
| Departments | `GET` | `/departments/{department_id}` | Read department |
| Departments | `PATCH` | `/departments/{department_id}` | Update department |
| Departments | `DELETE` | `/departments/{department_id}` | Deactivate department |
| Employees | `GET` | `/employees` | List/filter/paginate employees |
| Employees | `GET` | `/employees/me` | Read linked employee profile |
| Employees | `POST` | `/employees` | Create employee |
| Employees | `GET` | `/employees/{employee_id}` | Read employee |
| Employees | `PATCH` | `/employees/{employee_id}` | Update employee |
| Employees | `DELETE` | `/employees/{employee_id}` | Deactivate employee |
| Shifts | `GET` | `/shifts` | List shifts |
| Shifts | `POST` | `/shifts` | Create shift |
| Shifts | `GET` | `/shifts/{shift_id}` | Read shift |
| Shifts | `PATCH` | `/shifts/{shift_id}` | Update shift |
| Shifts | `DELETE` | `/shifts/{shift_id}` | Deactivate shift |
| Shifts | `POST` | `/shifts/{shift_id}/assignments` | Assign a shift |
| Shifts | `GET` | `/shifts/{shift_id}/assignments` | List shift assignments |
| Attendance | `POST` | `/attendance/check-in` | Check in for the current employee |
| Attendance | `POST` | `/attendance/check-out` | Check out for the current employee |
| Attendance | `GET` | `/attendance/me` | List current employee attendance |
| Attendance | `GET` | `/attendance` | Attendance report/list |
| Leave Management | `GET` | `/leaves/policies` | List leave policies |
| Leave Management | `POST` | `/leaves/policies` | Create a leave policy |
| Leave Management | `PATCH` | `/leaves/policies/{policy_id}` | Update a leave policy |
| Leave Management | `POST` | `/leaves` | Apply for leave |
| Leave Management | `GET` | `/leaves/me` | List current employee requests |
| Leave Management | `GET` | `/leaves/balance/me` | Read current employee leave balance |
| Leave Management | `GET` | `/leaves` | List/filter leave requests |
| Leave Management | `PATCH` | `/leaves/{leave_id}/decision` | Approve/reject leave |
| Leave Management | `POST` | `/leaves/{leave_id}/cancel` | Cancel own eligible request |
| Payroll | `POST` | `/payroll/generate` | Generate a payroll record |
| Payroll | `GET` | `/payroll/me` | List current employee payroll |
| Payroll | `GET` | `/payroll/summary` | Payroll summary |
| Payroll | `GET` | `/payroll` | List/filter payroll records |
| Payroll | `GET` | `/payroll/{payroll_id}` | Read payroll record |
| Payroll | `PATCH` | `/payroll/{payroll_id}` | Adjust an eligible payroll record |
| Payroll | `POST` | `/payroll/{payroll_id}/approve` | Approve payroll |
| Payroll | `POST` | `/payroll/{payroll_id}/mark-paid` | Mark payroll as paid |
| Payroll | `GET` | `/payroll/{payroll_id}/payslip` | Download PDF payslip |
| Notifications | `GET` | `/notifications` | List notifications |
| Notifications | `GET` | `/notifications/unread-count` | Get unread count |
| Notifications | `POST` | `/notifications/escalation/run` | Run escalation action |
| Notifications | `POST` | `/notifications` | Create notification |
| Notifications | `PATCH` | `/notifications/{notification_id}/read` | Mark one notification read |
| Notifications | `POST` | `/notifications/read-all` | Mark all notifications read |
| Notifications | `WEBSOCKET` | `/notifications/ws` | Live notification delivery |
| Chat | `POST` | `/chat/messages` | Send a direct message |
| Chat | `GET` | `/chat/conversations/{other_user_id}` | Get conversation history |
| Chat | `POST` | `/chat/conversations/{other_user_id}/read` | Mark conversation read |
| Chat | `WEBSOCKET` | `/chat/ws` | Live chat messages |
| Employee Documents | `GET` | `/documents` | List allowed documents |
| Employee Documents | `POST` | `/documents` | Upload employee document |
| Employee Documents | `GET` | `/documents/{document_id}/download` | Download a document |
| Employee Documents | `DELETE` | `/documents/{document_id}` | Delete document where permitted |
| Dataset Management | `POST` | `/datasets/upload` | Upload and validate CSV dataset |
| Dataset Management | `GET` | `/datasets` | List dataset versions |
| Dataset Management | `GET` | `/datasets/{dataset_id}` | Read dataset version |
| Dataset Management | `GET` | `/datasets/{dataset_id}/failed-records` | Read failed validation rows |
| Dataset Management | `POST` | `/datasets/{dataset_id}/train` | Train model from dataset version |
| AI Attrition | `POST` | `/attrition/predict` | Run attrition prediction |
| AI Attrition | `GET` | `/attrition/predictions` | List saved predictions |
| AI Attrition | `GET` | `/attrition/monitoring` | Read risk monitoring history |
| AI Attrition | `GET` | `/attrition/analytics/departments` | Department attrition analytics |
| Alerts | `GET` | `/alerts` | List visible workforce alerts |
| Alerts | `PATCH` | `/alerts/{alert_id}/acknowledge` | Acknowledge alert |
| Alerts | `PATCH` | `/alerts/{alert_id}/resolve` | Resolve alert |
| Forecasting | `POST` | `/forecasting/generate` | Generate monthly forecast |
| Forecasting | `POST` | `/forecasting/generate-year` | Generate yearly forecast |
| Forecasting | `GET` | `/forecasting` | List forecasts |
| HR Interventions | `POST` | `/interventions` | Create intervention |
| HR Interventions | `GET` | `/interventions` | List interventions |
| HR Interventions | `PATCH` | `/interventions/{intervention_id}` | Update intervention/follow-up |
| Recommendations | `GET` | `/recommendations` | List workforce recommendations |
| Recommendations | `POST` | `/recommendations/generate` | Generate recommendations |
| Dashboard & Analytics | `GET` | `/dashboard/overview` | Workforce summary KPIs |
| Dashboard & Analytics | `GET` | `/dashboard/attendance-summary` | Attendance summary |
| Dashboard & Analytics | `GET` | `/dashboard/payroll-summary` | Payroll summary for period |
| Dashboard & Analytics | `GET` | `/dashboard/department-analytics` | Department analytics |
| Dashboard & Analytics | `GET` | `/dashboard/attrition-summary` | Attrition summary |
| Audit Logs | `GET` | `/audit-logs` | Read audit logs |
| Tasks | `POST` | `/tasks` | Create task |
| Tasks | `GET` | `/tasks` | List tasks |
| Tasks | `PATCH` | `/tasks/{task_id}` | Update task |
| Performance Reviews | `POST` | `/performance-reviews` | Create review |
| Performance Reviews | `GET` | `/performance-reviews` | List reviews |
| Performance Reviews | `GET` | `/performance-reviews/{review_id}` | Read review |
| Performance Reviews | `PATCH` | `/performance-reviews/{review_id}` | Update draft review |
| Performance Reviews | `POST` | `/performance-reviews/{review_id}/submit` | Submit review |
| Performance Reviews | `POST` | `/performance-reviews/{review_id}/acknowledge` | Acknowledge review |
| Reports & Exports | `GET` | `/reports/employees` | Employee report |
| Reports & Exports | `GET` | `/reports/attendance` | Attendance report |
| Reports & Exports | `GET` | `/reports/payroll` | Payroll report |
| Reports & Exports | `GET` | `/reports/attrition` | Attrition report |
| Advanced Search | `GET` | `/search` | Search supported workforce record types |
| Workforce Activity | `GET` | `/workforce-activities` | List activities |
| Workforce Activity | `POST` | `/workforce-activities` | Create activity where permitted |
| Workforce Activity | `WEBSOCKET` | `/workforce-activities/ws` | Live activity feed |

## System endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | API welcome/status response |
| `GET` | `/health` | API health probe |
| `GET` | `/health/db` | Database connectivity probe |
| `GET` | `/docs` | Interactive Swagger UI (development) |
| `GET` | `/openapi.json` | OpenAPI schema |

## Important workflow notes

- **Employee ID vs User ID:** these are separate identifiers. Employee-specific attendance, leave, payroll and prediction requests generally use the employee record, while auth/chat/notification ownership uses the user record. Do not substitute one ID for the other.
- **Attendance:** `POST /attendance/check-in` and `/check-out` operate for a linked employee. An Admin account without a linked employee profile should not be used as an employee-attendance smoke test.
- **Leave:** employee self-service uses `/leaves/me` and `/leaves/balance/me`; review/approval uses `/leaves/{leave_id}/decision`; policies use `/leaves/policies`.
- **Payroll:** generation is `POST /payroll/generate`; list/detail and updates have separate endpoints; pay-state transitions are `/approve` and `/mark-paid`; payslips are returned by `/payslip`.
- **Datasets:** upload uses `POST /datasets/upload`; failed validation rows are available from `/datasets/{dataset_id}/failed-records`; training uses `/datasets/{dataset_id}/train`.
- **Notifications:** list/count/read/read-all and escalation are separate endpoints; WebSocket path `/notifications/ws` supports live events.
- **Reports:** the API router in this source exposes employee, attendance, payroll and attrition reports. Confirm file formats and filter parameters via `/docs` for the deployed version.
- **Role authorization:** roles are enforced by backend dependencies. Frontend menu/route visibility alone is not adequate security.
- **Unavailable operations:** do not infer that a Create/Delete feature exists just because a generic frontend form can render it. Check the corresponding path and HTTP method in `/openapi.json`.

## API testing suggestions

Use Swagger UI or an API client to capture a successful request, expected status, response shape and role. Never save bearer tokens, reset tokens, employee PII or database credentials in committed collections.


## Machine-readable specification for submission

The route table above is a human-readable index. For exact operations, parameter schemas, required fields and response definitions from the **current local application**, use the live `http://127.0.0.1:8010/openapi.json` endpoint. Before handover, capture that response into `docs/openapi.json` by running `scripts/capture_submission_artifacts.ps1` from the repository root while the backend is running. Do not hand-edit or fabricate the generated OpenAPI file; regenerate it from the final local backend after API changes.
