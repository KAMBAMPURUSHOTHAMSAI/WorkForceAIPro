import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  Info,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import api from "../api/axios";

const RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function percent(value, alreadyPercent = false) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  const normalized = alreadyPercent ? numeric : numeric * 100;
  return `${normalized.toFixed(1)}%`;
}

function errorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    return detail.message || JSON.stringify(detail);
  }
  return error?.message || "Request failed. Please try again.";
}

function riskClasses(level) {
  switch (String(level || "").toUpperCase()) {
    case "CRITICAL":
      return "border-rose-400/30 bg-rose-400/10 text-rose-200";
    case "HIGH":
      return "border-orange-400/30 bg-orange-400/10 text-orange-200";
    case "MEDIUM":
      return "border-amber-400/30 bg-amber-400/10 text-amber-200";
    case "LOW":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

function RiskBadge({ level }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide ${riskClasses(level)}`}
    >
      {String(level || "UNKNOWN").toUpperCase()}
    </span>
  );
}

function MetricCard({ label, value, hint, icon: Icon, tone = "cyan" }) {
  const tones = {
    cyan: "bg-cyan-400/10 text-cyan-200 ring-cyan-300/10",
    rose: "bg-rose-400/10 text-rose-200 ring-rose-300/10",
    amber: "bg-amber-400/10 text-amber-200 ring-amber-300/10",
    violet: "bg-violet-400/10 text-violet-200 ring-violet-300/10",
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-5 shadow-lg shadow-black/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-white">{value}</p>
          {hint ? <p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p> : null}
        </div>
        <div className={`rounded-xl p-3 ring-1 ${tones[tone] || tones.cyan}`}>
          <Icon size={19} />
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title, description, icon: Icon, children }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon ? (
          <span className="mt-0.5 rounded-xl bg-white/[0.05] p-2.5 text-cyan-200 ring-1 ring-white/10">
            <Icon size={18} />
          </span>
        ) : null}
        <div>
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-400">{description}</p> : null}
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 px-5 py-10 text-center">
      <Info size={22} className="mx-auto text-slate-500" />
      <p className="mt-3 text-sm font-medium text-slate-200">{title}</p>
      <p className="mx-auto mt-1 max-w-lg text-xs leading-5 text-slate-500">{description}</p>
    </div>
  );
}

function getDatasetLabel(dataset) {
  return `v${dataset.version_number ?? dataset.id} · ${dataset.original_filename || `Dataset ${dataset.id}`}`;
}

export default function AttritionAnalyticsPage() {
  const [datasets, setDatasets] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [predictionTotal, setPredictionTotal] = useState(0);
  const [monitoring, setMonitoring] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [sectionErrors, setSectionErrors] = useState({});
  const [notice, setNotice] = useState(null);
  const [riskFilter, setRiskFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedPrediction, setSelectedPrediction] = useState(null);
  const [datasetId, setDatasetId] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [features, setFeatures] = useState({});
  const [predicting, setPredicting] = useState(false);
  const [predictionResult, setPredictionResult] = useState(null);
  const initializedDatasetId = useRef("");

  const trainedDatasets = useMemo(
    () => datasets.filter((dataset) => String(dataset.status).toUpperCase() === "TRAINED"),
    [datasets]
  );

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => String(dataset.id) === String(datasetId)) || null,
    [datasets, datasetId]
  );

  const featureColumns = useMemo(
    () => (Array.isArray(selectedDataset?.feature_columns) ? selectedDataset.feature_columns : []),
    [selectedDataset]
  );

  const loadDashboard = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setPageError("");
    setSectionErrors({});

    const requests = await Promise.allSettled([
      api.get("/datasets"),
      api.get("/attrition/predictions", {
        params: {
          page,
          page_size: 20,
          ...(riskFilter ? { risk_level: riskFilter } : {}),
          ...(employeeFilter ? { employee_id: Number(employeeFilter) } : {}),
        },
      }),
      api.get("/attrition/monitoring", {
        params: {
          limit: 100,
          ...(riskFilter ? { risk_level: riskFilter } : {}),
          ...(employeeFilter ? { employee_id: Number(employeeFilter) } : {}),
        },
      }),
      api.get("/attrition/analytics/departments"),
      api.get("/employees", {
        params: { page: 1, page_size: 100, employment_status: "ACTIVE" },
      }),
    ]);

    const nextErrors = {};
    const [datasetResponse, predictionResponse, monitoringResponse, departmentResponse, employeeResponse] = requests;

    if (datasetResponse.status === "fulfilled") {
      const rows = Array.isArray(datasetResponse.value.data) ? datasetResponse.value.data : [];
      setDatasets(rows);
      setDatasetId((current) => {
        if (rows.some((row) => String(row.id) === String(current) && String(row.status).toUpperCase() === "TRAINED")) return current;
        return String(rows.find((row) => String(row.status).toUpperCase() === "TRAINED")?.id || "");
      });
    } else {
      nextErrors.datasets = errorMessage(datasetResponse.reason);
    }

    if (predictionResponse.status === "fulfilled") {
      setPredictions(Array.isArray(predictionResponse.value.data?.items) ? predictionResponse.value.data.items : []);
      setPredictionTotal(Number(predictionResponse.value.data?.total || 0));
    } else {
      nextErrors.predictions = errorMessage(predictionResponse.reason);
      setPredictions([]);
      setPredictionTotal(0);
    }

    if (monitoringResponse.status === "fulfilled") {
      setMonitoring(Array.isArray(monitoringResponse.value.data) ? monitoringResponse.value.data : []);
    } else {
      nextErrors.monitoring = errorMessage(monitoringResponse.reason);
      setMonitoring([]);
    }

    if (departmentResponse.status === "fulfilled") {
      setDepartments(Array.isArray(departmentResponse.value.data) ? departmentResponse.value.data : []);
    } else {
      nextErrors.departments = errorMessage(departmentResponse.reason);
      setDepartments([]);
    }

    if (employeeResponse.status === "fulfilled") {
      setEmployees(Array.isArray(employeeResponse.value.data?.items) ? employeeResponse.value.data.items : []);
    } else {
      nextErrors.employees = errorMessage(employeeResponse.reason);
      setEmployees([]);
    }

    setSectionErrors(nextErrors);
    const allFailed = requests.every((item) => item.status === "rejected");
    if (allFailed) {
      setPageError("Unable to load the attrition workspace. Check the API server and your HR/Admin access, then retry.");
    }
    setLoading(false);
    setRefreshing(false);
  }, [employeeFilter, page, riskFilter]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (!cancelled) void loadDashboard();
    });
    return () => {
      cancelled = true;
    };
  }, [loadDashboard]);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return;
      const normalizedDatasetId = String(datasetId || "");
      if (!normalizedDatasetId) {
        initializedDatasetId.current = "";
        setFeatures({});
        return;
      }
      if (initializedDatasetId.current === normalizedDatasetId) return;

      const dataset = datasets.find((item) => String(item.id) === normalizedDatasetId);
      if (!dataset) return;

      initializedDatasetId.current = normalizedDatasetId;
      const nextFeatures = {};
      for (const column of dataset.feature_columns || []) nextFeatures[column] = "";
      setFeatures(nextFeatures);
      setPredictionResult(null);
    });
    return () => {
      cancelled = true;
    };
  }, [datasetId, datasets]);

  const filteredPredictions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return predictions;
    return predictions.filter((item) => {
      const text = [item.id, item.employee_id, item.dataset_version_id, item.risk_level, item.model_version]
        .filter((value) => value !== null && value !== undefined)
        .join(" ")
        .toLowerCase();
      return text.includes(query);
    });
  }, [predictions, search]);

  const summary = useMemo(() => {
    const total = predictionTotal;
    const counts = predictions.reduce((result, item) => {
      const level = String(item.risk_level || "UNKNOWN").toUpperCase();
      result[level] = (result[level] || 0) + 1;
      return result;
    }, {});
    return {
      total,
      highCritical: (counts.HIGH || 0) + (counts.CRITICAL || 0),
      critical: counts.CRITICAL || 0,
      trained: trainedDatasets.length,
      visiblePredictions: predictions.length,
    };
  }, [predictionTotal, predictions, trainedDatasets.length]);

  async function handlePredict(event) {
    event.preventDefault();
    setNotice(null);
    setPredictionResult(null);

    if (!selectedDataset || String(selectedDataset.status).toUpperCase() !== "TRAINED") {
      setNotice({ type: "error", message: "Select a trained dataset before running a prediction." });
      return;
    }
    if (!featureColumns.length) {
      setNotice({ type: "error", message: "The selected trained dataset does not have registered feature columns." });
      return;
    }

    const payloadFeatures = {};
    for (const column of featureColumns) {
      const value = features[column];
      payloadFeatures[column] = value === undefined || String(value).trim() === "" ? null : value;
    }

    setPredicting(true);
    try {
      const response = await api.post("/attrition/predict", {
        dataset_version_id: Number(datasetId),
        employee_id: employeeId ? Number(employeeId) : null,
        features: payloadFeatures,
      });
      setPredictionResult(response.data);
      setNotice({
        type: "success",
        message: `Prediction #${response.data?.id ?? "—"} was saved successfully.`,
      });
      await loadDashboard({ quiet: true });
    } catch (error) {
      setNotice({ type: "error", message: errorMessage(error) });
    } finally {
      setPredicting(false);
    }
  }

  const maxPages = Math.max(1, Math.ceil(predictionTotal / 20));

  return (
    <div className="min-h-full space-y-6 pb-8 text-slate-100">
      <header className="relative overflow-hidden rounded-3xl border border-cyan-300/15 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/70 p-6 shadow-xl shadow-black/20 sm:p-8">
        <div className="pointer-events-none absolute -right-8 -top-16 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              <BrainCircuit size={14} /> AI WORKFORCE INTELLIGENCE
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Attrition Predictions & Analytics</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Review saved model predictions, monitor changes in employee risk, compare department-level signals, and run predictions with a trained dataset.
            </p>
            <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-slate-400">
              <Info size={14} className="mt-0.5 shrink-0" /> Risk scores are model estimates, not proof of intent or a basis for automated employment decisions. Review context fairly and involve a human decision-maker.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadDashboard({ quiet: true })}
            disabled={refreshing || loading}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh data"}
          </button>
        </div>
      </header>

      {pageError ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-rose-400/25 bg-rose-400/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-rose-100"><AlertTriangle size={17} className="mt-0.5 shrink-0" />{pageError}</p>
          <button type="button" onClick={() => loadDashboard()} className="rounded-lg border border-rose-300/25 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-300/10">Retry</button>
        </div>
      ) : null}

      {notice ? (
        <div className={`flex items-start justify-between gap-3 rounded-xl border p-4 text-sm ${notice.type === "success" ? "border-emerald-300/20 bg-emerald-300/10 text-emerald-100" : "border-rose-300/20 bg-rose-300/10 text-rose-100"}`}>
          <span className="flex items-start gap-2">{notice.type === "success" ? <CheckCircle2 size={17} className="mt-0.5 shrink-0" /> : <AlertTriangle size={17} className="mt-0.5 shrink-0" />}{notice.message}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message"><X size={16} /></button>
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Saved predictions" value={loading ? "…" : summary.total.toLocaleString()} hint={`${summary.visiblePredictions} currently loaded in this view`} icon={Activity} tone="cyan" />
        <MetricCard label="High / critical on page" value={loading ? "…" : summary.highCritical} hint="From the currently loaded prediction page" icon={ShieldAlert} tone="rose" />
        <MetricCard label="Critical on page" value={loading ? "…" : summary.critical} hint="Review the underlying record and context" icon={AlertTriangle} tone="amber" />
        <MetricCard label="Trained models" value={loading ? "…" : summary.trained} hint="Dataset versions whose status is TRAINED" icon={Database} tone="violet" />
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
        <SectionHeader
          title="Run an attrition prediction"
          description="Choose a TRAINED dataset. The form uses that version's registered feature columns and sends them to the trained model endpoint."
          icon={Sparkles}
        />
        {sectionErrors.datasets ? <p className="mb-3 text-xs text-rose-200">Dataset API: {sectionErrors.datasets}</p> : null}
        {trainedDatasets.length === 0 ? (
          <EmptyState title="No trained dataset available" description="Upload a CSV dataset from Datasets, validate it, and train the model before running predictions here." />
        ) : (
          <form onSubmit={handlePredict} className="space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-slate-300">Trained dataset version <span className="text-rose-300">*</span></span>
                <select value={datasetId} onChange={(event) => setDatasetId(event.target.value)} required className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-cyan-300/50">
                  {trainedDatasets.map((dataset) => <option key={dataset.id} value={dataset.id}>{getDatasetLabel(dataset)}</option>)}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-2 block font-medium text-slate-300">Link to employee ID (optional)</span>
                <input type="number" min="1" step="1" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} placeholder="Enter an active employee ID" className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" />
                <span className="mt-1 block text-xs leading-5 text-slate-500">Leave empty for a general prediction. The API validates the employee record and allows predictions only for active employees.</span>
              </label>
            </div>

            {selectedDataset?.model_metrics ? (
              <div className="grid gap-3 rounded-xl border border-cyan-300/10 bg-cyan-300/[0.04] p-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Model version", selectedDataset.model_metrics.model_version || `Dataset ${selectedDataset.id}`],
                  ["Accuracy", percent(selectedDataset.model_metrics.accuracy)],
                  ["F1 score", percent(selectedDataset.model_metrics.f1_score)],
                  ["ROC-AUC", percent(selectedDataset.model_metrics.roc_auc)],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 truncate text-sm font-semibold text-slate-100" title={String(value)}>{value}</p></div>
                ))}
              </div>
            ) : null}

            {featureColumns.length === 0 ? (
              <EmptyState title="No registered model features" description="The selected dataset doesn't expose feature columns. Check the dataset and retrain it if appropriate." />
            ) : (
              <div>
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div><h3 className="text-sm font-semibold text-white">Model input features</h3><p className="mt-1 text-xs text-slate-500">Enter values that match the dataset's feature format. Leave a field blank only when a missing value is appropriate.</p></div>
                  <span className="text-xs text-slate-500">{featureColumns.length} feature{featureColumns.length === 1 ? "" : "s"}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {featureColumns.map((column) => (
                    <label key={column} className="block min-w-0 text-sm">
                      <span className="mb-1.5 block truncate font-medium text-slate-300" title={column}>{column}</span>
                      <input
                        type="text"
                        value={features[column] ?? ""}
                        onChange={(event) => setFeatures((current) => ({ ...current, [column]: event.target.value }))}
                        placeholder={`Enter ${column}`}
                        className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50"
                        autoComplete="off"
                      />
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex flex-col gap-3 border-t border-white/[0.08] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-xs leading-5 text-slate-500">The model will reject mismatched feature names or incompatible numeric values. A linked employee prediction also creates a risk-monitoring record; high-risk results may create alerts for HR/Admin.</p>
              <button type="submit" disabled={predicting || !datasetId || !featureColumns.length} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-300 px-5 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
                {predicting ? <RefreshCw size={16} className="animate-spin" /> : <BrainCircuit size={17} />}
                {predicting ? "Running model…" : "Run prediction"}
              </button>
            </div>
          </form>
        )}

        {predictionResult ? (
          <div className="mt-5 rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.06] p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-cyan-100/70">Latest result · Prediction #{predictionResult.id}</p><div className="mt-2 flex flex-wrap items-center gap-3"><RiskBadge level={predictionResult.risk_level} /><span className="text-sm text-slate-200">{predictionResult.predicted_attrition ? "Model predicted attrition" : "Model did not predict attrition"}</span></div></div>
              <div className="grid grid-cols-2 gap-5 sm:min-w-[240px]"><div><p className="text-xs text-slate-500">Risk probability</p><p className="mt-1 text-xl font-semibold text-white">{percent(predictionResult.risk_probability)}</p></div><div><p className="text-xs text-slate-500">Confidence proxy</p><p className="mt-1 text-xl font-semibold text-white">{percent(predictionResult.confidence_score)}</p></div></div>
            </div>
            <p className="mt-3 break-all text-xs text-slate-500">Model: {predictionResult.model_version} · Saved {formatDate(predictionResult.created_at)}</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
        <SectionHeader title="Department risk overview" description="Aggregated from each employee's latest saved prediction per department, as returned by the backend analytics endpoint." icon={TrendingUp} />
        {sectionErrors.departments ? <p className="mb-3 text-xs text-rose-200">Department analytics: {sectionErrors.departments}</p> : null}
        {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading department analytics…</p> : departments.length === 0 ? <EmptyState title="No department analytics yet" description="This view appears when departments have employees with saved attrition predictions." /> : (
          <div className="space-y-4">
            {departments.map((department) => {
              const risk = Number(department.average_risk_percent || 0);
              return (
                <div key={department.department_id} className="grid gap-2 md:grid-cols-[minmax(150px,1.1fr)_minmax(160px,2fr)_auto] md:items-center md:gap-5">
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-200">{department.department_name}</p><p className="mt-1 text-xs text-slate-500">{department.employees_with_predictions || 0} employees with predictions</p></div>
                  <div><div className="mb-1.5 flex justify-between text-xs"><span className="text-slate-500">Average risk</span><span className="font-semibold text-slate-200">{percent(risk, true)}</span></div><div className="h-2 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-rose-400" style={{ width: `${Math.max(0, Math.min(100, risk))}%` }} /></div></div>
                  <div className="text-left md:text-right"><p className="text-sm font-semibold text-white">{department.predicted_attrition_count || 0}</p><p className="text-[11px] text-slate-500">Predicted attrition</p></div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
        <SectionHeader title="Saved predictions" description="Browse historical model results. Probability and confidence values are displayed as percentages; confidence is a model confidence proxy, not a guarantee." icon={BrainCircuit}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative block"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search visible records" className="w-full rounded-xl border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40 sm:w-52" /></label>
            <select value={riskFilter} onChange={(event) => { setPage(1); setRiskFilter(event.target.value); }} className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none focus:border-cyan-300/40"><option value="">All risk levels</option>{RISK_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}</select>
            <input type="number" min="1" step="1" value={employeeFilter} onChange={(event) => { setPage(1); setEmployeeFilter(event.target.value); }} placeholder="Employee ID" aria-label="Filter by employee ID" className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40 sm:w-32" />
          </div>
        </SectionHeader>
        {sectionErrors.predictions ? <p className="mb-3 text-xs text-rose-200">Predictions API: {sectionErrors.predictions}</p> : null}
        {loading ? <p className="py-10 text-center text-sm text-slate-500">Loading saved predictions…</p> : filteredPredictions.length === 0 ? <EmptyState title="No matching predictions" description="Run a prediction, clear filters, or choose another risk level or employee." /> : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="min-w-[820px] w-full text-left text-sm">
              <thead className="bg-white/[0.035] text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Prediction</th><th className="px-4 py-3 font-semibold">Employee</th><th className="px-4 py-3 font-semibold">Risk</th><th className="px-4 py-3 font-semibold">Probability</th><th className="px-4 py-3 font-semibold">Predicted attrition</th><th className="px-4 py-3 font-semibold">Saved at</th><th className="px-4 py-3 text-right font-semibold">Details</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredPredictions.map((item) => {
                  const employee = employees.find((record) => record.id === item.employee_id);
                  const employeeName = employee ? `${employee.first_name} ${employee.last_name}` : item.employee_id ? `Employee #${item.employee_id}` : "Unlinked prediction";
                  return <tr key={item.id} className="transition hover:bg-white/[0.025]"><td className="px-4 py-3.5"><p className="font-semibold text-white">#{item.id}</p><p className="mt-1 text-[11px] text-slate-500">Dataset {item.dataset_version_id ?? "—"}</p></td><td className="px-4 py-3.5"><p className="text-slate-200">{employeeName}</p>{employee ? <p className="mt-1 text-[11px] text-slate-500">{employee.employee_code}</p> : null}</td><td className="px-4 py-3.5"><RiskBadge level={item.risk_level} /></td><td className="px-4 py-3.5 font-semibold text-slate-200">{percent(item.risk_probability)}</td><td className="px-4 py-3.5"><span className={`rounded-lg px-2 py-1 text-xs ${item.predicted_attrition ? "bg-rose-400/10 text-rose-200" : "bg-emerald-400/10 text-emerald-200"}`}>{item.predicted_attrition ? "Yes" : "No"}</span></td><td className="px-4 py-3.5 text-xs text-slate-400">{formatDate(item.created_at)}</td><td className="px-4 py-3.5 text-right"><button type="button" onClick={() => setSelectedPrediction(item)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-cyan-300/30 hover:text-cyan-100">View</button></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-4 flex flex-col gap-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Page {page} of {maxPages} · {predictionTotal.toLocaleString()} matching records returned by API</span>
          <div className="flex items-center gap-2"><button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-slate-300 hover:bg-white/5 disabled:opacity-40"><ChevronLeft size={14} /> Previous</button><button type="button" disabled={page >= maxPages || loading} onClick={() => setPage((value) => Math.min(maxPages, value + 1))} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-slate-300 hover:bg-white/5 disabled:opacity-40">Next <ChevronRight size={14} /></button></div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
        <SectionHeader title="Risk monitoring history" description="Risk-monitoring entries are created when a prediction is linked to an employee profile." icon={Clock3} />
        {sectionErrors.monitoring ? <p className="mb-3 text-xs text-rose-200">Monitoring API: {sectionErrors.monitoring}</p> : null}
        {loading ? <p className="py-8 text-center text-sm text-slate-500">Loading monitoring history…</p> : monitoring.length === 0 ? <EmptyState title="No risk changes recorded" description="After a prediction is run with an employee linked, monitoring history can appear here." /> : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.08]"><table className="min-w-[760px] w-full text-left text-sm"><thead className="bg-white/[0.035] text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Detected</th><th className="px-4 py-3 font-semibold">Employee</th><th className="px-4 py-3 font-semibold">Previous</th><th className="px-4 py-3 font-semibold">Current</th><th className="px-4 py-3 font-semibold">Change</th><th className="px-4 py-3 font-semibold">Risk</th><th className="px-4 py-3 font-semibold">Reason</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{monitoring.slice(0, 50).map((item) => <tr key={item.id || `${item.employee_id}-${item.detected_at}`} className="hover:bg-white/[0.025]"><td className="px-4 py-3 text-xs text-slate-400">{formatDate(item.detected_at)}</td><td className="px-4 py-3 text-slate-200">{employees.find((record) => record.id === item.employee_id)?.employee_code || `Employee #${item.employee_id}`}</td><td className="px-4 py-3 text-slate-300">{item.previous_risk_percent == null ? "First score" : percent(item.previous_risk_percent, true)}</td><td className="px-4 py-3 font-semibold text-white">{percent(item.current_risk_percent, true)}</td><td className={`px-4 py-3 font-medium ${Number(item.risk_change_percent || 0) > 0 ? "text-rose-200" : Number(item.risk_change_percent || 0) < 0 ? "text-emerald-200" : "text-slate-400"}`}>{item.risk_change_percent == null ? "—" : `${Number(item.risk_change_percent) > 0 ? "+" : ""}${Number(item.risk_change_percent).toFixed(2)} pp`}</td><td className="px-4 py-3"><RiskBadge level={item.risk_level} /></td><td className="max-w-[240px] px-4 py-3 text-xs text-slate-400">{item.reason || "—"}</td></tr>)}</tbody></table></div>
        )}
      </section>

      {selectedPrediction ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setSelectedPrediction(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="prediction-detail-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wide text-slate-500">Saved model output</p><h2 id="prediction-detail-title" className="mt-1 text-lg font-semibold text-white">Prediction #{selectedPrediction.id}</h2></div><button type="button" onClick={() => setSelectedPrediction(null)} aria-label="Close prediction details" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X size={18} /></button></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xs text-slate-500">Risk level</p><div className="mt-2"><RiskBadge level={selectedPrediction.risk_level} /></div></div><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xs text-slate-500">Probability / confidence proxy</p><p className="mt-2 font-semibold text-white">{percent(selectedPrediction.risk_probability)} / {percent(selectedPrediction.confidence_score)}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xs text-slate-500">Prediction output</p><p className="mt-2 font-semibold text-white">{selectedPrediction.predicted_attrition ? "Attrition predicted" : "Attrition not predicted"}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-xs text-slate-500">Model version</p><p className="mt-2 break-all text-sm text-slate-200">{selectedPrediction.model_version || "—"}</p></div></div>
            <div className="mt-4"><p className="mb-2 text-sm font-semibold text-slate-200">Input features</p><pre className="max-h-72 overflow-auto rounded-xl border border-white/10 bg-slate-950 p-4 text-xs leading-5 text-slate-300">{JSON.stringify(selectedPrediction.input_features || {}, null, 2)}</pre></div>
            <p className="mt-3 text-xs text-slate-500">Saved {formatDate(selectedPrediction.created_at)} · Dataset {selectedPrediction.dataset_version_id ?? "—"} · Employee {selectedPrediction.employee_id ?? "not linked"}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
