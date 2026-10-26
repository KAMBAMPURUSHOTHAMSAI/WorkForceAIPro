import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  Activity,
  BriefcaseBusiness,
  CalendarCheck,
  ChartNoAxesCombined,
  CircleDollarSign,
  RefreshCw,
  Users,
  Bell,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  UserRound,
  Wallet,
} from "lucide-react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import api from "../api/axios";

const ENDPOINTS = [
  { key: "overview", url: "/dashboard/overview" },
  { key: "attendance", url: "/dashboard/attendance-summary" },
  { key: "payroll", url: `/dashboard/payroll-summary?period_year=${new Date().getFullYear()}&period_month=${new Date().getMonth() + 1}` },
  { key: "analytics", url: "/dashboard/department-analytics" },
  { key: "attrition", url: "/dashboard/attrition-summary" },
  { key: "employees", url: "/employees" },
  { key: "departments", url: "/departments" },
];

function isObject(value) {
  return value !== null && typeof value === "object";
}

function extractRows(data, depth = 0) {
  if (Array.isArray(data)) {
    return data;
  }

  if (!isObject(data) || depth > 5) {
    return [];
  }

  for (const key of [
    "items",
    "results",
    "records",
    "rows",
    "employees",
    "departments",
    "data",
  ]) {
    if (Array.isArray(data[key])) {
      return data[key];
    }
  }

  for (const key of ["data", "result", "response"]) {
    if (isObject(data[key])) {
      const nestedRows = extractRows(data[key], depth + 1);

      if (nestedRows.length > 0) {
        return nestedRows;
      }
    }
  }

  return [];
}

function findValue(data, keys, depth = 0) {
  if (!isObject(data) || depth > 6) {
    return undefined;
  }

  const entries = Object.entries(data);

  for (const [key, value] of entries) {
    const normalizedKey = key.toLowerCase();

    if (
      keys.some((candidate) =>
        normalizedKey.includes(candidate.toLowerCase())
      ) &&
      ["string", "number"].includes(typeof value)
    ) {
      return value;
    }
  }

  for (const [, value] of entries) {
    if (isObject(value)) {
      const result = findValue(value, keys, depth + 1);

      if (result !== undefined) {
        return result;
      }
    }
  }

  return undefined;
}

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  if (typeof value === "number") {
    return Number.isFinite(value)
      ? value.toLocaleString()
      : "—";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.length
      ? `${value.length} records`
      : "No records";
  }

  if (isObject(value)) {
    const usefulValue = findValue(value, [
      "employee_count",
      "total_employees",
      "total_payroll",
      "payroll_total",
      "net_payroll",
      "gross_payroll",
      "total_amount",
      "count",
      "total",
      "amount",
      "percentage",
      "rate",
      "value",
    ]);

    if (usefulValue !== undefined) {
      return formatValue(usefulValue);
    }

    const label =
      value.name ??
      value.department_name ??
      value.title ??
      value.label;

    if (typeof label === "string") {
      return label;
    }

    const json = JSON.stringify(value);

    return json.length > 180
      ? `${json.slice(0, 177)}...`
      : json;
  }

  return String(value);
}

function getDepartmentId(record) {
  const department = record?.department;

  const value =
    record?.department_id ??
    record?.dept_id ??
    (isObject(department) ? department.id : undefined);

  return value === null || value === undefined
    ? null
    : String(value);
}

