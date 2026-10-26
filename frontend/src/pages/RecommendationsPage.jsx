import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Download,
  Filter,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import api from "../api/axios";

function getErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.message || JSON.stringify(detail);
  return error?.message || "Request failed. Please try again.";
}

function displayDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function priorityClass(priority) {
  switch (String(priority || "").toUpperCase()) {
    case "CRITICAL": return "border-rose-400/30 bg-rose-400/10 text-rose-200";
    case "HIGH": return "border-orange-400/30 bg-orange-400/10 text-orange-200";
    case "MEDIUM": return "border-amber-400/30 bg-amber-400/10 text-amber-200";
    default: return "border-white/10 bg-white/5 text-slate-300";
  }
}

function downloadCsv(rows) {
  if (!rows.length) return;
  const columns = [
    ["id", "Recommendation ID"], ["employee_id", "Employee ID"],
    ["department_id", "Department ID"], ["prediction_id", "Prediction ID"],
    ["category", "Category"], ["title", "Title"], ["recommendation", "Recommendation"],
    ["priority", "Priority"], ["created_by", "Created By"], ["created_at", "Created At"],
  ];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns.map(([, label]) => escape(label)).join(","), ...rows.map((row) => columns.map(([key]) => escape(row[key])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "workforce-recommendations.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function Metric({ label, value, hint, icon: Icon }) {
  return <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-semibold text-white">{value}</p>{hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}</div><span className="rounded-xl bg-cyan-300/10 p-3 text-cyan-200"><Icon size={19} /></span></div></div>;
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>{children}</label>;
}

const inputClass = "w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50";

export default function RecommendationsPage() {
  const [recommendations, setRecommendations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pageError, setPageError] = useState("");
  const [departmentError, setDepartmentError] = useState("");
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [minimumRisk, setMinimumRisk] = useState("0.60");
  const [generationDepartment, setGenerationDepartment] = useState("");
  const [selectedRecommendation, setSelectedRecommendation] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setPageError("");
    setDepartmentError("");
    const params = { limit: 200 };
    if (departmentFilter) params.department_id = Number(departmentFilter);
    if (employeeFilter && Number(employeeFilter) > 0) params.employee_id = Number(employeeFilter);
    const [recommendationResult, departmentResult] = await Promise.allSettled([
      api.get("/recommendations", { params }),
      api.get("/departments"),
    ]);
    if (recommendationResult.status === "fulfilled") {
      setRecommendations(Array.isArray(recommendationResult.value.data) ? recommendationResult.value.data : []);
    } else {
      setPageError(getErrorMessage(recommendationResult.reason));
    }
    if (departmentResult.status === "fulfilled") {
      setDepartments(Array.isArray(departmentResult.value.data) ? departmentResult.value.data : []);
    } else {
      setDepartmentError(`Department list could not be loaded: ${getErrorMessage(departmentResult.reason)}`);
    }
    setLoading(false);
    setRefreshing(false);
  }, [departmentFilter, employeeFilter]);

  // Fetch the API data when query filters change.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- The effect starts an async request and synchronizes page loading state.
  useEffect(() => { load(); }, [load]);

  const filteredRecommendations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return recommendations.filter((item) => {
      const matchesQuery = !query || [item.title, item.recommendation, item.category, item.priority, item.employee_id, item.department_id, item.prediction_id].some((value) => String(value ?? "").toLowerCase().includes(query));
      const matchesPriority = !priorityFilter || String(item.priority || "").toUpperCase() === priorityFilter;
      const matchesCategory = !categoryFilter || String(item.category || "").toUpperCase() === categoryFilter;
      return matchesQuery && matchesPriority && matchesCategory;
    });
  }, [recommendations, search, priorityFilter, categoryFilter]);

  const priorityCounts = useMemo(() => ({
    high: recommendations.filter((item) => ["HIGH", "CRITICAL"].includes(String(item.priority || "").toUpperCase())).length,
    retention: recommendations.filter((item) => String(item.category || "").toUpperCase() === "RETENTION").length,
    linked: recommendations.filter((item) => item.employee_id != null).length,
  }), [recommendations]);

  const categories = useMemo(() => [...new Set(recommendations.map((item) => String(item.category || "").toUpperCase()).filter(Boolean))].sort(), [recommendations]);

  async function generateRecommendations(event) {
    event.preventDefault();
    const threshold = Number(minimumRisk);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      setNotice({ type: "error", message: "Minimum risk must be between 0 and 1 (for example, 0.60 means 60%)." });
      return;
    }
    setGenerating(true);
    setNotice(null);
    try {
      const params = { minimum_risk: threshold };
      if (generationDepartment) params.department_id = Number(generationDepartment);
      const response = await api.post("/recommendations/generate", null, { params });
      const data = response.data || {};
      setNotice({
        type: "success",
        message: `Generation completed. Created ${Number(data.created_count || 0)} recommendation(s); skipped ${Number(data.skipped_existing_count || 0)} existing recommendation(s).`,
      });
      await load({ quiet: true });
    } catch (error) {
      setNotice({ type: "error", message: getErrorMessage(error) });
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-full space-y-6 bg-slate-950 p-4 text-slate-100 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/10 px-3 py-1 text-xs font-semibold text-violet-200"><Sparkles size={14} /> Workforce Intelligence</div><h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">AI Recommendations</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Generate HR follow-up recommendations from the latest employee attrition risk predictions and review saved recommendations.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => load({ quiet: true })} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh</button><button onClick={() => downloadCsv(filteredRecommendations)} disabled={!filteredRecommendations.length} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40"><Download size={16} /> Export CSV</button></div></div>

      {notice ? <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-400/30 bg-rose-400/10 text-rose-100" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"}`}>{notice.message}<button className="ml-3 underline" onClick={() => setNotice(null)}>Dismiss</button></div> : null}
      {pageError ? <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100"><p className="font-semibold">Could not load recommendations</p><p className="mt-1">{pageError}</p><button onClick={() => load()} className="mt-3 underline">Try again</button></div> : null}
      {departmentError ? <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100">{departmentError} Department filters and scoped generation may be unavailable.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Recommendations loaded" value={recommendations.length.toLocaleString()} hint="Latest records returned by the API" icon={Activity} /><Metric label="High / critical priority" value={priorityCounts.high.toLocaleString()} hint="From the loaded results" icon={AlertTriangle} /><Metric label="Retention recommendations" value={priorityCounts.retention.toLocaleString()} hint="Category = RETENTION" icon={ShieldCheck} /><Metric label="Employee-linked records" value={priorityCounts.linked.toLocaleString()} hint="Linked to an employee record" icon={Users} /></div>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6"><div className="mb-5 flex items-start gap-3"><span className="rounded-xl bg-violet-300/10 p-2.5 text-violet-200"><Sparkles size={19} /></span><div><h2 className="font-semibold text-white">Generate recommendations</h2><p className="mt-1 text-sm text-slate-400">Uses the latest saved prediction per active employee. Existing RETENTION recommendations for a prediction are skipped rather than duplicated.</p></div></div>
        <form onSubmit={generateRecommendations} className="grid gap-4 md:grid-cols-3"><Field label="Minimum risk threshold"><select className={inputClass} value={minimumRisk} onChange={(event) => setMinimumRisk(event.target.value)}><option value="0.40">40% · broad review</option><option value="0.50">50%</option><option value="0.60">60% · default</option><option value="0.70">70%</option><option value="0.80">80% · highest risk</option><option value="0.90">90%</option></select></Field><Field label="Department scope"><select className={inputClass} value={generationDepartment} onChange={(event) => setGenerationDepartment(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></Field><div className="flex items-end"><button type="submit" disabled={generating} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-violet-200 disabled:cursor-wait disabled:opacity-60">{generating ? <LoaderCircle size={16} className="animate-spin" /> : <Sparkles size={16} />}{generating ? "Generating…" : "Generate recommendations"}</button></div></form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6"><div className="mb-5 flex flex-col gap-4"><div><h2 className="font-semibold text-white">Recommendation history</h2><p className="mt-1 text-sm text-slate-400">Filter and inspect recommendations produced by the backend.</p></div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><label className="relative block sm:col-span-2 xl:col-span-1"><span className="mb-1.5 block text-xs font-medium text-slate-400">Search</span><Search className="absolute left-3 top-[2.15rem] text-slate-500" size={15} /><input className={`${inputClass} pl-9`} placeholder="Title, employee, ID…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><Field label="Department"><select className={inputClass} value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></Field><Field label="Employee ID"><input className={inputClass} type="number" min="1" placeholder="Any employee" value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)} /></Field><Field label="Priority"><select className={inputClass} value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="">All priorities</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="NORMAL">Normal</option><option value="LOW">Low</option></select></Field><Field label="Category"><select className={inputClass} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select></Field></div><div className="flex items-center gap-2 text-xs text-slate-500"><Filter size={13} /> Showing {filteredRecommendations.length} of {recommendations.length} loaded recommendation records.</div></div>
        {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><LoaderCircle className="animate-spin" size={18} /> Loading recommendations…</div> : filteredRecommendations.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-5 py-12 text-center"><Info className="mx-auto text-slate-500" size={22} /><p className="mt-3 text-sm font-semibold text-white">No recommendations found</p><p className="mt-1 text-xs text-slate-500">Change the filters or generate recommendations. Generate will return zero new rows if no recent employee predictions meet the selected threshold.</p></div> : <div className="overflow-x-auto rounded-xl border border-white/10"><table className="min-w-full divide-y divide-white/10 text-left text-sm"><thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-400"><tr>{["Recommendation", "Priority", "Employee / Department", "Prediction", "Created", "Details"].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-white/5">{filteredRecommendations.map((item) => <tr key={item.id} className="text-slate-300 hover:bg-white/[0.025]"><td className="max-w-md px-4 py-3"><p className="font-semibold text-white">{item.title}</p><p className="mt-1 text-xs text-slate-500">#{item.id} · {item.category}</p><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{item.recommendation}</p></td><td className="px-4 py-3"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${priorityClass(item.priority)}`}>{item.priority || "NORMAL"}</span></td><td className="whitespace-nowrap px-4 py-3">{item.employee_id ? `Employee #${item.employee_id}` : "Unlinked"}<span className="mt-1 block text-xs text-slate-500">{item.department_id ? `Department #${item.department_id}` : "No department"}</span></td><td className="px-4 py-3">{item.prediction_id ? `#${item.prediction_id}` : "—"}</td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{displayDate(item.created_at)}</td><td className="px-4 py-3"><button onClick={() => setSelectedRecommendation(item)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-violet-200 hover:bg-white/5">Details</button></td></tr>)}</tbody></table></div>}
        <p className="mt-3 text-xs leading-5 text-slate-500">Recommendations are decision-support prompts, not employment decisions. Validate the model signal with the employee and a qualified HR reviewer; do not use a risk score alone to take adverse action.</p>
      </section>

      {selectedRecommendation ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="recommendation-details-title" onClick={() => setSelectedRecommendation(null)}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-violet-200">Recommendation #{selectedRecommendation.id}</p><h2 id="recommendation-details-title" className="mt-1 text-xl font-semibold text-white">{selectedRecommendation.title}</h2></div><button onClick={() => setSelectedRecommendation(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close details"><X size={18} /></button></div><div className="mt-4 flex flex-wrap items-center gap-2"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${priorityClass(selectedRecommendation.priority)}`}>{selectedRecommendation.priority || "NORMAL"}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300">{selectedRecommendation.category}</span><span className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300">{selectedRecommendation.employee_id ? `Employee #${selectedRecommendation.employee_id}` : "Unlinked employee"}</span></div><div className="mt-5 rounded-xl border border-white/10 bg-slate-950/50 p-4"><h3 className="text-sm font-semibold text-white">Recommended HR follow-up</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-300">{selectedRecommendation.recommendation}</p></div><div className="mt-4"><h3 className="text-sm font-semibold text-white">Prediction context</h3><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-5 text-slate-300">{JSON.stringify(selectedRecommendation.recommendation_data || { message: "No additional context supplied by the API." }, null, 2)}</pre></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-500">Department / prediction</p><p className="mt-1 text-sm text-slate-200">{selectedRecommendation.department_id ?? "—"} / {selectedRecommendation.prediction_id ?? "—"}</p></div><div className="rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-500">Created</p><p className="mt-1 text-sm text-slate-200">{displayDate(selectedRecommendation.created_at)}</p></div></div><button onClick={() => setSelectedRecommendation(null)} className="mt-5 w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15"><CheckCircle2 size={15} className="mr-2 inline" />Close</button></div></div> : null}
    </div>
  );
}
