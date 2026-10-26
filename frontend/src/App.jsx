import { Navigate, Route, Routes } from "react-router-dom";

import AppLayout from "./components/layout/AppLayout";
import ProtectedRoute from "./components/common/ProtectedRoute";

// Public authentication pages
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

// Main workspace pages
import Dashboard from "./pages/Dashboard";
import ProfilePage from "./pages/ProfilePage";
import SearchPage from "./pages/SearchPage";
import ReportsPage from "./pages/ReportsPage";

// Dedicated pages that exist in the current frontend/src/pages folder
import AttendancePage from "./pages/AttendancePage";
import LeaveManagementPage from "./pages/LeaveManagementPage";
import MyPayrollPage from "./pages/MyPayrollPage";
import PayrollManagementPage from "./pages/PayrollManagementPage";
import NotificationsPage from "./pages/NotificationsPage";
import WorkforceAlertsPage from "./pages/WorkforceAlertsPage";
import AuditLogsPage from "./pages/AuditLogsPage";
import WorkforceActivityPage from "./pages/WorkforceActivityPage";
import DocumentsPage from "./pages/DocumentsPage";
import ChatPage from "./pages/ChatPage";
import AttritionAnalyticsPage from "./pages/AttritionAnalyticsPage";
import ForecastingPage from "./pages/ForecastingPage";
import RecommendationsPage from "./pages/RecommendationsPage";
import HRInterventionsPage from "./pages/HRInterventionsPage";
import DatasetsPage from "./pages/DatasetsPage";

// Generic OpenAPI-driven page for modules without a separate page file.
import ModulePage from "./pages/ModulePage";

const modules = [
  {
    path: "employees",
    title: "Employees",
    endpoint: "/employees",
    description: "Create, view, edit and deactivate employee profiles.",
    roles: ["ADMIN", "HR"],
    deleteLabel: "Deactivate",
  },
  {
    path: "departments",
    title: "Departments",
    endpoint: "/departments",
    description: "Manage department records and organization structure.",
    roles: ["ADMIN", "HR"],
  },
  {
    path: "attendance",
    title: "Attendance",
    endpoint: "/attendance",
    description: "Check in, check out and view attendance history.",
  },
  {
    path: "leaves",
    title: "Leave Management",
    endpoint: "/leaves",
    description: "Apply for leave, track requests and review approvals.",
  },
  {
    path: "shifts",
    title: "Shifts",
    endpoint: "/shifts",
    description: "Create and edit shifts and manage shift assignments.",
    roles: ["ADMIN", "HR"],
    rowActions: [
      {
        label: "Assignments",
        method: "POST",
        path: "/shifts/{id}/assignments",
      },
    ],
  },
  {
    path: "payroll",
    title: "Payroll",
    endpoint: "/payroll",
    description: "Manage payroll records, approvals and payslip workflows.",
    roles: ["ADMIN", "HR"],
    topActions: [
      {
        label: "Generate Payroll",
        method: "POST",
        path: "/payroll/generate",
      },
    ],
    rowActions: [
      {
        label: "Approve",
        method: "POST",
        path: "/payroll/{id}/approve",
        confirm: true,
      },
      {
        label: "Mark Paid",
        method: "POST",
        path: "/payroll/{id}/mark-paid",
        confirm: true,
      },
      {
        label: "Payslip",
        method: "GET",
        path: "/payroll/{id}/payslip",
        download: true,
        filename: "payslip",
      },
    ],
  },
  {
    path: "reviews",
    title: "Performance Reviews",
    endpoint: "/performance-reviews",
    description: "Create, update and submit performance reviews.",
    rowActions: [
      {
        label: "Submit",
        method: "POST",
        path: "/performance-reviews/{id}/submit",
        confirm: true,
      },
      {
        label: "Acknowledge",
        method: "POST",
        path: "/performance-reviews/{id}/acknowledge",
      },
    ],
  },
  {
    path: "tasks",
    title: "Tasks",
    endpoint: "/tasks",
    description: "Create tasks and update assignments and statuses.",
  },
  {
    path: "attrition",
    title: "Attrition Predictions",
    endpoint: "/attrition/predictions",
    description: "Review employee attrition predictions and risk indicators.",
    roles: ["ADMIN", "HR"],
    topActions: [
      {
        label: "Predict Attrition",
        method: "POST",
        path: "/attrition/predict",
      },
    ],
  },
  {
    path: "alerts",
    title: "Workforce Alerts",
    endpoint: "/alerts",
    description: "Review and resolve workforce risk alerts.",
    rowActions: [
      {
        label: "Acknowledge",
        method: "PATCH",
        path: "/alerts/{id}/acknowledge",
      },
      {
        label: "Resolve",
        method: "PATCH",
        path: "/alerts/{id}/resolve",
        confirm: true,
      },
    ],
  },
  {
    path: "datasets",
    title: "Datasets",
    endpoint: "/datasets",
    description: "Upload datasets, review versions and train models.",
    roles: ["ADMIN", "HR"],
    topActions: [
      {
        label: "Upload Dataset",
        method: "POST",
        path: "/datasets/upload",
      },
    ],
    rowActions: [
      {
        label: "Train Model",
        method: "POST",
        path: "/datasets/{id}/train",
        confirm: true,
      },
    ],
  },
  {
    path: "forecasting",
    title: "Forecasting",
    endpoint: "/forecasting",
    description: "View workforce forecasts and generate new scenarios.",
    roles: ["ADMIN", "HR", "MANAGER"],
    topActions: [
      {
        label: "Generate Forecast",
        method: "POST",
        path: "/forecasting/generate",
      },
      {
        label: "Generate Yearly",
        method: "POST",
        path: "/forecasting/generate-year",
      },
    ],
  },
  {
    path: "recommendations",
    title: "Recommendations",
    endpoint: "/recommendations",
    description: "Review and generate workforce recommendations.",
    roles: ["ADMIN", "HR", "MANAGER"],
    topActions: [
      {
        label: "Generate Recommendations",
        method: "POST",
        path: "/recommendations/generate",
      },
    ],
  },
  {
    path: "notifications",
    title: "Notifications",
    endpoint: "/notifications",
    description: "Review notifications and mark them as read.",
    rowActions: [
      {
        label: "Mark Read",
        method: "PATCH",
        path: "/notifications/{id}/read",
      },
    ],
  },
  {
    path: "activity",
    title: "Workforce Activity",
    endpoint: "/workforce-activities",
    description: "Review workforce activities recorded by the platform.",
  },
  {
    path: "users",
    title: "User Management",
    endpoint: "/users",
    description: "View users and update permitted roles and account status.",
    roles: ["ADMIN"],
  },
  {
    path: "documents",
    title: "Employee Documents",
    endpoint: "/documents",
    description: "Upload, view, download and manage employee documents.",
    rowActions: [
      {
        label: "Download",
        method: "GET",
        path: "/documents/{id}/download",
        download: true,
        filename: "employee-document",
      },
    ],
  },
  {
    path: "interventions",
    title: "HR Interventions",
    endpoint: "/interventions",
    description: "Create, update and track interventions and follow-ups.",
    roles: ["ADMIN", "HR"],
  },
  {
    path: "audit-logs",
    title: "Audit Logs",
    endpoint: "/audit-logs",
    description: "Review administrative and workforce change history.",
    roles: ["ADMIN", "HR"],
  },
];

