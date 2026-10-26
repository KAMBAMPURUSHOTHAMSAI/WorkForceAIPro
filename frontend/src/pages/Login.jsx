import { useState } from "react";
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Activity,
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import { useAuth } from "../context/AuthContext";

function getLoginError(error) {
  const status = error.response?.status;
  const detail = error.response?.data?.detail;

  if (status === 401) {
    return "Incorrect email or password. Please try again, or register a new account.";
  }

  if (status === 403) {
    return (
      detail ||
      "Your account is inactive. Please contact your administrator."
    );
  }

  if (status === 422) {
    if (Array.isArray(detail)) {
      return detail
        .map((item) => item.msg || "Invalid input")
        .join(". ");
    }

    return detail || "Please check the email and password fields.";
  }

  if (!error.response) {
    return (
      "Cannot connect to the backend. Check that FastAPI is running " +
      "at http://127.0.0.1:8010 and that frontend/.env contains " +
      "VITE_API_BASE_URL=http://127.0.0.1:8010/api/v1. " +
      `Details: ${error.message || "Network error"}`
    );
  }

  if (status >= 500) {
    return (
      `Backend server error (${status}). ` +
      "Check the FastAPI terminal for the actual error."
    );
  }

  return detail || `Login failed. HTTP status: ${status || "unknown"}.`;
}

export default function Login() {
  const { login, user, loading } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(
    () => location.state?.email || ""
  );
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login(email.trim(), password);

      const destination =
        location.state?.from?.pathname || "/";

      navigate(destination, { replace: true });
    } catch (requestError) {
      setError(getLoginError(requestError));
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
            <ShieldCheck size={15} />
            Workforce analytics workspace
          </div>

          <h2 className="text-5xl font-semibold leading-tight tracking-tight">
            Make better
            <span className="block text-cyan-300">
              workforce decisions.
            </span>
          </h2>

          <p className="mt-6 max-w-md text-base leading-7 text-slate-400">
            Manage employees, attendance, leave, payroll and
            workforce intelligence from one central workspace.
          </p>

          <div className="mt-10 grid max-w-md grid-cols-2 gap-3">
            {[
              ["People", "Employee operations"],
              ["Insights", "Workforce analytics"],
              ["Security", "Role-based access"],
              ["Performance", "Operational reports"],
            ].map(([title, description]) => (
              <div
                key={title}
                className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
              >
                <p className="font-medium">{title}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-500">
          WorkForce AI Pro · Secure workforce management
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-9 flex items-center gap-3 lg:hidden">
            <div className="rounded-xl bg-cyan-400 p-2.5 text-slate-950">
              <Activity size={24} />
            </div>
            <span className="text-lg font-bold">
              WorkForce AI Pro
            </span>
          </div>

          <p className="text-sm font-medium text-cyan-300">
            Welcome back
          </p>

          <h2 className="mt-2 text-3xl font-semibold tracking-tight">
            Sign in to your account
          </h2>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            Enter your registered credentials to open your workspace.
          </p>

          {location.state?.registered && (
            <div
              role="status"
              className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
            >
              Account created successfully. Sign in with your new account.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mt-6 break-words rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm leading-6 text-rose-200"
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
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
                autoComplete="username"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"
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
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 pr-12 text-sm outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/10"
                />

                <button
                  type="button"
                  aria-label={
                    showPassword ? "Hide password" : "Show password"
                  }
                  onClick={() =>
                    setShowPassword((value) => !value)
                  }
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

            <div className="flex justify-end">
              <Link
                to="/forgot-password"
                className="text-sm text-cyan-300 hover:text-cyan-200"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={submitting || loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-400 px-4 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
              {!submitting && <ArrowRight size={17} />}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs text-slate-500">
              NEW TO WORKFORCE AI PRO?
            </span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <Link
            to="/register"
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-slate-900 px-4 py-3.5 text-sm font-semibold text-white transition hover:border-cyan-300/30 hover:bg-slate-800"
          >
            <UserPlus size={17} />
            Create an account
          </Link>

          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-slate-500">
            <ShieldCheck size={15} />
            Your access depends on your assigned role.
          </div>
        </div>
      </section>
    </main>
  );
}