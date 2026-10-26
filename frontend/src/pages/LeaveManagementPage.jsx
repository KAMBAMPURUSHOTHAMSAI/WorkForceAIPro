import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import api from "../api/axios";

const COLORS = {
  text: "#0f172a",
  secondary: "#475569",
  muted: "#64748b",
  border: "#e2e8f0",
};

const TODAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

function errorMessage(error) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || "Invalid input").join(", ");
  }
  return error?.message || "Request failed. Please try again.";
}

function listFrom(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  return [];
}

function formatDate(value) {
  if (!value) return "—";
  const dateOnly = String(value).slice(0, 10);
  const parsed = new Date(`${dateOnly}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return dateOnly;
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function roleName(user) {
  return String(user?.role ?? user?.role_name ?? "EMPLOYEE").toUpperCase();
}

function statusOf(record) {
  return String(record?.status ?? "PENDING").toUpperCase();
}

function StatusBadge({ status }) {
  const normalized = String(status || "PENDING").toUpperCase();
  const styleByStatus = {
    ACTIVE: { background: "#dcfce7", color: "#166534" },
    INACTIVE: { background: "#e2e8f0", color: "#334155" },
    APPROVED: { background: "#dcfce7", color: "#166534" },
    REJECTED: { background: "#fee2e2", color: "#991b1b" },
    CANCELLED: { background: "#e2e8f0", color: "#334155" },
    PENDING: { background: "#fef3c7", color: "#92400e" },
  };
  return (
    <span
      className="inline-flex rounded-full px-3 py-1.5 text-xs font-bold"
      style={styleByStatus[normalized] || styleByStatus.PENDING}
    >
      {normalized}
    </span>
  );
}

function Panel({ children, className = "" }) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border bg-white shadow-lg shadow-black/5 ${className}`}
      style={{ borderColor: COLORS.border }}
    >
      {children}
    </section>
  );
}

function PanelHeading({ icon: Icon, title, description, actions }) {
  return (
    <div
      className="flex flex-col justify-between gap-3 border-b px-5 py-5 sm:flex-row sm:items-center sm:px-7"
      style={{ borderColor: "#f1f5f9" }}
    >
      <div>
        <div className="flex items-center gap-2">
          {Icon && <Icon size={22} style={{ color: "#2563eb" }} />}
          <h2 className="text-xl font-bold sm:text-2xl" style={{ color: COLORS.text }}>
            {title}
          </h2>
        </div>
        {description && (
          <p className="mt-1 text-sm" style={{ color: COLORS.secondary }}>
            {description}
          </p>
        )}
      </div>
      {actions}
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="flex flex-col items-center px-5 py-10 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-2xl"
        style={{ background: "#f1f5f9", color: "#64748b" }}
      >
        <CalendarDays size={26} />
      </div>
      <p className="mt-4 font-bold" style={{ color: COLORS.text }}>{title}</p>
      <p className="mt-1 max-w-lg text-sm" style={{ color: COLORS.secondary }}>{description}</p>
    </div>
  );
}

