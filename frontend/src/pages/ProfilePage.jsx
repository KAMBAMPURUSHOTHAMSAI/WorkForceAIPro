
import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  CheckCircle2,
  RefreshCw,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import api from "../api/axios";
import { useAuth } from "../context/AuthContext";

export default function ProfilePage() {
  const { refreshProfile } = useAuth();

  const [profile, setProfile] = useState(null);
  const [employee, setEmployee] = useState(null);

  const [form, setForm] = useState({
    full_name: "",
    email: "",
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadProfile = useCallback(async () => {
    try {
      // The first request is awaited before updating React state.
      const response = await api.get("/auth/me");
      const user = response.data;

      setProfile(user);

      setForm({
        full_name: user.full_name || "",
        email: user.email || "",
      });

      try {
        const employeeResponse = await api.get("/employees/me");
        setEmployee(employeeResponse.data);
      } catch (employeeError) {
        // A user account may not have a linked employee record.
        if (employeeError.response?.status === 404) {
          setEmployee(null);
        } else {
          setEmployee(null);
        }
      }
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          "Unable to load your profile."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Start the asynchronous profile-loading operation.
    // State updates occur as the API request completes.
   // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProfile();
  }, [loadProfile]);

  function updateField(event) {
    const { name, value } = event.target;

    setForm((current) => ({
      ...current,
      [name]: value,
    }));

    // Clear the previous status when the user edits a field.
    setError("");
    setSuccess("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const response = await api.patch("/auth/me", {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
      });

      setProfile(response.data);

      setForm({
        full_name: response.data.full_name || "",
        email: response.data.email || "",
      });

      await refreshProfile();

      setSuccess("Profile updated successfully.");
    } catch (requestError) {
      setError(
        requestError.response?.data?.detail ||
          "Unable to update your profile."
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-slate-400">
        <RefreshCw size={17} className="animate-spin" />
        Loading profile...
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section>
        <p className="text-xs font-medium tracking-[0.14em] text-cyan-300">
          ACCOUNT SETTINGS
        </p>

        <h2 className="mt-2 text-2xl font-semibold">
          My Profile
        </h2>

        <p className="mt-2 text-sm text-slate-400">
          Update your account details and view your linked employee profile.
        </p>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-400/20 bg-rose-400/[0.06] p-4 text-sm text-rose-200"
        >
          {String(error)}
        </div>
      )}

      {success && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] p-4 text-sm text-emerald-200"
        >
          <CheckCircle2 size={17} />
          {success}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Account information */}
        <section className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 sm:p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-cyan-300/10 p-3 text-cyan-300">
              <UserRound size={21} />
            </div>

            <div>
              <h3 className="text-sm font-semibold">
                Account information
              </h3>
              <p className="mt-1 text-xs text-slate-500">
                Edit your basic account details
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="profile-full-name"
                className="mb-2 block text-sm text-slate-300"
              >
                Full name
              </label>

              <input
                id="profile-full-name"
                name="full_name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                maxLength={150}
                value={form.full_name}
                onChange={updateField}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label
                htmlFor="profile-email"
                className="mb-2 block text-sm text-slate-300"
              >
                Email address
              </label>

              <input
                id="profile-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={255}
                value={form.email}
                onChange={updateField}
                className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-cyan-400"
              />
            </div>

            <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck size={16} className="text-cyan-300" />

                <span className="text-xs font-medium">
                  Assigned role
                </span>
              </div>

              <p className="mt-2 text-sm font-semibold text-white">
                {profile?.role || "—"}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                Only an authorized administrator can change your role.
              </p>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}

              {saving ? "Saving..." : "Save profile"}
            </button>
          </form>
        </section>

        {/* Linked employee information */}
        <section className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 sm:p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-xl bg-violet-300/10 p-3 text-violet-300">
              <Activity size={21} />
            </div>

            <div>
              <h3 className="text-sm font-semibold">
                Employee profile
              </h3>

              <p className="mt-1 text-xs text-slate-500">
                Linked information from the employee record
              </p>
            </div>
          </div>

          {employee ? (
            <div className="space-y-3">
              {[
                ["Employee code", employee.employee_code],
                [
                  "Employee name",
                  `${employee.first_name || ""} ${employee.last_name || ""}`.trim(),
                ],
                ["Job title", employee.job_title],
                ["Employment type", employee.employment_type],
                ["Employment status", employee.employment_status],
                ["Department ID", employee.department_id],
                ["Date of joining", employee.date_of_joining],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-4 rounded-xl bg-white/[0.025] p-3"
                >
                  <span className="text-xs text-slate-500">
                    {label}
                  </span>

                  <span className="break-words text-right text-sm text-slate-200">
                    {value ?? "—"}
                  </span>
                </div>
              ))}

              <p className="pt-2 text-xs leading-5 text-slate-500">
                Employee details such as department, designation and
                employment status are maintained through authorized
                Employee Management operations.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 p-6">
              <p className="text-sm text-slate-300">
                No employee profile is linked to this account.
              </p>

              <p className="mt-2 text-xs leading-5 text-slate-500">
                Ask Admin/HR to create or link your Employee record.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
