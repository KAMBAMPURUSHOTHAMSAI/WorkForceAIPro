import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarClock,
  Download,
  Info,
  LoaderCircle,
  RefreshCw,
  TrendingDown,
  Users,
  X,
} from "lucide-react";
import api from "../api/axios";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

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

function number(value) {
  const result = Number(value);
  return Number.isFinite(result) ? result.toLocaleString() : "—";
}

function percent(value) {
  const result = Number(value);
  return Number.isFinite(result) ? `${result.toFixed(2)}%` : "—";
}

function downloadCsv(rows) {
  if (!rows.length) return;
  const columns = [
    ["id", "Forecast ID"],
    ["forecast_year", "Year"],
    ["forecast_month", "Month"],
    ["department_id", "Department ID"],
    ["forecast_scope", "Scope"],
    ["predicted_headcount", "Predicted Headcount"],
    ["predicted_attrition_count", "Predicted Attrition Count"],
    ["attrition_rate_percent", "Attrition Rate Percent"],
    ["stability_score", "Stability Score"],
    ["model_version", "Model Version"],
    ["created_at", "Created At"],
  ];
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = [columns.map(([, label]) => escape(label)).join(","), ...rows.map((row) => columns.map(([key]) => escape(row[key])).join(","))].join("\r\n");
  const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "workforce-forecasts.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function Metric({ label, value, hint, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-semibold text-white">{value}</p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <div className="rounded-xl bg-cyan-300/10 p-3 text-cyan-200"><Icon size={19} /></div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-medium text-slate-400">{label}</span>{children}</label>;
}

const inputClass = "w-full rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-300/50";

