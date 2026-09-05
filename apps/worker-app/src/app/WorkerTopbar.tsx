import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { localizedWorkerRoute, type CanonicalWorkerRouteId, type WorkerLocale } from "./workerRoutes";
import { localizeConnectionPresentation, type WorkerConnectionPresentation } from "./workerDashboard";

export function WorkerTopbar({
  activeRoute,
  connected,
  connectionStatus,
  queueDepth,
  runtimeStatus,
  loopRunning = false,
  selectedSeries,
  locale,
  onNavigate,
  isSidebarCollapsed,
  onToggleSidebar,
}: {
  activeRoute: CanonicalWorkerRouteId;
  connected: boolean;
  connectionStatus?: WorkerConnectionPresentation;
  queueDepth: number;
  runtimeStatus: string;
  loopRunning?: boolean;
  selectedSeries?: string | null;
  locale?: WorkerLocale;
  onNavigate?: (route: CanonicalWorkerRouteId) => void;
  isSidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const activeLocale = locale ?? "en";
  const routeCopy = localizedWorkerRoute(activeRoute, activeLocale);
  const status = connectionStatus ?? {
    connected,
    label: connected
      ? activeLocale === "th"
        ? "เชื่อมต่อแล้ว"
        : "Connected"
      : activeLocale === "th"
        ? "ยังไม่เชื่อมต่อ"
        : "Not connected",
    detail: connected
      ? ""
      : activeLocale === "th"
        ? "กด Connect เพื่อเริ่มรับงาน"
        : "Open Connection and connect this machine to receive jobs.",
    tone: connected ? "ready" : "error",
  } satisfies WorkerConnectionPresentation;
  const checked = status.checkedAt
    ? new Date(status.checkedAt).toLocaleTimeString(activeLocale === "th" ? "th-TH" : "en-US")
    : null;
  const localizedStatus = localizeConnectionPresentation(status, activeLocale);
  const [comfy, setComfy] = useState<{
    activeProfileId?: string | null;
    profiles?: Array<{
      profileId: string;
      displayName: string;
      enabled: boolean;
      lastProbeStatus?: string | null;
      lastProbeAt?: string | null;
    }>;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refreshComfy = () =>
      void invoke<typeof comfy>("worker_app_get_comfy_profiles")
        .then((value) => {
          if (!cancelled) setComfy(value);
        })
        .catch(() => {
          if (!cancelled) setComfy(null);
        });
    refreshComfy();
    const timer = window.setInterval(refreshComfy, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const activeComfy = comfy?.profiles?.find((p) => p.profileId === comfy.activeProfileId);
  const comfyLabel = !activeComfy
    ? activeLocale === "th"
      ? "ไม่ได้ตั้งค่า"
      : "Not set"
    : activeComfy.lastProbeStatus === "ready"
      ? activeLocale === "th"
        ? "พร้อม"
        : "Ready"
      : activeComfy.lastProbeStatus === "failed"
        ? activeLocale === "th"
          ? "ขัดข้อง"
          : "Error"
        : activeLocale === "th"
          ? "ยังไม่ตรวจ"
          : "Unprobed";

  const label = localizedStatus.label;
  const detail = localizedStatus.detail;
  const connectionAction =
    status.connected === false ||
    status.stale === true ||
    ["Not connected", "Reconnect required", "Approval pending", "Connection check delayed"].includes(
      status.label
    );

  return (
    <header className="worker-topbar compact-single-line" data-testid="worker-topbar">
      <div className="worker-topbar-brand">
        {onToggleSidebar && (
          <button
            type="button"
            className={`sidebar-hamburger-btn ${isSidebarCollapsed ? "is-collapsed" : ""}`}
            onClick={onToggleSidebar}
            title={
              isSidebarCollapsed
                ? activeLocale === "th"
                  ? "ขยายแถบเมนูหลัก (Ctrl+B)"
                  : "Expand Sidebar Menu (Ctrl+B)"
                : activeLocale === "th"
                  ? "ยุบแถบเมนูหลัก เพื่อให้พื้นที่ทำงานเต็มหน้าจอ (Ctrl+B)"
                  : "Collapse Sidebar Menu (Ctrl+B)"
            }
          >
            <span className="hamburger-icon">{isSidebarCollapsed ? "☰" : "◀"}</span>
            <span className="hamburger-text">
              {isSidebarCollapsed
                ? activeLocale === "th"
                  ? "เปิดเมนู"
                  : "Menu"
                : activeLocale === "th"
                  ? "ยุบเมนู"
                  : "Collapse"}
            </span>
          </button>
        )}
        <div className="worker-route-pill">
          <span className="route-icon">🎬</span>
          <strong>{routeCopy.label}</strong>
        </div>
      </div>

      <div className="worker-topbar-status-strip" aria-label="Worker connection status">
        <span
          className={`status-chip tone-${status.tone === "ready" ? "ready" : status.tone === "pending" ? "pending" : "blocked"}`}
          title={`${detail || label} · ตรวจล่าสุด: ${checked || "—"}`}
        >
          <span className="status-dot-pulse" />
          {label}
        </span>

        <span className="info-chip series-chip" title="Active Series ID">
          📺 {selectedSeries || (activeLocale === "th" ? "ยังไม่เลือก" : "None")}
        </span>

        <span className="info-chip comfy-chip" title={`ComfyUI Server: ${activeComfy?.displayName || "None"}`}>
          🎨 {activeComfy?.displayName || "ComfyUI"}: <strong>{comfyLabel}</strong>
        </span>

        <span className="info-chip queue-chip" title="Waiting Jobs in Queue">
          📥 {activeLocale === "th" ? "คิว" : "Queue"}: <strong>{queueDepth}</strong>
        </span>

        <span
          className={`info-chip loop-chip ${loopRunning ? "running" : "idle"}`}
          title="Background Worker Execution Loop"
        >
          ⚡ {loopRunning ? (activeLocale === "th" ? "ทำงาน" : "Running") : (activeLocale === "th" ? "หยุด" : "Idle")}
        </span>

        <span className="info-chip runtime-chip" title="Hyperframes Runtime Status">
          ⚙️ {runtimeStatus}
        </span>

        {connectionAction && onNavigate && (
          <button
            type="button"
            className="connect-quick-btn"
            onClick={() => onNavigate("connection")}
            title="เปิดหน้าตั้งค่าการเชื่อมต่อ"
          >
            {activeLocale === "th" ? "เชื่อมต่อ" : "Connect"}
          </button>
        )}
      </div>
    </header>
  );
}
