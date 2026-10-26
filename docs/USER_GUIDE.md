# User Guide (Role-Oriented)

## Sign in and account access

1. Open the Vite frontend URL shown in the terminal.
2. Sign in with an active account. Use the Forgot Password flow only after SMTP/reset-token configuration is ready.
3. The application uses four roles: ADMIN, HR, MANAGER and EMPLOYEE. The allowed menu and action set depends on backend permissions.
4. A login user and an employee profile are separate records; an employee account must have a linked employee profile for employee-specific workflows.

## Admin

- Review dashboard metrics and protected reports.
- Manage user roles/status through User Management where supported.
- Manage employees, departments, shifts, documents and payroll within authorized endpoints.
- Upload datasets, run attrition prediction/training, inspect risk monitoring, alerts, forecasts, recommendations, interventions and audit logs.

## HR

- Maintain employee/department records and review attendance/leave as allowed.
- Maintain leave policies, approve/reject leave requests and manage payroll workflows.
- Review predictions, dataset validation, recommendations and follow-up interventions.
- Generate/export available reports.

## Manager

- Use only the team/workflow functions made available by the application and backend.
- Verify team-level scoping before using employee-sensitive data. Do not assume the route itself guarantees record-level authorization.

## Employee

- Review profile and linked employee information.
- Check in/out after an active shift is assigned and employee-profile linkage is correct.
- Apply for leave, review leave balance/history and cancel eligible requests.
- View personal payroll/payslips after payroll reaches an allowed state.
- View assigned tasks, acknowledge eligible performance reviews, access own notifications/documents/chat as authorized.

## Workflow tips

### Attendance

If the page says the user account is not linked to an employee profile, ask ADMIN/HR to link the User record to an Employee record. If it says no active shift is assigned, create/activate a shift and assign it for the current date before testing check-in. A check-in screenshot alone is not an end-to-end test; verify the saved attendance row and the corresponding check-out/working time.

### Leave

Check an active leave policy and available balance first. Apply with valid start/end dates and reason. HR/Admin or other permitted reviewers should make the decision; then refresh the employee request history and balance.

### Payroll

Ensure employee base salary and period are valid, generate payroll, check calculated amounts, approve, mark paid, and verify the payslip download. Use Employee ID for payroll generation, not User ID.

### Dataset and attrition model

Upload a well-formed CSV using the intended target column. Review valid/failed row counts, examine failed row details, then train only when requirements are met. Record the dataset version and metrics returned by the API. Treat model scores as decision support, not guaranteed outcomes.

### Notifications and live modules

Keep the backend running, verify WebSocket connections are authenticated, trigger a real event, verify a new notification/activity/message arrives, mark it read or resolve it if applicable, and confirm the persisted state after refresh.

## Troubleshooting

- **401 / redirected to login:** inspect access/refresh tokens and `/auth/refresh`; sign in again if the refresh session expired.
- **403:** current role may not be allowed by backend; do not work around by changing frontend-only permissions.
- **Employee profile not linked:** link the user account to an employee record.
- **No active shift:** assign an active shift for the test date.
- **CORS error:** add the exact Vite origin to `CORS_ALLOWED_ORIGINS` and restart FastAPI.
- **File or PDF does not download:** inspect browser Network response, content type/filename and the authenticated API endpoint.
- **Empty list:** check API response, filters, role visibility and the current database; empty UI does not necessarily mean code failure.
