import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import api from "../api/axios";

const INITIAL_FILTERS = {
  action: "",
  entity_type: "",
  actor_user_id: "",
  date_from: "",
  date_to: "",
};

function getErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg).filter(Boolean).join("; ");
  }
  return error?.message || "Unable to load audit logs. Please try again.";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function csvValue(value) {
  let text = value == null ? "" : String(value);
  // Avoid executing spreadsheet formulas when exported values are opened in Excel.
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(rows) {
  if (!rows.length) return;

  const columns = [
    ["id", "ID"],
    ["created_at", "Created At"],
    ["actor_user_id", "Actor User ID"],
    ["action", "Action"],
    ["entity_type", "Entity Type"],
    ["entity_id", "Entity ID"],
    ["details", "Details JSON"],
    ["ip_address", "IP Address"],
    ["user_agent", "User Agent"],
  ];
  const lines = [
    columns.map(([, label]) => csvValue(label)).join(","),
    ...rows.map((row) =>
      columns
        .map(([key]) =>
          csvValue(
            key === "details" && row[key]
              ? JSON.stringify(row[key])
              : row[key]
          )
        )
        .join(",")
    ),
  ];

  const blob = new Blob(["\uFEFF", lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `workforce-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function StatCard({ icon: Icon, label, value, note }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-slate-400">{label}</span>
        <span className="rounded-xl border border-white/10 bg-white/5 p-2 text-cyan-300">
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="grid gap-1 border-b border-white/10 py-3 last:border-b-0 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm text-slate-200">{children}</dd>
    </div>
  );
}

export default function AuditLogsPage() {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState(INITIAL_FILTERS);
  const [limit, setLimit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAuditLogs() {
      setLoading(true);
      setError("");

      const params = { limit, offset };
      if (appliedFilters.action.trim()) {
        params.action = appliedFilters.action.trim().toUpperCase();
      }
      if (appliedFilters.entity_type.trim()) {
        params.entity_type = appliedFilters.entity_type.trim().toUpperCase();
      }
      if (appliedFilters.actor_user_id.trim()) {
        params.actor_user_id = Number(appliedFilters.actor_user_id);
      }
      if (appliedFilters.date_from) {
        params.date_from = `${appliedFilters.date_from}T00:00:00`;
      }
      if (appliedFilters.date_to) {
        params.date_to = `${appliedFilters.date_to}T23:59:59.999999`;
      }

      try {
        const response = await api.get("/audit-logs", { params });
        if (!cancelled) {
          setRows(Array.isArray(response.data) ? response.data : []);
        }
      } catch (requestError) {
        if (!cancelled) {
          setRows([]);
          setError(getErrorMessage(requestError));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAuditLogs();
    return () => {
      cancelled = true;
    };
  }, [appliedFilters, limit, offset, refreshVersion]);

  const pageStats = useMemo(() => {
    const actions = new Set(rows.map((row) => row.action).filter(Boolean));
    const entities = new Set(rows.map((row) => row.entity_type).filter(Boolean));
    const actors = new Set(
      rows.map((row) => row.actor_user_id).filter((value) => value != null)
    );
    return {
      records: rows.length,
      actions: actions.size,
      entities: entities.size,
      actors: actors.size,
    };
  }, [rows]);

  function updateFilter(event) {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  }

  function applyFilters(event) {
    event.preventDefault();
    if (
      filters.date_from &&
      filters.date_to &&
      filters.date_from > filters.date_to
    ) {
      setError("Start date must be on or before the end date.");
      return;
    }
    setError("");
    setOffset(0);
    setAppliedFilters({ ...filters });
  }

  function clearFilters() {
    setFilters(INITIAL_FILTERS);
    setAppliedFilters(INITIAL_FILTERS);
    setOffset(0);
    setError("");
  }

  function changePageSize(event) {
    setLimit(Number(event.target.value));
    setOffset(0);
  }

  const currentPage = Math.floor(offset / limit) + 1;
  const hasPrevious = offset > 0;
  const hasNext = rows.length === limit;

  return (
    <div className="min-h-full space-y-6 bg-slate-950 p-4 text-slate-100 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <ShieldCheck size={15} /> Governance & Compliance
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Audit Logs
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Review recorded changes and administrative actions. Access is restricted to Admin and HR, matching the backend permission policy.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRefreshVersion((value) => value + 1)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => downloadCsv(rows)}
            disabled={!rows.length || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Download size={16} /> Export current page
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
          <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-300" />
          <div className="min-w-0 flex-1">{error}</div>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="rounded p-1 text-rose-200 hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={FileText} label="Records on this page" value={pageStats.records} note={`Page ${currentPage} · ${limit} per page`} />
        <StatCard icon={Activity} label="Action types" value={pageStats.actions} note="Distinct actions on this page" />
        <StatCard icon={ShieldCheck} label="Entity types" value={pageStats.entities} note="Distinct entities on this page" />
        <StatCard icon={Clock3} label="Actors recorded" value={pageStats.actors} note="Distinct actor user IDs on this page" />
      </div>

      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Filter size={17} className="text-cyan-300" />
          <h2 className="text-base font-semibold text-white">Filter audit events</h2>
        </div>
        <form onSubmit={applyFilters} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <label className="block text-xs font-medium text-slate-400">
            Action (exact)
            <input name="action" value={filters.action} onChange={updateFilter} placeholder="UPDATE, CREATE…" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/60" />
          </label>
          <label className="block text-xs font-medium text-slate-400">
            Entity type (exact)
            <input name="entity_type" value={filters.entity_type} onChange={updateFilter} placeholder="EMPLOYEE, LEAVE…" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/60" />
          </label>
          <label className="block text-xs font-medium text-slate-400">
            Actor user ID
            <input name="actor_user_id" type="number" min="1" step="1" value={filters.actor_user_id} onChange={updateFilter} placeholder="User ID" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/60" />
          </label>
          <label className="block text-xs font-medium text-slate-400">
            From date
            <span className="relative mt-2 block">
              <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input name="date_from" type="date" value={filters.date_from} onChange={updateFilter} className="w-full rounded-xl border border-white/10 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-cyan-400/60" />
            </span>
          </label>
          <label className="block text-xs font-medium text-slate-400">
            To date
            <span className="relative mt-2 block">
              <CalendarDays size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input name="date_to" type="date" value={filters.date_to} onChange={updateFilter} className="w-full rounded-xl border border-white/10 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none focus:border-cyan-400/60" />
            </span>
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-5">
            <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-300">
              <Search size={16} /> Apply filters
            </button>
            <button type="button" onClick={clearFilters} className="rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5">
              Clear filters
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
        <div className="flex flex-col gap-3 border-b border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="font-semibold text-white">Recorded events</h2>
            <p className="mt-1 text-xs text-slate-500">The backend returns a paginated list without a total-count field; counts above describe this page only.</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-400">
            Rows per page
            <select value={limit} onChange={changePageSize} className="rounded-lg border border-white/10 bg-slate-950 px-2.5 py-2 text-sm text-white outline-none focus:border-cyan-400/60">
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 px-5 py-16 text-sm text-slate-400">
            <RefreshCw size={18} className="animate-spin text-cyan-300" /> Loading audit records…
          </div>
        ) : error && rows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <AlertCircle size={28} className="mx-auto mb-3 text-rose-300" />
            <p className="font-medium text-white">Audit records could not be loaded</p>
            <p className="mt-2 text-sm text-slate-400">Check your Admin/HR access and backend connection, then refresh.</p>
          </div>
        ) : rows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <Search size={28} className="mx-auto mb-3 text-slate-500" />
            <p className="font-medium text-white">No audit events found</p>
            <p className="mt-2 text-sm text-slate-400">Try clearing filters or selecting a wider date range.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[940px] w-full text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Timestamp</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                  <th className="px-5 py-3 font-semibold">Entity</th>
                  <th className="px-5 py-3 font-semibold">Actor user ID</th>
                  <th className="px-5 py-3 font-semibold">IP address</th>
                  <th className="px-5 py-3 text-right font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {rows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-white/[0.025]">
                    <td className="whitespace-nowrap px-5 py-4 text-slate-300">{formatDate(row.created_at)}</td>
                    <td className="px-5 py-4">
                      <span className="inline-flex rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-2.5 py-1 text-xs font-semibold text-cyan-200">{row.action || "UNKNOWN"}</span>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium text-white">{row.entity_type || "Unknown entity"}</p>
                      <p className="mt-1 text-xs text-slate-500">ID: {row.entity_id ?? "—"}</p>
                    </td>
                    <td className="px-5 py-4 text-slate-300">{row.actor_user_id ?? "System / unknown"}</td>
                    <td className="px-5 py-4 font-mono text-xs text-slate-400">{row.ip_address || "—"}</td>
                    <td className="px-5 py-4 text-right">
                      <button type="button" onClick={() => setSelectedLog(row)} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs font-medium text-slate-200 hover:border-cyan-300/30 hover:bg-cyan-300/5">
                        <Eye size={14} /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-white/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-xs text-slate-500">
            {rows.length ? `Showing ${offset + 1}–${offset + rows.length} on the result set` : "No records on this page"}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={!hasPrevious || loading} onClick={() => setOffset((value) => Math.max(0, value - limit))} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30">
              <ChevronLeft size={16} /> Previous
            </button>
            <span className="min-w-16 text-center text-xs text-slate-400">Page {currentPage}</span>
            <button type="button" disabled={!hasNext || loading} onClick={() => setOffset((value) => value + limit)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30">
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedLog(null);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" className="my-8 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300">Audit event #{selectedLog.id}</p>
                <h2 id="audit-detail-title" className="mt-2 text-xl font-bold text-white">{selectedLog.action} · {selectedLog.entity_type}</h2>
                <p className="mt-1 text-sm text-slate-400">{formatDate(selectedLog.created_at)}</p>
              </div>
              <button type="button" onClick={() => setSelectedLog(null)} aria-label="Close audit detail" className="rounded-xl border border-white/10 p-2 text-slate-300 hover:bg-white/5">
                <X size={18} />
              </button>
            </div>
            <dl className="mt-3">
              <DetailRow label="Actor user ID">{selectedLog.actor_user_id ?? "System / unknown"}</DetailRow>
              <DetailRow label="Entity ID">{selectedLog.entity_id ?? "—"}</DetailRow>
              <DetailRow label="IP address">{selectedLog.ip_address || "—"}</DetailRow>
              <DetailRow label="User agent">{selectedLog.user_agent || "—"}</DetailRow>
              <DetailRow label="Recorded details">
                {selectedLog.details ? (
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-slate-950 p-3 text-xs leading-5 text-slate-300">{JSON.stringify(selectedLog.details, null, 2)}</pre>
                ) : "No additional details were stored for this event."}
              </DetailRow>
            </dl>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={() => setSelectedLog(null)} className="rounded-xl bg-white/10 px-4 py-2.5 text-sm font-medium text-white hover:bg-white/15">Close details</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
