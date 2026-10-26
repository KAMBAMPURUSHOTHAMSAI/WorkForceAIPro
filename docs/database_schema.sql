-- WorkForce AI Pro database schema export
-- Generated from the application's configured SQLAlchemy connection.
-- Schema DDL only: no application table rows are exported.
-- Generated UTC: 2026-10-26T04:27:45+00:00
SET FOREIGN_KEY_CHECKS=0;

-- Table: alembic_version
CREATE TABLE `alembic_version` (
  `version_num` varchar(32) NOT NULL,
  PRIMARY KEY (`version_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: attendance
CREATE TABLE `attendance` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `shift_id` int DEFAULT NULL,
  `attendance_date` date NOT NULL,
  `check_in` datetime NOT NULL,
  `check_out` datetime DEFAULT NULL,
  `working_minutes` int NOT NULL,
  `overtime_minutes` int NOT NULL,
  `status` varchar(20) NOT NULL,
  `notes` text,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_employee_date` (`employee_id`,`attendance_date`),
  KEY `ix_attendance_attendance_date` (`attendance_date`),
  KEY `ix_attendance_employee_id` (`employee_id`),
  KEY `ix_attendance_id` (`id`),
  KEY `ix_attendance_shift_id` (`shift_id`),
  CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `attendance_ibfk_2` FOREIGN KEY (`shift_id`) REFERENCES `shifts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ck_attendance_checkout_after_checkin` CHECK (((`check_out` is null) or (`check_out` >= `check_in`)))
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: attrition_predictions
CREATE TABLE `attrition_predictions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `dataset_version_id` int DEFAULT NULL,
  `predicted_attrition` tinyint(1) NOT NULL,
  `risk_probability` decimal(6,5) NOT NULL,
  `confidence_score` decimal(6,5) NOT NULL,
  `risk_level` varchar(20) NOT NULL,
  `model_version` varchar(100) NOT NULL,
  `input_features` json NOT NULL,
  `created_by_user_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `created_by_user_id` (`created_by_user_id`),
  KEY `dataset_version_id` (`dataset_version_id`),
  KEY `ix_attrition_predictions_employee_id` (`employee_id`),
  KEY `ix_attrition_predictions_id` (`id`),
  KEY `ix_attrition_predictions_risk_level` (`risk_level`),
  KEY `ix_prediction_employee_date` (`employee_id`,`created_at`),
  CONSTRAINT `attrition_predictions_ibfk_1` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `attrition_predictions_ibfk_2` FOREIGN KEY (`dataset_version_id`) REFERENCES `dataset_versions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `attrition_predictions_ibfk_3` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ck_prediction_confidence` CHECK (((`confidence_score` >= 0) and (`confidence_score` <= 1))),
  CONSTRAINT `ck_prediction_probability` CHECK (((`risk_probability` >= 0) and (`risk_probability` <= 1)))
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: audit_logs
CREATE TABLE `audit_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `actor_user_id` int DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(100) NOT NULL,
  `entity_id` varchar(100) DEFAULT NULL,
  `details` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `ix_audit_actor_created` (`actor_user_id`,`created_at`),
  KEY `ix_audit_entity` (`entity_type`,`entity_id`),
  KEY `ix_audit_logs_action` (`action`),
  KEY `ix_audit_logs_actor_user_id` (`actor_user_id`),
  KEY `ix_audit_logs_created_at` (`created_at`),
  KEY `ix_audit_logs_id` (`id`),
  CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: chat_messages
CREATE TABLE `chat_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sender_id` int NOT NULL,
  `recipient_id` int NOT NULL,
  `message` text NOT NULL,
  `sent_at` datetime NOT NULL DEFAULT (now()),
  `read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_chat_messages_id` (`id`),
  KEY `ix_chat_messages_recipient_id` (`recipient_id`),
  KEY `ix_chat_messages_sender_id` (`sender_id`),
  KEY `ix_chat_recipient_sender_time` (`recipient_id`,`sender_id`,`sent_at`),
  KEY `ix_chat_sender_recipient_time` (`sender_id`,`recipient_id`,`sent_at`),
  CONSTRAINT `chat_messages_ibfk_1` FOREIGN KEY (`recipient_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_messages_ibfk_2` FOREIGN KEY (`sender_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: dataset_failed_records
CREATE TABLE `dataset_failed_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `dataset_version_id` int NOT NULL,
  `row_number` int NOT NULL,
  `error_message` text NOT NULL,
  `row_data` json DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `ix_dataset_failed_records_id` (`id`),
  KEY `ix_failed_dataset_row` (`dataset_version_id`,`row_number`),
  CONSTRAINT `dataset_failed_records_ibfk_1` FOREIGN KEY (`dataset_version_id`) REFERENCES `dataset_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: dataset_versions
CREATE TABLE `dataset_versions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `version_number` int NOT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(100) NOT NULL,
  `target_column` varchar(100) NOT NULL,
  `total_rows` int NOT NULL,
  `valid_rows` int NOT NULL,
  `failed_rows` int NOT NULL,
  `feature_columns` json DEFAULT NULL,
  `validation_summary` json DEFAULT NULL,
  `model_metrics` json DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `error_message` text,
  `uploaded_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `stored_filename` (`stored_filename`),
  UNIQUE KEY `version_number` (`version_number`),
  KEY `uploaded_by` (`uploaded_by`),
  KEY `ix_dataset_versions_id` (`id`),
  KEY `ix_dataset_versions_status` (`status`),
  CONSTRAINT `dataset_versions_ibfk_1` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: departments
CREATE TABLE `departments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `description` text,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_departments_name` (`name`),
  KEY `ix_departments_id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: employee_documents
CREATE TABLE `employee_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `uploaded_by` int DEFAULT NULL,
  `original_filename` varchar(255) NOT NULL,
  `stored_filename` varchar(100) NOT NULL,
  `document_type` varchar(50) NOT NULL,
  `content_type` varchar(100) NOT NULL,
  `file_size` int NOT NULL,
  `is_deleted` tinyint(1) NOT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `stored_filename` (`stored_filename`),
  KEY `uploaded_by` (`uploaded_by`),
  KEY `ix_employee_documents_employee_id` (`employee_id`),
  KEY `ix_employee_documents_id` (`id`),
  CONSTRAINT `employee_documents_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `employee_documents_ibfk_2` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: employees
CREATE TABLE `employees` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_code` varchar(30) NOT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(25) DEFAULT NULL,
  `job_title` varchar(120) DEFAULT NULL,
  `employment_type` varchar(30) NOT NULL,
  `employment_status` varchar(30) NOT NULL,
  `date_of_joining` date DEFAULT NULL,
  `base_salary` decimal(12,2) NOT NULL,
  `department_id` int DEFAULT NULL,
  `manager_id` int DEFAULT NULL,
  `user_id` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_employees_email` (`email`),
  UNIQUE KEY `ix_employees_employee_code` (`employee_code`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `ix_employees_department_id` (`department_id`),
  KEY `ix_employees_employment_status` (`employment_status`),
  KEY `ix_employees_id` (`id`),
  KEY `ix_employees_manager_id` (`manager_id`),
  CONSTRAINT `employees_ibfk_1` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `employees_ibfk_2` FOREIGN KEY (`manager_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `employees_ibfk_3` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: hr_interventions
CREATE TABLE `hr_interventions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `prediction_id` int DEFAULT NULL,
  `title` varchar(180) NOT NULL,
  `category` varchar(50) NOT NULL,
  `recommendation` text NOT NULL,
  `assigned_to` int DEFAULT NULL,
  `follow_up_date` date DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `outcome_notes` text,
  `completed_at` datetime DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `assigned_to` (`assigned_to`),
  KEY `created_by` (`created_by`),
  KEY `prediction_id` (`prediction_id`),
  KEY `ix_hr_interventions_employee_id` (`employee_id`),
  KEY `ix_hr_interventions_id` (`id`),
  KEY `ix_hr_interventions_status` (`status`),
  CONSTRAINT `hr_interventions_ibfk_1` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `hr_interventions_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `hr_interventions_ibfk_3` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `hr_interventions_ibfk_4` FOREIGN KEY (`prediction_id`) REFERENCES `attrition_predictions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: hr_tasks
CREATE TABLE `hr_tasks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` text,
  `created_by` int NOT NULL,
  `assigned_to` int DEFAULT NULL,
  `related_employee_id` int DEFAULT NULL,
  `status` varchar(20) NOT NULL,
  `priority` varchar(20) NOT NULL,
  `due_date` date DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `ix_hr_tasks_assigned_to` (`assigned_to`),
  KEY `ix_hr_tasks_created_by` (`created_by`),
  KEY `ix_hr_tasks_due_date` (`due_date`),
  KEY `ix_hr_tasks_id` (`id`),
  KEY `ix_hr_tasks_priority` (`priority`),
  KEY `ix_hr_tasks_related_employee_id` (`related_employee_id`),
  KEY `ix_hr_tasks_status` (`status`),
  KEY `ix_hr_tasks_title` (`title`),
  CONSTRAINT `hr_tasks_ibfk_1` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `hr_tasks_ibfk_2` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `hr_tasks_ibfk_3` FOREIGN KEY (`related_employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ck_hr_task_priority` CHECK ((`priority` in (_utf8mb4'LOW',_utf8mb4'MEDIUM',_utf8mb4'HIGH',_utf8mb4'URGENT'))),
  CONSTRAINT `ck_hr_task_status` CHECK ((`status` in (_utf8mb4'OPEN',_utf8mb4'IN_PROGRESS',_utf8mb4'COMPLETED',_utf8mb4'CANCELLED')))
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: leave_policies
CREATE TABLE `leave_policies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(80) NOT NULL,
  `description` text,
  `annual_quota` int NOT NULL,
  `is_paid` tinyint(1) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_leave_policies_name` (`name`),
  KEY `ix_leave_policies_id` (`id`),
  CONSTRAINT `ck_leave_policy_annual_quota` CHECK ((`annual_quota` >= 0))
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: leave_requests
CREATE TABLE `leave_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `policy_id` int NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `total_days` int NOT NULL,
  `reason` text NOT NULL,
  `status` varchar(20) NOT NULL,
  `reviewer_id` int DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `reviewer_comments` text,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `reviewer_id` (`reviewer_id`),
  KEY `ix_leave_requests_employee_id` (`employee_id`),
  KEY `ix_leave_requests_end_date` (`end_date`),
  KEY `ix_leave_requests_id` (`id`),
  KEY `ix_leave_requests_policy_id` (`policy_id`),
  KEY `ix_leave_requests_start_date` (`start_date`),
  KEY `ix_leave_requests_status` (`status`),
  CONSTRAINT `leave_requests_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `leave_requests_ibfk_2` FOREIGN KEY (`policy_id`) REFERENCES `leave_policies` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `leave_requests_ibfk_3` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ck_leave_request_date_range` CHECK ((`end_date` >= `start_date`)),
  CONSTRAINT `ck_leave_request_total_days` CHECK ((`total_days` >= 1))
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: notifications
CREATE TABLE `notifications` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `notification_type` varchar(50) NOT NULL,
  `title` varchar(150) NOT NULL,
  `message` text NOT NULL,
  `priority` varchar(20) NOT NULL,
  `read_status` tinyint(1) NOT NULL,
  `read_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `ix_notifications_created_at` (`created_at`),
  KEY `ix_notifications_id` (`id`),
  KEY `ix_notifications_user_id` (`user_id`),
  CONSTRAINT `notifications_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: password_reset_tokens
CREATE TABLE `password_reset_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_password_reset_tokens_token_hash` (`token_hash`),
  KEY `ix_password_reset_tokens_id` (`id`),
  KEY `ix_password_reset_tokens_user_id` (`user_id`),
  CONSTRAINT `password_reset_tokens_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: payroll_records
CREATE TABLE `payroll_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `period_year` int NOT NULL,
  `period_month` int NOT NULL,
  `annual_base_salary` decimal(12,2) NOT NULL,
  `monthly_base_salary` decimal(12,2) NOT NULL,
  `allowances` decimal(12,2) NOT NULL,
  `bonus` decimal(12,2) NOT NULL,
  `tax_deduction` decimal(12,2) NOT NULL,
  `other_deductions` decimal(12,2) NOT NULL,
  `gross_pay` decimal(12,2) NOT NULL,
  `total_deductions` decimal(12,2) NOT NULL,
  `net_pay` decimal(12,2) NOT NULL,
  `status` varchar(20) NOT NULL,
  `generated_by` int DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_payroll_employee_period` (`employee_id`,`period_year`,`period_month`),
  KEY `generated_by` (`generated_by`),
  KEY `ix_payroll_records_employee_id` (`employee_id`),
  KEY `ix_payroll_records_id` (`id`),
  KEY `ix_payroll_records_status` (`status`),
  CONSTRAINT `payroll_records_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `payroll_records_ibfk_2` FOREIGN KEY (`generated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `ck_payroll_amounts_nonnegative` CHECK (((`gross_pay` >= 0) and (`total_deductions` >= 0) and (`net_pay` >= 0))),
  CONSTRAINT `ck_payroll_period_month` CHECK ((`period_month` between 1 and 12))
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: performance_reviews
CREATE TABLE `performance_reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `reviewer_id` int NOT NULL,
  `review_period_start` date NOT NULL,
  `review_period_end` date NOT NULL,
  `rating` decimal(3,2) DEFAULT NULL,
  `strengths` text,
  `improvement_areas` text,
  `goals` text,
  `reviewer_comments` text,
  `status` varchar(20) NOT NULL,
  `submitted_at` datetime DEFAULT NULL,
  `acknowledged_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_employee_review_period` (`employee_id`,`review_period_start`,`review_period_end`),
  KEY `ix_performance_reviews_employee_id` (`employee_id`),
  KEY `ix_performance_reviews_id` (`id`),
  KEY `ix_performance_reviews_reviewer_id` (`reviewer_id`),
  KEY `ix_performance_reviews_status` (`status`),
  CONSTRAINT `performance_reviews_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `performance_reviews_ibfk_2` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_performance_rating` CHECK (((`rating` is null) or ((`rating` >= 1) and (`rating` <= 5)))),
  CONSTRAINT `ck_performance_review_status` CHECK ((`status` in (_utf8mb4'DRAFT',_utf8mb4'SUBMITTED',_utf8mb4'ACKNOWLEDGED'))),
  CONSTRAINT `ck_review_period` CHECK ((`review_period_end` >= `review_period_start`))
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: refresh_sessions
CREATE TABLE `refresh_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `family_id` varchar(36) NOT NULL,
  `expires_at` datetime NOT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_refresh_sessions_token_hash` (`token_hash`),
  KEY `ix_refresh_sessions_family_id` (`family_id`),
  KEY `ix_refresh_sessions_id` (`id`),
  KEY `ix_refresh_sessions_user_id` (`user_id`),
  CONSTRAINT `refresh_sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: risk_monitoring_logs
CREATE TABLE `risk_monitoring_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `prediction_id` int DEFAULT NULL,
  `previous_risk_percent` decimal(5,2) DEFAULT NULL,
  `current_risk_percent` decimal(5,2) NOT NULL,
  `risk_change_percent` decimal(6,2) DEFAULT NULL,
  `risk_level` varchar(20) NOT NULL,
  `reason` text,
  `detected_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `prediction_id` (`prediction_id`),
  KEY `ix_risk_employee_detected` (`employee_id`,`detected_at`),
  KEY `ix_risk_monitoring_logs_employee_id` (`employee_id`),
  KEY `ix_risk_monitoring_logs_id` (`id`),
  KEY `ix_risk_monitoring_logs_risk_level` (`risk_level`),
  CONSTRAINT `risk_monitoring_logs_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `risk_monitoring_logs_ibfk_2` FOREIGN KEY (`prediction_id`) REFERENCES `attrition_predictions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: shift_assignments
CREATE TABLE `shift_assignments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `shift_id` int NOT NULL,
  `effective_from` date NOT NULL,
  `effective_to` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_shift_assignment_employee_start` (`employee_id`,`effective_from`),
  KEY `ix_shift_assignments_employee_id` (`employee_id`),
  KEY `ix_shift_assignments_id` (`id`),
  KEY `ix_shift_assignments_shift_id` (`shift_id`),
  CONSTRAINT `shift_assignments_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `shift_assignments_ibfk_2` FOREIGN KEY (`shift_id`) REFERENCES `shifts` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `ck_shift_assignment_date_range` CHECK (((`effective_to` is null) or (`effective_to` >= `effective_from`)))
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: shifts
CREATE TABLE `shifts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `break_minutes` int NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_shifts_name` (`name`),
  KEY `ix_shifts_id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: users
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `full_name` varchar(150) NOT NULL,
  `email` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL,
  `is_active` tinyint(1) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  `updated_at` datetime NOT NULL DEFAULT (now()),
  `token_version` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  UNIQUE KEY `ix_users_email` (`email`),
  KEY `ix_users_id` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: workforce_activities
CREATE TABLE `workforce_activities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `actor_user_id` int DEFAULT NULL,
  `activity_type` varchar(80) NOT NULL,
  `description` text NOT NULL,
  `activity_data` json DEFAULT NULL,
  `source` varchar(50) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `actor_user_id` (`actor_user_id`),
  KEY `ix_workforce_activities_activity_type` (`activity_type`),
  KEY `ix_workforce_activities_employee_id` (`employee_id`),
  KEY `ix_workforce_activities_id` (`id`),
  KEY `ix_workforce_activity_created` (`created_at`),
  CONSTRAINT `workforce_activities_ibfk_1` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `workforce_activities_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: workforce_alerts
CREATE TABLE `workforce_alerts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `prediction_id` int DEFAULT NULL,
  `recipient_user_id` int DEFAULT NULL,
  `title` varchar(180) NOT NULL,
  `message` text NOT NULL,
  `priority` varchar(20) NOT NULL,
  `status` varchar(20) NOT NULL,
  `acknowledged_at` datetime DEFAULT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `prediction_id` (`prediction_id`),
  KEY `ix_workforce_alerts_employee_id` (`employee_id`),
  KEY `ix_workforce_alerts_id` (`id`),
  KEY `ix_workforce_alerts_priority` (`priority`),
  KEY `ix_workforce_alerts_recipient_user_id` (`recipient_user_id`),
  KEY `ix_workforce_alerts_status` (`status`),
  CONSTRAINT `workforce_alerts_ibfk_1` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `workforce_alerts_ibfk_2` FOREIGN KEY (`prediction_id`) REFERENCES `attrition_predictions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `workforce_alerts_ibfk_3` FOREIGN KEY (`recipient_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: workforce_forecasts
CREATE TABLE `workforce_forecasts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `forecast_year` int NOT NULL,
  `forecast_month` int NOT NULL,
  `department_id` int DEFAULT NULL,
  `forecast_scope` varchar(30) NOT NULL,
  `predicted_headcount` int NOT NULL,
  `predicted_attrition_count` int NOT NULL,
  `attrition_rate_percent` decimal(5,2) NOT NULL,
  `stability_score` decimal(5,2) NOT NULL,
  `model_version` varchar(100) NOT NULL,
  `forecast_data` json DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `ix_workforce_forecast_period` (`forecast_year`,`forecast_month`),
  KEY `ix_workforce_forecasts_department_id` (`department_id`),
  KEY `ix_workforce_forecasts_id` (`id`),
  CONSTRAINT `workforce_forecasts_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `workforce_forecasts_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Table: workforce_recommendations
CREATE TABLE `workforce_recommendations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int DEFAULT NULL,
  `department_id` int DEFAULT NULL,
  `prediction_id` int DEFAULT NULL,
  `category` varchar(50) NOT NULL,
  `title` varchar(180) NOT NULL,
  `recommendation` text NOT NULL,
  `priority` varchar(20) NOT NULL,
  `recommendation_data` json DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT (now()),
  PRIMARY KEY (`id`),
  KEY `created_by` (`created_by`),
  KEY `prediction_id` (`prediction_id`),
  KEY `ix_workforce_recommendation_created` (`created_at`),
  KEY `ix_workforce_recommendations_department_id` (`department_id`),
  KEY `ix_workforce_recommendations_employee_id` (`employee_id`),
  KEY `ix_workforce_recommendations_id` (`id`),
  CONSTRAINT `workforce_recommendations_ibfk_1` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `workforce_recommendations_ibfk_2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `workforce_recommendations_ibfk_3` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `workforce_recommendations_ibfk_4` FOREIGN KEY (`prediction_id`) REFERENCES `attrition_predictions` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

SET FOREIGN_KEY_CHECKS=1;
