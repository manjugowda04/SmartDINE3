import { Outlet, NavLink, useLocation, Navigate, useNavigate } from "react-router-dom";
import { useRef, useEffect } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import {
  Authenticated,
  Unauthenticated,
  AuthLoading,
  useQuery,
} from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { SignInButton } from "@/components/ui/signin.tsx";
import { ThemeToggle } from "@/components/ui/theme-toggle.tsx";
import { Spinner } from "@/components/ui/spinner.tsx";
import {
  UtensilsCrossed,
  LayoutDashboard,
  ClipboardList,
  Table2,
  MenuSquare,
  CreditCard,
  Bell,
  BarChart3,
  FileText,
  Users,
  LogOut,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatTime, requestTypeLabel } from "@/lib/restaurant.ts";
import { audioNotifier } from "@/lib/audioNotification.ts";
import { SoundToggle } from "./SoundToggle.tsx";
import { toast } from "sonner";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
  roles: Array<"owner" | "manager" | "staff">;
}

const ALL_NAV_ITEMS: NavItem[] = [
  {
    to: "/management",
    label: "Dashboard",
    icon: LayoutDashboard,
    end: true,
    roles: ["owner"],
  },
  {
    to: "/management/orders",
    label: "Orders",
    icon: ClipboardList,
    roles: ["owner", "manager", "staff"],
  },
  {
    to: "/management/tables",
    label: "Tables",
    icon: Table2,
    roles: ["owner"],
  },
  {
    to: "/management/menu",
    label: "Menu",
    icon: MenuSquare,
    roles: ["owner"],
  },
  {
    to: "/management/payments",
    label: "Payments",
    icon: CreditCard,
    roles: ["owner", "manager"],
  },
  {
    to: "/management/requests",
    label: "Requests",
    icon: Bell,
    roles: ["owner", "manager", "staff"],
  },
  {
    to: "/management/analytics",
    label: "Analytics",
    icon: BarChart3,
    roles: ["owner", "manager"],
  },
  {
    to: "/management/reports",
    label: "Reports",
    icon: FileText,
    roles: ["owner", "manager"],
  },
  {
    to: "/management/staff",
    label: "Staff",
    icon: Users,
    roles: ["owner"],
  },
];

