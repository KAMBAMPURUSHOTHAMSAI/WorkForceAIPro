import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock3,
  Database,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import api from "../api/axios";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const MIN_TRAINING_ROWS = 20;

function getErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || JSON.stringify(item)).join("; ");
  }
  if (detail && typeof detail === "object") {
    return detail.message || JSON.stringify(detail);
  }
  return error?.message || "Request failed. Please try again.";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : "—";
}

function formatMetric(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${(number * 100).toFixed(1)}%`;
}

function statusClasses(status) {
  switch (String(status || "").toUpperCase()) {
    case "TRAINED":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
    case "VALIDATED":
      return "border-cyan-400/30 bg-cyan-400/10 text-cyan-200";
    case "TRAINING_FAILED":
    case "FAILED":
      return "border-rose-400/30 bg-rose-400/10 text-rose-200";
    case "UPLOADED":
      return "border-amber-400/30 bg-amber-400/10 text-amber-200";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wide ${statusClasses(status)}`}
    >
      {String(status || "UNKNOWN").replaceAll("_", " ")}
    </span>
  );
}

function MetricCard({ title, value, hint, icon: Icon, tone = "cyan" }) {
  const toneClasses = {
    cyan: "bg-cyan-400/10 text-cyan-200 ring-cyan-300/10",
    violet: "bg-violet-400/10 text-violet-200 ring-violet-300/10",
    emerald: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/10",
    rose: "bg-rose-400/10 text-rose-200 ring-rose-300/10",
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-black/10 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-400">{title}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            {value}
          </p>
          {hint ? <p className="mt-2 text-xs leading-5 text-slate-500">{hint}</p> : null}
        </div>
        <span className={`rounded-xl p-3 ring-1 ${toneClasses[tone] || toneClasses.cyan}`}>
          <Icon size={19} />
        </span>
      </div>
    </div>
  );
}

function SectionHeading({ title, description, icon: Icon, children }) {
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
          {description ? <p className="mt-1 max-w-3xl text-sm leading-5 text-slate-400">{description}</p> : null}
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

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col gap-1 border-b border-white/[0.06] py-3 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="break-words text-sm text-slate-200 sm:max-w-[70%] sm:text-right">
        {value === null || value === undefined || value === "" ? "—" : String(value)}
      </span>
    </div>
  );
}

function downloadCsv(rows, filename) {
  if (!rows.length) return false;
  const columns = ["id", "dataset_version_id", "row_number", "error_message", "row_data", "created_at"];
  const quote = (value) => {
    const text = value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
    return `"${text.replaceAll('"', '""')}"`;
  };
  const content = [
    columns.join(","),
    ...rows.map((row) => columns.map((column) => quote(row[column])).join(",")),
  ].join("\r\n");
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return true;
}