export default function ForecastingPage() {
  const currentYear = new Date().getFullYear();
  const [forecasts, setForecasts] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [pageError, setPageError] = useState("");
  const [departmentError, setDepartmentError] = useState("");
  const [notice, setNotice] = useState(null);
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [formYear, setFormYear] = useState(String(currentYear));
  const [formMonth, setFormMonth] = useState(String(new Date().getMonth() + 1));
  const [formDepartment, setFormDepartment] = useState("");
  const [generationMode, setGenerationMode] = useState("monthly");
  const [selectedForecast, setSelectedForecast] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setPageError("");
    setDepartmentError("");

    const params = { limit: 200 };
    if (yearFilter) params.forecast_year = Number(yearFilter);
    if (monthFilter) params.forecast_month = Number(monthFilter);
    if (departmentFilter) params.department_id = Number(departmentFilter);

    const [forecastResult, departmentResult] = await Promise.allSettled([
      api.get("/forecasting", { params }),
      api.get("/departments"),
    ]);

    if (forecastResult.status === "fulfilled") {
      setForecasts(Array.isArray(forecastResult.value.data) ? forecastResult.value.data : []);
    } else {
      setPageError(getErrorMessage(forecastResult.reason));
    }

    if (departmentResult.status === "fulfilled") {
      setDepartments(Array.isArray(departmentResult.value.data) ? departmentResult.value.data : []);
    } else {
      setDepartmentError(`Department list could not be loaded: ${getErrorMessage(departmentResult.reason)}`);
    }

    setLoading(false);
    setRefreshing(false);
  }, [yearFilter, monthFilter, departmentFilter]);

  // Fetch the API data when query filters change.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- The effect starts an async request and synchronizes page loading state.
  useEffect(() => { load(); }, [load]);

  const latest = forecasts[0] || null;
  const averageRate = useMemo(() => {
    if (!forecasts.length) return null;
    return forecasts.reduce((sum, item) => sum + Number(item.attrition_rate_percent || 0), 0) / forecasts.length;
  }, [forecasts]);
  const averageStability = useMemo(() => {
    if (!forecasts.length) return null;
    return forecasts.reduce((sum, item) => sum + Number(item.stability_score || 0), 0) / forecasts.length;
  }, [forecasts]);

  async function generateForecast(event) {
    event.preventDefault();
    const year = Number(formYear);
    const month = Number(formMonth);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setNotice({ type: "error", message: "Enter a year between 2000 and 2100." });
      return;
    }
    if (generationMode === "monthly" && (!Number.isInteger(month) || month < 1 || month > 12)) {
      setNotice({ type: "error", message: "Select a valid forecast month." });
      return;
    }

    setGenerating(true);
    setNotice(null);
    try {
      let response;
      const departmentId = formDepartment ? Number(formDepartment) : undefined;
      if (generationMode === "monthly") {
        response = await api.post("/forecasting/generate", {
          forecast_year: year,
          forecast_month: month,
          ...(departmentId ? { department_id: departmentId } : {}),
        });
      } else {
        response = await api.post("/forecasting/generate-year", null, {
          params: { forecast_year: year, ...(departmentId ? { department_id: departmentId } : {}) },
        });
      }
      const generated = response.data;
      setNotice({
        type: "success",
        message: `${generationMode === "monthly" ? "Monthly" : "Yearly"} forecast #${generated?.id ?? ""} generated successfully. Review the assumptions before using it for planning.`,
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-200"><CalendarClock size={14} /> Workforce Intelligence</div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">Workforce Forecasting</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Generate monthly and yearly headcount scenarios from the latest saved employee risk predictions, then review historical forecast records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => load({ quiet: true })} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50"><RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh</button>
          <button onClick={() => downloadCsv(forecasts)} disabled={!forecasts.length} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40"><Download size={16} /> Export CSV</button>
        </div>
      </div>

      {notice ? <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-400/30 bg-rose-400/10 text-rose-100" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"}`}>{notice.message}<button className="ml-3 underline" onClick={() => setNotice(null)}>Dismiss</button></div> : null}
      {pageError ? <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100"><p className="font-semibold">Could not load workforce forecasts</p><p className="mt-1">{pageError}</p><button onClick={() => load()} className="mt-3 underline">Try again</button></div> : null}
      {departmentError ? <p className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs text-amber-100">{departmentError} You can still use company-wide forecasting.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Saved scenarios" value={number(forecasts.length)} hint="Records in the current filter" icon={CalendarClock} />
        <Metric label="Latest projected exits" value={latest ? number(latest.predicted_attrition_count) : "—"} hint={latest ? `${latest.forecast_year} · ${MONTHS[Math.max(0, Math.min(11, Number(latest.forecast_month) - 1))]}` : "Generate a forecast to see a result"} icon={TrendingDown} />
        <Metric label="Average attrition rate" value={averageRate === null ? "—" : percent(averageRate)} hint="Average of the records currently loaded" icon={Activity} />
        <Metric label="Average stability score" value={averageStability === null ? "—" : `${averageStability.toFixed(2)} / 100`} hint="Baseline score; not a probability" icon={Users} />
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="rounded-xl bg-cyan-300/10 p-2.5 text-cyan-200"><CalendarClock size={19} /></span>
          <div><h2 className="font-semibold text-white">Generate forecast</h2><p className="mt-1 text-sm text-slate-400">A forecast requires active employees and saved attrition predictions. Department is optional; leave it blank for the whole company.</p></div>
        </div>
        <form onSubmit={generateForecast} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Scenario type"><select className={inputClass} value={generationMode} onChange={(event) => setGenerationMode(event.target.value)}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></Field>
          <Field label="Forecast year"><input className={inputClass} type="number" min="2000" max="2100" required value={formYear} onChange={(event) => setFormYear(event.target.value)} /></Field>
          {generationMode === "monthly" ? <Field label="Forecast month"><select className={inputClass} value={formMonth} onChange={(event) => setFormMonth(event.target.value)}>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></Field> : <div className="flex items-end pb-2 text-xs text-slate-500">Yearly mode uses December as its saved period.</div>}
          <Field label="Department (optional)"><select className={inputClass} value={formDepartment} onChange={(event) => setFormDepartment(event.target.value)}><option value="">All active departments / Company</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></Field>
          <div className="flex items-end"><button type="submit" disabled={generating} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-wait disabled:opacity-60">{generating ? <LoaderCircle size={16} className="animate-spin" /> : <CalendarClock size={16} />}{generating ? "Generating…" : "Generate scenario"}</button></div>
        </form>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><h2 className="font-semibold text-white">Forecast history</h2><p className="mt-1 text-sm text-slate-400">Review saved scenarios and their model assumptions.</p></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Year"><input className={inputClass} type="number" min="2000" max="2100" placeholder="All years" value={yearFilter} onChange={(event) => setYearFilter(event.target.value)} /></Field>
            <Field label="Month"><select className={inputClass} value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)}><option value="">All months</option>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></Field>
            <Field label="Department"><select className={inputClass} value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></Field>
          </div>
        </div>
        {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><LoaderCircle className="animate-spin" size={18} /> Loading forecasts…</div> : forecasts.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 px-5 py-12 text-center"><Info className="mx-auto text-slate-500" size={22} /><p className="mt-3 text-sm font-semibold text-white">No forecasts found</p><p className="mt-1 text-xs text-slate-500">Generate a scenario or adjust the filters. If generation reports that predictions are missing, create attrition predictions first.</p></div> : (
          <div className="overflow-x-auto rounded-xl border border-white/10"><table className="min-w-full divide-y divide-white/10 text-left text-sm"><thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-400"><tr>{["Period", "Scope", "Predicted headcount", "Projected exits", "Attrition rate", "Stability", "Created", "Details"].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody className="divide-y divide-white/5">{forecasts.map((item) => <tr key={item.id} className="text-slate-300 hover:bg-white/[0.025]"><td className="whitespace-nowrap px-4 py-3"><span className="font-semibold text-white">{MONTHS[Math.max(0, Math.min(11, Number(item.forecast_month) - 1))]} {item.forecast_year}</span><span className="mt-1 block text-xs text-slate-500">ID #{item.id}</span></td><td className="whitespace-nowrap px-4 py-3">{item.forecast_scope || "—"}<span className="mt-1 block text-xs text-slate-500">{item.department_id ? `Department #${item.department_id}` : "Company-wide"}</span></td><td className="px-4 py-3 font-semibold text-white">{number(item.predicted_headcount)}</td><td className="px-4 py-3">{number(item.predicted_attrition_count)}</td><td className="px-4 py-3">{percent(item.attrition_rate_percent)}</td><td className="px-4 py-3">{Number(item.stability_score).toFixed(2)} / 100</td><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{displayDate(item.created_at)}</td><td className="px-4 py-3"><button onClick={() => setSelectedForecast(item)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-white/5">View</button></td></tr>)}</tbody></table></div>
        )}
        <p className="mt-3 text-xs leading-5 text-slate-500">Note: The API labels the current method as a risk-weighted snapshot baseline, not a validated time-series forecast. Review the assumptions and prediction coverage shown in the record details before operational use.</p>
      </section>

      {selectedForecast ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="forecast-details-title" onClick={() => setSelectedForecast(null)}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-cyan-200">Forecast #{selectedForecast.id}</p><h2 id="forecast-details-title" className="mt-1 text-xl font-semibold text-white">{selectedForecast.forecast_year} · {MONTHS[Math.max(0, Math.min(11, Number(selectedForecast.forecast_month) - 1))]}</h2></div><button onClick={() => setSelectedForecast(null)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close details"><X size={18} /></button></div><div className="mt-5 grid gap-3 sm:grid-cols-2">{[["Predicted headcount", number(selectedForecast.predicted_headcount)], ["Projected exits", number(selectedForecast.predicted_attrition_count)], ["Attrition rate", percent(selectedForecast.attrition_rate_percent)], ["Stability score", `${Number(selectedForecast.stability_score).toFixed(2)} / 100`], ["Scope", selectedForecast.forecast_scope], ["Model version", selectedForecast.model_version]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-slate-950/50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-100">{value}</p></div>)}</div><div className="mt-4"><h3 className="text-sm font-semibold text-white">Method and assumptions</h3><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-white/10 bg-slate-950/60 p-4 text-xs leading-5 text-slate-300">{JSON.stringify(selectedForecast.forecast_data || { message: "No forecast data supplied by the API." }, null, 2)}</pre></div><p className="mt-3 text-xs text-slate-500">Created {displayDate(selectedForecast.created_at)} · Created by user #{selectedForecast.created_by ?? "unknown"}</p><button onClick={() => setSelectedForecast(null)} className="mt-5 w-full rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/15">Close</button></div></div> : null}
    </div>
  );
}