function renderModulePage(module) {
  // Use the existing dedicated page whenever one is present in src/pages.
  switch (module.path) {
    case "attendance":
      return <AttendancePage />;

    case "leaves":
      return <LeaveManagementPage />;

    case "payroll":
      return <PayrollManagementPage />;

    case "notifications":
      return <NotificationsPage />;

    case "alerts":
      return <WorkforceAlertsPage />;

    case "audit-logs":
      return <AuditLogsPage />;

    case "activity":
      return <WorkforceActivityPage />;

    case "documents":
      return <DocumentsPage />;

    case "attrition":
      return <AttritionAnalyticsPage />;

    case "forecasting":
      return <ForecastingPage />;

    case "recommendations":
      return <RecommendationsPage />;

    case "interventions":
      return <HRInterventionsPage />;

    case "datasets":
      return <DatasetsPage />;

    default:
      // Employees, Departments, Shifts, Reviews, Tasks and Users currently
      // use ModulePage in the supplied project structure.
      return (
        <ModulePage
          title={module.title}
          endpoint={module.endpoint}
          description={module.description}
          topActions={module.topActions || []}
          rowActions={module.rowActions || []}
          deleteLabel={module.deleteLabel || "Delete"}
        />
      );
  }
}

function ApplicationRoutes() {
  return (
    <Routes>
      {/* Public authentication routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* Protected workspace routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Dashboard />} />

          {/* Friendly aliases for dashboard and charts */}
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="charts" element={<Dashboard />} />

          <Route path="profile" element={<ProfilePage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="chat" element={<ChatPage />} />

          {/* Personal payslips are separate from HR/Admin payroll management. */}
          <Route path="my-payroll" element={<MyPayrollPage />} />

          {/* Reports are restricted to ADMIN and HR */}
          <Route
            element={<ProtectedRoute allowedRoles={["ADMIN", "HR"]} />}
          >
            <Route path="reports" element={<ReportsPage />} />
          </Route>

          {/* Module routes */}
          {modules.map((module) => {
            const page = renderModulePage(module);

            if (!module.roles) {
              return (
                <Route
                  key={module.path}
                  path={module.path}
                  element={page}
                />
              );
            }

            return (
              <Route
                key={`${module.path}-role-gate`}
                element={<ProtectedRoute allowedRoles={module.roles} />}
              >
                <Route path={module.path} element={page} />
              </Route>
            );
          })}
        </Route>
      </Route>

      {/* Redirect unknown URLs to the main route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return <ApplicationRoutes />;
}