function getDepartmentName(record) {
  const department = record?.department;

  const value =
    record?.department_name ??
    (typeof department === "string" ? department : undefined) ??
    (isObject(department)
      ? department.name ?? department.department_name
      : undefined) ??
    record?.departmentName;

  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function getEmployeeLabel(record, index) {
  const fullName =
    record?.full_name ??
    record?.employee_name ??
    record?.name;

  if (typeof fullName === "string" && fullName.trim()) {
    return fullName.trim();
  }

  const firstName = record?.first_name ?? "";
  const lastName = record?.last_name ?? "";
  const combined = `${firstName} ${lastName}`.trim();

  return combined || `Employee ${index + 1}`;
}

/**
 * Builds chart data from actual employee rows.
 * If an employee has no matching department, count that employee
 * under "Unassigned" instead of silently omitting them.
 */
function buildDepartmentChart(employees, departments, totalEmployees) {
  const groups = new Map();
  const departmentIdToKey = new Map();
  const departmentNameToKey = new Map();

  departments.forEach((department, index) => {
    const id = department.id ?? department.department_id;
    const name =
      department.name ??
      department.department_name ??
      department.title ??
      `Department ${index + 1}`;

    const key =
      id !== undefined && id !== null
        ? `department:${id}`
        : `department-name:${String(name).toLowerCase()}`;

    groups.set(key, {
      name: String(name),
      employees: 0,
    });

    if (id !== undefined && id !== null) {
      departmentIdToKey.set(String(id), key);
    }

    departmentNameToKey.set(
      String(name).toLowerCase(),
      key
    );
  });

  let unassignedCount = 0;

  employees.forEach((employee) => {
    const departmentId = getDepartmentId(employee);
    const departmentName = getDepartmentName(employee);

    let key = null;

    if (departmentId !== null) {
      key = departmentIdToKey.get(departmentId) ?? null;
    }

    if (!key && departmentName) {
      key =
        departmentNameToKey.get(
          departmentName.toLowerCase()
        ) ?? null;
    }

    // If departments were not returned, derive groups from employees.
    if (!key && departmentName) {
      key = `department-name:${departmentName.toLowerCase()}`;

      if (!groups.has(key)) {
        groups.set(key, {
          name: departmentName,
          employees: 0,
        });

        departmentNameToKey.set(
          departmentName.toLowerCase(),
          key
        );
      }
    }

    if (key && groups.has(key)) {
      groups.get(key).employees += 1;
    } else {
      unassignedCount += 1;
    }
  });

  if (unassignedCount > 0) {
    groups.set("unassigned", {
      name: "Unassigned",
      employees: unassignedCount,
    });
  }

  let chart = Array.from(groups.values());

  // Do not show an invented department breakdown when only a total
  // employee count is available. Show a single, clearly labelled bar.
  if (employees.length === 0 && totalEmployees > 0) {
    return [
      {
        name: "All employees",
        employees: totalEmployees,
      },
    ];
  }

  // If employees exist but departments do not, show the real total.
  if (chart.length === 0 && employees.length > 0) {
    return [
      {
        name: "All employees",
        employees: employees.length,
      },
    ];
  }

  // Do not draw a misleading chart if no employee data was found.
  if (
    chart.length > 0 &&
    employees.length === 0 &&
    totalEmployees === undefined
  ) {
    return [];
  }

  chart = chart.filter(
    (item) => Number.isFinite(item.employees)
  );

  return chart;
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  accent,
}) {
  return (
    <div className="rounded-2xl border border-white/[0.08] bg-slate-900/70 p-5 transition hover:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">
            {title}
          </p>

          <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-white">
            {formatValue(value)}
          </p>

          <p className="mt-2 text-xs text-slate-500">
            {detail}
          </p>
        </div>

        <div className={`shrink-0 rounded-xl p-3 ${accent}`}>
          <Icon size={19} />
        </div>
      </div>
    </div>
  );
}

