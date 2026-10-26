import { useEffect, useState } from "react";

import {
  Activity,
  Bell,
  BriefcaseBusiness,
  CalendarCheck,
  ChartNoAxesCombined,
  ChevronRight,
  ClipboardList,
  Database,
  FileBarChart,
  FileText,
  Gauge,
  GitBranch,
  Layers3,
  LogOut,
  Menu,
  MessageSquare,
  Search,
  Shield,
  Users,
  Wallet,
  X,
  UserRound,
} from "lucide-react";

import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import api, { getAccessToken } from "../../api/axios";


const navigation = [
  {
    heading: "OVERVIEW",
    items: [
      {
        label: "Dashboard",
        path: "/",
        icon: Gauge,
      },
      {
        label: "My Profile",
        path: "/profile",
        icon: UserRound,
      },
      {
        label: "Advanced Search",
        path: "/search",
        icon: Search,
      },
      {
        label: "Reports",
        path: "/reports",
        icon: FileBarChart,
        roles: ["ADMIN", "HR"],
      },
    ],
  },
  {
    heading: "PEOPLE OPERATIONS",
    items: [
      {
        label: "Employees",
        path: "/employees",
        icon: Users,
      },
      {
        label: "Departments",
        path: "/departments",
        icon: BriefcaseBusiness,
      },
      {
        label: "Attendance",
        path: "/attendance",
        icon: CalendarCheck,
      },
      {
        label: "Leave Management",
        path: "/leaves",
        icon: ClipboardList,
      },
      {
        label: "Shifts",
        path: "/shifts",
        icon: Layers3,
      },
      {
        label: "My Payslips",
        path: "/my-payroll",
        icon: Wallet,
      },
      {
        label: "Payroll Management",
        path: "/payroll",
        icon: Wallet,
        roles: ["ADMIN", "HR"],
      },
      {
        label: "Team Chat",
        path: "/chat",
        icon: MessageSquare,
      },
      {
        label: "Performance Reviews",
        path: "/reviews",
        icon: ChartNoAxesCombined,
      },
      {
        label: "Tasks",
        path: "/tasks",
        icon: ClipboardList,
      },
      {
        label: "Employee Documents",
        path: "/documents",
        icon: FileText,
      },
    ],
  },
  {
    heading: "WORKFORCE INTELLIGENCE",
    items: [
      {
        label: "Attrition Analytics",
        path: "/attrition",
        icon: ChartNoAxesCombined,
        roles: ["ADMIN", "HR"],
      },
      {
        label: "Alerts",
        path: "/alerts",
        icon: Bell,
      },
      {
        label: "Datasets",
        path: "/datasets",
        icon: Database,
        roles: ["ADMIN", "HR"],
      },
      {
        label: "Forecasting",
        path: "/forecasting",
        icon: GitBranch,
        roles: ["ADMIN", "HR"],
      },
      {
        label: "Recommendations",
        path: "/recommendations",
        icon: Activity,
        roles: ["ADMIN", "HR"],
      },
      {
        label: "HR Interventions",
        path: "/interventions",
        icon: ClipboardList,
        roles: ["ADMIN", "HR"],
      },
      {
        label: "Activity Feed",
        path: "/activity",
        icon: Activity,
      },
      {
        label: "Audit Logs",
        path: "/audit-logs",
        icon: Shield,
        roles: ["ADMIN", "HR"],
      },
      {
        label: "Notifications",
        path: "/notifications",
        icon: Bell,
      },
    ],
  },
];


