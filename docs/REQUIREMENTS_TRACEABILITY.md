# Requirements Traceability Matrix

This matrix maps the 30 modules in the supplied WorkForce AI Pro requirements document to the testing evidence currently available. A feature may be implemented and manually exercised without every edge case being covered by automated integration tests. Keep those claims distinct.

**Evidence definitions**

- **Manual core flow reported PASS:** the user reported using the UI and confirming the listed main workflow.
- **Automated targeted coverage:** the newly added test suite runs as part of the reported `79 passed` pytest result. These tests cover selected schemas, services, ML logic, exports and API contracts; they are not a full integration test of every UI endpoint.
- **Follow-up:** an explicit remaining test, known defect or acceptance criterion that has not been confirmed closed.

| Module | Requirement area | Manual evidence reported | Automated coverage/evidence | Remaining follow-up |
|---:|---|---|---|---|
| 1 | Authentication & Authorization | Login, session persistence and forgot/reset password workflows passed. | Auth/schema/route-related targeted tests included in the 79-test suite. | Explicit token-expiry/refresh, invalid-token and all-role API matrix not fully recorded. |
| 2 | Employee Management | Employee list, search/view and test-employee workflow exercised. | Employee schema/API-contract tests included. | Full duplicate-value, deactivate, filtering and every CRUD endpoint matrix not claimed as automated E2E. |
| 3 | Department & Role Management | Department CRUD passed; role-specific dashboard/access cases exercised. | Department/user schema and API-contract tests included where covered by the test files. | Complete ADMIN/HR/MANAGER/EMPLOYEE permission matrix remains to be recorded. |
| 4 | Attendance & Shift Management | Check-in/out and 8-hour calculation passed; overlap rejection was checked. | Relevant schemas/API contracts have targeted coverage. | Valid shift assignment, overtime and stale-session edge cases not all evidenced in this report. |
| 5 | Leave Management | Apply, approve, reject, cancel, balance, email and in-app notification flows passed. | Leave workflow schema tests included. | Reports and boundary/invalid-date cases need evidence if required for acceptance. Leave Policy activate/deactivate is intentionally excluded from current scope by user decision. |
| 6 | Payroll Management | Generate, approve, mark-paid, payslip download and calculation workflow exercised. | Payroll service/schema tests and proration unit tests included in suite. | State-transition/duplicate period and every non-zero deduction/bonus combination are not full DB integration coverage. |
| 7 | Notifications & Alerts | Read/unread, mark-all-read, history, email and unread badge updates passed. | Notification service tests included. | Toast appearance and all automated escalation/reconnect cases are not fully captured as automated E2E. |
| 8 | One-to-One Chat | Live send/reply, history persistence and read receipts passed. | Selected communication schemas/API contracts covered. | Full WebSocket reconnect/load coverage not claimed. |
| 9 | Document Management | Upload/download and Admin delete persistence passed. | API contract coverage is partial. | Invalid file type/size and unauthorized download security cases should be captured if required. |
| 10 | Dashboard & Workforce Analytics | Main dashboard, statistics and chart display exercised. | Route/API contracts partly covered. | Every displayed metric not independently reconciled against SQL rows in the test report. |
| 11 | Dataset Management | Valid 40-row CSV upload/validation passed; duplicate/failure counts were displayed. | Dataset schema/ML tests included. | Versioning and malformed/duplicate/missing-target negative cases are not all full integration tests. |
| 12 | AI Attrition Prediction | Model training, prediction, risk percentage, saved history and employee link tested. | Attrition model tests included in the 79-test suite. | Metrics came from synthetic data; do not present them as real-world model validation. Confidence-score behavior should be documented against the actual model. |
| 13 | Employee Risk Monitoring | High-risk alert creation, acknowledge and resolve were exercised. | Selected alert/model schemas are covered. | Risk change tracking through successive predictions needs explicit evidence. |
| 14 | Workforce Forecasting | Monthly/yearly forecast generation, details and CSV export passed. | Forecast/schema/API coverage is targeted. | Current `risk_weighted_snapshot_baseline` is an estimate; assumptions and forecast accuracy have not been validated against real historical outcomes. |
| 15 | Attrition Analytics Dashboard | Department-level prediction/average-risk result displayed. | Selected analytics API/model contracts covered. | All trend/turnover metrics not independently reconciled with a real dataset. |
| 16 | HR Intervention & Decision Support | Create/edit/notes/follow-up and manual status changes passed. | Intervention schemas/API contracts have targeted coverage. | **Audit event for an intervention update was not visible in a previous UI test; retest after the audit fix.** The dedicated Complete/Record Outcome auto-status action also needs closure confirmation. |
| 17 | Smart Notification & Alert Engine | Risk alert priority and acknowledge/resolve workflow exercised. | Notification service and related schemas covered selectively. | Automated escalation rules and duplicate-alert prevention are not fully covered by end-to-end tests. |
| 18 | Real-Time Workforce Monitoring | Activity Feed entries persisted after refresh; live notification indicator was visible. | Activity API contract coverage is partial. | A distinct real-time activity event delivery/reconnect test remains to be recorded. |
| 19 | Reports & Export System | Forecast/recommendation/audit CSV and payroll payslip PDF downloads exercised. | Report export serialization tests included. | Confirm formats and filter scopes for each required report before making a universal export claim. |
| 20 | Audit Logs & Activity Tracking | Audit page, displayed attendance correction, filters and CSV export worked. | API route contracts covered selectively. | **Known follow-up:** the prior test showed no `UPDATED_HR_INTERVENTION` event after refresh; do not mark complete until a new event appears. Verify other critical mutations are captured. |
| 21 | Workflow & Task Management | Create/assign/status changes OPEN → IN_PROGRESS → COMPLETED and persistence passed. | Task schemas/API contracts covered selectively. | Due-date/overdue notification edge cases not fully evidenced. |
| 22 | Performance Review System | Create/submit and employee acknowledgement persisted. | Review schema/API contract tests included. | Full goal-history/reporting and cross-role matrix not captured as automated E2E. |
| 23 | AI Recommendation Engine | Generate/detail and CSV export passed. | Recommendation/ML schemas covered selectively. | Team/department-wide insight quality needs dataset-specific acceptance criteria. |
| 24 | Advanced Search & Filtering | Search for `Demo` returned matching employee records. | API contract tests included selectively. | All combined filters and role-scoped search results not covered by the single reported UI search. |
| 25 | Professional Enterprise UI/UX | Core pages/forms/tables were exercised during manual testing; screenshots exist. | ESLint and Vite production build passed. | Responsive/accessibility checks across every route are not represented by lint/build alone. |
| 26 | Role-Based Access Control | Admin and Employee access/dashboard differences and a review acknowledgement restriction were tested. | Auth/API contract tests cover selected access boundaries. | All four roles across every sensitive endpoint are not claimed as fully automated. |
| 27 | Workforce Stability Engine | Monthly/yearly forecasts and department analytics were exercised. | Related model/schema tests are targeted. | Workforce growth/stability score calculations need explicit expected-value acceptance tests. |
| 28 | Optimization & Scalability | Normal interactive flows and production build completed. | No dedicated load/benchmark results included. | Performance/load testing, large-table behavior and database query profiling remain unmeasured. |
| 29 | Testing & Validation | Manual tests reported passed for core workflows; frontend lint/build and backend pytest completed. | **79 passed, 0 failed**, one deprecation warning. | 79 passing tests are selected automated tests, not proof of all 30 modules' full E2E coverage. |
| 30 | Frontend & Backend Integration | Main UI workflows called the backend and persisted data in the manual tests. | API contract, route and service tests included selectively. | Final end-to-end role/real-time/error-state regression evidence still needs to be retained with the submission. |

## Release interpretation

- The current frontend lint and production build passed in the local Windows environment.
- The current backend test run reported `79 passed, 0 failed`; one non-blocking Starlette/httpx deprecation warning was emitted.
- Alembic current and head revisions both reported `9f74883e2e58`.
- These results support a **conditional submission-ready documentation state**, not a claim of performance certification or complete automated E2E coverage.
- Keep Audit Logs intervention coverage open until the local application emits and displays a new intervention audit event after the relevant fix.
