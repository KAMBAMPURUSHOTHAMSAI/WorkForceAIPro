import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Activity, ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";

import api from "../api/axios";

function getErrorMessage(error) {
  const status = error.response?.status;
  const detail = error.response?.data?.detail;

  if (status === 400) return "This password reset link is invalid, expired, or has already been used. Request a new link.";
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || "Invalid input").join(". ");
  }
  if (typeof detail === "string" && detail.trim()) return detail;
  if (!error.response) {
    return "Cannot connect to the backend. Check that FastAPI is running and frontend/.env points to the correct API URL.";
  }
  if (status >= 500) return "The server could not reset your password. Please try again later.";
  return `Password reset failed${status ? ` (HTTP ${status})` : ""}. Please try again or request a new link.`;
}

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    if (!token || token.length < 32) {
      setError("The reset link is missing a valid token. Request a new password reset link.");
      return;
    }
    if (password.length < 8 || password.length > 128) {
      setError("Password must contain between 8 and 128 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", {
        token,
        new_password: password,
      });
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(6,182,212,0.12),_transparent_55%)]" />
      <section className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/90 p-7 shadow-2xl sm:p-9">
        <Link to="/login" className="mb-7 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-cyan-300">
          <ArrowLeft size={16} /> Back to sign in
        </Link>

        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-400 text-slate-950">
            <Activity size={23} />
          </div>
          <div>
            <p className="text-lg font-bold tracking-tight">WorkForce AI Pro</p>
            <p className="text-xs text-slate-400">Workforce intelligence</p>
          </div>
        </div>

        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
          <KeyRound size={23} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Reset your password</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Choose a new password to secure your account. Reset links expire after 20 minutes and can only be used once.</p>

        {success ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4" role="status">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={20} />
              <div>
                <p className="font-semibold text-emerald-200">Password reset successfully</p>
                <p className="mt-1 text-sm leading-5 text-slate-300">Your active sessions have been revoked. Please sign in again with your new password.</p>
              </div>
            </div>
            <button type="button" onClick={() => navigate("/login", { replace: true })} className="mt-4 w-full rounded-xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300">Go to sign in</button>
          </div>
        ) : !token ? (
          <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
            <p className="font-semibold text-amber-200">Reset link token is missing</p>
            <p className="mt-1 text-sm leading-5 text-slate-300">Open the complete reset link from your email or request a new one.</p>
            <Link to="/forgot-password" className="mt-4 inline-flex text-sm font-semibold text-cyan-300 hover:text-cyan-200">Request a new reset link</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="reset-password" className="mb-2 block text-sm font-medium text-slate-200">New password</label>
              <div className="relative">
                <input
                  id="reset-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 py-3 pl-3 pr-11 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15"
                />
                <button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white">
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
            <div>
              <label htmlFor="reset-confirm-password" className="mb-2 block text-sm font-medium text-slate-200">Confirm new password</label>
              <div className="relative">
                <input
                  id="reset-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={128}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter new password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 py-3 pl-3 pr-11 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15"
                />
                <button type="button" aria-label={showConfirmPassword ? "Hide confirmation" : "Show confirmation"} onClick={() => setShowConfirmPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-white">
                  {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {error && <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm leading-5 text-rose-200" role="alert">{error}</div>}

            <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Resetting password..." : "Reset password"}
            </button>
          </form>
        )}

        <p className="mt-7 flex items-center justify-center gap-2 text-center text-xs leading-5 text-slate-500"><ShieldCheck size={14} /> Reset links expire after 20 minutes.</p>
      </section>
    </main>
  );
}
