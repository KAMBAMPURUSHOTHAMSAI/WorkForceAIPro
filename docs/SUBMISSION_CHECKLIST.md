# Submission and Handover Checklist

## Source code and documentation

- [ ] Final source ZIP is created from the latest local Windows project folder, not from an older uploaded snapshot.
- [x] Root README and core technical/user documentation are present.
- [x] Sanitized `.env.example` templates are present; inspect them before submission.
- [x] Requirements traceability matrix and test plan are present.
- [x] Screenshot index and eight UI screenshots are included in this documentation pack.
- [ ] Final source ZIP has been inspected to exclude real `.env` files, credentials, `.venv/`, `node_modules/`, caches, generated local databases and confidential records.

## Current automated verification (user-reported terminal output, 26 October 2026)

- [x] `npm run lint` — passed with no lint errors.
- [x] `npm run build` — passed; Vite emitted a non-blocking large JavaScript chunk warning (~1.1 MB minified).
- [x] `python -m pytest -q` — 79 passed, 0 failed; one Starlette/httpx deprecation warning.
- [x] `alembic current` and `alembic heads` both reported `9f74883e2e58`.
- [x] Core HR and AI workflows have been manually tested by the developer; details and limits are recorded in `TEST_RESULTS.md` and `REQUIREMENTS_TRACEABILITY.md`.

## Runtime artefacts — generate from the final local project

- [ ] `docs/openapi.json` — capture from the running local API, using `scripts/capture_submission_artifacts.ps1`.
- [ ] `docs/database_schema.sql` — export structure only (no rows) from the actual local MySQL database; the same helper script attempts this if `mysqldump` is available.
- [x] `docs/API_DOCUMENTATION.md` — human-readable endpoint index is present.
- [x] `docs/DATABASE_SCHEMA.md` — human-readable model/table reference is present.

## Defect closure / evidence

- [ ] Re-test Audit Logs after updating an HR intervention. A new intervention audit event must appear before this item can be closed.
- [ ] Re-check whether the dedicated intervention Complete/Record Outcome action changes status to `COMPLETED` automatically; if not, record it as a known UX issue or fix it separately.
- [ ] Keep final screenshots/demo evidence free of real employee PII, credentials and reset tokens.
- [ ] Confirm exports open and contain only authorized/synthetic data.

## Package hygiene

Do not include:

- `backend/.env`, `frontend/.env`, JWT secrets, database passwords, SMTP credentials, reset tokens or API tokens.
- Local virtual environments (`backend/.venv`), `frontend/node_modules`, cache folders or unnecessary generated `dist` output.
- Database dumps with real employee rows or screenshots exposing employee PII.

**Submission status: CONDITIONAL.** The documentation set is in place and the reported lint/build/automated test/migration checks passed. Generate runtime OpenAPI/SQL schema artefacts from the final local app and close the audit-log retest before calling the package fully finalized.
