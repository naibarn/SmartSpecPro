import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { localizedWorkerRoute, type CanonicalWorkerRouteId, type WorkerLocale } from "./workerRoutes";
import { localizeConnectionPresentation, type WorkerConnectionPresentation } from "./workerDashboard";

export function WorkerTopbar({ activeRoute, connected, connectionStatus, queueDepth, runtimeStatus, loopRunning = false, selectedSeries, locale, onNavigate }: {
  activeRoute: CanonicalWorkerRouteId;
  connected: boolean;
  connectionStatus?: WorkerConnectionPresentation;
  queueDepth: number;
  runtimeStatus: string;
  loopRunning?: boolean;
  selectedSeries?: string | null;
  locale?: WorkerLocale;
  onNavigate?: (route: CanonicalWorkerRouteId) => void;
}) {
  const activeLocale = locale ?? "en";
  const routeCopy = localizedWorkerRoute(activeRoute, activeLocale);
  const status = connectionStatus ?? {
    connected,
    label: connected ? (activeLocale === "th" ? "เชื่อมต่อแล้ว" : "Connected") : (activeLocale === "th" ? "ยังไม่เชื่อมต่อ" : "Not connected"),
    detail: connected ? "" : (activeLocale === "th" ? "กด Connect เพื่อเริ่มรับงาน" : "Open Connection and connect this machine to receive jobs."),
    tone: connected ? "ready" : "error",
  } satisfies WorkerConnectionPresentation;
  const checked = status.checkedAt ? new Date(status.checkedAt).toLocaleString(activeLocale === "th" ? "th-TH" : "en-US") : null;
  const expiry = status.expiresAt ? new Date(status.expiresAt).toLocaleString(activeLocale === "th" ? "th-TH" : "en-US") : null;
  const localizedStatus = localizeConnectionPresentation(status, activeLocale);
  const [comfy, setComfy] = useState<{ activeProfileId?: string | null; profiles?: Array<{ profileId: string; displayName: string; enabled: boolean; lastProbeStatus?: string | null; lastProbeAt?: string | null }> } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const refreshComfy = () => void invoke<typeof comfy>("worker_app_get_comfy_profiles").then(value => { if (!cancelled) setComfy(value); }).catch(() => { if (!cancelled) setComfy(null); });
    refreshComfy();
    const timer = window.setInterval(refreshComfy, 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  const activeComfy = comfy?.profiles?.find(profile => profile.profileId === comfy.activeProfileId);
  const comfyLabel = !activeComfy ? (activeLocale === "th" ? "ไม่ได้ตั้งค่า" : "Not configured") : activeComfy.lastProbeStatus === "ready" ? (activeLocale === "th" ? "พร้อม" : "Ready") : activeComfy.lastProbeStatus === "failed" ? (activeLocale === "th" ? "ขัดข้อง" : "Unavailable") : (activeLocale === "th" ? "ยังไม่ตรวจ" : "Not probed");
  const label = localizedStatus.label;
  const detail = localizedStatus.detail;
  const connectionAction = status.connected === false || status.stale === true || ["Not connected", "Reconnect required", "Approval pending", "Connection check delayed"].includes(status.label);
  return <header className="worker-topbar" data-testid="worker-topbar">
    <div>
      <p className="eyebrow">{activeLocale === "th" ? "พื้นที่ทำงาน Worker" : "Worker workspace"}</p>
      <strong>{routeCopy.label}</strong>
    </div>
    <div className="worker-topbar-status" aria-label="Worker connection status">
      <span className={`status-dot ${status.tone === "ready" ? "ready" : status.tone === "pending" ? "pending" : "blocked"}`} title={detail}>{label}</span>
      {detail ? <span className="worker-topbar-detail">{detail}</span> : null}
      <span>{activeLocale === "th" ? "หมดอายุ" : "Expires"}: {expiry || (activeLocale === "th" ? "ไม่ได้ระบุจาก Server" : "Not provided by server")}</span>
      <span>{activeLocale === "th" ? "ตรวจล่าสุด" : "Last checked"}: {checked || (activeLocale === "th" ? "กำลังตรวจ" : "Checking")}</span>
      <span>Series: {selectedSeries || (activeLocale === "th" ? "ยังไม่ได้เลือก" : "Not selected")}</span>
      <span>ComfyUI: {activeComfy?.displayName || (activeLocale === "th" ? "ไม่ได้เลือก" : "Not selected")} · {comfyLabel}</span>
      <span>{activeLocale === "th" ? "คิว" : "Queue"}: {queueDepth}</span>
      <span>{activeLocale === "th" ? "Worker loop" : "Worker loop"}: {loopRunning ? (activeLocale === "th" ? "กำลังทำงาน" : "Running") : (activeLocale === "th" ? "หยุดอยู่" : "Stopped")}</span>
      <span>Runtime: {runtimeStatus}</span>
      {connectionAction && onNavigate ? <button type="button" className="secondary-button small" onClick={() => onNavigate("connection")}>{activeLocale === "th" ? "ไปหน้าเชื่อมต่อ" : "Open Connection"}</button> : null}
    </div>
  </header>;
}
