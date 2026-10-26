# Functional and Regression Test Plan

> **How to use this checklist:** core UI workflows have already been manually exercised and the current targeted backend suite reported 79 passed tests. This plan is the broader repeatable acceptance checklist, not a statement that every checkbox has passed. See `TEST_RESULTS.md` for the actual recorded results and the known audit-log follow-up.

## Status convention

- `[ ]` Not run
- `[x]` Passed only after recording actual evidence
- `[!]` Failed/blocked; capture the request, response, screenshot/log, and responsible component

Do not mark a test passed because a page renders or because `npm run build` succeeds. Use test accounts for each role and disposable/test data. Avoid testing payroll or notifications against production users/data.

## A. Build and service checks

- [x] `npm run lint` passes in the local frontend project (terminal output reported 26 October 2026).
- [x] `npm run build` passes in Windows (terminal output reported 26 October 2026; bundle-size advisory noted in `TEST_RESULTS.md`).
- [x] FastAPI starts on the intended port (`8010` in the local test environment).
- [x] `GET /health` returns a healthy response.
- [x] `GET /health/db` confirmed database connectivity.
- [ ] `/docs` loads the active OpenAPI schema.
- [ ] Browser requests pass CORS using the actual Vite origin.

## B. Authentication and RBAC

- [x] Valid login opens the dashboard and the session persisted during the reported manual test.
- [ ] Invalid password shows safe error and does not create a session.
- [ ] Normal refresh/session persistence was tested; expired-token and invalid-refresh cases still require an explicit test.
- [ ] Logout invalidates/removes local session tokens.
- [ ] Registration validates required inputs and handles duplicate email.
- [x] Forgot-password email/reset flow was reported working.
- [x] Valid reset-password flow was reported working; invalid/expired/used-token rejection still needs explicit evidence.
- [ ] ADMIN, HR, MANAGER, EMPLOYEE route and API permissions are tested individually.
- [ ] Employee account linked to the correct employee record can read own profile; unlinked account receives expected message.

## C. Core HR operations

### Employees and departments
- [ ] Create employee with valid unique employee code/email.
- [ ] Duplicate employee code/email returns clear validation error.
- [ ] Edit employee, change department/manager, and verify persisted values.
- [ ] Search/filter/pagination return matching rows across multiple pages.
- [ ] Deactivate employee and verify inactive state; check dependent workflows.
- [x] Department create/edit/delete CRUD passed. Department statistics and employee linkages still need a separate reconciliation test.

### Shifts and attendance
- [ ] Create/activate shift and assign employee with effective dates.
- [ ] Employee with linked profile and active shift can check in.
- [ ] Duplicate check-in is rejected appropriately.
- [x] Check-out after check-in saved the expected times during manual testing.
- [x] Working-time calculation was manually verified for an 8-hour attendance record. Overtime-specific cases still need evidence.
- [ ] ADMIN without employee linkage does not masquerade as an employee; button and message are clear.
- [ ] HR/Admin attendance report and date filters work with records.

### Leave
- [ ] HR/Admin creates or updates active leave policy.
- [x] Valid leave application was tested; invalid/reversed date-range rejection remains to be checked.
- [x] Leave history, decision status and balance updates were reported working.
- [x] Approve and reject workflows were tested; detailed decision-note edge cases still need evidence.
- [ ] Employee can cancel only eligible requests.

### Payroll and payslips
- [x] Payroll generation for an employee/month was tested; Employee ID versus User ID was checked in the workflow.
- [ ] Duplicate employee/period generation is handled clearly.
- [x] Payroll calculation was manually checked by the developer for the tested record; non-zero deduction/bonus combinations remain unverified.
- [x] Generate/approve/mark-paid workflow passed for the tested payroll record.
- [ ] Disallowed state transition is rejected by backend and surfaced in UI.
- [ ] Employee only sees own payroll; HR/Admin listing is appropriately scoped.
- [x] Payslip PDF download and employee visibility were reported working; every metadata/content edge case was not separately checked.

## D. Communication and documents

- [x] Notification creation updated the recipient unread count/list in the reported UI test.
- [x] Mark Read, Mark All Read and unread status persistence passed.
- [ ] Escalation behavior works for a controlled test notification and does not send duplicate alerts.
- [ ] WebSocket notification updates arrive and reconnect behavior is observable.
- [x] Two-user message delivery, history persistence and read receipts passed.
- [ ] Employee document upload validates file type and size on frontend and backend.
- [ ] Authorized document download produces the expected bytes/file; unauthorized user is denied.
- [x] Admin document deletion and persistence after refresh passed.

## E. AI and workforce intelligence

- [x] Valid 40-row synthetic dataset upload/target selection passed.
- [ ] Upload malformed/duplicate/missing-target dataset and inspect failed-record output.
- [x] Model training completed and metrics were displayed for the synthetic test dataset.
- [x] Prediction, saved history and employee linkage were reported working for synthetic test data.
- [ ] Validate confidence/risk labels and department analytics against API response.
- [x] High-risk alert creation, acknowledgement and resolution were tested; successive-risk-change tracking remains to be validated.
- [x] Monthly/yearly forecast generation, details and saved history passed. Forecast assumptions/accuracy were not validated against real outcomes.
- [x] Recommendation generation, details/category/priority display and CSV export passed; duplicate-generation behavior remains to be checked.
- [ ] Create/update/complete intervention and verify assignee, follow-up date and outcome persist.

## F. Reports, search, activity and audit

- [ ] Employee, attendance, payroll and attrition reports match database/API records.
- [ ] Download each supported PDF/Excel/CSV export; open it and verify rows, encoding, filename and filters.
- [ ] Search by query and each supported record type; verify empty, error and partial-result states.
- [ ] Verify search does not expose records outside role/user scope.
- [ ] A successful mutation creates an activity record where middleware rules apply.
- [ ] Audit records show actor/action/entity/time and only authorized roles can read them.
- [ ] CSV export accurately represents all records claimed by the page; note any server-page/loaded-row limitations.

## G. Frontend routes and UX

- [ ] All sidebar links open the intended component (dedicated page vs generic ModulePage).
- [ ] `/login`, `/register`, `/forgot-password`, `/reset-password` load without authentication; protected routes redirect appropriately.
- [ ] `/dashboard`, `/charts`, `/profile`, `/search`, `/reports`, `/employees`, `/departments`, `/attendance`, `/leaves`, `/shifts`, `/my-payroll`, `/payroll`, `/chat`, `/reviews`, `/tasks`, `/documents`, `/attrition`, `/alerts`, `/datasets`, `/forecasting`, `/recommendations`, `/notifications`, `/activity`, `/users`, `/interventions`, `/audit-logs` resolve as intended.
- [ ] Browser console has no uncaught errors; failed HTTP requests show useful error states.
- [ ] Responsive layout reviewed at desktop and mobile widths; keyboard and focus states checked.

## Evidence template

For each test record: Test ID, date/time, environment, role, seeded record IDs (avoid real PII), steps, expected result, actual result, HTTP status/response summary, screenshot/log file, PASS/FAIL/BLOCKED, defect and retest status.
