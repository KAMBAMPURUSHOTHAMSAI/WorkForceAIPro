import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Clock3,
  Inbox,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
} from "lucide-react";

import api, { getAccessToken } from "../api/axios";
import { useAuth } from "../context/AuthContext";

const PRIORITY_STYLES = {
  LOW: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  NORMAL: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  HIGH: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  CRITICAL: "border-rose-400/30 bg-rose-400/10 text-rose-200",
};

function getErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg).filter(Boolean).join("; ") || fallback;
  }
  return error?.response?.data?.message || error?.message || fallback;
}

function formatDate(value) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatType(value) {
  return String(value || "GENERAL")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function NotificationsPage() {
  const { user } = useAuth();
  const isAdminOrHR = ["ADMIN", "HR"].includes(user?.role);

  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [bulkWorking, setBulkWorking] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [form, setForm] = useState({
    target_user_id: "",
    notification_type: "GENERAL",
    title: "",
    message: "",
    priority: "NORMAL",
  });

  const loadNotifications = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError("");
      }

      try {
        const [listResponse, countResponse] = await Promise.all([
          api.get("/notifications", {
            params: {
              unread_only: filter === "unread",
              limit: 100,
            },
          }),
          api.get("/notifications/unread-count"),
        ]);

        setNotifications(Array.isArray(listResponse.data) ? listResponse.data : []);
        setUnreadCount(Number(countResponse.data?.unread_count || 0));
      } catch (requestError) {
        setError(getErrorMessage(requestError, "Could not load notifications."));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [filter]
  );

  const loadRef = useRef(loadNotifications);
  useEffect(() => {
    loadRef.current = loadNotifications;
  }, [loadNotifications]);

  useEffect(() => {
    // Start the initial request after the effect stack, avoiding a synchronous state update.
    Promise.resolve().then(() => loadNotifications(true));
  }, [loadNotifications]);

  // Connect to the backend notification WebSocket for real-time changes.
  useEffect(() => {
    const token = getAccessToken();
    const baseURL = api.defaults.baseURL || "http://127.0.0.1:8010/api/v1";

    if (!token || typeof WebSocket === "undefined") return undefined;

    let socket;
    try {
      const wsBaseURL = baseURL.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
      socket = new WebSocket(
        `${wsBaseURL.replace(/\/$/, "")}/notifications/ws?token=${encodeURIComponent(token)}`
      );
    } catch {
      return undefined;
    }

    socket.onopen = () => setLiveConnected(true);
    socket.onclose = () => setLiveConnected(false);
    socket.onerror = () => setLiveConnected(false);
    socket.onmessage = (messageEvent) => {
      try {
        const event = JSON.parse(messageEvent.data);
        if (
          [
            "new_notification",
            "notification_updated",
            "notifications_read_all",
          ].includes(event?.event)
        ) {
          loadRef.current?.(true);
        }
      } catch {
        // Ignore malformed WebSocket messages; the REST endpoints remain available.
      }
    };

    return () => {
      socket.close();
    };
  }, []);

  const filteredNotifications = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return notifications;
    return notifications.filter((item) =>
      [item.title, item.message, item.notification_type, item.priority]
        .some((value) => String(value || "").toLowerCase().includes(needle))
    );
  }, [notifications, search]);

  async function handleMarkRead(notification) {
    if (notification.read_status) return;
    setWorkingId(notification.id);
    setError("");
    setSuccess("");

    try {
      const response = await api.patch(`/notifications/${notification.id}/read`);
      setNotifications((current) =>
        current.map((item) => item.id === notification.id ? response.data : item)
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      setSuccess("Notification marked as read.");
      if (filter === "unread") {
        await loadNotifications(true);
      }
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not mark this notification as read."));
    } finally {
      setWorkingId(null);
    }
  }

  async function handleMarkAllRead() {
    if (unreadCount === 0 || bulkWorking) return;
    setBulkWorking(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post("/notifications/read-all");
      setUnreadCount(Number(response.data?.unread_count || 0));
      if (filter === "unread") {
        setNotifications([]);
      } else {
        setNotifications((current) =>
          current.map((item) => ({ ...item, read_status: true, read_at: item.read_at || new Date().toISOString() }))
        );
      }
      setSuccess(`${Number(response.data?.updated_count || 0)} notification(s) marked as read.`);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not mark all notifications as read."));
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleCreateNotification(event) {
    event.preventDefault();
    if (!isAdminOrHR || creating) return;

    setCreating(true);
    setError("");
    setSuccess("");

    try {
      await api.post("/notifications", {
        target_user_id: Number(form.target_user_id),
        notification_type: form.notification_type.trim() || "GENERAL",
        title: form.title.trim(),
        message: form.message.trim(),
        priority: form.priority,
      });

      setForm({
        target_user_id: "",
        notification_type: "GENERAL",
        title: "",
        message: "",
        priority: "NORMAL",
      });
      setShowCreateForm(false);
      setSuccess("Notification sent successfully.");
      await loadNotifications(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not send the notification."));
    } finally {
      setCreating(false);
    }
  }

  async function handleRunEscalation() {
    if (!isAdminOrHR || escalating) return;
    setEscalating(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.post("/notifications/escalation/run");
      setSuccess(
        `Escalation sweep completed. ${Number(response.data?.created_count || 0)} notification(s) created.`
      );
      await loadNotifications(true);
    } catch (requestError) {
      setError(getErrorMessage(requestError, "Could not run notification escalation."));
    } finally {
      setEscalating(false);
    }
  }

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-5 shadow-xl shadow-black/10 sm:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium text-cyan-200">
              <Bell size={14} /> Notification Center
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Keep up with workforce updates
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              View account notifications, read important updates, and stay synchronized with live events.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3">
              <p className="text-xs text-slate-400">Unread notifications</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-white">{unreadCount}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3">
              <span className={`inline-flex items-center gap-2 text-xs ${liveConnected ? "text-emerald-300" : "text-slate-400"}`}>
                <span className={`h-2 w-2 rounded-full ${liveConnected ? "bg-emerald-400" : "bg-slate-500"}`} />
                {liveConnected ? "Live connected" : "Live updates offline"}
              </span>
              <p className="mt-1 text-[11px] text-slate-500">Refresh remains available</p>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-100">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError("")} className="text-rose-200 hover:text-white" aria-label="Dismiss error">×</button>
        </div>
      )}

      {success && (
        <div role="status" className="flex items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <Check size={18} className="mt-0.5 shrink-0" />
          <span className="flex-1">{success}</span>
          <button type="button" onClick={() => setSuccess("")} className="text-emerald-200 hover:text-white" aria-label="Dismiss message">×</button>
        </div>
      )}

      {isAdminOrHR && (
        <section className="rounded-2xl border border-white/10 bg-slate-900/80 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-xl bg-violet-400/10 p-2.5 text-violet-200"><ShieldAlert size={20} /></div>
              <div>
                <h3 className="font-semibold text-white">HR & Admin tools</h3>
                <p className="mt-1 text-sm text-slate-400">Send a notification to an active user or run the configured escalation sweep.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setShowCreateForm((current) => !current)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-300 px-3.5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">
                <Send size={16} /> {showCreateForm ? "Close form" : "Send notification"}
              </button>
              <button type="button" onClick={handleRunEscalation} disabled={escalating} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
                <Activity size={16} /> {escalating ? "Running…" : "Run escalation"}
              </button>
            </div>
          </div>

          {showCreateForm && (
            <form onSubmit={handleCreateNotification} className="mt-5 grid grid-cols-1 gap-4 border-t border-white/10 pt-5 md:grid-cols-2">
              <label className="block text-sm text-slate-300">
                Target user ID
                <input type="number" min="1" step="1" required value={form.target_user_id} onChange={(event) => updateForm("target_user_id", event.target.value)} placeholder="Enter active user's ID" className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/60" />
                <span className="mt-1 block text-xs text-slate-500">The backend validates that the target account exists and is active.</span>
              </label>
              <label className="block text-sm text-slate-300">
                Notification type
                <input type="text" minLength="2" maxLength="50" required value={form.notification_type} onChange={(event) => updateForm("notification_type", event.target.value)} placeholder="GENERAL" className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/60" />
              </label>
              <label className="block text-sm text-slate-300 md:col-span-2">
                Title
                <input type="text" minLength="2" maxLength="150" required value={form.title} onChange={(event) => updateForm("title", event.target.value)} placeholder="Notification title" className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/60" />
              </label>
              <label className="block text-sm text-slate-300 md:col-span-2">
                Message
                <textarea minLength="1" maxLength="5000" rows={3} required value={form.message} onChange={(event) => updateForm("message", event.target.value)} placeholder="Write the notification message…" className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/60" />
              </label>
              <label className="block text-sm text-slate-300">
                Priority
                <select value={form.priority} onChange={(event) => updateForm("priority", event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-300/60">
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </label>
              <div className="flex items-end justify-end">
                <button type="submit" disabled={creating} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto">
                  <Send size={16} /> {creating ? "Sending…" : "Send notification"}
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80">
        <div className="flex flex-col gap-4 border-b border-white/10 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="font-semibold text-white">Your notifications</h3>
            <p className="mt-1 text-xs text-slate-400">Showing up to 100 most recent notifications returned by the API.</p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 sm:w-56">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search notifications" aria-label="Search notifications" className="w-full rounded-lg border border-white/10 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-300/60" />
            </div>
            <div className="flex rounded-lg border border-white/10 bg-slate-950 p-1">
              <button type="button" onClick={() => setFilter("all")} aria-pressed={filter === "all"} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${filter === "all" ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:text-white"}`}>All</button>
              <button type="button" onClick={() => setFilter("unread")} aria-pressed={filter === "unread"} className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${filter === "unread" ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:text-white"}`}>Unread</button>
            </div>
            <button type="button" onClick={() => { setError(""); setRefreshing(true); loadNotifications(true); }} disabled={refreshing || loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50">
              <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} /> Refresh
            </button>
            <button type="button" onClick={handleMarkAllRead} disabled={unreadCount === 0 || bulkWorking} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-slate-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40">
              <CheckCheck size={15} /> {bulkWorking ? "Updating…" : "Mark all read"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-52 items-center justify-center gap-3 text-sm text-slate-400">
            <RefreshCw size={18} className="animate-spin" /> Loading notifications…
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex min-h-64 flex-col items-center justify-center px-5 text-center">
            <div className="rounded-2xl border border-white/10 bg-slate-950 p-4 text-slate-500"><Inbox size={28} /></div>
            <h4 className="mt-4 font-semibold text-white">No notifications found</h4>
            <p className="mt-1 max-w-md text-sm text-slate-400">
              {search ? "Try another search term." : filter === "unread" ? "You are all caught up. There are no unread notifications." : "Notifications will appear here when the backend has updates for your account."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {filteredNotifications.map((notification) => {
              const priority = String(notification.priority || "NORMAL").toUpperCase();
              const isUnread = !notification.read_status;
              return (
                <article key={notification.id} className={`flex gap-3 p-4 transition sm:gap-4 sm:p-5 ${isUnread ? "bg-cyan-300/[0.035]" : "hover:bg-white/[0.02]"}`}>
                  <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${isUnread ? "border-cyan-300/20 bg-cyan-300/10 text-cyan-200" : "border-white/10 bg-slate-950 text-slate-500"}`}>
                    {priority === "CRITICAL" || priority === "HIGH" ? <AlertTriangle size={18} /> : <Bell size={18} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className={`break-words font-semibold ${isUnread ? "text-white" : "text-slate-200"}`}>{notification.title}</h4>
                      {isUnread && <span className="h-2 w-2 rounded-full bg-cyan-300" title="Unread" />}
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PRIORITY_STYLES[priority] || PRIORITY_STYLES.NORMAL}`}>{priority}</span>
                      <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-400">{formatType(notification.notification_type)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{notification.message}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5"><Clock3 size={13} /> {formatDate(notification.created_at)}</span>
                      {notification.read_at && <span>Read {formatDate(notification.read_at)}</span>}
                      <span className="font-mono">ID: {notification.id}</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {isUnread ? (
                      <button type="button" onClick={() => handleMarkRead(notification)} disabled={workingId === notification.id} title="Mark as read" aria-label={`Mark notification ${notification.id} as read`} className="inline-flex items-center gap-2 rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-100 transition hover:bg-cyan-300/20 disabled:opacity-50">
                        <Check size={15} /> <span className="hidden sm:inline">{workingId === notification.id ? "Saving…" : "Mark read"}</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-slate-500"><CheckCheck size={15} /> <span className="hidden sm:inline">Read</span></span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {!loading && filteredNotifications.length > 0 && (
          <div className="border-t border-white/10 px-4 py-3 text-xs text-slate-500 sm:px-5">
            Showing {filteredNotifications.length} notification(s). Unread count is provided by the server.
          </div>
        )}
      </section>
    </div>
  );
}
