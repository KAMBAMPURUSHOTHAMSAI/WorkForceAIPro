
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  LogIn,
  LogOut,
  Pencil,
  RefreshCw,
  Save,
  Timer,
  X,
} from "lucide-react";
import api from "../api/axios";

const TEXT = {
  primary: "#0f172a",
  secondary: "#475569",
  muted: "#64748b",
  border: "#e2e8f0",
};

function getToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getErrorMessage(error) {
  const detail = error?.response?.data?.detail;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || "Invalid input").join(", ");
  }

  return error?.message || "Unable to complete the request.";
}

function normalizeRecords(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  for (const key of ["items", "records", "attendance", "results", "data"]) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  if (payload.id != null || payload.attendance_date || payload.check_in) {
    return [payload];
  }

  return [];
}

function recordDate(record) {
  const value =
    record.attendance_date ??
    record.date ??
    record.work_date ??
    record.day;

  return value ? String(value).slice(0, 10) : "";
}

function checkInValue(record) {
  return (
    record?.check_in ??
    record?.check_in_at ??
    record?.checked_in_at ??
    record?.check_in_time ??
    null
  );
}

function checkOutValue(record) {
  return (
    record?.check_out ??
    record?.check_out_at ??
    record?.checked_out_at ??
    record?.check_out_time ??
    null
  );
}

function formatDateTime(value) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDuration(record) {
  const start = checkInValue(record);
  const end = checkOutValue(record);

  if (start && !end) {
    return record?.status === "MISSED_CHECKOUT" ? "Missing check-out" : "In progress";
  }

  let minutes = record?.working_minutes;

  if (minutes == null && start && end) {
    minutes = Math.max(
      0,
      Math.floor(
        (new Date(end).getTime() - new Date(start).getTime()) / 60000
      )
    );
  }

  if (minutes == null) return "—";

  const totalMinutes = Math.max(0, Number(minutes));

  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function indiaLocalDateTimeToIso(value) {
  if (!value) return null;
  // Attendance timestamps and display are based on India Standard Time.
  return new Date(`${value}:00+05:30`).toISOString();
}

function getRoles(profile) {
  const values = [];

  const directRole = profile?.role ?? profile?.role_name;

  if (typeof directRole === "string") {
    values.push(directRole);
  }

  if (Array.isArray(profile?.roles)) {
    for (const role of profile.roles) {
      if (typeof role === "string") {
        values.push(role);
      } else if (role) {
        values.push(role.name ?? role.code ?? "");
      }
    }
  }

  return values.map((role) => String(role).toUpperCase());
}

function StatusBadge({ status, checkedIn = false, checkedOut = false }) {
  let label = status || "Not checked in";
  let badgeStyle = {
    background: "#f1f5f9",
    color: "#475569",
  };

  if (String(status || "").toUpperCase() === "MISSED_CHECKOUT") {
    label = "Missed check-out";
    badgeStyle = { background: "#fef3c7", color: "#92400e" };
  } else if (checkedOut) {
    label = "Completed";
    badgeStyle = {
      background: "#dcfce7",
      color: "#166534",
    };
  } else if (checkedIn) {
    label = "Currently checked in";
    badgeStyle = {
      background: "#dbeafe",
      color: "#1d4ed8",
    };
  }

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold sm:text-sm"
      style={badgeStyle}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {String(label).replaceAll("_", " ")}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, description, color }) {
  const colors = {
    blue: {
      background: "#dbeafe",
      foreground: "#1d4ed8",
    },
    green: {
      background: "#dcfce7",
      foreground: "#15803d",
    },
    violet: {
      background: "#ede9fe",
      foreground: "#6d28d9",
    },
  };

  const selected = colors[color] || colors.blue;

  return (
    <div
      className="rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md sm:p-6"
      style={{ borderColor: TEXT.border }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: TEXT.secondary }}>
            {label}
          </p>

          <p
            className="mt-3 break-words text-xl font-bold tracking-tight sm:text-2xl"
            style={{ color: TEXT.primary }}
          >
            {value}
          </p>

          <p className="mt-2 text-xs sm:text-sm" style={{ color: TEXT.muted }}>
            {description}
          </p>
        </div>

        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: selected.background,
            color: selected.foreground,
          }}
        >
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function TableCell({ children, className = "" }) {
  return (
    <td
      className={`px-4 py-4 text-sm sm:px-6 ${className}`}
      style={{ color: TEXT.primary, opacity: 1 }}
    >
      {children}
    </td>
  );
}

