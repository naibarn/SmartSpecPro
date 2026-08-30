import type { PropsWithChildren } from "react";
import { useWorkerAppContext, WorkerAppProvider } from "./workerContext";
import type { CanonicalWorkerRouteId, WorkerLocale, WorkerRoute } from "./workerRoutes";
import { WorkerTopbar } from "./WorkerTopbar";
import type { WorkerConnectionPresentation } from "./workerDashboard";

type WorkerAppShellProps = PropsWithChildren<{ routes: readonly WorkerRoute[]; activeRoute: CanonicalWorkerRouteId; onNavigate: (route: CanonicalWorkerRouteId) => void; connected: boolean; connectionStatus?: WorkerConnectionPresentation; queueDepth: number; runtimeStatus: string; loopRunning?: boolean; selectedSeries?: string | null; locale?: WorkerLocale }>;

function WorkerAppShellContent({ routes, activeRoute, onNavigate, children, connected, connectionStatus, queueDepth, runtimeStatus, loopRunning = false, selectedSeries, locale = "en" }: WorkerAppShellProps) {
  const { selectedSeriesId } = useWorkerAppContext();
  return <div className="worker-layout">
    <nav className="tab-bar worker-sidebar" role="navigation" aria-label="Worker sections">
      {routes.map((route) => <button key={route.id} type="button" aria-current={activeRoute === route.id ? "page" : undefined} className={`tab-button${activeRoute === route.id ? " active" : ""}`} onClick={() => onNavigate(route.id)} data-testid={`worker-tab-${route.id}`}><span className="tab-label">{route.label}</span><span className="tab-hint">{route.hint}</span></button>)}
    </nav>
    <div className="worker-screen">
      <WorkerTopbar activeRoute={activeRoute} connected={connected} connectionStatus={connectionStatus} queueDepth={queueDepth} runtimeStatus={runtimeStatus} loopRunning={loopRunning} selectedSeries={selectedSeries ?? selectedSeriesId} locale={locale} onNavigate={onNavigate} />
      {children}
    </div>
  </div>;
}

export function WorkerAppShell(props: WorkerAppShellProps) {
  return <WorkerAppProvider activeRoute={props.activeRoute} locale={props.locale}>
    <WorkerAppShellContent {...props} />
  </WorkerAppProvider>;
}
