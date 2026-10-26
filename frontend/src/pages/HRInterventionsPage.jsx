import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"];
const CATEGORIES = [
  "CAREER_GROWTH",
  "COMPENSATION",
  "ENGAGEMENT",
  "MANAGER_SUPPORT",
  "RECOGNITION",
  "WORKLOAD",
  "WELLBEING",
  "OTHER",
];

function errorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).filter(Boolean).join("; ");
  if (detail && typeof detail === "object") return detail.message || JSON.stringify(detail);
  return error?.message || "Request failed. Please try again.";
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString(undefined, includeTime
    ? { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { year: "numeric", month: "short", day: "2-digit" });
}

function statusClasses(status) {
  switch (String(status || "").toUpperCase()) {
    case "OPEN": return "border-cyan-300/25 bg-cyan-300/10 text-cyan-200";
    case "IN_PROGRESS": return "border-amber-300/25 bg-amber-300/10 text-amber-200";
    case "COMPLETED": return "border-emerald-300/25 bg-emerald-300/10 text-emerald-200";
    case "CANCELLED": return "border-rose-300/25 bg-rose-300/10 text-rose-200";
    default: return "border-white/10 bg-white/5 text-slate-300";
  }
}

function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide ${statusClasses(status)}`}>{String(status || "UNKNOWN").replaceAll("_", " ")}</span>;
}

function EmptyState({ title, detail }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 px-5 py-12 text-center">
      <ClipboardCheck size={25} className="mx-auto text-slate-500" />
      <p className="mt-3 text-sm font-semibold text-slate-200">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}

function Metric({ label, value, hint, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
          {hint ? <p className="mt-1 text-[11px] text-slate-500">{hint}</p> : null}
        </div>
        <span className="rounded-xl bg-cyan-300/10 p-2.5 text-cyan-200"><Icon size={18} /></span>
      </div>
    </div>
  );
}

const EMPTY_CREATE = {
  employee_id: "",
  prediction_id: "",
  title: "",
  category: "ENGAGEMENT",
  recommendation: "",
  assigned_to: "",
  follow_up_date: "",
};

export default function HRInterventionsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [sourceErrors, setSourceErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ status: "OPEN", assigned_to: "", follow_up_date: "", outcome_notes: "" });

  const loadData = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    setPageError("");
    setSourceErrors({});
    const requests = await Promise.allSettled([
      api.get("/interventions", { params: { limit: 200 } }),
      api.get("/employees", { params: { page: 1, page_size: 100, employment_status: "ACTIVE" } }),
      api.get("/attrition/predictions", { params: { page: 1, page_size: 100 } }),
      ...(isAdmin ? [api.get("/users", { params: { skip: 0, limit: 100, is_active: true } })] : []),
    ]);
    const [interventionsResult, employeesResult, predictionsResult] = requests;
    const errors = {};

    if (interventionsResult.status === "fulfilled") {
      setItems(Array.isArray(interventionsResult.value.data) ? interventionsResult.value.data : []);
    } else {
      errors.interventions = errorMessage(interventionsResult.reason);
      setItems([]);
    }
    if (employeesResult.status === "fulfilled") {
      const data = employeesResult.value.data;
      setEmployees(Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []);
    } else {
      errors.employees = errorMessage(employeesResult.reason);
      setEmployees([]);
    }
    if (predictionsResult.status === "fulfilled") {
      const data = predictionsResult.value.data;
      setPredictions(Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []);
    } else {
      errors.predictions = errorMessage(predictionsResult.reason);
      setPredictions([]);
    }
    if (isAdmin) {
      const usersResult = requests[3];
      if (usersResult.status === "fulfilled") {
        setUsers(Array.isArray(usersResult.value.data) ? usersResult.value.data : []);
      } else {
        errors.users = errorMessage(usersResult.reason);
        setUsers([]);
      }
    } else {
      setUsers([]);
    }
    setSourceErrors(errors);
    if (interventionsResult.status === "rejected") setPageError(errorMessage(interventionsResult.reason));
    setLoading(false);
  }, [isAdmin]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- The effect starts API synchronization and updates loading/data state.
  useEffect(() => { loadData(); }, [loadData]);

  const employeeMap = useMemo(() => new Map(employees.map((employee) => [Number(employee.id), employee])), [employees]);
  const userMap = useMemo(() => new Map(users.map((person) => [Number(person.id), person])), [users]);
  const availablePredictions = useMemo(() => {
    if (!createForm.employee_id) return [];
    return predictions.filter((prediction) => Number(prediction.employee_id) === Number(createForm.employee_id));
  }, [predictions, createForm.employee_id]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter && item.status !== statusFilter) return false;
      if (employeeFilter && Number(item.employee_id) !== Number(employeeFilter)) return false;
      const employee = employeeMap.get(Number(item.employee_id));
      const joinedName = employee ? `${employee.first_name || ""} ${employee.last_name || ""}`.trim() : "";
      const haystack = [item.id, item.title, item.category, item.recommendation, item.status, item.employee_id, joinedName, item.assigned_to].join(" ").toLowerCase();
      return !term || haystack.includes(term);
    });
  }, [items, search, statusFilter, employeeFilter, employeeMap]);

  const metrics = useMemo(() => ({
    total: items.length,
    open: items.filter((item) => item.status === "OPEN").length,
    inProgress: items.filter((item) => item.status === "IN_PROGRESS").length,
    completed: items.filter((item) => item.status === "COMPLETED").length,
    overdue: items.filter((item) => item.follow_up_date && item.follow_up_date < new Date().toISOString().slice(0, 10) && !["COMPLETED", "CANCELLED"].includes(item.status)).length,
  }), [items]);

  function updateCreate(field, value) {
    setCreateForm((current) => ({ ...current, [field]: value, ...(field === "employee_id" ? { prediction_id: "" } : {}) }));
  }

  async function submitCreate(event) {
    event.preventDefault();
    setNotice(null);
    setPageError("");
    const payload = {
      employee_id: Number(createForm.employee_id),
      title: createForm.title.trim(),
      category: createForm.category,
      recommendation: createForm.recommendation.trim(),
      prediction_id: createForm.prediction_id ? Number(createForm.prediction_id) : null,
      assigned_to: createForm.assigned_to ? Number(createForm.assigned_to) : null,
      follow_up_date: createForm.follow_up_date || null,
    };
    if (!payload.employee_id || payload.title.length < 3 || payload.recommendation.length < 5) {
      setPageError("Select an employee, enter a title (at least 3 characters), and provide a recommendation (at least 5 characters).");
      return;
    }
    if (payload.assigned_to !== null && (!Number.isInteger(payload.assigned_to) || payload.assigned_to <= 0)) {
      setPageError("Assigned User ID must be a positive whole number.");
      return;
    }
    setSaving(true);
    try {
      await api.post("/interventions", payload);
      setNotice({ type: "success", text: "Intervention created successfully." });
      setCreateForm(EMPTY_CREATE);
      setShowCreate(false);
      await loadData({ quiet: true });
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(item) {
    setEditing(item);
    setEditForm({
      status: item.status || "OPEN",
      assigned_to: item.assigned_to == null ? "" : String(item.assigned_to),
      follow_up_date: item.follow_up_date || "",
      outcome_notes: item.outcome_notes || "",
    });
    setPageError("");
    setNotice(null);
  }

  async function submitEdit(event) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setPageError("");
    setNotice(null);
    const payload = {
      status: editForm.status,
      assigned_to: editForm.assigned_to ? Number(editForm.assigned_to) : null,
      follow_up_date: editForm.follow_up_date || null,
      outcome_notes: editForm.outcome_notes,
    };
    if (payload.assigned_to !== null && (!Number.isInteger(payload.assigned_to) || payload.assigned_to <= 0)) {
      setPageError("Assigned User ID must be a positive whole number.");
      setSaving(false);
      return;
    }
    try {
      await api.patch(`/interventions/${editing.id}`, payload);
      setNotice({ type: "success", text: `Intervention #${editing.id} updated successfully.` });
      setEditing(null);
      await loadData({ quiet: true });
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function quickStatus(item, status) {
    setSaving(true);
    setPageError("");
    setNotice(null);
    try {
      await api.patch(`/interventions/${item.id}`, { status });
      setNotice({ type: "success", text: `Intervention #${item.id} moved to ${status.replaceAll("_", " ")}.` });
      await loadData({ quiet: true });
    } catch (error) {
      setPageError(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  function downloadCsv() {
    const headers = ["id", "employee_id", "prediction_id", "title", "category", "recommendation", "assigned_to", "follow_up_date", "status", "outcome_notes", "created_at", "completed_at"];
    const escapeCell = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const csv = [headers.join(","), ...filteredItems.map((item) => headers.map((key) => escapeCell(item[key])).join(","))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "hr-interventions.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 text-slate-100">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-[11px] font-semibold tracking-wide text-cyan-200">
            <ShieldCheck size={14} /> ADMIN / HR WORKSPACE
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">HR Interventions</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Create employee support actions, assign ownership, set follow-up dates, and record outcomes. Interventions support human review; they do not make employment decisions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => loadData()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /> Refresh</button>
          <button type="button" onClick={downloadCsv} disabled={!filteredItems.length} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-40">Export CSV</button>
          <button type="button" onClick={() => { setShowCreate(true); setPageError(""); setNotice(null); }} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-200"><Plus size={16} /> New intervention</button>
        </div>
      </div>

      {pageError ? <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-300/20 bg-rose-300/10 p-4 text-sm text-rose-200"><AlertCircle size={18} className="mt-0.5 shrink-0" /><span>{pageError}</span><button type="button" onClick={() => setPageError("")} className="ml-auto rounded-md p-1 hover:bg-white/5" aria-label="Dismiss error"><X size={15} /></button></div> : null}
      {notice ? <div role="status" className="flex items-center gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-200"><CheckCircle2 size={18} /><span>{notice.text}</span><button type="button" onClick={() => setNotice(null)} className="ml-auto rounded-md p-1 hover:bg-white/5" aria-label="Dismiss message"><X size={15} /></button></div> : null}
      {Object.keys(sourceErrors).length > 0 ? <div className="rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100"><p className="mb-1 font-semibold">Some helper data could not be loaded.</p>{Object.entries(sourceErrors).map(([key, value]) => <p key={key}>{key}: {value}</p>)}<p className="mt-1 text-amber-200/70">Intervention records use the backend API directly; helper lists may be incomplete until refresh.</p></div> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="Loaded interventions" value={metrics.total} hint="Latest 200 records maximum" icon={ClipboardCheck} />
        <Metric label="Open" value={metrics.open} hint="Awaiting action" icon={Clock3} />
        <Metric label="In progress" value={metrics.inProgress} hint="Follow-up underway" icon={ActivityIcon} />
        <Metric label="Completed" value={metrics.completed} hint="Outcome recorded or ready to record" icon={CheckCircle2} />
        <Metric label="Overdue follow-ups" value={metrics.overdue} hint="Past date, still active" icon={CalendarClock} />
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_210px_230px_auto]">
          <label className="relative block"><span className="sr-only">Search interventions</span><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, employee, category, ID…" className="w-full rounded-xl border border-white/10 bg-slate-950/70 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" /></label>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-300/40"><option value="">All statuses</option>{STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>
          <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-300/40"><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name} · #{employee.id}</option>)}</select>
          <button type="button" onClick={() => { setSearch(""); setStatusFilter(""); setEmployeeFilter(""); }} className="rounded-xl border border-white/10 px-3 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">Clear filters</button>
        </div>
        <p className="mt-3 text-xs text-slate-500">Showing {filteredItems.length} of {items.length} loaded records · backend list limit: 200</p>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-4 sm:px-5"><div><h2 className="text-sm font-semibold text-white">Intervention register</h2><p className="mt-1 text-xs text-slate-500">Use Edit to change status, owner, follow-up date, or outcome notes.</p></div><span className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><UserRound size={14} /> HR-managed records</span></div>
        {loading ? <div className="space-y-3 p-5">{[1, 2, 3].map((index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-white/[0.04]" />)}</div> : pageError && !items.length ? <div className="p-5"><EmptyState title="Interventions could not be loaded" detail="Check your access token and confirm the backend is running, then refresh." /></div> : filteredItems.length === 0 ? <div className="p-5"><EmptyState title="No interventions found" detail="Create an intervention or clear the current filters. Only real API records are shown." /></div> : (
          <>
            <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1050px] text-left"><thead className="bg-white/[0.025] text-[10px] uppercase tracking-[0.12em] text-slate-500"><tr><th className="px-5 py-3 font-semibold">Employee</th><th className="px-4 py-3 font-semibold">Intervention</th><th className="px-4 py-3 font-semibold">Follow-up</th><th className="px-4 py-3 font-semibold">Owner</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-5 py-3 text-right font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{filteredItems.map((item) => { const employee = employeeMap.get(Number(item.employee_id)); const owner = userMap.get(Number(item.assigned_to)); const overdue = item.follow_up_date && item.follow_up_date < new Date().toISOString().slice(0, 10) && !["COMPLETED", "CANCELLED"].includes(item.status); return <tr key={item.id} className="align-top hover:bg-white/[0.02]"><td className="px-5 py-4"><p className="text-sm font-semibold text-slate-100">{employee ? `${employee.first_name} ${employee.last_name}` : `Employee #${item.employee_id}`}</p><p className="mt-1 text-[11px] text-slate-500">ID {item.employee_id} {employee?.employee_code ? `· ${employee.employee_code}` : ""}</p></td><td className="max-w-[380px] px-4 py-4"><p className="text-sm font-semibold text-white">{item.title}</p><p className="mt-1 text-[10px] font-bold tracking-wide text-cyan-200">{item.category}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{item.recommendation}</p><p className="mt-2 text-[10px] text-slate-600">Intervention #{item.id}{item.prediction_id ? ` · Prediction #${item.prediction_id}` : ""}</p></td><td className="px-4 py-4"><p className={`text-xs font-medium ${overdue ? "text-rose-200" : "text-slate-300"}`}>{formatDate(item.follow_up_date)}</p>{overdue ? <p className="mt-1 text-[10px] text-rose-300">Overdue</p> : null}<p className="mt-2 text-[10px] text-slate-600">Created {formatDate(item.created_at)}</p></td><td className="px-4 py-4"><p className="text-xs text-slate-200">{owner?.full_name || (item.assigned_to ? `User #${item.assigned_to}` : "Unassigned")}</p>{owner?.email ? <p className="mt-1 text-[10px] text-slate-500">{owner.email}</p> : null}</td><td className="px-4 py-4"><StatusBadge status={item.status} />{item.completed_at ? <p className="mt-2 text-[10px] text-slate-500">Completed {formatDate(item.completed_at)}</p> : null}</td><td className="px-5 py-4 text-right"><div className="flex flex-col items-end gap-2"><button type="button" onClick={() => beginEdit(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-cyan-300/30 hover:bg-cyan-300/5"><Edit3 size={13} /> Edit</button>{item.status === "OPEN" ? <button type="button" disabled={saving} onClick={() => quickStatus(item, "IN_PROGRESS")} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-amber-200 hover:bg-amber-300/10 disabled:opacity-40">Start work</button> : null}{item.status === "IN_PROGRESS" ? <button type="button" disabled={saving} onClick={() => beginEdit(item)} className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-300/10 disabled:opacity-40">Complete / record outcome</button> : null}</div></td></tr>; })}</tbody></table></div>
            <div className="space-y-3 p-3 md:hidden">{filteredItems.map((item) => { const employee = employeeMap.get(Number(item.employee_id)); return <article key={item.id} className="rounded-xl border border-white/10 bg-slate-950/50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white">{item.title}</p><p className="mt-1 text-xs text-slate-400">{employee ? `${employee.first_name} ${employee.last_name}` : `Employee #${item.employee_id}`}</p></div><StatusBadge status={item.status} /></div><p className="mt-3 text-[10px] font-bold tracking-wide text-cyan-200">{item.category}</p><p className="mt-2 text-xs leading-5 text-slate-400">{item.recommendation}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-slate-500"><span>Follow-up: {formatDate(item.follow_up_date)}</span><span>Owner: {item.assigned_to ? `User #${item.assigned_to}` : "Unassigned"}</span></div><button type="button" onClick={() => beginEdit(item)} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200"><Edit3 size={13} /> Edit intervention</button></article>; })}</div>
          </>
        )}
      </section>

      {showCreate ? <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowCreate(false); }}><section role="dialog" aria-modal="true" aria-labelledby="create-intervention-title" className="my-6 w-full max-w-3xl rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="create-intervention-title" className="text-lg font-semibold text-white">Create intervention</h2><p className="mt-1 text-xs leading-5 text-slate-400">Create a human-reviewed support action for an employee. Required fields are marked.</p></div><button type="button" onClick={() => setShowCreate(false)} disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-white/5" aria-label="Close create form"><X size={18} /></button></div><form onSubmit={submitCreate} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium text-slate-300">Employee *<select required value={createForm.employee_id} onChange={(event) => updateCreate("employee_id", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/40"><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.first_name} {employee.last_name} · ID {employee.id}</option>)}</select></label><label className="text-xs font-medium text-slate-300">Related attrition prediction (optional)<select value={createForm.prediction_id} onChange={(event) => updateCreate("prediction_id", event.target.value)} disabled={!createForm.employee_id} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/40 disabled:opacity-50"><option value="">No prediction linked</option>{availablePredictions.map((prediction) => <option key={prediction.id} value={prediction.id}>#{prediction.id} · {String(prediction.risk_level || "Unknown")} · {formatDate(prediction.created_at)}</option>)}</select></label><label className="text-xs font-medium text-slate-300">Title *<input required minLength={3} maxLength={180} value={createForm.title} onChange={(event) => updateCreate("title", event.target.value)} placeholder="e.g. Career development check-in" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" /></label><label className="text-xs font-medium text-slate-300">Category *<select value={createForm.category} onChange={(event) => updateCreate("category", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/40">{CATEGORIES.map((category) => <option key={category} value={category}>{category.replaceAll("_", " ")}</option>)}</select></label><label className="text-xs font-medium text-slate-300 sm:col-span-2">Recommendation / action plan *<textarea required minLength={5} maxLength={5000} rows={4} value={createForm.recommendation} onChange={(event) => updateCreate("recommendation", event.target.value)} placeholder="Describe the support action, responsible next step, and intended outcome…" className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm leading-5 text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" /></label><label className="text-xs font-medium text-slate-300">Follow-up date<input type="date" value={createForm.follow_up_date} onChange={(event) => updateCreate("follow_up_date", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/40" /></label><label className="text-xs font-medium text-slate-300">Assigned user {isAdmin ? "(optional)" : "ID, optional"}{isAdmin ? <select value={createForm.assigned_to} onChange={(event) => updateCreate("assigned_to", event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/40"><option value="">Unassigned</option>{users.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email} · {person.role} · #{person.id}</option>)}</select> : <input type="number" min="1" step="1" value={createForm.assigned_to} onChange={(event) => updateCreate("assigned_to", event.target.value)} placeholder="Active User ID" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" />}</label><div className="flex justify-end gap-2 border-t border-white/[0.08] pt-4 sm:col-span-2"><button type="button" onClick={() => setShowCreate(false)} disabled={saving} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">Cancel</button><button type="submit" disabled={saving || !employees.length} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">{saving ? "Saving…" : "Create intervention"}</button></div></form></section></div> : null}

      {editing ? <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setEditing(null); }}><section role="dialog" aria-modal="true" aria-labelledby="edit-intervention-title" className="my-6 w-full max-w-2xl rounded-2xl border border-white/10 bg-slate-950 p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><h2 id="edit-intervention-title" className="text-lg font-semibold text-white">Edit intervention #{editing.id}</h2><p className="mt-1 text-xs text-slate-400">Update the allowed fields. Completion timestamp is maintained by the backend.</p></div><button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-white/5" aria-label="Close edit form"><X size={18} /></button></div><form onSubmit={submitEdit} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-medium text-slate-300">Status<select value={editForm.status} onChange={(event) => setEditForm((current) => ({ ...current, status: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/40">{STATUSES.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label><label className="text-xs font-medium text-slate-300">Follow-up date<input type="date" value={editForm.follow_up_date} onChange={(event) => setEditForm((current) => ({ ...current, follow_up_date: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/40" /></label><label className="text-xs font-medium text-slate-300 sm:col-span-2">Assigned user {isAdmin ? "(optional)" : "ID, optional"}{isAdmin ? <select value={editForm.assigned_to} onChange={(event) => setEditForm((current) => ({ ...current, assigned_to: event.target.value }))} className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/40"><option value="">Unassigned</option>{users.map((person) => <option key={person.id} value={person.id}>{person.full_name || person.email} · {person.role} · #{person.id}</option>)}</select> : <input type="number" min="1" step="1" value={editForm.assigned_to} onChange={(event) => setEditForm((current) => ({ ...current, assigned_to: event.target.value }))} placeholder="Active User ID" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" />}</label><label className="text-xs font-medium text-slate-300 sm:col-span-2">Outcome notes<textarea maxLength={5000} rows={4} value={editForm.outcome_notes} onChange={(event) => setEditForm((current) => ({ ...current, outcome_notes: event.target.value }))} placeholder="What happened during follow-up? Record the support outcome…" className="mt-2 w-full resize-y rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm leading-5 text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" /></label><div className="flex justify-end gap-2 border-t border-white/[0.08] pt-4 sm:col-span-2"><button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5">Cancel</button><button type="submit" disabled={saving} className="rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button></div></form></section></div> : null}

      <p className="text-[11px] leading-5 text-slate-600">Privacy note: attrition predictions should only inform supportive, human-reviewed follow-up. Do not use a prediction score as the sole basis for employment decisions.</p>
    </div>
  );
}

function ActivityIcon(props) {
  return <CalendarClock {...props} />;
}