function SummaryPanel({ title, data, error, onRetry }) {
  const rows = extractRows(data);

  return (
    <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-white">
            {title}
          </h3>

          <p className="mt-1 text-[11px] text-slate-500">
            Live backend data
          </p>
        </div>

        {error && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
            title="Retry"
          >
            <RefreshCw size={15} />
          </button>
        )}
      </div>

      <div className="p-5">
        {error ? (
          <p className="text-sm text-rose-300">
            {String(error)}
          </p>
        ) : !data ? (
          <p className="text-sm text-slate-500">
            Loading summary...
          </p>
        ) : rows.length > 0 ? (
          <div className="space-y-3">
            {rows.slice(0, 8).map((row, index) => (
              <div
                key={row?.id ?? index}
                className="flex items-start justify-between gap-4 rounded-xl bg-white/[0.03] px-3 py-3"
              >
                <span className="min-w-0 text-xs font-medium text-slate-300">
                  {getEmployeeLabel(row, index)}
                </span>

                <span className="max-w-[65%] break-words text-right text-xs text-cyan-300">
                  {formatValue(row)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <details>
            <summary className="cursor-pointer text-xs text-cyan-300 hover:text-cyan-200">
              View response details
            </summary>

            <pre className="mt-4 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-300">
              {JSON.stringify(data, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </section>
  );
}

function AdminDashboard() {
  const [sections, setSections] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);

    const results = await Promise.all(
      ENDPOINTS.map(async ({ key, url }) => {
        try {
          const response = await api.get(url);

          return {
            key,
            data: response.data,
            error: null,
          };
        } catch (error) {
          return {
            key,
            data: null,
            error:
              error.response?.data?.detail ||
              error.message ||
              "Unable to load this section.",
          };
        }
      })
    );

    const nextSections = {};

    for (const result of results) {
      nextSections[result.key] = {
        data: result.data,
        error: result.error,
      };
    }

    setSections(nextSections);
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    // Fetching dashboard data is an external synchronization; state updates happen after the requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard();
  }, [loadDashboard]);

  const overview = sections.overview?.data;
  const attendance = sections.attendance?.data;
  const payroll = sections.payroll?.data;
  const analytics = sections.analytics?.data;
  const attrition = sections.attrition?.data;
  const employeeData = sections.employees?.data;
  const departmentData = sections.departments?.data;

  const employees = extractRows(employeeData);
  const departments = extractRows(departmentData);

  const totalEmployees =
    toNumber(
      findValue(overview, [
        "total_employees",
        "employees_count",
        "employee_count",
        "total_staff",
        "headcount",
      ])
    ) ??
    toNumber(
      findValue(employeeData, [
        "total_employees",
        "employees_count",
        "employee_count",
        "total_count",
        "total",
      ])
    ) ??
    (employees.length > 0 ? employees.length : undefined);

  const totalDepartments =
    toNumber(
      findValue(overview, [
        "total_departments",
        "department_count",
      ])
    ) ??
    toNumber(
      findValue(departmentData, [
        "total_departments",
        "department_count",
        "total_count",
        "total",
      ])
    ) ??
    (departments.length > 0 ? departments.length : undefined);

  const attendanceMetric =
    toNumber(findValue(overview, ["attendance_records_today"])) ??
    toNumber(findValue(attendance, ["total_records"]));

  const attritionMetric = findValue(attrition, [
    "attrition_rate",
    "high_risk_count",
    "high_risk_employees",
    "risk_count",
  ]);

  const payrollMetric = findValue(payroll, [
    "net_pay",
    "gross_pay",
    "total_payroll",
    "payroll_total",
    "net_payroll",
    "gross_payroll",
    "total_amount",
    "amount",
  ]);

  const chartData = buildDepartmentChart(
    employees,
    departments,
    totalEmployees
  );

  const metrics = [
    {
      title: "Employees",
      value: totalEmployees,
      detail: "From employee records",
      icon: Users,
      accent: "bg-cyan-300/10 text-cyan-300",
    },
    {
      title: "Departments",
      value: totalDepartments,
      detail: "Organization structure",
      icon: BriefcaseBusiness,
      accent: "bg-violet-300/10 text-violet-300",
    },
    {
      title: "Attendance records today",
      value: attendanceMetric,
      detail: "Real backend attendance count",
      icon: CalendarCheck,
      accent: "bg-emerald-300/10 text-emerald-300",
    },
    {
      title: "Attrition",
      value: attritionMetric,
      detail: "Workforce risk insights",
      icon: ChartNoAxesCombined,
      accent: "bg-amber-300/10 text-amber-300",
    },
    {
      title: "Payroll",
      value: payrollMetric,
      detail: "Payroll summary",
      icon: CircleDollarSign,
      accent: "bg-blue-300/10 text-blue-300",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-gradient-to-r from-cyan-400/[0.12] via-slate-900 to-blue-500/[0.08] p-6 sm:p-8">
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-cyan-300/[0.06] blur-3xl" />

        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-cyan-300">
              <Activity size={15} />
              WORKFORCE INTELLIGENCE
            </div>

            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Workforce overview
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Monitor employees, attendance, payroll and attrition
              using real data from your backend.
            </p>

            {lastUpdated && (
              <p className="mt-3 text-[11px] text-slate-500">
                Last refreshed: {lastUpdated.toLocaleTimeString()}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-cyan-300/30 hover:text-cyan-200 disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              className={loading ? "animate-spin" : ""}
            />
            Refresh data
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map((metric) => (
          <MetricCard
            key={metric.title}
            {...metric}
            value={
              metric.value === undefined
                ? loading
                  ? "..."
                  : "—"
                : metric.value
            }
          />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">
                Employees by department
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Calculated from actual employee records
              </p>
            </div>

            <BriefcaseBusiness
              size={18}
              className="text-cyan-300"
            />
          </div>

          {chartData.length > 0 ? (
            <div className="mt-5 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{
                    top: 10,
                    right: 10,
                    left: -20,
                    bottom: 10,
                  }}
                >
                  <CartesianGrid
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                    vertical={false}
                  />

                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />

                  <YAxis
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />

                  <Tooltip
                    formatter={(value) => [
                      formatValue(value),
                      "Employees",
                    ]}
                    contentStyle={{
                      background: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 12,
                      color: "#f8fafc",
                    }}
                  />

                  <Bar
                    dataKey="employees"
                    name="Employees"
                    fill="#22d3ee"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="mt-5 flex min-h-56 flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-5 text-center">
              <ChartNoAxesCombined
                size={25}
                className="text-slate-600"
              />

              <p className="mt-3 text-sm text-slate-400">
                No employee data found.
              </p>

              <p className="mt-2 max-w-sm text-xs leading-5 text-slate-600">
                Check whether the Employees API returns records and
                whether those records contain department IDs or names.
              </p>
            </div>
          )}
        </div>

        <div className="grid content-start gap-5">
          <SummaryPanel
            title="Attendance summary"
            data={attendance}
            error={sections.attendance?.error}
            onRetry={loadDashboard}
          />

          <SummaryPanel
            title="Attrition summary"
            data={attrition}
            error={sections.attrition?.error}
            onRetry={loadDashboard}
          />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-3">
        <SummaryPanel
          title="Organization overview"
          data={overview}
          error={sections.overview?.error}
          onRetry={loadDashboard}
        />

        <SummaryPanel
          title="Payroll summary"
          data={payroll}
          error={sections.payroll?.error}
          onRetry={loadDashboard}
        />

        <SummaryPanel
          title="Department analytics"
          data={analytics}
          error={sections.analytics?.error}
          onRetry={loadDashboard}
        />
      </section>

      {(sections.employees?.error ||
        sections.departments?.error) && (
        <section className="rounded-xl border border-amber-300/20 bg-amber-300/[0.05] p-4 text-sm text-amber-200">
          {sections.employees?.error && (
            <p>Employees API: {String(sections.employees.error)}</p>
          )}

          {sections.departments?.error && (
            <p className="mt-1">
              Departments API: {String(sections.departments.error)}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

const PERSONAL_ENDPOINTS = [
  { key: "employee", url: "/employees/me" },
  { key: "attendance", url: "/attendance/me?page=1&page_size=10" },
  { key: "leaves", url: "/leaves/me" },
  { key: "leaveBalance", url: "/leaves/balance/me" },
  { key: "payroll", url: "/payroll/me" },
  { key: "tasks", url: "/tasks?limit=100" },
  { key: "reviews", url: "/performance-reviews" },
  { key: "notifications", url: "/notifications/unread-count" },
];

function getStatus(record) {
  return String(record?.status ?? "").toUpperCase();
}

function getPersonalName(employee, user) {
  const employeeName = `${employee?.first_name ?? ""} ${employee?.last_name ?? ""}`.trim();
  return (
    employeeName ||
    user?.full_name ||
    user?.name ||
    user?.email ||
    "there"
  );
}

function prettyRole(role) {
  const normalized = String(role ?? "USER").toUpperCase();
  return normalized.charAt(0) + normalized.slice(1).toLowerCase();
}

function PersonalMetric({ title, value, detail, icon: Icon, to, tone = "cyan" }) {
  const accentByTone = {
    cyan: "bg-cyan-300/10 text-cyan-300",
    violet: "bg-violet-300/10 text-violet-300",
    emerald: "bg-emerald-300/10 text-emerald-300",
    amber: "bg-amber-300/10 text-amber-300",
    blue: "bg-blue-300/10 text-blue-300",
    rose: "bg-rose-300/10 text-rose-300",
  };

  const card = (
    <div className="h-full rounded-2xl border border-white/[0.08] bg-slate-900/70 p-5 transition hover:border-white/15">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-slate-400">{title}</p>
          <p className="mt-3 break-words text-2xl font-semibold tracking-tight text-white">
            {value === null || value === undefined || value === "" ? "—" : formatValue(value)}
          </p>
          <p className="mt-2 text-xs text-slate-500">{detail}</p>
        </div>
        <span className={`shrink-0 rounded-xl p-3 ${accentByTone[tone] ?? accentByTone.cyan}`}>
          <Icon size={19} />
        </span>
      </div>
    </div>
  );

  return to ? <Link to={to} className="block">{card}</Link> : card;
}

function QuickAction({ to, icon: Icon, title, description }) {
  return (
    <Link
      to={to}
      className="group flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4 transition hover:border-cyan-300/25 hover:bg-cyan-300/[0.04]"
    >
      <span className="rounded-lg bg-cyan-300/10 p-2 text-cyan-300">
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-100 group-hover:text-cyan-200">
          {title}
        </span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">
          {description}
        </span>
      </span>
    </Link>
  );
}

function PersonalDashboard() {
  const { user } = useAuth();
  const [sections, setSections] = useState({});
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    const results = await Promise.all(
      PERSONAL_ENDPOINTS.map(async ({ key, url }) => {
        try {
          const response = await api.get(url);
          return { key, data: response.data, error: null };
        } catch (error) {
          return {
            key,
            data: null,
            error:
              error.response?.data?.detail ||
              error.response?.data?.message ||
              error.message ||
              "Unable to load this section.",
          };
        }
      })
    );

    const next = {};
    for (const result of results) {
      next[result.key] = result;
    }
    setSections(next);
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    // Fetching dashboard data is an external synchronization; state updates happen after the requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDashboard();
  }, [loadDashboard]);

  const employee = sections.employee?.data;
  const attendance = sections.attendance?.data;
  const leaveRows = extractRows(sections.leaves?.data);
  const balanceRows = extractRows(sections.leaveBalance?.data);
  const payrollRows = extractRows(sections.payroll?.data);
  const taskRows = extractRows(sections.tasks?.data);
  const reviewRows = extractRows(sections.reviews?.data);
  const unreadCount = toNumber(
    findValue(sections.notifications?.data, ["unread_count"])
  );

  const pendingLeaves = leaveRows.filter((row) => getStatus(row) === "PENDING").length;
  const openTasks = taskRows.filter((row) => ["OPEN", "IN_PROGRESS"].includes(getStatus(row))).length;
  const completedTasks = taskRows.filter((row) => getStatus(row) === "COMPLETED").length;
  const availableLeaveDays = balanceRows.reduce((sum, row) => {
    const days = toNumber(row?.available_days);
    return sum + (days ?? 0);
  }, 0);
  const hasLeaveBalance = Boolean(sections.leaveBalance?.data);
  const latestPayroll = payrollRows[0];
  const role = String(user?.role ?? "EMPLOYEE").toUpperCase();
  const isManager = role === "MANAGER";
  const displayName = getPersonalName(employee, user);
  const attendanceTotal = toNumber(attendance?.total);
  const apiErrors = PERSONAL_ENDPOINTS
    .filter(({ key }) => sections[key]?.error)
    .map(({ key }) => ({ key, error: sections[key].error }));

  const personalMetrics = [
    {
      title: "Attendance records",
      value: attendanceTotal,
      detail: "Your attendance history",
      icon: CalendarCheck,
      to: "/attendance",
      tone: "emerald",
      loadingValue: "—",
    },
    {
      title: isManager ? "Open team tasks" : "My open tasks",
      value: sections.tasks?.error ? undefined : openTasks,
      detail: completedTasks ? `${completedTasks} completed` : "Assigned work",
      icon: ClipboardList,
      to: "/tasks",
      tone: "violet",
    },
    {
      title: "Pending leave requests",
      value: sections.leaves?.error ? undefined : pendingLeaves,
      detail: "Your submitted requests",
      icon: Clock3,
      to: "/leaves",
      tone: "amber",
    },
    {
      title: "Available leave days",
      value: hasLeaveBalance ? availableLeaveDays : undefined,
      detail: "Total across active policies",
      icon: CheckCircle2,
      to: "/leaves",
      tone: "emerald",
    },
    {
      title: "Latest net pay",
      value: latestPayroll?.net_pay,
      detail: latestPayroll
        ? `${latestPayroll.period_month}/${latestPayroll.period_year} · ${latestPayroll.status}`
        : "Latest payroll record",
      icon: Wallet,
      to: "/my-payroll",
      tone: "blue",
    },
    {
      title: "Unread notifications",
      value: unreadCount,
      detail: "Messages for your account",
      icon: Bell,
      to: "/notifications",
      tone: "rose",
    },
  ];

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-2xl border border-cyan-300/15 bg-gradient-to-r from-cyan-400/[0.12] via-slate-900 to-blue-500/[0.08] p-6 sm:p-8">
        <div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-cyan-300/[0.06] blur-3xl" />
        <div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium text-cyan-300">
              <UserRound size={15} />
              {isManager ? "TEAM WORKSPACE" : "PERSONAL WORKSPACE"}
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Welcome, {displayName}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              {isManager
                ? "Review your work, follow team tasks, and keep up with your own attendance, leave, and payroll."
                : "Track your attendance, leave balance, tasks, notifications, and your own payroll records in one place."}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
              <span>{prettyRole(role)} account</span>
              {employee?.job_title && <span>· {employee.job_title}</span>}
              {lastUpdated && <span>· Updated {lastUpdated.toLocaleTimeString()}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={loadDashboard}
            disabled={loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-medium text-slate-200 transition hover:border-cyan-300/30 hover:text-cyan-200 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh data
          </button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {personalMetrics.map((metric) => {
          let value = metric.value;
          if (loading && value === undefined) value = "...";
          if (!loading && value === undefined) value = "—";
          return <PersonalMetric key={metric.title} {...metric} value={value} />;
        })}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-white">Quick actions</h3>
          <p className="mt-1 text-xs text-slate-500">Shortcuts based on your day-to-day workflow</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <QuickAction to="/attendance" icon={CalendarCheck} title="Attendance" description="Check in/out and review your attendance history." />
            <QuickAction to="/leaves" icon={FileText} title="Leave management" description="Apply for leave and see decisions and balance." />
            <QuickAction to="/my-payroll" icon={Wallet} title="My payslips" description="Review payroll history and available payslips." />
            <QuickAction to="/tasks" icon={ClipboardList} title={isManager ? "Team tasks" : "My tasks"} description="Check assignments and update permitted task statuses." />
            <QuickAction to="/reviews" icon={CheckCircle2} title="Performance reviews" description="Review performance records available to your account." />
            <QuickAction to="/notifications" icon={Bell} title="Notifications" description="Read notifications and mark them as read." />
          </div>
        </div>

        <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5">
          <h3 className="text-sm font-semibold text-white">Recent payroll</h3>
          <p className="mt-1 text-xs text-slate-500">Only your own payroll records are requested</p>
          <div className="mt-4 space-y-3">
            {sections.payroll?.error ? (
              <p className="rounded-xl bg-amber-300/[0.05] px-3 py-3 text-xs leading-5 text-amber-200">
                Payroll could not be loaded: {String(sections.payroll.error)}
              </p>
            ) : payrollRows.length ? (
              payrollRows.slice(0, 4).map((record) => (
                <div key={record.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-200">
                      {record.period_month}/{record.period_year}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">{record.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-cyan-200">
                      {record.net_pay === undefined ? "—" : Number(record.net_pay).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                    {String(record.status).toUpperCase() === "PAID" && (
                      <Link to="/my-payroll" className="mt-1 inline-block text-[11px] text-cyan-300 hover:text-cyan-200">
                        Open payslips
                      </Link>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
                <Wallet size={22} className="mx-auto text-slate-600" />
                <p className="mt-3 text-sm text-slate-300">No payroll records returned</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">Your payroll will appear here once records are available.</p>
              </div>
            )}
          </div>
          <Link to="/my-payroll" className="mt-4 inline-flex items-center gap-2 text-xs font-medium text-cyan-300 hover:text-cyan-200">
            View all payslips <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {apiErrors.length > 0 && (
        <section className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4">
          <h3 className="text-sm font-semibold text-amber-200">Some dashboard data is unavailable</h3>
          <p className="mt-1 text-xs leading-5 text-slate-400">
            Other sections remain usable. An error here can mean your account is not linked to the required employee record or the API request was rejected.
          </p>
          <div className="mt-3 space-y-2">
            {apiErrors.map(({ key, error }) => (
              <p key={key} className="break-words text-xs text-amber-100/90">
                <span className="font-semibold">{key}:</span> {String(error)}
              </p>
            ))}
          </div>
        </section>
      )}

      <div className="text-[11px] text-slate-600">
        Performance reviews available: {reviewRows.length}. Task summary: {taskRows.length} records.
      </div>
    </div>
  );
}

// Dashboard overview APIs are ADMIN/HR-only. Other roles use endpoints scoped to their own account/team.
export default function Dashboard() {
  const { user, loading } = useAuth();
  const role = String(user?.role ?? "").toUpperCase();

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-2xl border border-white/[0.08] bg-slate-900/60">
        <div className="flex items-center gap-3 text-sm text-slate-400">
          <RefreshCw size={17} className="animate-spin" /> Loading your workspace...
        </div>
      </div>
    );
  }

  return role === "ADMIN" || role === "HR" ? <AdminDashboard /> : <PersonalDashboard />;
}