function TableHeader({ children, className = "" }) {
  return (
    <th
      className={`px-4 py-4 text-left text-xs font-bold uppercase tracking-wider sm:px-6 ${className}`}
      style={{ color: TEXT.secondary, opacity: 1 }}
    >
      {children}
    </th>
  );
}

function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "#f1f5f9", color: "#64748b" }}
      >
        <CalendarDays size={26} />
      </div>

      <p className="mt-4 font-semibold" style={{ color: TEXT.primary }}>
        {message}
      </p>

      <p className="mt-1 text-sm" style={{ color: TEXT.secondary }}>
        Attendance records will appear here when available.
      </p>
    </div>
  );
}

export default function AttendancePage() {
  const today = getToday();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [myRecords, setMyRecords] = useState([]);
  const [teamRecords, setTeamRecords] = useState([]);
  const [profileMissing, setProfileMissing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingRecord, setEditingRecord] = useState(null);
  const [correctionForm, setCorrectionForm] = useState({
    check_in: "",
    check_out: "",
    status: "PRESENT",
    notes: "",
    correction_reason: "",
  });
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [correctionError, setCorrectionError] = useState("");

  const loadAttendance = useCallback(async (managementMode = false) => {
    setLoading(true);
    setError("");

    const [mineResult, teamResult] = await Promise.allSettled([
      api.get("/attendance/me"),
      managementMode
        ? api.get("/attendance")
        : Promise.resolve(null),
    ]);

    if (mineResult.status === "fulfilled") {
      setMyRecords(normalizeRecords(mineResult.value.data));
      setProfileMissing(false);
    } else {
      setMyRecords([]);

      const status = mineResult.reason?.response?.status;
      setProfileMissing(status === 404);

      if (status !== 404) {
        setError(getErrorMessage(mineResult.reason));
      }
    }

    if (managementMode && teamResult.status === "fulfilled") {
      setTeamRecords(normalizeRecords(teamResult.value.data));
    } else if (managementMode && teamResult.status === "rejected") {
      setTeamRecords([]);

      setError(
        (current) =>
          current ||
          `Unable to load team attendance: ${getErrorMessage(teamResult.reason)}`
      );
    } else {
      setTeamRecords([]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function initialize() {
      try {
        const response = await api.get("/auth/me");

        if (!mounted) return;

        const roles = getRoles(response.data);
        const managementMode = roles.some((role) =>
          ["ADMIN", "HR"].includes(role)
        );

        setCanManage(managementMode);
        await loadAttendance(managementMode);
      } catch (requestError) {
        if (!mounted) return;

        setError(getErrorMessage(requestError));
        setLoading(false);
      }
    }

    initialize();

    return () => {
      mounted = false;
    };
  }, [loadAttendance]);

  const todayRecord = useMemo(
    () => myRecords.find((record) => recordDate(record) === today),
    [myRecords, today]
  );

  const isCheckedIn = Boolean(todayRecord && checkInValue(todayRecord));
  const isCheckedOut = Boolean(todayRecord && checkOutValue(todayRecord));

  const history = useMemo(
    () =>
      [...myRecords].sort((a, b) =>
        recordDate(b).localeCompare(recordDate(a))
      ),
    [myRecords]
  );

  async function performAction(action) {
    setActionLoading(action);
    setError("");
    setNotice("");

    try {
      if (action === "check-in") {
        await api.post("/attendance/check-in");
      } else {
        await api.post("/attendance/check-out");
      }

      setNotice(
        action === "check-in"
          ? "Your check-in has been recorded successfully."
          : "Your check-out has been recorded successfully."
      );

      await loadAttendance(canManage);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setActionLoading("");
    }
  }

  function beginCorrection(record) {
    setCorrectionError("");
    setEditingRecord(record);
    setCorrectionForm({
      check_in: toDateTimeLocal(checkInValue(record)),
      check_out: toDateTimeLocal(checkOutValue(record)),
      status: record.status === "MISSED_CHECKOUT" ? "MISSED_CHECKOUT" : (record.status || "PRESENT"),
      notes: record.notes || "",
      correction_reason: "",
    });
  }

  async function saveCorrection(event) {
    event.preventDefault();
    if (!editingRecord?.id) {
      setCorrectionError("Attendance record ID is missing.");
      return;
    }
    if (!correctionForm.check_in) {
      setCorrectionError("Check-in time is required.");
      return;
    }
    if (correctionForm.correction_reason.trim().length < 5) {
      setCorrectionError("Enter a correction reason with at least 5 characters.");
      return;
    }

    setSavingCorrection(true);
    setCorrectionError("");
    setError("");
    setNotice("");

    try {
      const payload = {
        check_in: indiaLocalDateTimeToIso(correctionForm.check_in),
        check_out: indiaLocalDateTimeToIso(correctionForm.check_out),
        status: correctionForm.status,
        notes: correctionForm.notes.trim() || null,
        correction_reason: correctionForm.correction_reason.trim(),
      };

      await api.patch(`/attendance/${editingRecord.id}`, payload);
      setNotice(`Attendance record #${editingRecord.id} was corrected and added to the audit log.`);
      setEditingRecord(null);
      await loadAttendance(canManage);
    } catch (requestError) {
      setCorrectionError(getErrorMessage(requestError));
    } finally {
      setSavingCorrection(false);
    }
  }

  const todayLabel = new Date(`${today}T12:00:00+05:30`).toLocaleDateString(
    "en-IN",
    {
      timeZone: "Asia/Kolkata",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }
  );

  return (
    <main className="w-full min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      {/* Page header: light text for the dark application background */}
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            Workforce / Workspace
          </div>

          <h1
            className="text-3xl font-extrabold tracking-tight sm:text-4xl"
            style={{ color: "#ffffff", opacity: 1 }}
          >
            Attendance Management
          </h1>

          <p
            className="mt-2 max-w-2xl text-sm leading-6 sm:text-base"
            style={{ color: "#cbd5e1", opacity: 1 }}
          >
            Record your working day, track hours and review attendance history.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadAttendance(canManage)}
          disabled={loading || Boolean(actionLoading)}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border px-5 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
          style={{
            borderColor: "#64748b",
            background: "#0f172a",
            color: "#ffffff",
          }}
        >
          <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border p-4 text-sm font-medium"
          style={{
            borderColor: "#fecaca",
            background: "#fef2f2",
            color: "#991b1b",
          }}
        >
          <Clock3 size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-xl border p-4 text-sm font-semibold"
          style={{
            borderColor: "#bbf7d0",
            background: "#f0fdf4",
            color: "#166534",
          }}
        >
          <CheckCircle2 size={19} className="shrink-0" />
          {notice}
        </div>
      )}

      {/* Today's attendance summary */}
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          icon={LogIn}
          label="Today's Check-In"
          value={
            todayRecord
              ? formatDateTime(checkInValue(todayRecord))
              : "Not started"
          }
          description="Your recorded start time"
          color="blue"
        />

        <StatCard
          icon={LogOut}
          label="Today's Check-Out"
          value={
            todayRecord
              ? formatDateTime(checkOutValue(todayRecord))
              : "Not completed"
          }
          description="Your recorded finish time"
          color="green"
        />

        <StatCard
          icon={Timer}
          label="Working Time"
          value={todayRecord ? formatDuration(todayRecord) : "0h 0m"}
          description="Calculated from your attendance"
          color="violet"
        />
      </section>

      {/* Employee check-in/check-out */}
      <section
        className="overflow-hidden rounded-2xl border bg-white shadow-lg shadow-black/5"
        style={{ borderColor: TEXT.border }}
      >
        <div
          className="flex flex-col justify-between gap-4 border-b px-5 py-5 sm:flex-row sm:items-center sm:px-7"
          style={{ borderColor: "#f1f5f9" }}
        >
          <div>
            <h2
              className="text-xl font-bold sm:text-2xl"
              style={{ color: TEXT.primary, opacity: 1 }}
            >
              My Workday
            </h2>

            <p
              className="mt-1 text-sm"
              style={{ color: TEXT.secondary, opacity: 1 }}
            >
              {todayLabel} · India Standard Time
            </p>
          </div>

          <StatusBadge
            checkedIn={isCheckedIn}
            checkedOut={isCheckedOut}
            status={todayRecord?.status}
          />
        </div>

        {profileMissing ? (
          <div
            className="m-5 rounded-xl border p-5 text-sm leading-6 sm:m-7"
            style={{
              borderColor: "#fcd34d",
              background: "#fffbeb",
              color: "#92400e",
            }}
          >
            <p className="font-bold">Employee profile not linked</p>
            <p className="mt-1">
              Ask HR/Admin to link your login account to an active Employee
              record before recording attendance.
            </p>
          </div>
        ) : (
          <div className="p-5 sm:p-7">
            {loading ? (
              <div className="animate-pulse space-y-4">
                <div className="h-20 rounded-xl bg-slate-100" />
                <div className="h-12 w-64 rounded-xl bg-slate-100" />
              </div>
            ) : (
              <>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div
                    className="rounded-xl border p-4 sm:p-5"
                    style={{
                      borderColor: "#dbeafe",
                      background: "#eff6ff",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: "#dbeafe",
                          color: "#1d4ed8",
                        }}
                      >
                        <LogIn size={22} />
                      </div>

                      <div className="min-w-0">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "#1e40af" }}
                        >
                          Start your workday
                        </p>

                        <p
                          className="mt-1 break-words font-bold"
                          style={{ color: TEXT.primary }}
                        >
                          {isCheckedIn
                            ? `Checked in at ${formatDateTime(checkInValue(todayRecord))}`
                            : "You have not checked in yet"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div
                    className="rounded-xl border p-4 sm:p-5"
                    style={{
                      borderColor: "#bbf7d0",
                      background: "#f0fdf4",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          background: "#dcfce7",
                          color: "#15803d",
                        }}
                      >
                        <LogOut size={22} />
                      </div>

                      <div className="min-w-0">
                        <p
                          className="text-sm font-semibold"
                          style={{ color: "#166534" }}
                        >
                          Finish your workday
                        </p>

                        <p
                          className="mt-1 break-words font-bold"
                          style={{ color: TEXT.primary }}
                        >
                          {isCheckedOut
                            ? `Checked out at ${formatDateTime(checkOutValue(todayRecord))}`
                            : isCheckedIn
                              ? "Remember to check out before leaving"
                              : "Check in before checking out"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => performAction("check-in")}
                    disabled={
                      Boolean(actionLoading) ||
                      isCheckedIn ||
                      loading ||
                      profileMissing
                    }
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-7 py-3 text-sm font-bold text-white shadow-sm transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:shadow-none"
                    style={
                      isCheckedIn
                        ? {
                            background: "#cbd5e1",
                            color: "#475569",
                          }
                        : {
                            background: "#2563eb",
                            color: "#ffffff",
                          }
                    }
                  >
                    {actionLoading === "check-in" ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      <LogIn size={18} />
                    )}

                    {isCheckedIn
                      ? "Already Checked In"
                      : actionLoading === "check-in"
                        ? "Checking In..."
                        : "Check In"}
                  </button>

                  <button
                    type="button"
                    onClick={() => performAction("check-out")}
                    disabled={
                      Boolean(actionLoading) ||
                      !isCheckedIn ||
                      isCheckedOut ||
                      loading ||
                      profileMissing
                    }
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-7 py-3 text-sm font-bold text-white shadow-sm transition focus:outline-none focus:ring-4 disabled:cursor-not-allowed disabled:shadow-none"
                    style={
                      !isCheckedIn || isCheckedOut
                        ? {
                            background: "#cbd5e1",
                            color: "#475569",
                          }
                        : {
                            background: "#059669",
                            color: "#ffffff",
                          }
                    }
                  >
                    {actionLoading === "check-out" ? (
                      <RefreshCw size={18} className="animate-spin" />
                    ) : (
                      <LogOut size={18} />
                    )}

                    {isCheckedOut
                      ? "Already Checked Out"
                      : actionLoading === "check-out"
                        ? "Checking Out..."
                        : "Check Out"}
                  </button>
                </div>

                <p
                  className="mt-4 text-xs leading-5 sm:text-sm"
                  style={{ color: TEXT.secondary, opacity: 1 }}
                >
                  Attendance is saved by the backend. Refresh the page to
                  verify the latest record and working time.
                </p>
              </>
            )}
          </div>
        )}
      </section>

      {/* Employee attendance history */}
      <section
        className="overflow-hidden rounded-2xl border bg-white shadow-lg shadow-black/5"
        style={{ borderColor: TEXT.border }}
      >
        <div
          className="flex flex-col justify-between gap-2 border-b px-5 py-5 sm:flex-row sm:items-center sm:px-7"
          style={{ borderColor: "#f1f5f9" }}
        >
          <div>
            <div className="flex items-center gap-2">
              <CalendarDays size={22} style={{ color: "#2563eb" }} />

              <h2
                className="text-xl font-bold sm:text-2xl"
                style={{ color: TEXT.primary, opacity: 1 }}
              >
                My Attendance History
              </h2>
            </div>

            <p
              className="mt-1 text-sm"
              style={{ color: TEXT.secondary, opacity: 1 }}
            >
              View your recorded attendance and work hours.
            </p>
          </div>

          <span
            className="text-sm font-semibold"
            style={{ color: TEXT.secondary, opacity: 1 }}
          >
            {history.length} record{history.length === 1 ? "" : "s"}
          </span>
        </div>

        {loading ? (
          <div className="space-y-3 p-6">
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
            <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          </div>
        ) : history.length === 0 ? (
          <EmptyState message="No attendance records found" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead style={{ background: "#f8fafc" }}>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <TableHeader>Date</TableHeader>
                  <TableHeader>Check-In</TableHeader>
                  <TableHeader>Check-Out</TableHeader>
                  <TableHeader>Working Time</TableHeader>
                  <TableHeader>Status</TableHeader>
                </tr>
              </thead>

              <tbody>
                {history.map((record, index) => {
                  const checkedIn = Boolean(checkInValue(record));
                  const checkedOut = Boolean(checkOutValue(record));

                  return (
                    <tr
                      key={record.id ?? `${recordDate(record)}-${index}`}
                      className="transition hover:bg-blue-50"
                      style={{
                        background: index % 2 === 0 ? "#ffffff" : "#f8fafc",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <TableCell className="whitespace-nowrap font-semibold">
                        {recordDate(record) || "—"}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(checkInValue(record))}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(checkOutValue(record))}
                      </TableCell>

                      <TableCell className="whitespace-nowrap font-semibold">
                        {formatDuration(record)}
                      </TableCell>

                      <TableCell>
                        <StatusBadge
                          checkedIn={checkedIn}
                          checkedOut={checkedOut}
                          status={record.status}
                        />
                      </TableCell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* HR/Admin team attendance */}
      {canManage && (
        <section
          className="overflow-hidden rounded-2xl border bg-white shadow-lg shadow-black/5"
          style={{ borderColor: TEXT.border }}
        >
          <div
            className="border-b px-5 py-5 sm:px-7"
            style={{ borderColor: "#f1f5f9" }}
          >
            <h2
              className="text-xl font-bold sm:text-2xl"
              style={{ color: TEXT.primary, opacity: 1 }}
            >
              Team Attendance
            </h2>

            <p
              className="mt-1 text-sm"
              style={{ color: TEXT.secondary, opacity: 1 }}
            >
              Employee attendance records available to HR/Admin.
            </p>
          </div>

          {teamRecords.length === 0 ? (
            <EmptyState message="No team attendance records returned" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-left">
                <thead style={{ background: "#f8fafc" }}>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <TableHeader>Employee</TableHeader>
                    <TableHeader>Date</TableHeader>
                    <TableHeader>Check-In</TableHeader>
                    <TableHeader>Check-Out</TableHeader>
                    <TableHeader>Working Time</TableHeader>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Actions</TableHeader>
                  </tr>
                </thead>

                <tbody>
                  {teamRecords.map((record, index) => (
                    <tr
                      key={record.id ?? `team-${index}`}
                      className="transition hover:bg-blue-50"
                      style={{
                        background: index % 2 === 0 ? "#ffffff" : "#f8fafc",
                        borderBottom: "1px solid #e2e8f0",
                      }}
                    >
                      <TableCell className="font-semibold">
                        {record.employee_name ??
                          record.employee?.full_name ??
                          record.full_name ??
                          record.employee_code ??
                          `Employee #${record.employee_id ?? "—"}`}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {recordDate(record) || "—"}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(checkInValue(record))}
                      </TableCell>

                      <TableCell className="whitespace-nowrap">
                        {formatDateTime(checkOutValue(record))}
                      </TableCell>

                      <TableCell className="whitespace-nowrap font-semibold">
                        {formatDuration(record)}
                      </TableCell>

                      <TableCell>
                        <StatusBadge
                          checkedIn={Boolean(checkInValue(record))}
                          checkedOut={Boolean(checkOutValue(record))}
                          status={record.status}
                        />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => beginCorrection(record)}
                          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          style={{ borderColor: "#cbd5e1", color: "#0f172a" }}
                          title={`Correct attendance record ${record.id}`}
                        >
                          <Pencil size={14} /> Edit record
                        </button>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Admin/HR attendance correction modal */}
      {canManage && editingRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/70 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !savingCorrection) {
              setEditingRecord(null);
              setCorrectionError("");
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="attendance-correction-title"
            className="my-auto w-full max-w-2xl rounded-2xl border bg-white p-5 shadow-2xl sm:p-7"
            style={{ borderColor: "#cbd5e1" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Admin / HR action</p>
                <h2 id="attendance-correction-title" className="mt-1 text-xl font-extrabold text-slate-900">
                  Correct Attendance #{editingRecord.id}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Correct the actual timestamps. The reason and before/after values will be stored in Audit Logs.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setEditingRecord(null); setCorrectionError(""); }}
                disabled={savingCorrection}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Close correction form"
              >
                <X size={20} />
              </button>
            </div>

            {correctionError && (
              <div role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">
                {correctionError}
              </div>
            )}

            <form onSubmit={saveCorrection} className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Attendance date
                  <input
                    value={recordDate(editingRecord)}
                    readOnly
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2.5 text-slate-700"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Status
                  <select
                    value={correctionForm.status}
                    onChange={(event) => setCorrectionForm((current) => ({ ...current, status: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900"
                  >
                    <option value="PRESENT">Present</option>
                    <option value="LATE">Late</option>
                    <option value="HALF_DAY">Half day</option>
                    <option value="MISSED_CHECKOUT">Missed check-out</option>
                  </select>
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Check-in time *
                  <input
                    type="datetime-local"
                    required
                    value={correctionForm.check_in}
                    onChange={(event) => setCorrectionForm((current) => ({ ...current, check_in: event.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900"
                  />
                </label>
                <label className="block text-sm font-semibold text-slate-700">
                  Check-out time
                  <input
                    type="datetime-local"
                    value={correctionForm.check_out}
                    onChange={(event) => setCorrectionForm((current) => ({ ...current, check_out: event.target.value, status: event.target.value ? (current.status === "MISSED_CHECKOUT" ? "PRESENT" : current.status) : "MISSED_CHECKOUT" }))}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900"
                  />
                  <span className="mt-1 block text-xs font-normal text-slate-500">Leave empty only when checkout was missed; the record will not block future sessions.</span>
                </label>
              </div>

              <label className="block text-sm font-semibold text-slate-700">
                Attendance notes
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={correctionForm.notes}
                  onChange={(event) => setCorrectionForm((current) => ({ ...current, notes: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900"
                  placeholder="Optional record note"
                />
              </label>

              <label className="block text-sm font-semibold text-slate-700">
                Reason for correction *
                <textarea
                  rows={2}
                  required
                  minLength={5}
                  maxLength={500}
                  value={correctionForm.correction_reason}
                  onChange={(event) => setCorrectionForm((current) => ({ ...current, correction_reason: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900"
                  placeholder="Example: Employee forgot to check out on 22 Oct; HR verified the correct time."
                />
              </label>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                A session cannot exceed 24 hours. Saving recalculates working/overtime minutes and writes an audit entry containing the old values, new values and reason.
              </div>

              <div className="flex flex-col-reverse justify-end gap-3 border-t border-slate-200 pt-4 sm:flex-row">
                <button
                  type="button"
                  onClick={() => { setEditingRecord(null); setCorrectionError(""); }}
                  disabled={savingCorrection}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingCorrection}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {savingCorrection ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                  {savingCorrection ? "Saving correction..." : "Save correction"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
