import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Download,
  Filter,
  LoaderCircle,
  Radio,
  RefreshCw,
  Search,
  ShieldCheck,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";

import api, { getAccessToken } from "../api/axios";
import { useAuth } from "../context/AuthContext";

const PAGE_SIZE = 50;

function getErrorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || String(item)).join("; ");
  }
  return error?.message || "Could not load workforce activities.";
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

function toCsvValue(value) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function exportActivities(rows) {
  const headers = [
    "ID",
    "Activity Type",
    "Description",
    "Employee ID",
    "Actor User ID",
    "Source",
    "Created At",
    "Activity Data",
  ];
  const csvRows = rows.map((row) => [
    row.id,
    row.activity_type,
    row.description,
    row.employee_id,
    row.actor_user_id,
    row.source,
    row.created_at,
    row.activity_data ? JSON.stringify(row.activity_data) : "",
  ]);
  const csv = [headers, ...csvRows]
    .map((row) => row.map(toCsvValue).join(","))
    .join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `workforce-activities-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function MetaItem({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold text-slate-800">{value ?? "—"}</div>
    </div>
  );
}

export default function WorkforceActivityPage() {
  const { user } = useAuth();
  const isAdminOrHr = ["ADMIN", "HR"].includes(String(user?.role || "").toUpperCase());
  const [activities, setActivities] = useState([]);
  const [knownTypes, setKnownTypes] = useState([]);
  const [activityType, setActivityType] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [socketState, setSocketState] = useState("connecting");
  const [refreshNumber, setRefreshNumber] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [formData, setFormData] = useState({
    employee_id: "",
    activity_type: "",
    description: "",
    activity_data: "",
  });
  const [selectedActivity, setSelectedActivity] = useState(null);
  const activityTypeRef = useRef(activityType);
  const socketRef = useRef(null);
  const requestGenerationRef = useRef(0);

  useEffect(() => {
    activityTypeRef.current = activityType;
  }, [activityType]);

  const loadLatest = useCallback(async (filterType, generation) => {
    try {
      const params = { limit: PAGE_SIZE };
      if (filterType) params.activity_type = filterType;
      const response = await api.get("/workforce-activities", { params });
      if (generation !== requestGenerationRef.current) return;
      const rows = Array.isArray(response.data) ? response.data : [];
      setActivities(rows);
      setHasMore(rows.length === PAGE_SIZE);
      setKnownTypes((previous) => [
        ...new Set([...previous, ...rows.map((row) => row.activity_type).filter(Boolean)]),
      ].sort((a, b) => a.localeCompare(b)));
      setError("");
    } catch (requestError) {
      if (generation === requestGenerationRef.current) {
        setError(getErrorMessage(requestError));
      }
    } finally {
      if (generation === requestGenerationRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const generation = ++requestGenerationRef.current;
    loadLatest(activityType, generation);
    return () => {
      // Ignore results from an earlier filter or refresh request.
      requestGenerationRef.current += 1;
    };
  }, [activityType, refreshNumber, loadLatest]);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer;
    let activeSocket;

    const connect = () => {
      if (disposed) return;
      const token = getAccessToken();
      if (!token) {
        setSocketState("offline");
        return;
      }

      try {
        const apiUrl = new URL(api.defaults.baseURL || "/api/v1", window.location.origin);
        const socketProtocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
        const basePath = apiUrl.pathname.replace(/\/+$/, "");
        const socketUrl = `${socketProtocol}//${apiUrl.host}${basePath}/workforce-activities/ws?token=${encodeURIComponent(token)}`;
        const socket = new WebSocket(socketUrl);
        activeSocket = socket;
        socketRef.current = socket;

        socket.onmessage = (messageEvent) => {
          let message;
          try {
            message = JSON.parse(messageEvent.data);
          } catch {
            return;
          }

          if (message?.event === "connected") {
            setSocketState("connected");
            return;
          }

          if (message?.event !== "activity" || !message.data?.id) return;
          const incoming = message.data;
          const currentFilter = activityTypeRef.current;
          if (currentFilter && incoming.activity_type !== currentFilter) return;

          setActivities((previous) => {
            const exists = previous.some((item) => item.id === incoming.id);
            if (exists) return previous;
            return [incoming, ...previous].slice(0, PAGE_SIZE);
          });
          setKnownTypes((previous) => [
            ...new Set([...previous, incoming.activity_type].filter(Boolean)),
          ].sort((a, b) => a.localeCompare(b)));
          setNotice("A new workforce activity arrived.");
        };

        socket.onerror = () => {
          // close triggers the reconnect path below.
          socket.close();
        };

        socket.onclose = () => {
          if (socketRef.current === socket) socketRef.current = null;
          if (disposed) return;
          setSocketState("reconnecting");
          reconnectTimer = window.setTimeout(connect, 4000);
        };
      } catch {
        if (!disposed) {
          setSocketState("reconnecting");
          reconnectTimer = window.setTimeout(connect, 4000);
        }
      }
    };

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (activeSocket) {
        activeSocket.onclose = null;
        activeSocket.onerror = null;
        activeSocket.close();
      }
      if (socketRef.current === activeSocket) socketRef.current = null;
    };
  }, [user?.id, user?.role]);

  const loadMore = async () => {
    if (loadingMore || !hasMore || activities.length === 0) return;
    setLoadingMore(true);
    setError("");
    const generation = requestGenerationRef.current;
    const filterAtStart = activityType;
    const oldestId = Number(activities[activities.length - 1]?.id);

    if (!Number.isFinite(oldestId)) {
      setLoadingMore(false);
      setHasMore(false);
      return;
    }

    try {
      const params = { limit: PAGE_SIZE, before_id: oldestId };
      if (filterAtStart) params.activity_type = filterAtStart;
      const response = await api.get("/workforce-activities", { params });
      if (generation !== requestGenerationRef.current || filterAtStart !== activityTypeRef.current) return;
      const rows = Array.isArray(response.data) ? response.data : [];
      setActivities((previous) => {
        const ids = new Set(previous.map((row) => row.id));
        return [...previous, ...rows.filter((row) => !ids.has(row.id))];
      });
      setKnownTypes((previous) => [
        ...new Set([...previous, ...rows.map((row) => row.activity_type).filter(Boolean)]),
      ].sort((a, b) => a.localeCompare(b)));
      setHasMore(rows.length === PAGE_SIZE);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredActivities = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return activities;
    return activities.filter((item) => {
      const haystack = [
        item.id,
        item.activity_type,
        item.description,
        item.employee_id,
        item.actor_user_id,
        item.source,
        item.activity_data ? JSON.stringify(item.activity_data) : "",
      ].join(" ").toLowerCase();
      return haystack.includes(term);
    });
  }, [activities, search]);

  const handleCreate = async (event) => {
    event.preventDefault();
    setFormError("");
    setNotice("");

    const activityTypeValue = formData.activity_type.trim();
    const descriptionValue = formData.description.trim();
    if (activityTypeValue.length < 2) {
      setFormError("Activity type must contain at least 2 characters.");
      return;
    }
    if (!descriptionValue) {
      setFormError("Description is required.");
      return;
    }

    let activityData = null;
    if (formData.activity_data.trim()) {
      try {
        activityData = JSON.parse(formData.activity_data);
        if (!activityData || Array.isArray(activityData) || typeof activityData !== "object") {
          setFormError("Activity data must be a valid JSON object.");
          return;
        }
      } catch {
        setFormError("Activity data is not valid JSON.");
        return;
      }
    }

    const payload = {
      employee_id: formData.employee_id.trim() ? Number(formData.employee_id) : null,
      activity_type: activityTypeValue,
      description: descriptionValue,
      activity_data: activityData,
    };
    if (payload.employee_id !== null && (!Number.isInteger(payload.employee_id) || payload.employee_id <= 0)) {
      setFormError("Employee ID must be a positive whole number.");
      return;
    }

    setSaving(true);
    try {
      const response = await api.post("/workforce-activities", payload);
      const created = response.data;
      setActivities((previous) => {
        if (activityTypeRef.current && created.activity_type !== activityTypeRef.current) return previous;
        return [created, ...previous.filter((item) => item.id !== created.id)].slice(0, PAGE_SIZE);
      });
      setKnownTypes((previous) => [
        ...new Set([...previous, created.activity_type].filter(Boolean)),
      ].sort((a, b) => a.localeCompare(b)));
      setFormData({ employee_id: "", activity_type: "", description: "", activity_data: "" });
      setShowCreateForm(false);
      setNotice("Workforce activity recorded.");
    } catch (requestError) {
      setFormError(getErrorMessage(requestError));
    } finally {
      setSaving(false);
    }
  };

  const countLatest = activities.length;
  const uniqueEmployees = new Set(activities.map((row) => row.employee_id).filter((id) => id != null)).size;
  const latestTimestamp = activities[0]?.created_at;
  const connectionLabel = socketState === "connected"
    ? "Live updates connected"
    : socketState === "offline"
      ? "Live updates unavailable"
      : "Reconnecting live updates";

  return (
    <div className="min-h-full space-y-6 bg-slate-50 p-4 text-slate-900 sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
            <Activity className="h-3.5 w-3.5" /> Workforce operations
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Workforce Activity Feed</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
            Review recent workforce events. HR/Admin can see organization-wide activity; other roles see activity related to their account or employee record.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold ${socketState === "connected" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`} title={connectionLabel}>
            {socketState === "connected" ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            {connectionLabel}
          </span>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setNotice("");
              setRefreshNumber((value) => value + 1);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          {isAdminOrHr && (
            <button
              type="button"
              onClick={() => { setShowCreateForm((value) => !value); setFormError(""); }}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
            >
              <Radio className="h-4 w-4" /> Record activity
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="flex items-start justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 shrink-0" />{notice}</span>
          <button type="button" onClick={() => setNotice("")} className="rounded p-0.5 hover:bg-emerald-100" aria-label="Dismiss message"><X className="h-4 w-4" /></button>
        </div>
      )}

      {error && (
        <div className="flex flex-col justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:flex-row sm:items-center">
          <span className="inline-flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</span>
          <button type="button" onClick={() => { setLoading(true); setRefreshNumber((value) => value + 1); }} className="shrink-0 rounded-lg border border-rose-300 bg-white px-3 py-1.5 font-semibold hover:bg-rose-100">Try again</button>
        </div>
      )}

      {isAdminOrHr && showCreateForm && (
        <form onSubmit={handleCreate} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Record workforce activity</h2>
              <p className="mt-1 text-sm text-slate-600">This creates an activity record through the backend API. The activity actor is recorded as your signed-in user.</p>
            </div>
            <button type="button" onClick={() => setShowCreateForm(false)} aria-label="Close form" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm font-semibold text-slate-700">
              Activity type *
              <input value={formData.activity_type} onChange={(event) => setFormData((previous) => ({ ...previous, activity_type: event.target.value }))} maxLength={80} minLength={2} required placeholder="e.g. HR_REVIEW_COMPLETED" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="block text-sm font-semibold text-slate-700">
              Employee ID (optional)
              <input type="number" min="1" step="1" value={formData.employee_id} onChange={(event) => setFormData((previous) => ({ ...previous, employee_id: event.target.value }))} placeholder="Link activity to employee" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
            <label className="block text-sm font-semibold text-slate-700 md:col-span-2">
              Description *
              <textarea value={formData.description} onChange={(event) => setFormData((previous) => ({ ...previous, description: event.target.value }))} required maxLength={2000} rows={3} placeholder="Describe the workforce event" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              <span className="mt-1 block text-right text-xs font-normal text-slate-500">{formData.description.length}/2000</span>
            </label>
            <label className="block text-sm font-semibold text-slate-700 md:col-span-2">
              Activity data JSON (optional)
              <textarea value={formData.activity_data} onChange={(event) => setFormData((previous) => ({ ...previous, activity_data: event.target.value }))} rows={3} placeholder={'{"source":"manual","note":"Example metadata"}'} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm font-normal outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            </label>
          </div>
          {formError && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{formError}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreateForm(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">
              {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}{saving ? "Saving…" : "Save activity"}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600">Loaded records</span><Activity className="h-5 w-5 text-blue-700" /></div>
          <div className="mt-3 text-2xl font-bold tabular-nums text-slate-950">{countLatest}</div>
          <div className="mt-1 text-xs text-slate-500">Current result page{hasMore ? " · more available" : ""}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600">Linked employees</span><ShieldCheck className="h-5 w-5 text-violet-700" /></div>
          <div className="mt-3 text-2xl font-bold tabular-nums text-slate-950">{uniqueEmployees}</div>
          <div className="mt-1 text-xs text-slate-500">Distinct employee IDs in loaded records</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600">Activity types</span><Filter className="h-5 w-5 text-emerald-700" /></div>
          <div className="mt-3 text-2xl font-bold tabular-nums text-slate-950">{knownTypes.length}</div>
          <div className="mt-1 text-xs text-slate-500">Types observed while browsing</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-600">Latest activity</span><CalendarClock className="h-5 w-5 text-amber-700" /></div>
          <div className="mt-3 text-base font-bold text-slate-950">{latestTimestamp ? formatDate(latestTimestamp) : "—"}</div>
          <div className="mt-1 text-xs text-slate-500">From the current results</div>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4 sm:p-5">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Recent activity</h2>
              <p className="mt-1 text-sm text-slate-600">Newest events appear first. More events are loaded using the backend cursor.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="relative block min-w-0 sm:min-w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search loaded records" aria-label="Search loaded activities" className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </label>
              <label className="relative block min-w-0 sm:min-w-52">
                <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <select value={activityType} onChange={(event) => { setLoading(true); setNotice(""); setActivityType(event.target.value); }} aria-label="Filter by activity type" className="w-full appearance-none rounded-xl border border-slate-300 bg-white py-2.5 pl-9 pr-9 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100">
                  <option value="">All activity types</option>
                  {knownTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              </label>
              <button type="button" onClick={() => exportActivities(filteredActivities)} disabled={filteredActivities.length === 0} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50" title="Exports only records currently loaded and visible after search">
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-64 items-center justify-center gap-3 text-sm font-medium text-slate-600"><LoaderCircle className="h-5 w-5 animate-spin text-blue-700" />Loading workforce activity…</div>
        ) : filteredActivities.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500"><Activity className="h-7 w-7" /></div>
            <h3 className="mt-4 font-bold text-slate-900">No activities found</h3>
            <p className="mt-1 max-w-md text-sm text-slate-600">Try clearing the search or choosing another activity type. Your visible records are also limited by your role permissions.</p>
            {(search || activityType) && <button type="button" onClick={() => { setSearch(""); setLoading(true); setActivityType(""); }} className="mt-4 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Clear filters</button>}
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {filteredActivities.map((item) => (
                <button key={item.id} type="button" onClick={() => setSelectedActivity(item)} className="group grid w-full gap-3 px-4 py-4 text-left transition hover:bg-blue-50/60 focus:bg-blue-50/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:px-5">
                  <span className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700 ring-1 ring-blue-100"><Activity className="h-5 w-5" /></span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-950">{item.activity_type || "Activity"}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">#{item.id}</span>
                      {item.source && <span className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">{item.source}</span>}
                    </span>
                    <span className="mt-1.5 block whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.description || "No description provided."}</span>
                    <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {item.employee_id != null && <span>Employee ID: <strong className="font-semibold text-slate-700">{item.employee_id}</strong></span>}
                      {item.actor_user_id != null && <span>Actor User ID: <strong className="font-semibold text-slate-700">{item.actor_user_id}</strong></span>}
                      {item.activity_data && <span>Includes metadata</span>}
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 sm:justify-end"><CalendarClock className="h-3.5 w-3.5" />{formatDate(item.created_at)}</span>
                </button>
              ))}
            </div>
            <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-4 sm:flex-row sm:px-5">
              <p className="text-xs text-slate-600">Showing {filteredActivities.length} matching record{filteredActivities.length === 1 ? "" : "s"} from {activities.length} loaded.</p>
              {hasMore ? (
                <button type="button" disabled={loadingMore} onClick={loadMore} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60">
                  {loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" />}{loadingMore ? "Loading…" : "Load older activities"}
                </button>
              ) : <span className="text-xs font-medium text-slate-500">No more records reported by the API</span>}
            </div>
          </>
        )}
      </section>

      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-900">
        <Radio className="mt-0.5 h-4 w-4 shrink-0" />
        <p><strong>Scope:</strong> search and CSV export apply to the records currently loaded in this page. The backend enforces activity visibility by role and employee association; live events follow the same permission rules.</p>
      </div>

      {selectedActivity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedActivity(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="activity-detail-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Activity detail · #{selectedActivity.id}</p>
                <h2 id="activity-detail-title" className="mt-1 text-xl font-bold text-slate-950">{selectedActivity.activity_type || "Workforce activity"}</h2>
              </div>
              <button type="button" onClick={() => setSelectedActivity(null)} aria-label="Close activity details" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{selectedActivity.description || "No description provided."}</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetaItem label="Activity ID" value={selectedActivity.id} />
              <MetaItem label="Source" value={selectedActivity.source} />
              <MetaItem label="Employee ID" value={selectedActivity.employee_id} />
              <MetaItem label="Actor User ID" value={selectedActivity.actor_user_id} />
              <div className="sm:col-span-2"><MetaItem label="Created at" value={formatDate(selectedActivity.created_at)} /></div>
            </div>
            <div className="mt-5">
              <h3 className="text-sm font-bold text-slate-900">Activity data</h3>
              {selectedActivity.activity_data ? (
                <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(selectedActivity.activity_data, null, 2)}</pre>
              ) : <p className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">No additional activity data was recorded.</p>}
            </div>
            <div className="mt-6 flex justify-end"><button type="button" onClick={() => setSelectedActivity(null)} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">Close</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