function FailedRecordsModal({ dataset, records, loading, error, onClose, onExport }) {
  const [expandedRecordId, setExpandedRecordId] = useState(null);

  if (!dataset) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-slate-950 shadow-2xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-labelledby="failed-records-title">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div>
            <h2 id="failed-records-title" className="text-lg font-semibold text-white">Failed validation records</h2>
            <p className="mt-1 text-sm text-slate-400">v{dataset.version_number} · {dataset.original_filename}</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onExport} disabled={!records.length || loading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40">
              <Download size={15} /> Export CSV
            </button>
            <button type="button" onClick={onClose} aria-label="Close failed records" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X size={18} /></button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-300"><LoaderCircle className="animate-spin" size={18} /> Loading failed records…</div>
          ) : error ? (
            <div className="rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200">{error}</div>
          ) : records.length === 0 ? (
            <EmptyState title="No failed records" description="This dataset did not return any failed validation records." />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="min-w-[760px] w-full text-left text-sm">
                <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                  <tr><th className="px-4 py-3">CSV row</th><th className="px-4 py-3">Validation error</th><th className="px-4 py-3">Created</th><th className="px-4 py-3 text-right">Row data</th></tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {records.map((record) => (
                    <Fragment key={record.id}>
                      <tr className="align-top hover:bg-white/[0.025]">
                        <td className="px-4 py-3 font-mono text-slate-200">{record.row_number}</td>
                        <td className="max-w-sm px-4 py-3 text-rose-200">{record.error_message || "Validation failed"}</td>
                        <td className="px-4 py-3 text-xs text-slate-400">{formatDate(record.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-200 hover:text-cyan-100" onClick={() => setExpandedRecordId((current) => current === record.id ? null : record.id)}>
                            {expandedRecordId === record.id ? "Hide" : "View"}
                            {expandedRecordId === record.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </td>
                      </tr>
                      {expandedRecordId === record.id ? (
                        <tr key={`${record.id}-details`}><td colSpan={4} className="bg-black/20 px-4 py-3"><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-slate-950 p-3 text-xs leading-5 text-slate-300">{JSON.stringify(record.row_data || {}, null, 2)}</pre></td></tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs leading-5 text-slate-500">CSV row numbers include the header row (the first data row is row 2).</p>
        </div>
      </section>
    </div>
  );
}

export default function DatasetsPage() {
  const [datasets, setDatasets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [targetColumn, setTargetColumn] = useState("Attrition");
  const [uploading, setUploading] = useState(false);
  const [trainingId, setTrainingId] = useState(null);
  const [failedDataset, setFailedDataset] = useState(null);
  const [failedRecords, setFailedRecords] = useState([]);
  const [failedLoading, setFailedLoading] = useState(false);
  const [failedError, setFailedError] = useState("");
  const [detailsExpanded, setDetailsExpanded] = useState(true);

  const loadDatasets = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setPageError("");
    try {
      const response = await api.get("/datasets");
      const rows = Array.isArray(response.data) ? response.data : [];
      setDatasets(rows);
      setSelectedDatasetId((current) => {
        if (rows.some((row) => String(row.id) === String(current))) return current;
        return rows.length ? String(rows[0].id) : "";
      });
    } catch (error) {
      setPageError(getErrorMessage(error));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    api.get("/datasets")
      .then((response) => {
        if (cancelled) return;
        const rows = Array.isArray(response.data) ? response.data : [];
        setDatasets(rows);
        setSelectedDatasetId((current) => {
          if (rows.some((row) => String(row.id) === String(current))) return current;
          return rows.length ? String(rows[0].id) : "";
        });
      })
      .catch((error) => {
        if (!cancelled) setPageError(getErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const selectedDataset = useMemo(
    () => datasets.find((dataset) => String(dataset.id) === String(selectedDatasetId)) || null,
    [datasets, selectedDatasetId]
  );

  const filteredDatasets = useMemo(() => {
    const query = search.trim().toLowerCase();
    return datasets.filter((dataset) => {
      const matchesStatus = statusFilter === "ALL" || String(dataset.status).toUpperCase() === statusFilter;
      const matchesSearch = !query || [dataset.original_filename, dataset.target_column, dataset.version_number, dataset.id]
        .some((value) => String(value ?? "").toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [datasets, search, statusFilter]);

  const totals = useMemo(() => ({
    versions: datasets.length,
    trained: datasets.filter((dataset) => String(dataset.status).toUpperCase() === "TRAINED").length,
    validRows: datasets.reduce((sum, dataset) => sum + Number(dataset.valid_rows || 0), 0),
    failedRows: datasets.reduce((sum, dataset) => sum + Number(dataset.failed_rows || 0), 0),
  }), [datasets]);

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setNotice(null);
    if (!file) {
      setSelectedFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setSelectedFile(null);
      setNotice({ type: "error", text: "Only .csv files are supported by the backend." });
      event.target.value = "";
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setSelectedFile(null);
      setNotice({ type: "error", text: "The file is larger than the 15 MB upload limit." });
      event.target.value = "";
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    setNotice(null);
    if (!selectedFile) {
      setNotice({ type: "error", text: "Choose a CSV file before uploading." });
      return;
    }
    if (!targetColumn.trim()) {
      setNotice({ type: "error", text: "Enter the target column name from your CSV header." });
      return;
    }

    const body = new FormData();
    body.append("file", selectedFile);
    body.append("target_column", targetColumn.trim());
    setUploading(true);
    try {
      const response = await api.post("/datasets/upload", body);
      const result = response.data;
      setSelectedDatasetId(String(result.id));
      setUploadOpen(false);
      setSelectedFile(null);
      setTargetColumn("Attrition");
      event.target.reset();
      setNotice({
        type: "success",
        text: `Dataset v${result.version_number} uploaded and validated: ${formatNumber(result.valid_rows)} valid rows, ${formatNumber(result.failed_rows)} failed rows.`,
      });
      await loadDatasets({ quiet: true });
      setSelectedDatasetId(String(result.id));
    } catch (error) {
      setNotice({ type: "error", text: getErrorMessage(error) });
    } finally {
      setUploading(false);
    }
  };

  const handleTrain = async (dataset) => {
    if (!dataset || Number(dataset.valid_rows || 0) < MIN_TRAINING_ROWS) return;
    const approved = window.confirm(
      `Train the attrition model using dataset v${dataset.version_number} (${dataset.original_filename})? Training runs synchronously and can take some time.`
    );
    if (!approved) return;

    setTrainingId(dataset.id);
    setNotice(null);
    try {
      const response = await api.post(`/datasets/${dataset.id}/train`);
      const result = response.data || {};
      setSelectedDatasetId(String(dataset.id));
      setNotice({
        type: "success",
        text: `${result.message || "Training completed."} ${formatNumber(result.valid_rows)} valid rows used.`,
      });
      await loadDatasets({ quiet: true });
      setSelectedDatasetId(String(dataset.id));
    } catch (error) {
      setNotice({ type: "error", text: getErrorMessage(error) });
      await loadDatasets({ quiet: true });
      setSelectedDatasetId(String(dataset.id));
    } finally {
      setTrainingId(null);
    }
  };

  const showFailedRecords = async (dataset) => {
    setFailedDataset(dataset);
    setFailedRecords([]);
    setFailedError("");
    setFailedLoading(true);
    try {
      const response = await api.get(`/datasets/${dataset.id}/failed-records`);
      setFailedRecords(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setFailedError(getErrorMessage(error));
    } finally {
      setFailedLoading(false);
    }
  };

  const selectedMetrics = selectedDataset?.model_metrics && typeof selectedDataset.model_metrics === "object"
    ? selectedDataset.model_metrics
    : null;
  const validation = selectedDataset?.validation_summary && typeof selectedDataset.validation_summary === "object"
    ? selectedDataset.validation_summary
    : null;

  return (
    <div className="min-h-full space-y-6 pb-8 text-slate-100">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/60 p-5 shadow-xl shadow-black/10 sm:p-7">
        <div className="pointer-events-none absolute -right-8 -top-12 h-56 w-56 rounded-full bg-cyan-400/[0.07] blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-3xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-1.5 text-xs font-semibold text-cyan-100">
              <BrainCircuit size={15} /> ML PIPELINE · DATA QUALITY · MODEL METRICS
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Datasets & Model Training</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Upload a CSV, review validation failures, train the attrition model, and inspect the evaluation metrics saved by the backend.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => loadDatasets({ quiet: true })} disabled={refreshing || loading} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50">
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} /> Refresh
            </button>
            <button type="button" onClick={() => { setUploadOpen((current) => !current); setNotice(null); }} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-lg shadow-cyan-950/30 hover:bg-cyan-200">
              <Upload size={16} /> Upload dataset
            </button>
          </div>
        </div>
        <div className="relative mt-5 flex flex-wrap gap-3 text-xs leading-5 text-slate-400">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-emerald-300" /> Admin / HR only</span>
          <span className="inline-flex items-center gap-1.5"><FileSpreadsheet size={14} className="text-cyan-300" /> CSV only · max 15 MB</span>
          <span className="inline-flex items-center gap-1.5"><BrainCircuit size={14} className="text-violet-300" /> Minimum 20 valid rows to train</span>
        </div>
      </div>

      {notice ? (
        <div className={`flex items-start gap-3 rounded-xl border p-4 ${notice.type === "error" ? "border-rose-400/25 bg-rose-400/[0.06] text-rose-100" : "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-100"}`} role="status">
          {notice.type === "error" ? <AlertCircle className="mt-0.5 shrink-0" size={18} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={18} />}
          <p className="flex-1 text-sm leading-6">{notice.text}</p>
          <button type="button" aria-label="Dismiss message" onClick={() => setNotice(null)} className="rounded p-1 opacity-70 hover:opacity-100"><X size={16} /></button>
        </div>
      ) : null}

      {uploadOpen ? (
        <section className="rounded-2xl border border-cyan-300/20 bg-slate-900/80 p-5 shadow-lg shadow-black/10 sm:p-6">
          <SectionHeading title="Upload and validate a dataset" description="The API validates the selected target column and stores a new dataset version." icon={Upload}>
            <button type="button" onClick={() => { setUploadOpen(false); setSelectedFile(null); }} className="inline-flex items-center gap-2 rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><X size={17} /><span className="text-xs font-semibold">Close</span></button>
          </SectionHeading>
          <form onSubmit={handleUpload} className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
            <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-cyan-200/25 bg-cyan-200/[0.025] px-5 py-6 text-center transition hover:border-cyan-200/50 hover:bg-cyan-200/[0.05]">
              <span className="rounded-xl bg-cyan-300/10 p-3 text-cyan-200"><FileSpreadsheet size={23} /></span>
              <span className="mt-3 text-sm font-semibold text-slate-100">{selectedFile ? selectedFile.name : "Choose a CSV dataset"}</span>
              <span className="mt-1 text-xs text-slate-500">CSV format only · Up to 15 MB</span>
              {selectedFile ? <span className="mt-2 text-xs text-cyan-200">{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB selected</span> : null}
              <input type="file" accept=".csv,text/csv" className="sr-only" onChange={handleFileChange} />
            </label>
            <div className="flex flex-col gap-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-200">Target column</span>
                <input value={targetColumn} onChange={(event) => setTargetColumn(event.target.value)} list="dataset-target-columns" placeholder="e.g. Attrition" required className="w-full rounded-xl border border-white/10 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50 focus:ring-2 focus:ring-cyan-300/10" />
                <datalist id="dataset-target-columns">
                  <option value="Attrition" />
                  <option value="attrition" />
                  <option value="left" />
                  <option value="Exited" />
                </datalist>
                <span className="mt-2 block text-xs leading-5 text-slate-500">Must exactly match a CSV header (case-insensitive). This column is used as the model target.</span>
              </label>
              <div className="rounded-xl border border-white/[0.07] bg-black/15 p-3.5 text-xs leading-5 text-slate-400">
                <p className="flex items-start gap-2"><CircleHelp size={15} className="mt-0.5 shrink-0 text-cyan-200" />Duplicate rows and rows missing the target value are recorded as validation failures. Keep your original file unchanged so you can compare row numbers.</p>
              </div>
              <button type="submit" disabled={uploading || !selectedFile || !targetColumn.trim()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50">
                {uploading ? <LoaderCircle size={17} className="animate-spin" /> : <Upload size={17} />}
                {uploading ? "Uploading and validating…" : "Upload & validate"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Dataset versions" value={formatNumber(totals.versions)} hint="All versions returned by the API" icon={Database} tone="cyan" />
        <MetricCard title="Trained versions" value={formatNumber(totals.trained)} hint="Status is TRAINED" icon={BrainCircuit} tone="violet" />
        <MetricCard title="Valid rows" value={formatNumber(totals.validRows)} hint="Summed across listed versions" icon={CheckCircle2} tone="emerald" />
        <MetricCard title="Failed rows" value={formatNumber(totals.failedRows)} hint="Validation failures across versions" icon={AlertCircle} tone="rose" />
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-lg shadow-black/10 sm:p-6">
        <SectionHeading title="Dataset version history" description="Select a version to inspect validation details and any stored model evaluation metrics." icon={Database}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search file or target" className="w-52 max-w-full rounded-lg border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/40" />
            </label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-lg border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-cyan-300/40">
              <option value="ALL">All statuses</option>
              <option value="VALIDATED">Validated</option>
              <option value="TRAINED">Trained</option>
              <option value="TRAINING_FAILED">Training failed</option>
              <option value="FAILED">Failed</option>
              <option value="UPLOADED">Uploaded</option>
            </select>
          </div>
        </SectionHeading>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-300"><LoaderCircle size={18} className="animate-spin" /> Loading dataset history…</div>
        ) : pageError ? (
          <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-4 text-sm text-rose-200"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 shrink-0" size={17} /><span>{pageError}</span></div><button type="button" onClick={() => loadDatasets()} className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5">Try again</button></div>
        ) : filteredDatasets.length === 0 ? (
          <EmptyState title={datasets.length ? "No matching datasets" : "No datasets uploaded yet"} description={datasets.length ? "Try changing the search text or status filter." : "Upload a CSV dataset to start validation and model training."} />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="px-4 py-3">Version / file</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Rows</th><th className="px-4 py-3">Target column</th><th className="px-4 py-3">Uploaded</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredDatasets.map((dataset) => {
                  const isSelected = String(selectedDatasetId) === String(dataset.id);
                  const canTrain = Number(dataset.valid_rows || 0) >= MIN_TRAINING_ROWS;
                  const isTraining = String(trainingId) === String(dataset.id);
                  return (
                    <tr key={dataset.id} className={`${isSelected ? "bg-cyan-300/[0.045]" : "hover:bg-white/[0.025]"} align-top`}>
                      <td className="px-4 py-3.5">
                        <button type="button" onClick={() => setSelectedDatasetId(String(dataset.id))} className="max-w-[280px] text-left">
                          <span className="block text-xs font-bold text-cyan-200">VERSION {dataset.version_number}</span>
                          <span className="mt-1 block break-words font-semibold text-white">{dataset.original_filename}</span>
                          <span className="mt-1 block text-[11px] text-slate-500">Dataset ID: {dataset.id}</span>
                        </button>
                      </td>
                      <td className="px-4 py-3.5"><StatusBadge status={dataset.status} />{dataset.error_message ? <p className="mt-2 max-w-48 text-xs leading-5 text-rose-300">{dataset.error_message}</p> : null}</td>
                      <td className="px-4 py-3.5">
                        <p className="font-semibold text-slate-100">{formatNumber(dataset.valid_rows)} <span className="font-normal text-slate-500">valid</span></p>
                        <p className="mt-1 text-xs text-slate-500">{formatNumber(dataset.failed_rows)} failed / {formatNumber(dataset.total_rows)} total</p>
                      </td>
                      <td className="px-4 py-3.5"><span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 font-mono text-xs text-slate-200">{dataset.target_column || "—"}</span><p className="mt-2 text-xs text-slate-500">{Array.isArray(dataset.feature_columns) ? `${dataset.feature_columns.length} feature columns` : "Feature columns pending"}</p></td>
                      <td className="whitespace-nowrap px-4 py-3.5 text-xs text-slate-400">{formatDate(dataset.created_at)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap justify-end gap-2">
                          <button type="button" onClick={() => setSelectedDatasetId(String(dataset.id))} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5"><Eye size={14} /> Details</button>
                          <button type="button" onClick={() => showFailedRecords(dataset)} disabled={!Number(dataset.failed_rows || 0)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-35"><FileText size={14} /> Failed rows</button>
                          <button type="button" onClick={() => handleTrain(dataset)} disabled={!canTrain || Boolean(trainingId)} title={canTrain ? "Train model with this dataset" : `At least ${MIN_TRAINING_ROWS} valid rows are required`} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-300 px-2.5 py-2 text-xs font-bold text-slate-950 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40">
                            {isTraining ? <LoaderCircle size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
                            {isTraining ? "Training…" : String(dataset.status).toUpperCase() === "TRAINED" ? "Retrain" : "Train"}
                          </button>
                        </div>
                        {!canTrain ? <p className="mt-2 text-right text-[11px] text-amber-200/80">Needs {Math.max(0, MIN_TRAINING_ROWS - Number(dataset.valid_rows || 0))} more valid rows</p> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-slate-500">The backend returns dataset versions in descending version order. No client-side pagination is applied to this endpoint.</p>
      </section>

      {selectedDataset ? (
        <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-lg shadow-black/10">
          <button type="button" onClick={() => setDetailsExpanded((current) => !current)} className="flex w-full items-center justify-between gap-4 border-b border-white/10 px-5 py-4 text-left sm:px-6">
            <div className="flex items-start gap-3"><span className="mt-0.5 rounded-xl bg-violet-300/10 p-2.5 text-violet-200"><Sparkles size={18} /></span><div><h2 className="text-base font-semibold text-white">Selected version details</h2><p className="mt-1 break-words text-sm text-slate-400">v{selectedDataset.version_number} · {selectedDataset.original_filename}</p></div></div>
            {detailsExpanded ? <ChevronUp size={18} className="shrink-0 text-slate-400" /> : <ChevronDown size={18} className="shrink-0 text-slate-400" />}
          </button>
          {detailsExpanded ? (
            <div className="grid gap-5 p-5 sm:p-6 xl:grid-cols-[0.9fr_1.1fr]">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-slate-100">Validation summary</h3><StatusBadge status={selectedDataset.status} /></div>
                <div className="rounded-xl border border-white/[0.07] bg-black/10 px-4">
                  <InfoRow label="Dataset ID" value={selectedDataset.id} />
                  <InfoRow label="Version" value={selectedDataset.version_number} />
                  <InfoRow label="Original filename" value={selectedDataset.original_filename} />
                  <InfoRow label="Target column" value={selectedDataset.target_column} />
                  <InfoRow label="Total rows" value={formatNumber(selectedDataset.total_rows)} />
                  <InfoRow label="Valid rows" value={formatNumber(selectedDataset.valid_rows)} />
                  <InfoRow label="Failed rows" value={formatNumber(selectedDataset.failed_rows)} />
                  <InfoRow label="Uploaded by user ID" value={selectedDataset.uploaded_by} />
                  <InfoRow label="Created at" value={formatDate(selectedDataset.created_at)} />
                </div>
                {validation ? (
                  <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-4">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Validation details</p>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(validation).map(([key, value]) => (
                        <div key={key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"><p className="text-[11px] capitalize text-slate-500">{key.replaceAll("_", " ")}</p><p className="mt-1 break-words text-sm font-semibold text-slate-100">{typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "—")}</p></div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {Array.isArray(selectedDataset.feature_columns) && selectedDataset.feature_columns.length ? (
                  <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/10 p-4">
                    <p className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-400">Feature columns ({selectedDataset.feature_columns.length})</p>
                    <div className="flex flex-wrap gap-2">{selectedDataset.feature_columns.map((column) => <span key={column} className="rounded-md border border-white/10 bg-white/[0.035] px-2 py-1 font-mono text-[11px] text-slate-300">{column}</span>)}</div>
                  </div>
                ) : <div className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-xs leading-5 text-slate-500">Feature columns will be available after the backend validates or trains this dataset.</div>}
              </div>

              <div>
                <SectionHeading title="Model evaluation" description="Metrics below are returned by the backend after model training. No metrics are estimated in the browser." icon={BrainCircuit} />
                {selectedMetrics ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <MetricCard title="Accuracy" value={formatMetric(selectedMetrics.accuracy)} hint="Correct predictions on held-out rows" icon={CheckCircle2} tone="emerald" />
                      <MetricCard title="Precision" value={formatMetric(selectedMetrics.precision)} hint="Positive predictions that were correct" icon={ShieldCheck} tone="cyan" />
                      <MetricCard title="Recall" value={formatMetric(selectedMetrics.recall)} hint="Actual positive cases identified" icon={Eye} tone="violet" />
                      <MetricCard title="F1 score" value={formatMetric(selectedMetrics.f1_score)} hint="Precision / recall harmonic mean" icon={Sparkles} tone="cyan" />
                    </div>
                    <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/10 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-slate-500">ROC-AUC</p><p className="mt-1 text-2xl font-semibold text-white">{formatMetric(selectedMetrics.roc_auc)}</p></div><div className="text-right"><p className="text-xs text-slate-500">Model version</p><p className="mt-1 break-all text-sm font-semibold text-slate-200">{selectedMetrics.model_version || "—"}</p></div></div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-lg bg-white/[0.03] p-3"><p className="text-xs text-slate-500">Training rows</p><p className="mt-1 text-lg font-semibold text-white">{formatNumber(selectedMetrics.training_rows)}</p></div>
                        <div className="rounded-lg bg-white/[0.03] p-3"><p className="text-xs text-slate-500">Testing rows</p><p className="mt-1 text-lg font-semibold text-white">{formatNumber(selectedMetrics.testing_rows)}</p></div>
                      </div>
                      {selectedMetrics.class_distribution ? <div className="mt-4"><p className="mb-2 text-xs font-semibold text-slate-400">Target class distribution</p><pre className="overflow-auto rounded-lg border border-white/[0.06] bg-slate-950 p-3 text-xs leading-5 text-slate-300">{JSON.stringify(selectedMetrics.class_distribution, null, 2)}</pre></div> : null}
                      {selectedMetrics.target_mapping ? <div className="mt-3"><p className="mb-2 text-xs font-semibold text-slate-400">Target label mapping</p><pre className="overflow-auto rounded-lg border border-white/[0.06] bg-slate-950 p-3 text-xs leading-5 text-slate-300">{JSON.stringify(selectedMetrics.target_mapping, null, 2)}</pre></div> : null}
                      {selectedMetrics.artifact ? <p className="mt-3 break-all text-[11px] text-slate-500">Model artifact: {selectedMetrics.artifact}</p> : null}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-white/10 px-5 py-12 text-center">
                    <BrainCircuit size={27} className="mx-auto text-slate-600" />
                    <p className="mt-3 text-sm font-semibold text-slate-200">No trained model metrics for this version</p>
                    <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-slate-500">After at least 20 valid rows are available, use Train to execute model training on the backend. The saved evaluation metrics will appear here.</p>
                    <button type="button" onClick={() => handleTrain(selectedDataset)} disabled={Number(selectedDataset.valid_rows || 0) < MIN_TRAINING_ROWS || Boolean(trainingId)} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-violet-300 px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-40"><BrainCircuit size={15} /> Train selected dataset</button>
                  </div>
                )}
                {selectedDataset.error_message ? <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-4 text-sm text-rose-200"><span className="font-semibold">Backend message:</span> {selectedDataset.error_message}</div> : null}
                <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300/15 bg-amber-300/[0.04] p-3 text-xs leading-5 text-slate-400"><Clock3 size={15} className="mt-0.5 shrink-0 text-amber-200" />Training runs synchronously on the API request. A larger dataset or model fit can take time; avoid closing this page until the request completes.</div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      <div className="flex items-start gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-xs leading-5 text-slate-500"><Info size={15} className="mt-0.5 shrink-0 text-slate-400" /><p>The backend accepts CSV files up to 15 MB and validates named, unique columns, row limits, duplicates and missing target values. Training requires at least 20 valid rows. The displayed model metrics are test-set evaluation results from the backend implementation and should be interpreted as model estimates, not guarantees.</p></div>

      <FailedRecordsModal
        key={failedDataset?.id ?? "no-failed-dataset"}
        dataset={failedDataset}
        records={failedRecords}
        loading={failedLoading}
        error={failedError}
        onClose={() => setFailedDataset(null)}
        onExport={() => {
          const ok = downloadCsv(failedRecords, `dataset-v${failedDataset?.version_number || ""}-failed-records.csv`);
          if (!ok) setNotice({ type: "error", text: "There are no failed records to export." });
        }}
      />
    </div>
  );
}
