# WorkForce AI Pro — Test Results

**Record date:** 26 October 2026

**Evidence source:** terminal results pasted by the developer in this conversation, plus previously reported UI workflow outcomes.

**Environment:** Windows PowerShell; frontend at the local Vite dev server (reported as port 5174 in earlier testing); FastAPI at `http://127.0.0.1:8010`; local MySQL database.

> This is an evidence summary, not a claim that every possible API/role combination, performance condition or UI error state has been covered. The automated suite is a targeted suite of tests and is distinct from manually reported browser testing.

## 1. Automated and build checks

| Check | Command / observation | Result | Notes |
|---|---|---|---|
| Frontend lint | `npm run lint` | **PASS** | Latest output completed without lint errors. |
| Frontend production build | `npm run build` | **PASS** | Vite 8.3.4; 2,593 modules transformed; build completed successfully. |
| Frontend bundle-size advisory | From `npm run build` | **WARNING** | Minified JS chunk is about 1,108.45 kB, above Vite's 500 kB advisory threshold; this is not a build failure. |
| Backend automated tests | `.\.venv\Scripts\python.exe -m pytest -q` | **PASS** | 79 passed, 0 failed, in 19.86 seconds. |
| Backend test warning | pytest warning summary | **WARNING** | One `StarletteDeprecationWarning`: current `starlette.testclient`/`httpx` integration is deprecated. It did not fail the tests. Review compatible test-client dependencies in a separate dependency-maintenance change. |
| Alembic current revision | `.\.venv\Scripts\python.exe -m alembic current` | **PASS** | `9f74883e2e58 (head)` |
| Alembic heads | `.\.venv\Scripts\python.exe -m alembic heads` | **PASS** | `9f74883e2e58 (head)`; current revision and head match. |

## 2. Manual UI workflows reported as passing

The developer reported successful UI testing for the principal workflows below. These results are based on user-reported execution; this table does not claim that every negative/boundary case was automated.

| Area | Manual result reported |
|---|---|
| Login/session/dashboard | Login, dashboard display, refresh/session persistence passed. |
| Employees/departments | Employee list/search/view and Department CRUD passed. |
| Attendance/shifts | Employee check-in/check-out and an 8-hour working-time calculation passed; duplicate/overlap validation was checked. |
| Leave | Apply, approval, rejection, cancellation, balance updates, email and in-app notifications passed. |
| Notifications | List, unread count/filter, Mark Read/Mark All Read, persistence and updates to the unread badge passed. |
| Chat | Two-way messaging, persisted history and read receipts passed. |
| Documents | Upload/download, Admin deletion and deletion persistence passed. |
| Payroll | Generate, approve, mark paid, payslip PDF download and employee payslip visibility were exercised. |
| Attrition datasets/model | A 40-row synthetic dataset upload/validation and model training/prediction workflow passed. The metrics are for synthetic data, not proof of real-world model accuracy. |
| Risk monitoring | High-risk alert creation, acknowledgement and resolution passed. |
| Forecasts/recommendations | Monthly/yearly forecast generation, details and CSV exports passed; recommendation creation/details/export passed. |
| HR interventions | Create/edit, notes and manual status change to COMPLETED persisted. |
| Activity/audit | Activity feed listing/persistence and audit page/filter/export worked for the tested records. |
| Tasks/performance reviews | Task status workflow and review submission/employee acknowledgement persisted. |
| Advanced search/RBAC | Employee search for `Demo` and selected Admin/Employee access distinctions passed. |
| Password recovery | Forgot-password email and reset-password flow passed. |

## 3. Known follow-up items

| Item | Current status | Closure evidence required |
|---|---|---|
| HR intervention audit event | **OPEN / retest required** | A previous test updated an HR intervention, but no `UPDATED_HR_INTERVENTION` event appeared in Audit Logs after refresh. Apply the relevant audit patch if not already applied, make a new update, and verify a new audit event appears with actor/action/time/details. |
| Intervention Complete/Record Outcome action | **Needs confirmation** | Earlier, that dedicated action did not automatically set status to `COMPLETED`; manual status editing did persist. Verify current behavior or record as a known UI defect. |
| Runtime OpenAPI JSON | **Not yet attached to this record** | Capture `docs/openapi.json` from the final local API with the helper script after starting the backend. |
| Runtime database schema export | **Not yet attached to this record** | Generate `docs/database_schema.sql` with `mysqldump --no-data` against the intended local development DB. |
| Large frontend bundle | **Optimization advisory** | Optional follow-up: code-split heavy pages/dependencies and confirm the build remains successful. |

## 4. Interpretation

- Frontend lint and production build passed.
- The current backend automated test run passed all 79 tests.
- Alembic current/head revision match.
- Core workflows have substantial manual verification reported by the developer.
- Audit intervention event closure and runtime API/schema artefact capture remain open. This report should be updated if the audit patch is tested successfully or additional final regression results become available.
