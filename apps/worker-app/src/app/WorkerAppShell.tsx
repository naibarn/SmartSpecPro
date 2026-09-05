import { useState, useEffect, type PropsWithChildren } from "react";
import { useWorkerAppContext, WorkerAppProvider } from "./workerContext";
import type { CanonicalWorkerRouteId, WorkerLocale, WorkerRoute } from "./workerRoutes";
import { WorkerTopbar } from "./WorkerTopbar";
import type { WorkerConnectionPresentation } from "./workerDashboard";

type WorkerAppShellProps = PropsWithChildren<{
  routes: readonly WorkerRoute[];
  activeRoute: CanonicalWorkerRouteId;
  onNavigate: (route: CanonicalWorkerRouteId) => void;
  connected: boolean;
  connectionStatus?: WorkerConnectionPresentation;
  queueDepth: number;
  runtimeStatus: string;
  loopRunning?: boolean;
  selectedSeries?: string | null;
  locale?: WorkerLocale;
}>;

function WorkerAppShellContent({
  routes,
  activeRoute,
  onNavigate,
  children,
  connected,
  connectionStatus,
  queueDepth,
  runtimeStatus,
  loopRunning = false,
  selectedSeries,
  locale = "en",
}: WorkerAppShellProps) {
  const { selectedSeriesId } = useWorkerAppContext();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem("smartspec_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("smartspec_sidebar_collapsed", String(next));
      } catch (e) {
        console.warn("Save sidebar state failed:", e);
      }
      return next;
    });
  };

  // Keyboard shortcut: Ctrl+B or Cmd+B to toggle sidebar collapse
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className={`worker-layout${isSidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      {/* Expanded Sidebar */}
      {!isSidebarCollapsed ? (
        <aside className="worker-sidebar-container">
          <nav className="tab-bar worker-sidebar" role="navigation" aria-label="Worker sections">
            <div className="worker-sidebar-header">
              <span className="sidebar-brand-title">
                {locale === "th" ? "เมนูระบบ" : "Navigation"}
              </span>
              <button
                type="button"
                className="sidebar-collapse-header-btn"
                onClick={toggleSidebar}
                title={locale === "th" ? "ยุบแถบเมนู (Ctrl+B) เพื่อขยายพื้นที่ทำงานเต็มหน้าจอ" : "Collapse Sidebar (Ctrl+B)"}
              >
                ◀ {locale === "th" ? "ยุบเมนู" : "Collapse"}
              </button>
            </div>

            {routes.map((route) => (
              <button
                key={route.id}
                type="button"
                aria-current={activeRoute === route.id ? "page" : undefined}
                className={`tab-button${activeRoute === route.id ? " active" : ""}`}
                onClick={() => onNavigate(route.id)}
                data-testid={`worker-tab-${route.id}`}
              >
                <span className="tab-label">{route.label}</span>
                <span className="tab-hint">{route.hint}</span>
              </button>
            ))}

            <button
              type="button"
              className="sidebar-bottom-collapse-btn"
              onClick={toggleSidebar}
              title={locale === "th" ? "ยุบแถบเมนู เพื่อขยายพื้นที่ทำงานเต็มหน้าจอ (Ctrl+B)" : "Collapse Sidebar (Ctrl+B)"}
            >
              ◀ {locale === "th" ? "ยุบเก็บแถบเมนู (ซ่อน)" : "Hide Sidebar"}
            </button>
          </nav>
        </aside>
      ) : (
        /* Slim Floating Rail when Collapsed */
        <div className="sidebar-collapsed-rail">
          <button
            type="button"
            className="sidebar-rail-expand-btn"
            onClick={toggleSidebar}
            title={locale === "th" ? "ขยายแสดงแถบเมนูหลัก (Ctrl+B)" : "Expand Sidebar (Ctrl+B)"}
          >
            <span className="rail-icon">▶</span>
            <span className="rail-vertical-text">
              {locale === "th" ? "เปิดเมนู" : "MENU"}
            </span>
          </button>
        </div>
      )}

      <div className="worker-screen">
        <WorkerTopbar
          activeRoute={activeRoute}
          connected={connected}
          connectionStatus={connectionStatus}
          queueDepth={queueDepth}
          runtimeStatus={runtimeStatus}
          loopRunning={loopRunning}
          selectedSeries={selectedSeries ?? selectedSeriesId}
          locale={locale}
          onNavigate={onNavigate}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleSidebar={toggleSidebar}
        />
        {children}
      </div>
    </div>
  );
}

export function WorkerAppShell(props: WorkerAppShellProps) {
  return (
    <WorkerAppProvider activeRoute={props.activeRoute} locale={props.locale}>
      <WorkerAppShellContent {...props} />
    </WorkerAppProvider>
  );
}

