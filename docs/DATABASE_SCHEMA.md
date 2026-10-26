# Database Schema Reference

## Source and scope

This index is derived from the SQLAlchemy models in `backend/app/models/` and the Alembic migration directory. It lists table names and mapped columns to help reviewers understand the relational model. Confirm exact types, nullable constraints, indexes, check constraints and foreign-key rules in the model/migration files for the checked-out version. This document does not include database rows or credentials.

## Tables

Relationships shown below are based on foreign-key fields in the model names. The exact `ondelete` behavior is defined in the models/migrations.

### `attendance` — `Attendance`

Columns: `id`, `employee_id`, `shift_id`, `attendance_date`, `check_in`, `check_out`, `working_minutes`, `overtime_minutes`, `status`, `notes`, `created_at`, `updated_at`.

### `attrition_predictions` — `AttritionPrediction`

Columns: `id`, `employee_id`, `dataset_version_id`, `predicted_attrition`, `risk_probability`, `confidence_score`, `risk_level`, `model_version`, `input_features`, `created_by_user_id`, `created_at`.

### `audit_logs` — `AuditLog`

Columns: `id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `details`, `ip_address`, `user_agent`, `created_at`.

### `chat_messages` — `ChatMessage`

Columns: `id`, `sender_id`, `recipient_id`, `message`, `sent_at`, `read_at`.

### `dataset_failed_records` — `DatasetFailedRecord`

Columns: `id`, `dataset_version_id`, `row_number`, `error_message`, `row_data`, `created_at`.

### `dataset_versions` — `DatasetVersion`

Columns: `id`, `version_number`, `original_filename`, `stored_filename`, `target_column`, `total_rows`, `valid_rows`, `failed_rows`, `feature_columns`, `validation_summary`, `model_metrics`, `status`, `error_message`, `uploaded_by`, `created_at`.

### `departments` — `Department`

Columns: `id`, `name`, `description`, `is_active`, `created_at`.

### `employee_documents` — `EmployeeDocument`

Columns: `id`, `employee_id`, `uploaded_by`, `original_filename`, `stored_filename`, `document_type`, `content_type`, `file_size`, `is_deleted`, `uploaded_at`.

### `employees` — `Employee`

Columns: `id`, `employee_code`, `first_name`, `last_name`, `email`, `phone`, `job_title`, `employment_type`, `employment_status`, `date_of_joining`, `base_salary`, `department_id`, `manager_id`, `user_id`, `created_at`, `updated_at`.

### `hr_interventions` — `HRIntervention`

Columns: `id`, `employee_id`, `prediction_id`, `title`, `category`, `recommendation`, `assigned_to`, `follow_up_date`, `status`, `outcome_notes`, `completed_at`, `created_by`, `created_at`.

### `hr_tasks` — `HRTask`

Columns: `id`, `title`, `description`, `created_by`, `assigned_to`, `related_employee_id`, `status`, `priority`, `due_date`, `completed_at`, `created_at`, `updated_at`.

### `leave_policies` — `LeavePolicy`

Columns: `id`, `name`, `description`, `annual_quota`, `is_paid`, `is_active`, `created_at`.

### `leave_requests` — `LeaveRequest`

Columns: `id`, `employee_id`, `policy_id`, `start_date`, `end_date`, `total_days`, `reason`, `status`, `reviewer_id`, `reviewed_at`, `reviewer_comments`, `created_at`, `updated_at`.

### `notifications` — `Notification`

Columns: `id`, `user_id`, `notification_type`, `title`, `message`, `priority`, `read_status`, `read_at`, `created_at`.

### `password_reset_tokens` — `PasswordResetToken`

Columns: `id`, `user_id`, `token_hash`, `expires_at`, `used_at`, `created_at`.

### `payroll_records` — `PayrollRecord`

Columns: `id`, `employee_id`, `period_year`, `period_month`, `annual_base_salary`, `monthly_base_salary`, `allowances`, `bonus`, `tax_deduction`, `other_deductions`, `gross_pay`, `total_deductions`, `net_pay`, `status`, `generated_by`, `paid_at`, `created_at`, `updated_at`.

### `performance_reviews` — `PerformanceReview`

Columns: `id`, `employee_id`, `reviewer_id`, `review_period_start`, `review_period_end`, `rating`, `strengths`, `improvement_areas`, `goals`, `reviewer_comments`, `status`, `submitted_at`, `acknowledged_at`, `created_at`, `updated_at`.

### `refresh_sessions` — `RefreshSession`

Columns: `id`, `user_id`, `token_hash`, `family_id`, `expires_at`, `revoked_at`, `created_at`.

### `risk_monitoring_logs` — `RiskMonitoringLog`

Columns: `id`, `employee_id`, `prediction_id`, `previous_risk_percent`, `current_risk_percent`, `risk_change_percent`, `risk_level`, `reason`, `detected_at`.

### `shift_assignments` — `ShiftAssignment`

Columns: `id`, `employee_id`, `shift_id`, `effective_from`, `effective_to`, `is_active`, `created_at`.

### `shifts` — `Shift`

Columns: `id`, `name`, `start_time`, `end_time`, `break_minutes`, `is_active`, `created_at`.

### `users` — `User`

Columns: `id`, `full_name`, `email`, `password_hash`, `role`, `is_active`, `token_version`, `created_at`, `updated_at`.

### `workforce_activities` — `WorkforceActivity`

Columns: `id`, `employee_id`, `actor_user_id`, `activity_type`, `description`, `activity_data`, `source`, `created_at`.

### `workforce_alerts` — `WorkforceAlert`

Columns: `id`, `employee_id`, `prediction_id`, `recipient_user_id`, `title`, `message`, `priority`, `status`, `acknowledged_at`, `resolved_at`, `created_at`.

### `workforce_forecasts` — `WorkforceForecast`

Columns: `id`, `forecast_year`, `forecast_month`, `department_id`, `forecast_scope`, `predicted_headcount`, `predicted_attrition_count`, `attrition_rate_percent`, `stability_score`, `model_version`, `forecast_data`, `created_by`, `created_at`.

### `workforce_recommendations` — `WorkforceRecommendation`

Columns: `id`, `employee_id`, `department_id`, `prediction_id`, `category`, `title`, `recommendation`, `priority`, `recommendation_data`, `created_by`, `created_at`.

## Main relationships

| Source field(s) | Target | Meaning |
|---|---|---|
| `employees.department_id` | `departments.id` | Employee belongs to a department (optional). |
| `employees.manager_id` | `employees.id` | Employee manager/self-reference (optional). |
| `employees.user_id` | `users.id` | Optional one-to-one link from employee profile to login user. |
| `attendance.employee_id` | `employees.id` | Attendance belongs to an employee. |
| `attendance.shift_id` | `shifts.id` | Attendance may reference a shift. |
| `shift_assignments.employee_id` | `employees.id` | Assignment belongs to an employee. |
| `shift_assignments.shift_id` | `shifts.id` | Assignment references a shift. |
| `leave_requests.employee_id` | `employees.id` | Leave request belongs to employee. |
| `leave_requests.policy_id` | `leave_policies.id` | Leave request uses a leave policy. |
| `payroll_records.employee_id` | `employees.id` | Payroll record belongs to employee; employee+period is unique. |
| `payroll_records.generated_by` | `users.id` | User who generated payroll (optional). |
| `performance_reviews.employee_id` | `employees.id` | Performance review subject. |
| `performance_reviews.reviewer_id` | `users.id` | Reviewing user. |
| `chat_messages.sender_id / recipient_id` | `users.id` | Direct message sender and recipient. |
| `notifications.user_id` | `users.id` | Notification recipient. |
| `employee_documents.employee_id` | `employees.id` | Document owner. |
| `dataset_failed_records.dataset_version_id` | `dataset_versions.id` | Failed row belongs to dataset version. |
| `attrition_predictions.employee_id` | `employees.id` | Prediction subject (when employee-linked). |
| `attrition_predictions.dataset_version_id` | `dataset_versions.id` | Source dataset version. |
| `risk_monitoring_logs.employee_id / prediction_id` | `employees.id / attrition_predictions.id` | Risk monitoring event linkage. |
| `workforce_alerts.employee_id / prediction_id / recipient_user_id` | `employees.id / attrition_predictions.id / users.id` | Alert subject, prediction and recipient. |
| `workforce_forecasts.department_id` | `departments.id` | Department-scoped forecast (may be nullable for organization-wide scope). |
| `workforce_recommendations.employee_id / department_id / prediction_id` | `employees.id / departments.id / attrition_predictions.id` | Recommendation subject/department/prediction where applicable. |
| `hr_interventions.employee_id / prediction_id / assigned_to / created_by` | `employees.id / attrition_predictions.id / users.id / users.id` | Intervention target, linked prediction, assignee and creator. |
| `hr_tasks.created_by / assigned_to / related_employee_id` | `users.id / users.id / employees.id` | Task creator, assignee and related employee. |
| `audit_logs.actor_user_id` | `users.id` | Actor responsible for audited action. |
| `workforce_activities.employee_id / actor_user_id` | `employees.id / users.id` | Related employee and actor. |
| `password_reset_tokens.user_id` | `users.id` | Password reset token owner. |
| `refresh_sessions.user_id` | `users.id` | Refresh session owner. |

## Constraints worth testing

- Employee code and employee email are unique.
- User email is unique.
- Attendance is unique per employee/date; check-out must not precede check-in.
- Payroll is unique per employee/year/month; month and non-negative amounts have database constraints.
- Employee-linked actions require the account to be linked to an `employees` row.
- Use Alembic migration scripts rather than hand-editing database tables in a deployed environment.



## Runtime schema export for submission

This Markdown page is the human-readable model/table reference. The exact database structure for the final local MySQL database should additionally be captured to `docs/database_schema.sql` using `scripts/capture_submission_artifacts.ps1`. The helper calls `mysqldump --no-data`; it exports schema definitions rather than employee, payroll or other application rows. The generated SQL reflects the database connected to by the local backend `.env`, so confirm that it is the intended development database before running the export. Never include production rows, credentials or a full data dump in the handover package.
