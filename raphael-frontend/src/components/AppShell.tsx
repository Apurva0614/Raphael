import * as React from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Columns,
  Database,
  FileText,
  Globe,
  LayoutDashboard,
  Settings as SettingsIcon,
  Shield,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import TopoBackground from "@/components/TopoBackground";
import StatusDot from "@/components/ui/status-dot";

interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { label: "Explorer", to: "/explorer", icon: Globe },
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Risk Intel", to: "/risk", icon: Shield },
  { label: "Analytics", to: "/analytics", icon: TrendingUp },
  { label: "Compare", to: "/compare", icon: Columns },
  { label: "Alerts", to: "/alerts", icon: Bell },
  { label: "Reports", to: "/reports", icon: FileText },
  { label: "Data Catalog", to: "/catalog", icon: Database },
  { label: "Settings", to: "/settings", icon: SettingsIcon },
];

export function AppShell() {
  const [collapsed, setCollapsed] = React.useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const activeItem = NAV.find((n) => pathname.startsWith(n.to)) ?? NAV[1];

  // Tauri/desktop: suppress native right-click context menu except inside
  // explicitly selectable text regions (report previews, data values).
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("[data-selectable], input, textarea, [contenteditable='true']")) return;
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handler);
    return () => document.removeEventListener("contextmenu", handler);
  }, []);


  return (
    <div className="fixed inset-0 flex overflow-hidden bg-[#0a0f0a] text-[var(--cream)]">
      {/* Sidebar */}
      <aside
        className={cn(
          "relative z-20 flex h-full flex-col border-r border-[#1e2d1e] bg-[#0d150d] transition-[width] duration-300 ease-out",
          collapsed ? "w-16" : "w-[220px]",
        )}
      >
        {/* Brand */}
        <div className="flex h-12 items-center border-b border-[#1e2d1e] px-3">
          {collapsed ? (
            <span
              className="mx-auto text-[var(--cream)]"
              style={{ fontFamily: "var(--font-display)", fontSize: "1.35rem", fontWeight: 700 }}
            >
              R
            </span>
          ) : (
            <span
              className="text-[var(--cream)] tracking-[0.18em]"
              style={{ fontFamily: "var(--font-display)", fontSize: "1.1rem", fontWeight: 600 }}
            >
              RAPHAEL
            </span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          <ul className="flex flex-col gap-0.5 px-2">
            {NAV.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.to);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-md px-3 py-2 font-mono text-[11px] tracking-[0.16em] uppercase transition-colors",
                      isActive
                        ? "bg-[#1a2d1a] text-[var(--cream)]"
                        : "text-[var(--cream-muted)] hover:bg-[#152015] hover:text-[var(--cream)]",
                    )}
                    title={collapsed ? item.label : undefined}
                  >
                    {isActive && (
                      <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[var(--olive)] shadow-[0_0_10px_rgba(74,124,89,0.7)]" />
                    )}
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0 transition-colors",
                        isActive ? "text-[var(--olive)]" : "text-[var(--cream-muted)] group-hover:text-[var(--cream)]",
                      )}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer */}
        <div className="border-t border-[#1e2d1e] p-3">
          {!collapsed && (
            <div className="mb-2 font-mono text-[10px] tracking-[0.15em] text-[var(--cream-muted)]/70">
              18.5204° N&nbsp;|&nbsp;73.8567° E
            </div>
          )}
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-[#1e2d1e] bg-[#0a0f0a] px-2 py-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--cream-muted)] transition-colors hover:border-[var(--olive)]/50 hover:text-[var(--cream)]"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : (
              <>
                <ChevronLeft className="h-3.5 w-3.5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="relative flex h-full min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-[#1e2d1e] bg-[#0d150d] px-5">
          <h1
            className="text-[var(--cream)] tracking-wide"
            style={{ fontFamily: "var(--font-display)", fontSize: "1rem", fontWeight: 600 }}
          >
            {activeItem.label}
          </h1>
          <div className="flex items-center gap-5">
            <StatusDot tone="green" label="System Nominal" />
            <button
              type="button"
              className="relative rounded-md p-1.5 text-[var(--cream-muted)] transition-colors hover:bg-[#152015] hover:text-[var(--cream)]"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--amber-status)] shadow-[0_0_6px_rgba(212,168,83,0.8)]" />
            </button>
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#1e2d1e] bg-[#111a11] font-mono text-[10px] tracking-wider text-[var(--cream)]"
              aria-label="User"
            >
              RX
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="relative flex-1 overflow-hidden bg-[#0a0f0a]">
          <TopoBackground opacity={0.06} />
          <div className="relative z-[1] h-full w-full overflow-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export default AppShell;
