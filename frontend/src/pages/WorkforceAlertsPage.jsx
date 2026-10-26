import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  CheckCheck,
  Clock3,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  XCircle,
} from "lucide-react";

import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

const STATUS_OPTIONS = ["ALL", "NEW", "ACKNOWLEDGED", "RESOLVED"];
const PRIORITY_OPTIONS = ["ALL", "CRITICAL", "HIGH", "NORMAL", "LOW"];

function getErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const message = detail.map((item) => item?.msg).filter(Boolean).join("; ");
    if (message) return message;
  }
  return error?.message || fallback;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalized(value) {
  return String(value || "").trim().toUpperCase();
}

function statusStyle(status) {
  switch (normalized(status)) {
    case "NEW":
      return "border-rose-300/20 bg-rose-300/10 text-rose-200";
    case "ACKNOWLEDGED":
      return "border-amber-300/20 bg-amber-300/10 text-amber-200";
    case "RESOLVED":
      return "border-emerald-300/20 bg-emerald-300/10 text-emerald-200";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

function priorityStyle(priority) {
  switch (normalized(priority)) {
    case "CRITICAL":
      return "border-rose-300/25 bg-rose-400/10 text-rose-200";
    case "HIGH":
      return "border-orange-300/25 bg-orange-400/10 text-orange-200";
    case "NORMAL":
      return "border-cyan-300/20 bg-cyan-300/10 text-cyan-100";
    case "LOW":
      return "border-slate-300/15 bg-white/5 text-slate-300";
    default:
      return "border-white/10 bg-white/5 text-slate-300";
  }
}

function canManageAlert(alert, user) {
  if (normalized(user?.role) === "ADMIN") return true;
  if (
    user?.id != null &&
    alert?.recipient_user_id != null &&
    Number(user.id) === Number(alert.recipient_user_id)
  ) {
    return true;
  }
  return normalized(user?.role) === "HR" && alert?.recipient_user_id == null;
}

function MetricCard({ label, value, helper, icon: Icon, tone = "cyan" }) {
  const tones = {
    cyan: "border-cyan-300/15 bg-cyan-300/[0.06] text-cyan-200",
    rose: "border-rose-300/15 bg-rose-300/[0.06] text-rose-200",
    amber: "border-amber-300/15 bg-amber-300/[0.06] text-amber-200",
    emerald: "border-emerald-300/15 bg-emerald-300/[0.06] text-emerald-200",
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{helper}</p>
        </div>
        <div className={`rounded-xl border p-2.5 ${tones[tone] || tones.cyan}`}>
          <Icon size={19} />
        </div>
      </div>
    </div>
  );
}

export default function WorkforceAlertsPage() {
  const { user } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [busyAction, setBusyAction] = useState("");

  const loadAlerts = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    setError("");

    try {
      const response = await api.get("/alerts", {
        params: { limit: 100 },
      });
      setAlerts(Array.isArray(response.data) ? response.data : []);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not load workforce alerts."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    api.get("/alerts", { params: { limit: 100 } })
      .then((response) => {
        if (active) {
          setAlerts(Array.isArray(response.data) ? response.data : []);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(getErrorMessage(requestError, "Could not load workforce alerts."));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const totals = useMemo(() => {
    return alerts.reduce(
      (result, alert) => {
        const status = normalized(alert.status);
        if (status === "NEW") result.newCount += 1;
        else if (status === "ACKNOWLEDGED") result.acknowledgedCount += 1;
        else if (status === "RESOLVED") result.resolvedCount += 1;
        if (["CRITICAL", "HIGH"].includes(normalized(alert.priority)) && status !== "RESOLVED") {
          result.highPriorityCount += 1;
        }
        return result;
      },
      { newCount: 0, acknowledgedCount: 0, resolvedCount: 0, highPriorityCount: 0 }
    );
  }, [alerts]);

  const filteredAlerts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return alerts.filter((alert) => {
      if (statusFilter !== "ALL" && normalized(alert.status) !== statusFilter) return false;
      if (priorityFilter !== "ALL" && normalized(alert.priority) !== priorityFilter) return false;
      if (!needle) return true;
      const searchable = [
        alert.title,
        alert.message,
        alert.priority,
        alert.status,
        alert.employee_id,
        alert.prediction_id,
        alert.recipient_user_id,
        alert.id,
      ].filter((value) => value != null).join(" ").toLowerCase();
      return searchable.includes(needle);
    });
  }, [alerts, search, statusFilter, priorityFilter]);

  const handleAlertAction = async (alert, action) => {
    if (!canManageAlert(alert, user)) {
      setError("You do not have permission to update this alert.");
      return;
    }
    if (action === "resolve" && !window.confirm(`Resolve alert #${alert.id}?`)) return;

    const actionKey = `${alert.id}:${action}`;
    setBusyAction(actionKey);
    setError("");
    setSuccess("");

    try {
      const response = await api.patch(`/alerts/${alert.id}/${action}`);
      const updated = response.data;
      setAlerts((current) => current.map((item) => item.id === updated.id ? updated : item));
      setSuccess(action === "acknowledge" ? `Alert #${alert.id} acknowledged.` : `Alert #${alert.id} resolved.`);
    } catch (requestError) {
      setError(getErrorMessage(requestError, `Could not ${action} this alert.`));
    } finally {
      setBusyAction("");
    }
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("ALL");
    setPriorityFilter("ALL");
  };

  return (
    <div className="min-h-full space-y-6 pb-8 text-slate-100">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Workforce Intelligence</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">Workforce Alerts</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Review risk alerts generated by workforce intelligence, acknowledge issues you are handling, and resolve them when complete.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadAlerts(true)}
          disabled={loading || refreshing}
          className="inline-flex min-h-10 items-center justify-center gap-2 self-start rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          {refreshing ? "Refreshing…" : "Refresh alerts"}
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">
          <AlertCircle className="mt-0.5 shrink-0" size={18} />
          <div className="min-w-0 flex-1">{error}</div>
          <button type="button" onClick={() => setError("")} aria-label="Dismiss error" className="rounded p-1 text-rose-100/70 hover:bg-white/5 hover:text-white"><XCircle size={16} /></button>
        </div>
      )}
      {success && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} />
          <div className="min-w-0 flex-1">{success}</div>
          <button type="button" onClick={() => setSuccess("")} aria-label="Dismiss success" className="rounded p-1 text-emerald-100/70 hover:bg-white/5 hover:text-white"><XCircle size={16} /></button>
        </div>
      )}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="New alerts" value={totals.newCount} helper="Waiting for acknowledgement" icon={AlertTriangle} tone="rose" />
        <MetricCard label="High priority" value={totals.highPriorityCount} helper="Critical or high, not resolved" icon={ShieldAlert} tone="rose" />
        <MetricCard label="Acknowledged" value={totals.acknowledgedCount} helper="Being reviewed" icon={Clock3} tone="amber" />
        <MetricCard label="Resolved" value={totals.resolvedCount} helper="Closed alerts in latest records" icon={CheckCircle2} tone="emerald" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70">
        <div className="border-b border-white/10 p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="font-semibold text-white">Alert inbox</h2>
              <p className="mt-1 text-xs text-slate-500">Showing up to the latest 100 alerts permitted for your account.</p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:min-w-[650px]">
              <label className="relative block">
                <span className="sr-only">Search alerts</span>
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search alerts" className="min-h-10 w-full rounded-lg border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/50" />
              </label>
              <label className="relative block">
                <Filter size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="min-h-10 w-full appearance-none rounded-lg border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-cyan-300/50">
                  {STATUS_OPTIONS.map((option) => <option key={option} value={option}>{option === "ALL" ? "All statuses" : option.replaceAll("_", " ")}</option>)}
                </select>
              </label>
              <label className="relative block">
                <ShieldAlert size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <select aria-label="Filter by priority" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="min-h-10 w-full appearance-none rounded-lg border border-white/10 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none focus:border-cyan-300/50">
                  {PRIORITY_OPTIONS.map((option) => <option key={option} value={option}>{option === "ALL" ? "All priorities" : option}</option>)}
                </select>
              </label>
            </div>
          </div>
          {(search || statusFilter !== "ALL" || priorityFilter !== "ALL") && (
            <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
              <span>{filteredAlerts.length} matching alert(s)</span>
              <button type="button" onClick={clearFilters} className="font-medium text-cyan-200 hover:text-cyan-100">Clear filters</button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-56 items-center justify-center gap-3 text-sm text-slate-400"><RefreshCw size={18} className="animate-spin text-cyan-300" /> Loading workforce alerts…</div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] text-slate-400"><CheckCheck size={23} /></div>
            <h3 className="mt-4 font-semibold text-white">No alerts found</h3>
            <p className="mt-1 max-w-md text-sm text-slate-400">{alerts.length === 0 ? "No workforce alerts are currently available for your account." : "Try changing the search term or filters."}</p>
            {(search || statusFilter !== "ALL" || priorityFilter !== "ALL") && <button type="button" onClick={clearFilters} className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">Clear filters</button>}
          </div>
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {filteredAlerts.map((alert) => {
              const status = normalized(alert.status);
              const isResolved = status === "RESOLVED";
              const permitted = canManageAlert(alert, user);
              const acknowledgeKey = `${alert.id}:acknowledge`;
              const resolveKey = `${alert.id}:resolve`;
              const isWorking = busyAction === acknowledgeKey || busyAction === resolveKey;
              return (
                <article key={alert.id} className="p-4 transition hover:bg-white/[0.02] sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3 sm:gap-4">
                      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${priorityStyle(alert.priority)}`}>
                        {normalized(alert.priority) === "CRITICAL" || normalized(alert.priority) === "HIGH" ? <AlertTriangle size={18} /> : <AlertCircle size={18} />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words font-semibold text-white">{alert.title || `Workforce alert #${alert.id}`}</h3>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${priorityStyle(alert.priority)}`}>{normalized(alert.priority) || "NORMAL"}</span>
                          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${statusStyle(alert.status)}`}>{normalized(alert.status).replaceAll("_", " ") || "UNKNOWN"}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{alert.message || "No additional details were provided."}</p>
                        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500">
                          <span>Alert #{alert.id}</span>
                          <span className="inline-flex items-center gap-1.5"><Clock3 size={13} />Created {formatDate(alert.created_at)}</span>
                          {alert.employee_id != null && <span className="inline-flex items-center gap-1.5"><UserRound size={13} />Employee ID: {alert.employee_id}</span>}
                          {alert.prediction_id != null && <span>Prediction ID: {alert.prediction_id}</span>}
                          {alert.recipient_user_id != null && <span>Recipient user ID: {alert.recipient_user_id}</span>}
                          {alert.acknowledged_at && <span>Acknowledged {formatDate(alert.acknowledged_at)}</span>}
                          {alert.resolved_at && <span>Resolved {formatDate(alert.resolved_at)}</span>}
                        </div>
                      </div>
                    </div>
                    {!isResolved && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-0 lg:pl-3">
                        {status === "NEW" && (
                          <button type="button" onClick={() => handleAlertAction(alert, "acknowledge")} disabled={!permitted || isWorking} title={!permitted ? "You cannot update this alert" : "Acknowledge this alert"} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-300/15 disabled:cursor-not-allowed disabled:opacity-40">
                            {busyAction === acknowledgeKey ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />} Acknowledge
                          </button>
                        )}
                        <button type="button" onClick={() => handleAlertAction(alert, "resolve")} disabled={!permitted || isWorking} title={!permitted ? "You cannot update this alert" : "Resolve this alert"} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-40">
                          {busyAction === resolveKey ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Resolve
                        </button>
                      </div>
                    )}
                  </div>
                  {!permitted && !isResolved && (
                    <p className="mt-3 pl-[52px] text-xs text-slate-500">Actions are disabled because this alert is not assigned to your account.</p>
                  )}
                </article>
              );
            })}
          </div>
        )}
        {!loading && alerts.length > 0 && (
          <div className="border-t border-white/[0.07] px-4 py-3 text-xs text-slate-500 sm:px-5">
            Displaying {filteredAlerts.length} of {alerts.length} loaded alert(s). Status changes are saved by the server.
          </div>
        )}
      </section>

      <p className="text-xs leading-5 text-slate-500">
        Alert visibility and available actions are controlled by your account role and the backend. This page only uses the existing list, acknowledge, and resolve endpoints.
      </p>
    </div>
  );
}
