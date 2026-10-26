import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import api from "../api/axios";

function getRegistrationError(error) {
  const status = error.response?.status;
  const detail = error.response?.data?.detail;

  if (status === 409) {
    return "An account with this email already exists. Please sign in instead.";
  }

  if (status === 422) {
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          const field = item.loc?.at(-1);
          return `${field ? `${field}: ` : ""}${item.msg}`;
        })
        .join(". ");
    }

    return detail || "Please check the registration details.";
  }

  if (!error.response) {
    return (
      "Cannot connect to the backend. Ensure FastAPI is running " +
      "at http://127.0.0.1:8010 and frontend/.env points to " +
      "http://127.0.0.1:8010/api/v1. " +
      `Details: ${error.message || "Network error"}`
    );
  }

  if (status >= 500) {
    return `Server error (${status}). Check the FastAPI terminal.`;
  }

  return detail || `Registration failed (${status || "unknown error"}).`;
}

export default function Register() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedName.length < 2) {
      setError("Full name must contain at least 2 characters.");
      return;
    }

    if (password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      await api.post("/auth/register", {
        full_name: normalizedName,
        email: normalizedEmail,
        password,
      });

      navigate("/login", {
        replace: true,
        state: {
          email: normalizedEmail,
          registered: true,
        },
      });
    } catch (requestError) {
      setError(getRegistrationError(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-slate-950 text-white lg:grid-cols-2">
      <section className="relative hidden overflow-hidden border-r border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -left-20 top-32 h-80 w-80 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="absolute bottom-10 right-5 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

        <Link to="/login" className="relative flex items-center gap-3">
          <div className="rounded-xl bg-cyan-400 p-2.5 text-slate-950">
            <Activity size={25} />
          </div>

          <div>
            <h1 className="text-lg font-bold tracking-tight">
              WorkForce AI Pro
            </h1>
            <p className="text-xs text-slate-400">
              Workforce Intelligence Platform
            </p>
          </div>
        </Link>

        <div className="relative max-w-xl">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1.5 text-xs text-cyan-200">
            <UserPlus size={15} />
            Create your workspace account
          </div>

          <h2 className="text-5xl font-semibold leading-tight tracking-tight">
            Your workforce.
            <span className="block text-cyan-300">
              One connected platform.
            </span>
          </h2>

          <p className="mt-6 max-w-md text-base leading-7 text-slate-400">
            Create an account to access your assigned workforce
            tools and manage your work from one place.
          </p>
        </div>

        <p className="relative text-xs text-slate-500">
          WorkForce AI Pro · Secure workforce management
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="rounded-xl bg-cyan-400 p-2.5 text-slate-950">
              <Activity size={24} />
            </div>
            <span className="text-lg font-bold">WorkForce AI Pro</span>
          </div>

          <p className="text-sm font-medium text-cyan-300">
            Get started
          </p>

          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Create your account
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            Enter your details to register as an employee.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-6 break-words rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-7 space-y-4">
            <div>
              <label
                htmlFor="fullName"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Full name
              </label>

              <input
                id="fullName"
                type="text"
                autoComplete="name"
                minLength={2}
                maxLength={150}
                required
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Enter your full name"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Email address
              </label>

              <input
                id="email"
                type="email"
                autoComplete="email"
                maxLength={255}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Password
              </label>

              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 pr-12 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400"
                />

                <button
                  type="button"
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-2 block text-sm font-medium text-slate-300"
              >
                Confirm password
              </label>

              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={confirmPassword}
                  onChange={(event) =>
                    setConfirmPassword(event.target.value)
                  }
                  placeholder="Re-enter your password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 pr-12 text-sm outline-none placeholder:text-slate-600 focus:border-cyan-400"
                />

                <button
                  type="button"
                  aria-label={
                    showConfirmPassword
                      ? "Hide password"
                      : "Show password"
                  }
                  onClick={() =>
                    setShowConfirmPassword((value) => !value)
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:text-white"
                >
                  {showConfirmPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </div>

            <p className="text-xs leading-5 text-slate-500">
              New registrations receive the Employee role.
              Administrators assign other roles separately.
            </p>

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating account..." : "Create account"}
              {!submitting && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="mt-7 flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={15} />
            Your password is securely hashed by the backend.
          </div>

          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-semibold text-cyan-300 hover:text-cyan-200"
            >
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}