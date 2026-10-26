import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Download,
  FileText,
  RefreshCw,
  Wallet,
  X,
} from "lucide-react";

import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

function money(value) {
  const amount = Number(value ?? 0);
  return currencyFormatter.format(Number.isFinite(amount) ? amount : 0);
}

function apiMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).filter(Boolean).join("; ") || fallback;
  }
  return error?.message || fallback;
}

function periodLabel(record) {
  const month = Math.min(12, Math.max(1, Number(record?.period_month) || 1));
  const date = new Date(Number(record?.period_year) || new Date().getFullYear(), month - 1, 1);
  return date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function statusClasses(status) {
  if (status === "PAID") {
    return "border-emerald-400/25 bg-emerald-400/10 text-emerald-200";
  }
  if (status === "APPROVED") {
    return "border-cyan-400/25 bg-cyan-400/10 text-cyan-200";
  }
  return "border-amber-400/25 bg-amber-400/10 text-amber-200";
}

export default function MyPayrollPage() {
  const { user } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedYear, setSelectedYear] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedRecord, setSelectedRecord] = useState(null);

  const loadPayroll = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);

    try {
      const response = await api.get("/payroll/me");
      setError("");
      setSuccess("");
      setRecords(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setRecords([]);
      setError(apiMessage(requestError, "Unable to load your payroll records."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      loadPayroll();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [loadPayroll]);

  const years = useMemo(
    () => [...new Set(records.map((record) => String(record.period_year)))].sort((a, b) => Number(b) - Number(a)),
    [records]
  );

  const filteredRecords = useMemo(
    () => records.filter((record) => {
      const matchesYear = selectedYear === "all" || String(record.period_year) === selectedYear;
      const matchesStatus = selectedStatus === "all" || record.status === selectedStatus;
      return matchesYear && matchesStatus;
    }),
    [records, selectedYear, selectedStatus]
  );

  const totals = useMemo(() => {
    const paidRecords = records.filter((record) => record.status === "PAID");
    return {
      count: records.length,
      paidCount: paidRecords.length,
      paidNet: paidRecords.reduce((sum, record) => sum + Number(record.net_pay || 0), 0),
      latestNet: records.length ? Number(records[0].net_pay || 0) : 0,
    };
  }, [records]);

  async function downloadPayslip(record) {
    const privileged = ["ADMIN", "HR"].includes(user?.role);
    if (!privileged && !["APPROVED", "PAID"].includes(record.status)) {
      setError("Your payslip will be available after HR approves this payroll.");
      return;
    }

    setDownloadingId(record.id);
    setError("");
    setSuccess("");

    try {
      const response = await api.get(`/payroll/${record.id}/payslip`, {
        responseType: "blob",
      });
      const blobUrl = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" })
      );
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = `payslip-${record.period_year}-${String(record.period_month).padStart(2, "0")}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
      setSuccess(`Payslip for ${periodLabel(record)} downloaded.`);
    } catch (requestError) {
      // A Blob response may contain the API's error message; keep a useful fallback.
      setError(apiMessage(requestError, "Unable to download the payslip. Please try again."));
    } finally {
      setDownloadingId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-300">
        <RefreshCw size={18} className="animate-spin text-cyan-300" />
        Loading your payslips...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-slate-100">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-semibold tracking-[0.16em] text-cyan-300">EMPLOYEE SELF SERVICE</p>
          <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">My Payslips</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            View your personal payroll history, understand deductions, and download approved payslips.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadPayroll(true)}
          disabled={refreshing}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-200 hover:border-cyan-400/40 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh records
        </button>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-400/25 bg-rose-400/[0.08] p-4 text-sm text-rose-100">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-300" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/[0.08] p-4 text-sm text-emerald-100">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-300" />
          <span>{success}</span>
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={FileText} label="Payroll records" value={String(totals.count)} helper="All available periods" />
        <SummaryCard icon={CheckCircle2} label="Paid periods" value={String(totals.paidCount)} helper="Marked paid by HR" />
        <SummaryCard icon={Wallet} label="Total net paid" value={money(totals.paidNet)} helper="Paid records only" />
        <SummaryCard icon={CircleDollarSign} label="Latest net pay" value={money(totals.latestNet)} helper={records[0] ? periodLabel(records[0]) : "No payroll yet"} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.09] bg-slate-900/70 shadow-xl shadow-black/10">
        <div className="flex flex-col gap-4 border-b border-white/[0.07] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Payroll history</h2>
            <p className="mt-1 text-xs text-slate-400">{filteredRecords.length} of {records.length} record(s)</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative block">
              <span className="sr-only">Filter by year</span>
              <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                value={selectedYear}
                onChange={(event) => setSelectedYear(event.target.value)}
                className="w-full appearance-none rounded-xl border border-white/10 bg-slate-950 py-2.5 pl-9 pr-9 text-sm text-slate-200 outline-none focus:border-cyan-400 sm:w-40"
              >
                <option value="all">All years</option>
                {years.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            </label>
            <label className="relative block">
              <span className="sr-only">Filter by payroll status</span>
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                className="w-full appearance-none rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 pr-9 text-sm text-slate-200 outline-none focus:border-cyan-400 sm:w-44"
              >
                <option value="all">All statuses</option>
                <option value="GENERATED">Generated</option>
                <option value="APPROVED">Approved</option>
                <option value="PAID">Paid</option>
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
            </label>
          </div>
        </div>

        {records.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
              <Wallet size={25} />
            </div>
            <h3 className="mt-4 text-base font-semibold text-white">No payroll records yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">
              Your payroll records will appear here after HR generates payroll for your linked employee profile.
            </p>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-slate-400">No payroll records match the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead className="bg-slate-950/70 text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-4 font-medium">Pay period</th>
                  <th className="px-5 py-4 font-medium">Gross pay</th>
                  <th className="px-5 py-4 font-medium">Deductions</th>
                  <th className="px-5 py-4 font-medium">Net pay</th>
                  <th className="px-5 py-4 font-medium">Status</th>
                  <th className="px-5 py-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredRecords.map((record) => {
                  const canDownload = ["APPROVED", "PAID"].includes(record.status) || ["ADMIN", "HR"].includes(user?.role);
                  const isDownloading = downloadingId === record.id;
                  return (
                    <tr key={record.id} className="transition hover:bg-white/[0.025]">
                      <td className="px-5 py-4">
                        <p className="font-semibold text-white">{periodLabel(record)}</p>
                        <p className="mt-1 text-xs text-slate-500">Payroll #{record.id}</p>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-slate-300">{money(record.gross_pay)}</td>
                      <td className="px-5 py-4 whitespace-nowrap text-slate-300">{money(record.total_deductions)}</td>
                      <td className="px-5 py-4 whitespace-nowrap font-semibold text-emerald-200">{money(record.net_pay)}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${statusClasses(record.status)}`}>
                          {record.status || "UNKNOWN"}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedRecord(record)}
                            className="rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-300 hover:border-cyan-400/40 hover:text-white"
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadPayslip(record)}
                            disabled={!canDownload || isDownloading}
                            title={canDownload ? "Download PDF payslip" : "Payslip becomes available after approval"}
                            className="inline-flex items-center gap-2 rounded-lg bg-cyan-300 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                          >
                            {isDownloading ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                            PDF
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
        <Clock3 size={15} className="mt-0.5 shrink-0" />
        Payslips are available after payroll approval. If an amount or period looks incorrect, contact your HR/payroll team.
      </p>

      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedRecord(null);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="payroll-detail-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.15em] text-cyan-300">PAYROLL BREAKDOWN</p>
                <h2 id="payroll-detail-title" className="mt-2 text-xl font-semibold text-white">{periodLabel(selectedRecord)}</h2>
                <p className="mt-1 text-xs text-slate-400">Payroll record #{selectedRecord.id}</p>
              </div>
              <button type="button" onClick={() => setSelectedRecord(null)} aria-label="Close payroll details" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white">
                <X size={19} />
              </button>
            </div>
            <div className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.08] bg-slate-950/70 p-4">
              <div>
                <p className="text-xs text-slate-400">Net pay</p>
                <p className="mt-1 text-2xl font-semibold text-emerald-200">{money(selectedRecord.net_pay)}</p>
              </div>
              <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${statusClasses(selectedRecord.status)}`}>{selectedRecord.status}</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <DetailRow label="Annual base salary" value={money(selectedRecord.annual_base_salary)} />
              <DetailRow label="Monthly base salary" value={money(selectedRecord.monthly_base_salary)} />
              <DetailRow label="Allowances" value={money(selectedRecord.allowances)} />
              <DetailRow label="Bonus / incentives" value={money(selectedRecord.bonus)} />
              <DetailRow label="Gross pay" value={money(selectedRecord.gross_pay)} />
              <DetailRow label="Tax deduction" value={money(selectedRecord.tax_deduction)} />
              <DetailRow label="Other deductions" value={money(selectedRecord.other_deductions)} />
              <DetailRow label="Total deductions" value={money(selectedRecord.total_deductions)} />
              <DetailRow label="Generated on" value={selectedRecord.created_at ? new Date(selectedRecord.created_at).toLocaleDateString("en-IN") : "—"} />
              <DetailRow label="Paid on" value={selectedRecord.paid_at ? new Date(selectedRecord.paid_at).toLocaleDateString("en-IN") : "Not marked paid"} />
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setSelectedRecord(null)} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">Close</button>
              <button
                type="button"
                disabled={downloadingId === selectedRecord.id || (!["APPROVED", "PAID"].includes(selectedRecord.status) && !["ADMIN", "HR"].includes(user?.role))}
                onClick={() => downloadPayslip(selectedRecord)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                <Download size={16} /> Download PDF
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, helper }) {
  return (
    <article className="rounded-2xl border border-white/[0.08] bg-slate-900/65 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400">{label}</p>
          <p className="mt-3 break-words text-2xl font-semibold text-white">{value}</p>
          <p className="mt-2 text-xs text-slate-500">{helper}</p>
        </div>
        <span className="rounded-xl bg-cyan-300/10 p-3 text-cyan-300"><Icon size={20} /></span>
      </div>
    </article>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3.5">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-slate-100">{value}</p>
    </div>
  );
}