function ManagementSidebar({
  role,
  userName,
  pendingOrdersCount = 0,
  pendingRequestsCount = 0,
}: {
  role: "owner" | "manager" | "staff";
  userName: string;
  pendingOrdersCount?: number;
  pendingRequestsCount?: number;
}) {
  const { signOut } = useAuthActions();
  const restaurant = useQuery(api.restaurants.getCurrentRestaurant);
  const visibleNav = ALL_NAV_ITEMS.filter((item) => item.roles.includes(role));

  const roleBadgeColor = {
    owner: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    staff: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
  }[role];

  return (
    <aside className="hidden md:flex md:w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border h-screen sticky top-0 overflow-y-auto sidebar-scroll">
      <div className="flex items-center justify-between gap-2 px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="bg-primary rounded-lg p-2 shrink-0">
            <UtensilsCrossed className="size-4 text-primary-foreground" />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="font-bold text-sm leading-tight truncate">
              {restaurant?.name ?? "SmartDine"}
            </h1>
            <p className="text-xs text-muted-foreground truncate">{userName}</p>
            <span
              className={`inline-block text-[10px] uppercase font-bold px-1.5 py-0.2 rounded mt-0.5 ${roleBadgeColor}`}
            >
              {role}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <SoundToggle className="size-8 text-sidebar-foreground hover:bg-sidebar-accent" />
          <ThemeToggle className="text-sidebar-foreground hover:bg-sidebar-accent size-8" />
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {visibleNav.map(({ to, label, icon: Icon, end }) => {
          const badge =
            to === "/management/orders" && pendingOrdersCount > 0
              ? pendingOrdersCount
              : to === "/management/requests" && pendingRequestsCount > 0
              ? pendingRequestsCount
              : null;

          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors relative",
                  isActive
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-sidebar-accent"
                )
              }
            >
              <Icon className="size-4" />
              <span>{label}</span>
              {badge !== null && (
                <span className="ml-auto bg-destructive text-destructive-foreground rounded-full text-xs px-2 py-0.5 font-bold animate-pulse">
                  {badge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="p-3 border-t border-sidebar-border flex items-center justify-between">
        <button
          type="button"
          onClick={() => void signOut()}
          className="flex flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut className="size-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}

function MobileBottomNav({
  role,
  pendingOrdersCount = 0,
  pendingRequestsCount = 0,
}: {
  role: "owner" | "manager" | "staff";
  pendingOrdersCount?: number;
  pendingRequestsCount?: number;
}) {
  const visibleNav = ALL_NAV_ITEMS.filter((item) => item.roles.includes(role)).slice(0, 5);

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-background border-t border-border flex items-center justify-around px-1 py-2">
      {visibleNav.map(({ to, label, icon: Icon, end }) => {
        const badge =
          to === "/management/orders" && pendingOrdersCount > 0
            ? pendingOrdersCount
            : to === "/management/requests" && pendingRequestsCount > 0
            ? pendingRequestsCount
            : null;

        return (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 px-2 py-1 rounded-md transition-colors relative",
                isActive ? "text-primary font-medium" : "text-muted-foreground"
              )
            }
          >
            <div className="relative">
              <Icon className="size-4" />
              {badge !== null && (
                <span className="absolute -top-1.5 -right-2.5 bg-destructive text-destructive-foreground rounded-full text-[9px] min-w-3.5 h-3.5 px-0.5 flex items-center justify-center font-bold">
                  {badge}
                </span>
              )}
            </div>
            <span className="text-[10px]">{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function UnauthView() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-6 px-4">
      <div className="text-center space-y-2">
        <div className="bg-primary rounded-xl p-4 w-16 h-16 mx-auto flex items-center justify-center mb-4">
          <UtensilsCrossed className="size-8 text-primary-foreground" />
        </div>

        <h1 className="text-2xl font-bold">SmartDine Management</h1>

        <p className="text-muted-foreground">
          Sign in or register your restaurant to access management tools
        </p>
      </div>

      <SignInButton size="lg" />
    </div>
  );
}

function AuthorizedManagement() {
  const user = useQuery(api.users.getCurrentUser);
  const restaurant = useQuery(api.restaurants.getCurrentRestaurant);
  const { signOut } = useAuthActions();
  const location = useLocation();
  const navigate = useNavigate();

  const activeOrders = useQuery(api.orders.listActiveOrders, {});
  const waiterRequests = useQuery(api.requests.listWaiterRequests, {});

  const seenOrderIdsRef = useRef<Set<string>>(new Set());
  const isOrdersInitializedRef = useRef<boolean>(false);

  const seenRequestIdsRef = useRef<Set<string>>(new Set());
  const isRequestsInitializedRef = useRef<boolean>(false);

  // Real-time order notification & sound
  useEffect(() => {
    if (activeOrders === undefined) return;

    if (!isOrdersInitializedRef.current) {
      activeOrders.forEach((o) => seenOrderIdsRef.current.add(o._id));
      isOrdersInitializedRef.current = true;
      return;
    }

    for (const order of activeOrders) {
      if (!seenOrderIdsRef.current.has(order._id)) {
        seenOrderIdsRef.current.add(order._id);

        if (order.status === "placed") {
          audioNotifier.playOrderChime();
          toast("🔔 New Order Received!", {
            description: `Table ${order.table?.tableNumber ?? "?"} · ${order.orderNumber} · ${formatTime(order.placedAt)}`,
            action: {
              label: "View Order",
              onClick: () => navigate("/management/orders"),
            },
            duration: 8000,
          });
        }
      }
    }
  }, [activeOrders, navigate]);

  // Real-time service request notification & sound
  useEffect(() => {
    if (waiterRequests === undefined) return;

    if (!isRequestsInitializedRef.current) {
      waiterRequests.forEach((r) => seenRequestIdsRef.current.add(r._id));
      isRequestsInitializedRef.current = true;
      return;
    }

    for (const req of waiterRequests) {
      if (!seenRequestIdsRef.current.has(req._id)) {
        seenRequestIdsRef.current.add(req._id);

        if (req.status === "pending") {
          audioNotifier.playRequestChime();
          toast(`🔔 New Service Request — Table ${req.table?.tableNumber ?? "?"}`, {
            description: `${requestTypeLabel(req.requestType)} · ${formatTime(req.createdAt)}`,
            action: {
              label: "View Request",
              onClick: () => navigate("/management/requests"),
            },
            duration: 8000,
          });
        }
      }
    }
  }, [waiterRequests, navigate]);

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  // Deactivated user check
  if (user && user.isActive === false) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center max-w-md mx-auto">
        <ShieldAlert className="size-12 text-destructive" />
        <h1 className="text-xl font-bold">Account Deactivated</h1>
        <p className="text-muted-foreground text-sm">
          Your account has been deactivated by the restaurant owner. You no longer have access to management tools.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-md border px-4 py-2 text-sm mt-2"
        >
          Sign Out
        </button>
      </div>
    );
  }

  const role = user?.role as "owner" | "manager" | "staff" | undefined;

  if (!user || !role || (role !== "owner" && role !== "manager" && role !== "staff")) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <ShieldAlert className="size-12 text-destructive" />
        <h1 className="text-xl font-bold">Access denied</h1>

        <p className="text-center text-muted-foreground text-sm max-w-sm">
          Your account is not authorized to access restaurant operations. Please contact your restaurant owner or administrator.
        </p>

        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-md border px-4 py-2 text-sm"
        >
          Sign Out
        </button>
      </div>
    );
  }

  const roleBadgeColor = {
    owner: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    manager: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    staff: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
  }[role];

  const pendingOrdersCount =
    activeOrders?.filter((o) => o.status === "placed").length ?? 0;
  const pendingRequestsCount =
    waiterRequests?.filter((r) => r.status === "pending").length ?? 0;

  // Route-level permission enforcement
  const path = location.pathname;

  // Non-owners landing on root /management: redirect to /management/orders
  if (path === "/management" && role !== "owner") {
    return <Navigate to="/management/orders" replace />;
  }

  // Specific route restrictions
  const isOwnerOnlyRoute =
    path === "/management" ||
    path.startsWith("/management/tables") ||
    path.startsWith("/management/menu") ||
    path.startsWith("/management/staff");

  const isManagerOrOwnerRoute =
    path.startsWith("/management/payments") ||
    path.startsWith("/management/analytics") ||
    path.startsWith("/management/reports");

  if (isOwnerOnlyRoute && role !== "owner") {
    return (
      <div className="flex h-screen overflow-hidden">
        <ManagementSidebar
          role={role}
          userName={user.name ?? user.email ?? "User"}
          pendingOrdersCount={pendingOrdersCount}
          pendingRequestsCount={pendingRequestsCount}
        />
        <main className="flex-1 p-8 text-center space-y-4 max-w-md mx-auto my-auto">
          <ShieldAlert className="size-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">Restricted Page</h2>
          <p className="text-muted-foreground text-sm">
            This section is reserved for the restaurant owner.
          </p>
          <NavLink
            to="/management/orders"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg"
          >
            Go to Orders
          </NavLink>
        </main>
      </div>
    );
  }

  if (isManagerOrOwnerRoute && role !== "owner" && role !== "manager") {
    return (
      <div className="flex h-screen overflow-hidden">
        <ManagementSidebar
          role={role}
          userName={user.name ?? user.email ?? "User"}
          pendingOrdersCount={pendingOrdersCount}
          pendingRequestsCount={pendingRequestsCount}
        />
        <main className="flex-1 p-8 text-center space-y-4 max-w-md mx-auto my-auto">
          <ShieldAlert className="size-12 text-destructive mx-auto" />
          <h2 className="text-xl font-bold">Restricted Page</h2>
          <p className="text-muted-foreground text-sm">
            Payment, analytics, and reporting operations require Manager or Owner privileges.
          </p>
          <NavLink
            to="/management/orders"
            className="inline-block px-4 py-2 bg-primary text-primary-foreground text-sm rounded-lg"
          >
            Go to Orders
          </NavLink>
        </main>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col md:flex-row h-screen overflow-hidden">
        {/* Mobile top header with sound toggle and restaurant branding */}
        <header className="md:hidden sticky top-0 z-40 bg-card border-b px-4 py-2.5 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-primary rounded p-1 shrink-0">
              <UtensilsCrossed className="size-3.5 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm truncate max-w-[150px]">
              {restaurant?.name ?? "SmartDine"}
            </span>
            <span className={`text-[10px] uppercase font-bold px-1.5 py-0.2 rounded shrink-0 ${roleBadgeColor}`}>
              {role}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <SoundToggle className="size-8" />
            <ThemeToggle className="text-foreground shrink-0 size-8" />
          </div>
        </header>

        <ManagementSidebar
          role={role}
          userName={user.name ?? user.email ?? "User"}
          pendingOrdersCount={pendingOrdersCount}
          pendingRequestsCount={pendingRequestsCount}
        />

        <main className="flex-1 overflow-auto pb-16 md:pb-0 bg-background">
          <Outlet />
        </main>
      </div>

      <MobileBottomNav
        role={role}
        pendingOrdersCount={pendingOrdersCount}
        pendingRequestsCount={pendingRequestsCount}
      />
    </>
  );
}

export default function ManagementLayout() {
  return (
    <>
      <AuthLoading>
        <div className="min-h-screen flex items-center justify-center">
          <Spinner className="size-8" />
        </div>
      </AuthLoading>

      <Unauthenticated>
        <UnauthView />
      </Unauthenticated>

      <Authenticated>
        <AuthorizedManagement />
      </Authenticated>
    </>
  );
}
