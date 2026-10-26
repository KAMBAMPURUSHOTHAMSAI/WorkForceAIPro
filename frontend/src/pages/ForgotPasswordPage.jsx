import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowLeft, CheckCircle2, Mail, ShieldCheck } from "lucide-react";

import api from "../api/axios";

function getErrorMessage(error) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || "Invalid input").join(". ");
  }
  if (typeof detail === "string" && detail.trim()) return detail;
  if (!error.response) {
    return "Cannot connect to the backend. Check that FastAPI is running and frontend/.env points to the correct API URL.";
  }
  if (error.response.status >= 500) {
    return "The server could not process this request. Please try again later.";
  }
  return "Unable to request a password reset. Please check the email address and try again.";
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess(false);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Enter the email address associated with your account.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email: normalizedEmail });
      // Keep the same generic result for existing and non-existing accounts.
      setSuccess(true);
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
          <ShieldCheck size={24} />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Forgot password?</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          Enter your account email. If an active account exists, password reset instructions will be sent.
        </p>

        {success ? (
          <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4" role="status">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-300" size={20} />
              <div>
                <p className="font-semibold text-emerald-200">Request received</p>
                <p className="mt-1 text-sm leading-5 text-slate-300">
                  If an active account exists for this email, password reset instructions will be sent. Check your inbox and spam folder.
                </p>
              </div>
            </div>
            <Link to="/login" className="mt-4 inline-flex text-sm font-semibold text-cyan-300 hover:text-cyan-200">Return to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-7 space-y-5">
            <div>
              <label htmlFor="forgot-email" className="mb-2 block text-sm font-medium text-slate-200">Email address</label>
              <div className="relative">
                <Mail size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-950/80 py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/15"
                />
              </div>
            </div>

            {error && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-200" role="alert">{error}</p>}

            <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? "Sending request..." : "Send reset instructions"}
            </button>
          </form>
        )}

        <p className="mt-7 text-center text-xs leading-5 text-slate-500">For your security, this page does not disclose whether an email is registered.</p>
      </section>
    </main>
  );
}
