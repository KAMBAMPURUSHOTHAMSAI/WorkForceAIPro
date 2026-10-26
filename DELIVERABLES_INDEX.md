# Deliverables Index

| File | Purpose | Status |
|---|---|---|
| `README.md` | Main project overview, setup, current verification summary | Updated with 26 October 2026 reported test results |
| `docs/PROJECT_OVERVIEW.md` | Architecture and module map | Existing documentation retained |
| `docs/INSTALLATION_AND_SETUP.md` | Windows setup, migrations, run commands and health checks | Windows paths and current test commands corrected |
| `docs/API_DOCUMENTATION.md` | Human-readable API route index grouped by functional area | Existing reference retained; links to live OpenAPI artefact added |
| `docs/openapi.json` | Machine-readable OpenAPI schema captured from the current running backend | Generate locally with `scripts/capture_submission_artifacts.ps1` |
| `docs/DATABASE_SCHEMA.md` | SQLAlchemy tables, fields, relationships and constraints | Existing reference retained; runtime SQL export described |
| `docs/database_schema.sql` | Actual MySQL table/schema definitions without application rows | Generate locally with `scripts/capture_submission_artifacts.ps1` when `mysqldump` is available |
| `docs/USER_GUIDE.md` | Role-oriented operator instructions and troubleshooting | Existing documentation retained |
| `docs/REQUIREMENTS_TRACEABILITY.md` | Mapping for all 30 requirement modules and evidence status | Updated to distinguish manual verification from automated coverage |
| `docs/TEST_PLAN.md` | Functional/regression checklist for repeatable acceptance testing | Existing checklist retained; read alongside `TEST_RESULTS.md` |
| `docs/TEST_RESULTS.md` | Executed frontend/backend/migration results and known follow-ups | Added using the actual terminal outputs supplied by the developer |
| `docs/TEST_RESULTS_TEMPLATE.md` | Blank template for future runs and evidence | Retained for subsequent test cycles |
| `docs/SUBMISSION_CHECKLIST.md` | Final packaging, security and open-defect checklist | Updated with current results and remaining closure items |
| `docs/SCREENSHOTS.md` | Index of the supplied UI screenshots | Existing index retained |
| `config-templates/backend.env.example` | Backend placeholder configuration; no real secret values | Retained; review before submission |
| `config-templates/frontend.env.example` | Frontend API URL template | Retained |
| `scripts/capture_submission_artifacts.ps1` | Saves current runtime OpenAPI JSON and attempts no-data MySQL schema export | New helper script; run only against the local development app/database |

This pack contains documentation, screenshot evidence and a small helper script. It is **not** a replacement for the latest working source checkout. Create the final source-code ZIP from the user's latest local project after all fixes and checks.
