import type { WorkerRoute } from "./workerRoutes";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useWorkerAppContext } from "./workerContext";

export function QuickActionsBar({ routes, onNavigate, connected, queueDepth, runtimeStatus }: { routes: readonly WorkerRoute[]; onNavigate: (route: WorkerRoute["id"]) => void; connected: boolean; queueDepth: number; runtimeStatus: string }) {
  const { selectedSeriesId } = useWorkerAppContext();
  const [actionState, setActionState] = useState<string>("");
  const actions = routes.filter((route) => ["series", "binding", "media-workspace", "queue", "workflows", "settings"].includes(route.id));
  const runSeriesAction = async (action: "index" | "review") => {
    if (!selectedSeriesId) return;
    setActionState(`${action}:กำลังส่ง`);
    try {
      const result = await invoke<{ status?: string; blockedReason?: string }>("worker_app_execute_series_quick_action", { seriesId: selectedSeriesId, action });
      setActionState(result.blockedReason ? `${action}:${result.blockedReason}` : `${action}:${result.status ?? "accepted"}`);
    } catch (error) {
      setActionState(`${action}:${error instanceof Error ? error.message : String(error)}`);
    }
  };
  return <div className="quick-actions" aria-label="Quick actions">
    <span className="quick-actions-label">Quick actions</span>
    {actions.map((route) => {
      const blocked = route.id !== "settings" && !connected;
      return <button key={route.id} type="button" className="secondary-button" disabled={blocked} title={blocked ? "เชื่อมต่อ Worker ก่อน" : undefined} onClick={() => onNavigate(route.id)}>{route.label}{route.id === "queue" ? ` (${queueDepth})` : route.id === "workflows" && runtimeStatus !== "ready" ? " · ตรวจ runtime" : ""}</button>;
    })}
    <button type="button" className="secondary-button" disabled={!connected || !selectedSeriesId} title={!selectedSeriesId ? "เลือก Series ก่อน" : undefined} onClick={() => void runSeriesAction("index")}>Index Series</button>
    <button type="button" className="secondary-button" disabled={!connected || !selectedSeriesId} title={!selectedSeriesId ? "เลือก Series ก่อน" : undefined} onClick={() => void runSeriesAction("review")}>Review assets</button>
    {actionState ? <span className="quick-actions-status" role="status" aria-live="polite">{actionState}</span> : null}
  </div>;
}