function Field({ label, htmlFor, required = false, children, hint }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 block text-sm font-bold" style={{ color: COLORS.text }}>
        {label}{required && <span className="ml-1 text-red-600">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1.5 text-xs" style={{ color: COLORS.muted }}>{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100";

function TableHeader({ children }) {
  return (
    <th
      className="whitespace-nowrap px-4 py-4 text-left text-xs font-bold uppercase tracking-wider sm:px-5"
      style={{ color: COLORS.secondary }}
    >
      {children}
    </th>
  );
}

function TableCell({ children, className = "" }) {
  return (
    <td className={`px-4 py-4 text-sm sm:px-5 ${className}`} style={{ color: COLORS.text }}>
      {children}
    </td>
  );
}

function StatCard({ title, value, description, icon: Icon, color }) {
  const themes = {
    blue: { background: "#dbeafe", foreground: "#1d4ed8" },
    amber: { background: "#fef3c7", foreground: "#92400e" },
    green: { background: "#dcfce7", foreground: "#166534" },
    violet: { background: "#ede9fe", foreground: "#6d28d9" },
  };
  const theme = themes[color] || themes.blue;

  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6" style={{ borderColor: COLORS.border }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: COLORS.secondary }}>{title}</p>
          <p className="mt-3 text-2xl font-extrabold" style={{ color: COLORS.text }}>{value}</p>
          <p className="mt-1 text-sm" style={{ color: COLORS.muted }}>{description}</p>
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: theme.background, color: theme.foreground }}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

const emptyPolicy = {
  name: "",
  description: "",
  annual_quota: 12,
  is_paid: true,
  is_active: true,
};

export default function LeaveManagementPage() {
  const [user, setUser] = useState(null);
  const [hasEmployeeProfile, setHasEmployeeProfile] = useState(false);
  const [myEmployeeId, setMyEmployeeId] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [requests, setRequests] = useState([]);
  const [balances, setBalances] = useState([]);
  const [employeeNames, setEmployeeNames] = useState({});

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowAction, setRowAction] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [filterStatus, setFilterStatus] = useState("ALL");
  const [decisionNotes, setDecisionNotes] = useState({});

  const [leaveForm, setLeaveForm] = useState({
    policy_id: "",
    start_date: TODAY,
    end_date: TODAY,
    reason: "",
  });

  const [showPolicyForm, setShowPolicyForm] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState(null);
  const [policyForm, setPolicyForm] = useState(emptyPolicy);

  const role = roleName(user);
  const canManagePolicies = role === "ADMIN" || role === "HR";
  const canReviewRequests = ["ADMIN", "HR", "MANAGER"].includes(role);

  const loadData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);

    setError("");

    try {
      const profileResponse = await api.get("/auth/me");
      const currentUser = profileResponse.data;
      setUser(currentUser);

      const currentRole = roleName(currentUser);
      const isReviewer = ["ADMIN", "HR", "MANAGER"].includes(currentRole);
      const isPolicyManager = ["ADMIN", "HR"].includes(currentRole);

      const jobs = [
        api.get(isReviewer ? "/leaves" : "/leaves/me", {
          params: isReviewer ? { page: 1, page_size: 100 } : undefined,
        }),
        api.get("/leaves/policies"),
        api.get("/employees/me"),
      ];

      // Managers review direct reports and also need their own leave history.
      if (currentRole === "MANAGER") {
        jobs.push(api.get("/leaves/me"));
      }

      if (isPolicyManager) {
        jobs.push(api.get("/employees", { params: { page: 1, page_size: 100 } }));
      }

      const results = await Promise.allSettled(jobs);

      if (results[0].status === "fulfilled") {
        let loadedRequests = listFrom(results[0].value.data);

        if (currentRole === "MANAGER" && results[3]?.status === "fulfilled") {
          const ownRequests = listFrom(results[3].value.data);
          const byId = new Map();
          [...loadedRequests, ...ownRequests].forEach((item) => byId.set(item.id, item));
          loadedRequests = [...byId.values()].sort((a, b) =>
            String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
          );
        }

        setRequests(loadedRequests);
      } else {
        setRequests([]);
        setError(errorMessage(results[0].reason));
      }

      if (results[1].status === "fulfilled") {
        setPolicies(listFrom(results[1].value.data).filter((policy) => policy.is_active !== false));
      } else {
        setPolicies([]);
        setError((current) => current || `Could not load leave policies: ${errorMessage(results[1].reason)}`);
      }

      const profileResult = results[2];
      const linkedEmployee = profileResult.status === "fulfilled";
      setHasEmployeeProfile(linkedEmployee);
      setMyEmployeeId(linkedEmployee ? profileResult.value.data.id : null);

      if (linkedEmployee) {
        try {
          const balanceResponse = await api.get("/leaves/balance/me", {
            params: { year: new Date().getFullYear() },
          });
          setBalances(listFrom(balanceResponse.data));
        } catch {
          setBalances([]);
        }
      } else {
        setBalances([]);
      }

      const employeeResultIndex = currentRole === "MANAGER" ? 4 : 3;
      if (isPolicyManager && results[employeeResultIndex]?.status === "fulfilled") {
        const employees = listFrom(results[employeeResultIndex].value.data);
        const nameMap = {};
        for (const employee of employees) {
          nameMap[employee.id] = [employee.first_name, employee.last_name].filter(Boolean).join(" ") || employee.employee_code || `Employee #${employee.id}`;
        }
        setEmployeeNames(nameMap);
      } else {
        setEmployeeNames({});
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Initial server hydration for the active session.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const filteredRequests = useMemo(() => {
    if (filterStatus === "ALL") return requests;
    return requests.filter((request) => statusOf(request) === filterStatus);
  }, [requests, filterStatus]);

  const summary = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((item) => statusOf(item) === "PENDING").length,
    approved: requests.filter((item) => statusOf(item) === "APPROVED").length,
    rejected: requests.filter((item) => statusOf(item) === "REJECTED").length,
  }), [requests]);

  async function submitLeave(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!hasEmployeeProfile) {
      setError("Your login account is not linked to an active employee profile. Ask HR/Admin to link it first.");
      return;
    }
    if (!leaveForm.policy_id) {
      setError("Please select a leave policy.");
      return;
    }
    if (leaveForm.start_date < TODAY) {
      setError("Start date cannot be in the past.");
      return;
    }
    if (leaveForm.end_date < leaveForm.start_date) {
      setError("End date cannot be before the start date.");
      return;
    }
    if (leaveForm.start_date.slice(0, 4) !== leaveForm.end_date.slice(0, 4)) {
      setError("Leave dates must be within the same calendar year.");
      return;
    }
    if (leaveForm.reason.trim().length < 5) {
      setError("Please provide a reason with at least 5 characters.");
      return;
    }

    setSaving(true);
    try {
      await api.post("/leaves", {
        policy_id: Number(leaveForm.policy_id),
        start_date: leaveForm.start_date,
        end_date: leaveForm.end_date,
        reason: leaveForm.reason.trim(),
      });

      setNotice("Leave application submitted successfully.");
      setLeaveForm({ policy_id: "", start_date: TODAY, end_date: TODAY, reason: "" });
      await loadData(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function beginCreatePolicy() {
    setEditingPolicyId(null);
    setPolicyForm({ ...emptyPolicy });
    setShowPolicyForm(true);
    setError("");
    setNotice("");
  }

  function beginEditPolicy(policy) {
    setEditingPolicyId(policy.id);
    setPolicyForm({
      name: policy.name ?? "",
      description: policy.description ?? "",
      annual_quota: Number(policy.annual_quota ?? 12),
      is_paid: Boolean(policy.is_paid),
      is_active: policy.is_active !== false,
    });
    setShowPolicyForm(true);
    setError("");
    setNotice("");
  }

  async function savePolicy(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const name = policyForm.name.trim();
    const quota = Number(policyForm.annual_quota);

    if (name.length < 2) {
      setError("Leave policy name must contain at least 2 characters.");
      setSaving(false);
      return;
    }
    if (!Number.isInteger(quota) || quota < 0 || quota > 365) {
      setError("Annual quota must be a whole number between 0 and 365.");
      setSaving(false);
      return;
    }

    const payload = {
      name,
      description: policyForm.description.trim() || null,
      annual_quota: quota,
      is_paid: Boolean(policyForm.is_paid),
    };

    if (editingPolicyId !== null) {
      payload.is_active = Boolean(policyForm.is_active);
    }

    try {
      if (editingPolicyId === null) {
        await api.post("/leaves/policies", payload);
        setNotice("Leave policy created successfully.");
      } else {
        await api.patch(`/leaves/policies/${editingPolicyId}`, payload);
        setNotice(payload.is_active ? "Leave policy updated successfully." : "Leave policy deactivated successfully.");
      }

      setShowPolicyForm(false);
      setEditingPolicyId(null);
      setPolicyForm({ ...emptyPolicy });
      await loadData(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  async function reviewRequest(request, decision) {
    const id = request.id;
    if (!id) {
      setError("Leave request ID is missing from the API response.");
      return;
    }

    const actionId = `${id}-${decision}`;
    setRowAction(actionId);
    setError("");
    setNotice("");

    try {
      await api.patch(`/leaves/${id}/decision`, {
        decision,
        comments: String(decisionNotes[id] ?? "").trim() || null,
      });
      setNotice(decision === "APPROVED" ? "Leave request approved." : "Leave request rejected.");
      await loadData(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setRowAction("");
    }
  }

  async function cancelRequest(request) {
    const id = request.id;
    if (!id) {
      setError("Leave request ID is missing from the API response.");
      return;
    }
    if (!window.confirm("Cancel this pending leave request?")) return;

    setRowAction(`${id}-CANCEL`);
    setError("");
    setNotice("");

    try {
      await api.post(`/leaves/${id}/cancel`);
      setNotice("Leave request cancelled successfully.");
      await loadData(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setRowAction("");
    }
  }

  return (
    <main className="w-full min-w-0 space-y-6 px-4 py-6 sm:px-6 lg:px-8 2xl:px-10">
      <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
            Workforce / People Operations
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {canReviewRequests ? "Leave Management" : "My Leave"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
            Submit leave applications, monitor balances and manage approval workflows.
          </p>
        </div>

        <button
          type="button"
          onClick={() => loadData(true)}
          disabled={loading || refreshing || saving || Boolean(rowAction)}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border px-5 py-3 text-sm font-bold text-white transition disabled:opacity-50 sm:self-auto"
          style={{ borderColor: "#64748b", background: "#0f172a" }}
        >
          <RefreshCw size={17} className={refreshing || loading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border p-4 text-sm font-semibold" style={{ borderColor: "#fecaca", background: "#fef2f2", color: "#991b1b" }}>
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-center gap-3 rounded-xl border p-4 text-sm font-semibold" style={{ borderColor: "#bbf7d0", background: "#f0fdf4", color: "#166534" }}>
          <CheckCircle2 size={19} /> {notice}
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Visible Requests" value={summary.total} description="Requests in this view" icon={FileText} color="blue" />
        <StatCard title="Pending" value={summary.pending} description="Awaiting review" icon={Clock3} color="amber" />
        <StatCard title="Approved" value={summary.approved} description="Approved requests" icon={CheckCircle2} color="green" />
        <StatCard title="Rejected" value={summary.rejected} description="Rejected requests" icon={XCircle} color="violet" />
      </section>

      {/* ADMIN/HR: leave policy creation and maintenance */}
      {canManagePolicies && (
        <Panel>
          <PanelHeading
            icon={ShieldCheck}
            title="Leave Policy Management"
            description="Create and maintain leave types, annual quota and paid/unpaid rules."
            actions={
              <button
                type="button"
                onClick={showPolicyForm ? () => setShowPolicyForm(false) : beginCreatePolicy}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white"
                style={{ background: showPolicyForm ? "#475569" : "#2563eb" }}
              >
                {showPolicyForm ? <X size={17} /> : <Plus size={17} />}
                {showPolicyForm ? "Close Form" : "Create Leave Policy"}
              </button>
            }
          />

          {showPolicyForm && (
            <form onSubmit={savePolicy} className="space-y-5 border-b p-5 sm:p-7" style={{ borderColor: "#e2e8f0", background: "#f8fafc" }}>
              <h3 className="text-lg font-bold" style={{ color: COLORS.text }}>
                {editingPolicyId === null ? "New Leave Policy" : `Edit Policy #${editingPolicyId}`}
              </h3>
              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Policy Name" htmlFor="policy-name" required>
                  <input id="policy-name" className={inputClass} style={{ borderColor: "#cbd5e1", color: COLORS.text }} required minLength={2} maxLength={80} value={policyForm.name} onChange={(event) => setPolicyForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Casual Leave" />
                </Field>
                <Field label="Annual Quota (Days)" htmlFor="policy-quota" required hint="Enter a whole number from 0 to 365.">
                  <input id="policy-quota" className={inputClass} style={{ borderColor: "#cbd5e1", color: COLORS.text }} type="number" min="0" max="365" step="1" required value={policyForm.annual_quota} onChange={(event) => setPolicyForm((current) => ({ ...current, annual_quota: event.target.value }))} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Description" htmlFor="policy-description">
                    <textarea id="policy-description" className={inputClass} style={{ borderColor: "#cbd5e1", color: COLORS.text }} rows={3} value={policyForm.description} onChange={(event) => setPolicyForm((current) => ({ ...current, description: event.target.value }))} placeholder="Explain when employees can use this leave policy." />
                  </Field>
                </div>
                <label className="flex items-center gap-3 rounded-xl border bg-white p-4" style={{ borderColor: "#cbd5e1" }}>
                  <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={policyForm.is_paid} onChange={(event) => setPolicyForm((current) => ({ ...current, is_paid: event.target.checked }))} />
                  <span>
                    <span className="block text-sm font-bold" style={{ color: COLORS.text }}>Paid Leave</span>
                    <span className="block text-xs" style={{ color: COLORS.secondary }}>Include this policy in paid leave entitlement.</span>
                  </span>
                </label>
                {editingPolicyId !== null && (
                  <label className="flex items-center gap-3 rounded-xl border bg-white p-4" style={{ borderColor: "#cbd5e1" }}>
                    <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={policyForm.is_active} onChange={(event) => setPolicyForm((current) => ({ ...current, is_active: event.target.checked }))} />
                    <span>
                      <span className="block text-sm font-bold" style={{ color: COLORS.text }}>Active Policy</span>
                      <span className="block text-xs" style={{ color: COLORS.secondary }}>Inactive policies disappear from employee application choices.</span>
                    </span>
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-50" style={{ background: "#2563eb" }}>
                  {saving ? <RefreshCw size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
                  {saving ? "Saving..." : editingPolicyId === null ? "Create Policy" : "Save Changes"}
                </button>
                <button type="button" disabled={saving} onClick={() => { setShowPolicyForm(false); setEditingPolicyId(null); setPolicyForm({ ...emptyPolicy }); }} className="rounded-xl border px-5 py-3 text-sm font-bold" style={{ borderColor: "#cbd5e1", color: COLORS.text, background: "white" }}>
                  Cancel
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="p-6 text-sm" style={{ color: COLORS.secondary }}>Loading policies...</div>
          ) : policies.length === 0 ? (
            <EmptyState title="No active leave policies" description="Create a leave policy so employees can select it when submitting applications." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead style={{ background: "#f8fafc" }}>
                  <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <TableHeader>Policy</TableHeader><TableHeader>Annual Quota</TableHeader><TableHeader>Pay Type</TableHeader><TableHeader>Status</TableHeader><TableHeader>Actions</TableHeader>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy, index) => (
                    <tr key={policy.id} style={{ background: index % 2 ? "#f8fafc" : "#fff", borderBottom: "1px solid #e2e8f0" }}>
                      <TableCell>
                        <p className="font-bold">{policy.name}</p>
                        {policy.description && <p className="mt-1 max-w-md whitespace-normal text-xs" style={{ color: COLORS.secondary }}>{policy.description}</p>}
                      </TableCell>
                      <TableCell className="font-semibold">{policy.annual_quota} days</TableCell>
                      <TableCell>{policy.is_paid ? "Paid" : "Unpaid"}</TableCell>
                      <TableCell><StatusBadge status={policy.is_active ? "ACTIVE" : "INACTIVE"} /></TableCell>
                      <TableCell>
                        <button type="button" onClick={() => beginEditPolicy(policy)} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold" style={{ borderColor: "#bfdbfe", background: "#eff6ff", color: "#1d4ed8" }}>
                          <Pencil size={14} /> Edit Policy
                        </button>
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* Employee/linked-user leave application */}
      {hasEmployeeProfile && (
        <Panel>
          <PanelHeading icon={Send} title="Apply for Leave" description="Choose a policy, enter your dates and submit the request for review." />
          <form onSubmit={submitLeave} className="space-y-5 p-5 sm:p-7">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Leave Policy" htmlFor="leave-policy" required>
                <select id="leave-policy" className={inputClass} style={{ borderColor: "#cbd5e1", color: COLORS.text }} required value={leaveForm.policy_id} onChange={(event) => setLeaveForm((current) => ({ ...current, policy_id: event.target.value }))}>
                  <option value="">Select leave policy</option>
                  {policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name} · {policy.annual_quota} days/year · {policy.is_paid ? "Paid" : "Unpaid"}</option>)}
                </select>
              </Field>
              <Field label="Reason" htmlFor="leave-reason" required hint="Please provide at least 5 characters.">
                <input id="leave-reason" className={inputClass} style={{ borderColor: "#cbd5e1", color: COLORS.text }} required minLength={5} maxLength={2000} value={leaveForm.reason} onChange={(event) => setLeaveForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Reason for leave" />
              </Field>
              <Field label="Start Date" htmlFor="leave-start" required>
                <input id="leave-start" type="date" min={TODAY} className={inputClass} style={{ borderColor: "#cbd5e1", color: COLORS.text }} required value={leaveForm.start_date} onChange={(event) => setLeaveForm((current) => ({ ...current, start_date: event.target.value, end_date: current.end_date < event.target.value ? event.target.value : current.end_date }))} />
              </Field>
              <Field label="End Date" htmlFor="leave-end" required>
                <input id="leave-end" type="date" min={leaveForm.start_date || TODAY} className={inputClass} style={{ borderColor: "#cbd5e1", color: COLORS.text }} required value={leaveForm.end_date} onChange={(event) => setLeaveForm((current) => ({ ...current, end_date: event.target.value }))} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t pt-5" style={{ borderColor: "#f1f5f9" }}>
              <button type="submit" disabled={saving || loading || policies.length === 0} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" style={{ background: "#2563eb" }}>
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} />}
                {saving ? "Submitting..." : "Submit Leave Request"}
              </button>
              <p className="text-xs sm:text-sm" style={{ color: COLORS.secondary }}>Weekends are excluded from backend working-day totals.</p>
            </div>
          </form>
        </Panel>
      )}

      {!hasEmployeeProfile && !canManagePolicies && !loading && (
        <div className="rounded-xl border p-4 text-sm" style={{ borderColor: "#fde68a", background: "#fffbeb", color: "#92400e" }}>
          Your login is not linked to an active employee profile. Ask HR/Admin to link your account to use leave applications and balances.
        </div>
      )}

      {/* Self leave balances */}
      {hasEmployeeProfile && (
        <Panel>
          <PanelHeading icon={CalendarDays} title="My Leave Balance" description={`Leave quota, approved days and pending reservations for ${new Date().getFullYear()}.`} />
          {loading ? (
            <div className="p-6 text-sm" style={{ color: COLORS.secondary }}>Loading leave balance...</div>
          ) : balances.length === 0 ? (
            <EmptyState title="No leave balance records" description="No active leave policies or balance data were returned for your employee account." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px] border-collapse text-left">
                <thead style={{ background: "#f8fafc" }}><tr style={{ borderBottom: "1px solid #e2e8f0" }}><TableHeader>Policy</TableHeader><TableHeader>Annual Quota</TableHeader><TableHeader>Approved</TableHeader><TableHeader>Pending</TableHeader><TableHeader>Available</TableHeader></tr></thead>
                <tbody>
                  {balances.map((balance, index) => (
                    <tr key={balance.policy_id ?? index} style={{ background: index % 2 ? "#f8fafc" : "#fff", borderBottom: "1px solid #e2e8f0" }}>
                      <TableCell className="font-semibold">{balance.policy_name ?? `Policy #${balance.policy_id}`}</TableCell>
                      <TableCell>{balance.annual_quota ?? 0} days</TableCell>
                      <TableCell>{balance.approved_days ?? 0} days</TableCell>
                      <TableCell>{balance.pending_days ?? 0} days</TableCell>
                      <TableCell className="font-extrabold" style={{ color: Number(balance.available_days ?? 0) > 0 ? "#166534" : "#b91c1c" }}>{balance.available_days ?? 0} days</TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      )}

      {/* Requests and approval actions */}
      <Panel>
        <PanelHeading
          icon={canReviewRequests ? ShieldCheck : FileText}
          title={canReviewRequests ? "Leave Requests & Approvals" : "My Leave History"}
          description={canReviewRequests ? "Review requests within your role permissions." : "Review your leave history, status and decisions."}
          actions={
            <div className="flex items-center gap-2">
              <label htmlFor="leave-filter" className="text-sm font-semibold" style={{ color: COLORS.secondary }}>Status</label>
              <select id="leave-filter" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold" style={{ borderColor: "#cbd5e1", color: COLORS.text }}>
                <option value="ALL">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          }
        />

        {loading ? (
          <div className="space-y-3 p-6"><div className="h-10 animate-pulse rounded-lg bg-slate-100" /><div className="h-10 animate-pulse rounded-lg bg-slate-100" /></div>
        ) : filteredRequests.length === 0 ? (
          <EmptyState title="No leave requests found" description={canReviewRequests ? "There are no requests matching this status filter." : "Your submitted leave applications will appear here."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left">
              <thead style={{ background: "#f8fafc" }}>
                <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                  {canReviewRequests && <TableHeader>Employee</TableHeader>}
                  <TableHeader>Policy</TableHeader><TableHeader>Start</TableHeader><TableHeader>End</TableHeader><TableHeader>Days</TableHeader><TableHeader>Reason</TableHeader><TableHeader>Status</TableHeader><TableHeader>Reviewer Notes</TableHeader><TableHeader>Actions</TableHeader>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request, index) => {
                  const id = request.id;
                  const status = statusOf(request);
                  const pending = status === "PENDING";
                  const busy = rowAction.startsWith(`${id}-`);
                  const employeeLabel = employeeNames[request.employee_id] || `Employee #${request.employee_id}`;
                  const isOwnRequest = myEmployeeId != null && Number(request.employee_id) === Number(myEmployeeId);
                  const policyName = policies.find((item) => item.id === request.policy_id)?.name || `Policy #${request.policy_id}`;

                  return (
                    <tr key={id} style={{ background: index % 2 ? "#f8fafc" : "#fff", borderBottom: "1px solid #e2e8f0" }} className="align-top transition hover:bg-blue-50">
                      {canReviewRequests && <TableCell className="font-semibold">{employeeLabel}</TableCell>}
                      <TableCell className="font-semibold">{policyName}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(request.start_date)}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(request.end_date)}</TableCell>
                      <TableCell className="whitespace-nowrap font-semibold">{request.total_days ?? "—"}</TableCell>
                      <TableCell className="max-w-xs whitespace-normal">{request.reason || "—"}</TableCell>
                      <TableCell><StatusBadge status={status} /></TableCell>
                      <TableCell className="max-w-xs whitespace-normal">{request.reviewer_comments || "—"}</TableCell>
                      <TableCell>
                        {pending && isOwnRequest ? (
                          <button type="button" disabled={Boolean(rowAction)} onClick={() => cancelRequest(request)} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "#fecaca", color: "#b91c1c", background: "#fff" }}>
                            {busy ? "Cancelling..." : "Cancel My Request"}
                          </button>
                        ) : canReviewRequests && pending ? (
                          <div className="min-w-52 space-y-2">
                            <input type="text" aria-label={`Reviewer comments for leave ${id}`} value={decisionNotes[id] ?? ""} onChange={(event) => setDecisionNotes((current) => ({ ...current, [id]: event.target.value }))} placeholder="Optional reviewer comments" className="w-full rounded-lg border bg-white px-3 py-2 text-xs" style={{ borderColor: "#cbd5e1", color: COLORS.text }} />
                            <div className="flex flex-wrap gap-2">
                              <button type="button" disabled={Boolean(rowAction)} onClick={() => reviewRequest(request, "APPROVED")} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "#15803d" }}>
                                {busy && rowAction === `${id}-APPROVED` ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />} Approve
                              </button>
                              <button type="button" disabled={Boolean(rowAction)} onClick={() => reviewRequest(request, "REJECTED")} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "#b91c1c" }}>
                                {busy && rowAction === `${id}-REJECTED` ? <RefreshCw size={13} className="animate-spin" /> : <XCircle size={13} />} Reject
                              </button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs" style={{ color: COLORS.muted }}>No action</span>
                        )}
                      </TableCell>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </main>
  );
}