export default function AppLayout() {
  const { user, logout } = useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveToast, setLiveToast] = useState(null);


  // Find the current page title.
  const pageTitle =
    navigation
      .flatMap((section) => section.items)
      .find((item) => item.path === location.pathname)?.label ||
    (location.pathname === "/users"
      ? "User Management"
      : "Workspace");


  // User information displayed in the sidebar and header.
  // Keep notifications live across every authenticated page, not only the
  // Notifications screen. The REST count remains the fallback if WebSocket is offline.
  useEffect(() => {
    const token = getAccessToken();
    const baseURL = api.defaults.baseURL || "http://127.0.0.1:8010/api/v1";
    if (!token || typeof WebSocket === "undefined") return undefined;

    let socket;
    let retryTimer;
    let toastTimer;
    let stopped = false;
    let retryDelay = 1000;

    const refreshUnreadCount = () => {
      api.get("/notifications/unread-count")
        .then((response) => setUnreadCount(Number(response.data?.unread_count || 0)))
        .catch(() => {});
    };

    const connect = () => {
      if (stopped) return;
      try {
        const wsBaseURL = baseURL.replace(/^http:/i, "ws:").replace(/^https:/i, "wss:");
        socket = new WebSocket(
          `${wsBaseURL.replace(/\/$/, "")}/notifications/ws?token=${encodeURIComponent(token)}`
        );
      } catch {
        scheduleReconnect();
        return;
      }

      socket.onopen = () => {
        retryDelay = 1000;
        refreshUnreadCount();
      };
      socket.onmessage = (messageEvent) => {
        try {
          const event = JSON.parse(messageEvent.data);
          if (event?.event === "new_notification") {
            const notice = event.data || {};
            setLiveToast({
              id: notice.id || `${Date.now()}`,
              title: notice.title || "New notification",
              message: notice.message || "You have a new workforce update.",
            });
            if (toastTimer) window.clearTimeout(toastTimer);
            toastTimer = window.setTimeout(() => setLiveToast(null), 9000);
            refreshUnreadCount();
          } else if (["notification_updated", "notifications_read_all"].includes(event?.event)) {
            refreshUnreadCount();
          }
        } catch {
          // Ignore malformed event frames; the REST page remains available.
        }
      };
      socket.onerror = () => {
        // onclose schedules a reconnect; avoid user-visible noise for transient failures.
      };
      socket.onclose = () => scheduleReconnect();
    };

    const scheduleReconnect = () => {
      if (stopped || retryTimer) return;
      const delay = retryDelay;
      retryDelay = Math.min(retryDelay * 2, 15000);
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, delay);
    };

    refreshUnreadCount();
    connect();
    return () => {
      stopped = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (toastTimer) window.clearTimeout(toastTimer);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);

  const displayName =
    user?.full_name ||
    user?.email ||
    "User";

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");


  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  }


  function closeMobileMenu() {
    setMobileMenuOpen(false);
  }


  function renderNavigation() {
    return navigation.map((section) => {
      const visibleItems = section.items.filter(
        (item) =>
          !item.roles ||
          item.roles.includes(user?.role)
      );

      return (
        <div
          key={section.heading}
          className="mb-6"
        >
          <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-slate-500">
            {section.heading}
          </p>

          <div className="space-y-1">
            {visibleItems.map(
              ({ label, path, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={closeMobileMenu}
                  end={path === "/"}
                  className={({ isActive }) =>
                    `group flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${
                      isActive
                        ? "bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20"
                        : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                    }`
                  }
                >
                  <span className="flex items-center gap-3">
                    <Icon size={17} />
                    {label}
                  </span>

                  {label === "Notifications" && unreadCount > 0 && (
                    <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-cyan-300 px-1.5 py-0.5 text-[10px] font-bold text-slate-950">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}

                  <ChevronRight
                    size={14}
                    className="opacity-0 transition group-hover:opacity-70"
                  />
                </NavLink>
              )
            )}
          </div>
        </div>
      );
    });
  }


  const sidebar = (
    <div className="flex h-full flex-col bg-slate-950">

      {/* Sidebar brand */}
      <div className="flex h-[76px] items-center gap-3 border-b border-white/[0.08] px-5">
        <div className="rounded-xl bg-cyan-400 p-2 text-slate-950">
          <Activity size={22} />
        </div>

        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">
            WorkForce AI Pro
          </p>

          <p className="text-[11px] text-slate-500">
            Workforce intelligence
          </p>
        </div>

        <button
          type="button"
          onClick={closeMobileMenu}
          className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden"
          aria-label="Close navigation"
        >
          <X size={19} />
        </button>
      </div>


      {/* Main navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-5">
        {renderNavigation()}

        {/* Admin-only navigation */}
        {user?.role === "ADMIN" && (
          <div className="mb-6">
            <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-slate-500">
              ADMINISTRATION
            </p>

            <NavLink
              to="/users"
              onClick={closeMobileMenu}
              className={({ isActive }) =>
                `flex items-center justify-between rounded-xl px-3 py-2.5 text-sm transition ${
                  isActive
                    ? "bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-white"
                }`
              }
            >
              <span className="flex items-center gap-3">
                <Shield size={17} />
                User Management
              </span>

              <ChevronRight
                size={14}
                className="opacity-0 transition group-hover:opacity-70"
              />
            </NavLink>
          </div>
        )}
      </nav>


      {/* User account and logout */}
      <div className="border-t border-white/[0.08] p-3">
        <div className="flex items-center gap-3 rounded-xl bg-white/[0.04] p-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-400/15 text-xs font-bold text-cyan-300">
            {initials || "U"}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">
              {displayName}
            </p>

            <p className="mt-1 text-[10px] text-slate-500">
              {user?.role || "USER"}
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-400/10 hover:text-rose-300"
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </div>
  );


  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[260px] border-r border-white/[0.08] lg:block">
        {sidebar}
      </aside>


      {/* Mobile navigation */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            onClick={closeMobileMenu}
            aria-label="Close menu overlay"
          />

          <aside className="relative h-full w-[285px] max-w-[85vw] border-r border-white/10">
            {sidebar}
          </aside>
        </div>
      )}


      {/* Main workspace */}
      <div className="lg:pl-[260px]">

        {/* Top header */}
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-white/[0.08] bg-slate-950/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-300 hover:bg-white/5 lg:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>

            <div>
              <p className="text-[11px] text-slate-500">
                WORKFORCE / WORKSPACE
              </p>

              <h1 className="mt-1 text-sm font-semibold sm:text-base">
                {pageTitle}
              </h1>
            </div>
          </div>


          {/* Current user */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/profile")}
              title="Open My Profile"
              className="hidden text-right sm:block"
            >
              <p className="max-w-44 truncate text-xs font-medium text-slate-200 hover:text-cyan-300">
                {displayName}
              </p>

              <p className="mt-1 text-[10px] text-slate-500">
                {user?.role || "USER"}
              </p>
            </button>

            <button
              type="button"
              onClick={() => navigate("/profile")}
              title="Open My Profile"
              aria-label="Open My Profile"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/20 bg-cyan-300/10 text-xs font-bold text-cyan-300 transition hover:bg-cyan-300/20"
            >
              {initials || "U"}
            </button>
          </div>
        </header>


        {/* Page content */}
        <main className="mx-auto max-w-[1600px] p-4 sm:p-7 lg:p-9">
          <Outlet />
        </main>

      </div>

      {liveToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 top-20 z-[80] w-[min(92vw,400px)] rounded-2xl border border-cyan-300/25 bg-slate-900 p-4 shadow-2xl shadow-black/40"
        >
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-cyan-300/10 p-2 text-cyan-200">
              <Bell size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-white">{liveToast.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">{liveToast.message}</p>
              <button
                type="button"
                onClick={() => {
                  setLiveToast(null);
                  navigate("/notifications");
                }}
                className="mt-3 text-xs font-semibold text-cyan-300 hover:text-cyan-200"
              >
                View notifications
              </button>
            </div>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setLiveToast(null)}
              className="rounded-md px-1 text-slate-400 hover:text-white"
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}