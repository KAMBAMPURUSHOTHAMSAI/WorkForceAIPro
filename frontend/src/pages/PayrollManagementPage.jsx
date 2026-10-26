import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Eye,
  FilePlus2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import api from "../api/axios";

const CURRENT_DATE = new Date();
const DEFAULT_YEAR = CURRENT_DATE.getFullYear();
const DEFAULT_MONTH = CURRENT_DATE.getMonth() + 1;
const PAGE_SIZES = [10, 20, 50, 100];
const PAYROLL_STATUSES = ["GENERATED", "APPROVED", "PAID"];

const INITIAL_GENERATE_FORM = {
  employee_id: "",
  period_year: String(DEFAULT_YEAR),
  period_month: String(DEFAULT_MONTH),
  allowances: "0.00",
  bonus: "0.00",
  tax_deduction: "0.00",
  other_deductions: "0.00",
};

function errorMessage(error, fallback = "The request could not be completed.") {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || "Invalid input").join(". ");
  }
  if (!error?.response) {
    return `${fallback} Check that the backend is running. ${error?.message || ""}`.trim();
  }
  return fallback;
}

function money(value) {
  if (value === null || value === undefined || value === "") return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function monthName(month) {
  const number = Number(month);
  if (!Number.isInteger(number) || number < 1 || number > 12) return "—";
  return new Date(2000, number - 1, 1).toLocaleString("en-IN", { month: "long" });
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function statusStyle(status) {
  if (status === "PAID") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-300";
  if (status === "APPROVED") return "border-blue-400/20 bg-blue-400/10 text-blue-300";
  return "border-amber-400/20 bg-amber-400/10 text-amber-300";
}

function Field({ label, children, hint }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="block text-xs leading-5 text-slate-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-60";

function SummaryCard({ icon: Icon, label, value, footnote }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 break-words text-xl font-bold text-white sm:text-2xl">{value}</p>
          {footnote && <p className="mt-1 text-xs text-slate-500">{footnote}</p>}
        </div>
        <div className="rounded-xl bg-cyan-300/10 p-2.5 text-cyan-300">
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function Modal({ title, eyebrow, onClose, children, wide = false }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:items-center sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className={`my-auto w-full ${wide ? "max-w-3xl" : "max-w-xl"} rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl`}>
        <header className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4 sm:px-6">
          <div>
            {eyebrow && <p className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">{eyebrow}</p>}
            <h2 className="mt-1 text-lg font-semibold text-white">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><X size={19} /></button>
        </header>
        <div className="p-5 sm:p-6">{children}</div>
      </section>
    </div>
  );
}

export default function PayrollManagementPage() {
  const [filters, setFilters] = useState({
    period_year: String(DEFAULT_YEAR),
    period_month: String(DEFAULT_MONTH),
    employee_id: "",
    status: "",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [notice, setNotice] = useState("");
  const [workingId, setWorkingId] = useState(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState(INITIAL_GENERATE_FORM);
  const [editRecord, setEditRecord] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [detailsRecord, setDetailsRecord] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visibleFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const visibleTo = Math.min(page * pageSize, total);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    setSummaryError("");

    const params = { page, page_size: pageSize };
    if (filters.period_year) params.period_year = Number(filters.period_year);
    if (filters.period_month) params.period_month = Number(filters.period_month);
    if (filters.employee_id.trim()) params.employee_id = Number(filters.employee_id);
    if (filters.status) params.status = filters.status;

    const summaryParams = {};
    if (filters.period_year) summaryParams.period_year = Number(filters.period_year);
    if (filters.period_month) summaryParams.period_month = Number(filters.period_month);

    const [listResult, summaryResult] = await Promise.allSettled([
      api.get("/payroll", { params }),
      summaryParams.period_year && summaryParams.period_month
        ? api.get("/payroll/summary", { params: summaryParams })
        : Promise.resolve(null),
    ]);

    if (listResult.status === "fulfilled") {
      const payload = listResult.value.data;
      const records = Array.isArray(payload) ? payload : payload?.items;
      setItems(Array.isArray(records) ? records : []);
      const loadedTotal = Number(payload?.total ?? (Array.isArray(records) ? records.length : 0));
      setTotal(loadedTotal);
      const lastPage = Math.max(1, Math.ceil(loadedTotal / pageSize));
      if (page > lastPage) setPage(lastPage);
    } else {
      setItems([]);
      setTotal(0);
      setError(errorMessage(listResult.reason, "Unable to load payroll records."));
    }

    if (summaryResult?.status === "fulfilled") {
      setSummary(summaryResult.value?.data ?? null);
    } else if (summaryResult?.status === "rejected") {
      setSummary(null);
      setSummaryError(errorMessage(summaryResult.reason, "Payroll summary is unavailable."));
    } else {
      setSummary(null);
    }

    setLoading(false);
  }, [filters, page, pageSize]);

  useEffect(() => {
    // Defer the data request to a microtask so the effect only coordinates
    // the async fetch lifecycle and does not synchronously cascade renders.
    Promise.resolve().then(() => loadData());
  }, [loadData]);

  function updateFilter(name, value) {
    setFilters((current) => ({ ...current, [name]: value }));
    setPage(1);
    setNotice("");
  }

  async function handleGenerate(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    const employeeId = Number(generateForm.employee_id);
    const year = Number(generateForm.period_year);
    const month = Number(generateForm.period_month);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      setError("Employee ID must be a positive number. Use the Employee ID, not the User ID.");
      return;
    }
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      setError("Period year must be from 2000 to 2100.");
      return;
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      setError("Period month must be from 1 to 12.");
      return;
    }

    const moneyFields = ["allowances", "bonus", "tax_deduction", "other_deductions"];
    for (const field of moneyFields) {
      if (!Number.isFinite(Number(generateForm[field])) || Number(generateForm[field]) < 0) {
        setError(`${field.replaceAll("_", " ")} must be zero or greater.`);
        return;
      }
    }

    setWorkingId("generate");
    try {
      await api.post("/payroll/generate", {
        employee_id: employeeId,
        period_year: year,
        period_month: month,
        allowances: Number(generateForm.allowances || 0),
        bonus: Number(generateForm.bonus || 0),
        tax_deduction: Number(generateForm.tax_deduction || 0),
        other_deductions: Number(generateForm.other_deductions || 0),
      });
      setGenerateOpen(false);
      setGenerateForm({ ...INITIAL_GENERATE_FORM, period_year: String(year), period_month: String(month) });
      setFilters({ period_year: String(year), period_month: String(month), employee_id: String(employeeId), status: "" });
      setPage(1);
      setNotice(`Payroll generated successfully for Employee #${employeeId}, ${year}-${String(month).padStart(2, "0")}.`);
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to generate payroll."));
    } finally {
      setWorkingId(null);
    }
  }

  function beginEdit(record) {
    setEditRecord(record);
    setEditForm({
      allowances: String(record.allowances ?? 0),
      bonus: String(record.bonus ?? 0),
      tax_deduction: String(record.tax_deduction ?? 0),
      other_deductions: String(record.other_deductions ?? 0),
    });
    setError("");
    setNotice("");
  }

  async function handleUpdate(event) {
    event.preventDefault();
    if (!editRecord || !editForm) return;
    setError("");
    setNotice("");

    const payload = {};
    for (const field of ["allowances", "bonus", "tax_deduction", "other_deductions"]) {
      const value = Number(editForm[field]);
      if (!Number.isFinite(value) || value < 0) {
        setError(`${field.replaceAll("_", " ")} must be zero or greater.`);
        return;
      }
      payload[field] = value;
    }

    setWorkingId(editRecord.id);
    try {
      await api.patch(`/payroll/${editRecord.id}`, payload);
      setEditRecord(null);
      setEditForm(null);
      setNotice(`Payroll record #${editRecord.id} updated successfully.`);
      await loadData();
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to update payroll amounts."));
    } finally {
      setWorkingId(null);
    }
  }

  async function runRecordAction(record, action) {
    setError("");
    setNotice("");
    setWorkingId(record.id);
    try {
      const endpoint = action === "approve"
        ? `/payroll/${record.id}/approve`
        : `/payroll/${record.id}/mark-paid`;
      await api.post(endpoint);
      setNotice(action === "approve"
        ? `Payroll record #${record.id} approved.`
        : `Payroll record #${record.id} marked as paid.`);
      await loadData();
    } catch (requestError) {
      setError(errorMessage(requestError, `Unable to ${action === "approve" ? "approve" : "mark as paid"} payroll.`));
    } finally {
      setWorkingId(null);
    }
  }

  async function downloadPayslip(record) {
    setError("");
    setNotice("");
    setDownloadingId(record.id);
    try {
      const response = await api.get(`/payroll/${record.id}/payslip`, { responseType: "blob" });
      const contentType = response.headers?.["content-type"] || "application/pdf";
      const blob = new Blob([response.data], { type: contentType });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `payslip-${record.id}-${record.period_year}-${String(record.period_month).padStart(2, "0")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setNotice(`Payslip for payroll #${record.id} downloaded.`);
    } catch (requestError) {
      setError(errorMessage(requestError, "Unable to download the payslip."));
    } finally {
      setDownloadingId(null);
    }
  }

  const statusCounts = useMemo(() => ({
    generated: Number(summary?.generated_count ?? items.filter((item) => item.status === "GENERATED").length),
    approved: Number(summary?.approved_count ?? items.filter((item) => item.status === "APPROVED").length),
    paid: Number(summary?.paid_count ?? items.filter((item) => item.status === "PAID").length),
  }), [summary, items]);

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 text-white sm:px-6 lg:px-8">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-300">Workforce Management</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Payroll Management</h1>
          <p className="mt-2 text-sm text-slate-400">Generate, adjust, approve and pay employee payroll records. Download official payslips.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => { setGenerateForm(INITIAL_GENERATE_FORM); setGenerateOpen(true); setError(""); setNotice(""); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">
            <FilePlus2 size={17} /> Generate Payroll
          </button>
          <button type="button" onClick={loadData} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:border-slate-500 disabled:opacity-50">
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
      </header>

      {error && <div role="alert" className="break-words rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
      {notice && <div role="status" className="break-words rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200">{notice}</div>}
      {summaryError && <div role="status" className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">Payroll summary unavailable: {summaryError}</div>}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={Banknote} label="Net Pay · Selected Period" value={money(summary?.net_pay)} footnote={summary ? `${summary.employee_count ?? 0} payroll records` : "Summary loads for a selected year and month"} />
        <SummaryCard icon={CircleDollarSign} label="Gross Pay" value={money(summary?.gross_pay)} footnote={`Deductions: ${money(summary?.total_deductions)}`} />
        <SummaryCard icon={BadgeCheck} label="Approved" value={statusCounts.approved} footnote="Ready to mark as paid" />
        <SummaryCard icon={Banknote} label="Paid" value={statusCounts.paid} footnote={`${statusCounts.generated} generated and awaiting approval`} />
      </section>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2"><Search size={17} className="text-cyan-300" /><h2 className="text-sm font-semibold text-white">Filter payroll records</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="Period year">
            <input className={inputClass} type="number" min="2000" max="2100" value={filters.period_year} onChange={(event) => updateFilter("period_year", event.target.value)} />
          </Field>
          <Field label="Period month">
            <select className={inputClass} value={filters.period_month} onChange={(event) => updateFilter("period_month", event.target.value)}>
              <option value="">All months</option>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{String(month).padStart(2, "0")} — {monthName(month)}</option>)}
            </select>
          </Field>
          <Field label="Employee ID" hint="Employee ID, not linked User ID">
            <input className={inputClass} type="number" min="1" placeholder="All employees" value={filters.employee_id} onChange={(event) => updateFilter("employee_id", event.target.value)} />
          </Field>
          <Field label="Payroll status">
            <select className={inputClass} value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}>
              <option value="">All statuses</option>
              {PAYROLL_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </Field>
          <Field label="Rows per page">
            <select className={inputClass} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size} records</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
        <div className="flex flex-col justify-between gap-2 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <div>
            <h2 className="font-semibold text-white">Payroll records</h2>
            <p className="mt-1 text-xs text-slate-400">{loading ? "Loading records…" : `${visibleFrom}–${visibleTo} of ${total} records · Page ${page} of ${totalPages}`}</p>
          </div>
          <p className="text-xs text-slate-500">Generate → Adjust → Approve → Mark Paid</p>
        </div>

        {loading ? (
          <div className="space-y-3 p-5"><div className="h-9 animate-pulse rounded-lg bg-white/5" /><div className="h-14 animate-pulse rounded-lg bg-white/5" /><div className="h-14 animate-pulse rounded-lg bg-white/5" /></div>
        ) : items.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <CircleDollarSign size={28} className="mx-auto text-slate-500" />
            <p className="mt-3 font-semibold text-white">No payroll records found</p>
            <p className="mt-1 text-sm text-slate-400">Change the filters or generate payroll for an active employee.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <thead className="bg-slate-800/80 text-[11px] uppercase tracking-wide text-slate-300">
                <tr>{["ID / Employee", "Period", "Base / Allowances", "Gross Pay", "Deductions", "Net Pay", "Status", "Actions"].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {items.map((record) => (
                  <tr key={record.id} className="transition hover:bg-white/[0.025]">
                    <td className="px-4 py-4"><p className="font-semibold text-white">#{record.id}</p><p className="mt-1 text-xs text-slate-400">Employee #{record.employee_id}</p></td>
                    <td className="px-4 py-4"><p className="font-medium text-white">{monthName(record.period_month)} {record.period_year}</p><p className="mt-1 text-xs text-slate-500">Created {formatDate(record.created_at)}</p></td>
                    <td className="px-4 py-4"><p className="text-white">Monthly {money(record.monthly_base_salary)}</p><p className="mt-1 text-xs text-slate-400">Allowances {money(record.allowances)}</p></td>
                    <td className="px-4 py-4 font-semibold text-white">{money(record.gross_pay)}</td>
                    <td className="px-4 py-4 text-slate-300">{money(record.total_deductions)}</td>
                    <td className="px-4 py-4 font-bold text-emerald-300">{money(record.net_pay)}</td>
                    <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold ${statusStyle(record.status)}`}>{record.status}</span>{record.paid_at && <p className="mt-1 text-[11px] text-slate-500">Paid {formatDate(record.paid_at)}</p>}</td>
                    <td className="px-4 py-4"><div className="flex flex-wrap items-center gap-1.5">
                      <button type="button" title="View payroll details" aria-label={`View payroll ${record.id}`} onClick={() => setDetailsRecord(record)} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-slate-500 hover:text-white"><Eye size={15} /></button>
                      {record.status === "GENERATED" && <button type="button" disabled={workingId === record.id} onClick={() => beginEdit(record)} className="rounded-lg border border-cyan-400/20 bg-cyan-400/5 px-2.5 py-2 text-xs font-semibold text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-50">Adjust</button>}
                      {record.status === "GENERATED" && <button type="button" disabled={workingId === record.id} onClick={() => runRecordAction(record, "approve")} className="rounded-lg border border-blue-400/20 bg-blue-400/5 px-2.5 py-2 text-xs font-semibold text-blue-200 hover:bg-blue-400/10 disabled:opacity-50">Approve</button>}
                      {record.status === "APPROVED" && <button type="button" disabled={workingId === record.id} onClick={() => runRecordAction(record, "mark-paid")} className="rounded-lg border border-emerald-400/20 bg-emerald-400/5 px-2.5 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-400/10 disabled:opacity-50">Mark Paid</button>}
                      <button type="button" disabled={downloadingId === record.id} onClick={() => downloadPayslip(record)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-2 text-xs font-semibold text-slate-200 hover:border-slate-500 disabled:opacity-50">{downloadingId === record.id ? <RefreshCw size={13} className="animate-spin" /> : <Download size={13} />} PDF</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex flex-col justify-between gap-3 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
          <p className="text-xs text-slate-400">Showing {visibleFrom}–{visibleTo} of {total}</p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={loading || page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-40"><ChevronLeft size={15} /> Previous</button>
            <span className="min-w-20 text-center text-xs text-slate-400">Page {page} / {totalPages}</span>
            <button type="button" disabled={loading || page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 disabled:opacity-40">Next <ChevronRight size={15} /></button>
          </div>
        </footer>
      </section>

      {generateOpen && <Modal title="Generate payroll" eyebrow="New payroll record" onClose={() => { if (workingId !== "generate") setGenerateOpen(false); }}>
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-3 text-xs leading-5 text-cyan-100">Enter the <strong>Employee ID</strong> from Employee Management. Payroll uses the employee's saved annual base salary.</div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Employee ID *"><input className={inputClass} type="number" min="1" required value={generateForm.employee_id} onChange={(event) => setGenerateForm((current) => ({ ...current, employee_id: event.target.value }))} placeholder="e.g. 2" /></Field>
            <Field label="Period year *"><input className={inputClass} type="number" min="2000" max="2100" required value={generateForm.period_year} onChange={(event) => setGenerateForm((current) => ({ ...current, period_year: event.target.value }))} /></Field>
            <Field label="Period month *"><select className={inputClass} required value={generateForm.period_month} onChange={(event) => setGenerateForm((current) => ({ ...current, period_month: event.target.value }))}>{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{String(month).padStart(2, "0")} — {monthName(month)}</option>)}</select></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[...["allowances", "bonus", "tax_deduction", "other_deductions"].map((field) => ({ field, label: field.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }))].map(({ field, label }) => <Field key={field} label={label}><input className={inputClass} type="number" min="0" step="0.01" required value={generateForm[field]} onChange={(event) => setGenerateForm((current) => ({ ...current, [field]: event.target.value }))} /></Field>)}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
            <button type="button" disabled={workingId === "generate"} onClick={() => setGenerateOpen(false)} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={workingId === "generate"} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">{workingId === "generate" && <RefreshCw size={15} className="animate-spin" />}{workingId === "generate" ? "Generating…" : "Generate payroll"}</button>
          </div>
        </form>
      </Modal>}

      {editRecord && editForm && <Modal title={`Adjust payroll #${editRecord.id}`} eyebrow="Generated records only" onClose={() => { if (workingId !== editRecord.id) { setEditRecord(null); setEditForm(null); } }}>
        <form onSubmit={handleUpdate} className="space-y-4">
          <p className="text-sm leading-6 text-slate-400">Only payroll records with status GENERATED can be adjusted. Gross pay, deductions and net pay are recalculated by the backend.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {[...["allowances", "bonus", "tax_deduction", "other_deductions"].map((field) => ({ field, label: field.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) }))].map(({ field, label }) => <Field key={field} label={label}><input className={inputClass} type="number" min="0" step="0.01" required value={editForm[field]} onChange={(event) => setEditForm((current) => ({ ...current, [field]: event.target.value }))} /></Field>)}
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
            <button type="button" disabled={workingId === editRecord.id} onClick={() => { setEditRecord(null); setEditForm(null); }} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-300 hover:bg-white/5 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={workingId === editRecord.id} className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50">{workingId === editRecord.id ? "Saving…" : "Save adjustments"}</button>
          </div>
        </form>
      </Modal>}

      {detailsRecord && <Modal title={`Payroll record #${detailsRecord.id}`} eyebrow="Payroll breakdown" wide onClose={() => setDetailsRecord(null)}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-slate-300">Employee #{detailsRecord.employee_id} · {monthName(detailsRecord.period_month)} {detailsRecord.period_year}</p><p className="mt-1 text-xs text-slate-500">Created {formatDate(detailsRecord.created_at)}</p></div><span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusStyle(detailsRecord.status)}`}>{detailsRecord.status}</span></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[["Annual base salary", detailsRecord.annual_base_salary], ["Monthly base salary", detailsRecord.monthly_base_salary], ["Allowances", detailsRecord.allowances], ["Bonus / incentives", detailsRecord.bonus], ["Gross pay", detailsRecord.gross_pay], ["Tax deduction", detailsRecord.tax_deduction], ["Other deductions", detailsRecord.other_deductions], ["Total deductions", detailsRecord.total_deductions], ["Net pay", detailsRecord.net_pay], ["Generated by user", detailsRecord.generated_by ?? "—"], ["Paid at", detailsRecord.paid_at ? formatDate(detailsRecord.paid_at) : "Not paid"]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.025] p-3"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 break-words font-semibold text-white">{["Generated by user", "Paid at"].includes(label) ? value : money(value)}</p></div>)}
        </div>
        <div className="mt-5 flex justify-end"><button type="button" onClick={() => downloadPayslip(detailsRecord)} disabled={downloadingId === detailsRecord.id} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-semibold text-white hover:border-slate-500 disabled:opacity-50"><Download size={16} /> Download payslip PDF</button></div>
      </Modal>}
    </main>
  );
}
