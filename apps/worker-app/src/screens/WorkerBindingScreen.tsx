import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openFolderDialog } from "@tauri-apps/plugin-dialog";
import { useWorkerAppContext } from "../app/workerContext";
import type { WorkerRouteId } from "../app/workerRoutes";

type SeriesProjection = {
  seriesId: string;
  title: string;
  status: string;
  accessMode: "read" | "operate";
  bindingRevision: number | null;
  bindingStatus: string | null;
};

type SeriesListResponse = { items: SeriesProjection[]; nextCursor: string | null };
type WorkspaceStatus = {
  seriesId: string;
  rootId: string;
  workspaceMode: string;
  status: string;
  fileCount: number;
  totalBytes: number;
} | null;

export function WorkerBindingScreen({ onNavigate }: { onNavigate?: (route: WorkerRouteId) => void }) {
  const { selectedSeriesId, setSelectedSeriesId, setSelectedRootId } = useWorkerAppContext();
  const [series, setSeries] = useState<SeriesProjection[]>([]);
  const [seriesQuery, setSeriesQuery] = useState("");
  const [nextSeriesCursor, setNextSeriesCursor] = useState<string | null>(null);
  const [rootPath, setRootPath] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceStatus>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadSeries = useCallback(async (options: { append?: boolean; cursor?: string | null; query?: string } = {}) => {
    setBusy(true);
    setError("");
    try {
      const query = options.query ?? "";
      const result = await invoke<SeriesListResponse>("worker_app_list_series", {
        query: query.trim() || null,
        cursor: options.cursor ?? null,
      });
      setSeries(current => options.append ? [...current, ...result.items] : result.items);
      setNextSeriesCursor(result.nextCursor);
      if (!options.append && !selectedSeriesId && result.items[0]) setSelectedSeriesId(result.items[0].seriesId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }, [selectedSeriesId, setSelectedSeriesId]);

  useEffect(() => { void loadSeries(); }, [loadSeries]);
  useEffect(() => {
    void invoke<WorkspaceStatus>("worker_app_get_local_workspace_status")
      .then(value => {
        if (value?.seriesId === selectedSeriesId) {
          setWorkspace(value);
          setSelectedRootId(value.rootId);
        } else if (value) {
          setWorkspace(null);
          setSelectedRootId(null);
        }
      })
      .catch(() => setWorkspace(null));
  }, [selectedSeriesId, setSelectedRootId]);

  const selected = series.find(item => item.seriesId === selectedSeriesId) ?? null;
  const chooseRoot = async () => {
    const selectedPath = await openFolderDialog({ directory: true, multiple: false, title: "เลือกโฟลเดอร์ footage ของ Series" });
    if (typeof selectedPath === "string") setRootPath(selectedPath);
  };
  const selectRoot = async () => {
    if (!selected || !rootPath.trim()) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const value = await invoke<WorkspaceStatus>("worker_app_pick_local_root", { seriesId: selected.seriesId, path: rootPath.trim() });
      setWorkspace(value); setSelectedRootId(value?.rootId ?? null); setMessage("ตรวจสอบโฟลเดอร์บนเครื่อง Worker แล้ว");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };
  const bind = async () => {
    if (!selected || !workspace) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const value = await invoke<{ status: string; bindingRevision: number }>("worker_app_bind_series", {
        seriesId: selected.seriesId,
        expectedRevision: selected.bindingRevision ?? 0,
        idempotencyKey: `worker-series-bind:${selected.seriesId}:${Date.now()}`,
      });
      setMessage(`ผูก Series สำเร็จ · ${value.status} · revision ${value.bindingRevision}`);
      await loadSeries({ query: seriesQuery });
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };
  const revoke = async () => {
    setBusy(true); setError("");
    try {
      if (!selected) return;
      await invoke("worker_app_revoke_local_root", { seriesId: selected.seriesId });
      setWorkspace(null); setSelectedRootId(null); setMessage("ยกเลิกการผูกโฟลเดอร์แล้ว");
    } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)); }
    finally { setBusy(false); }
  };

  return <section className="dashboard-grid" role="tabpanel" aria-label="Series binding" data-testid="worker-screen-binding">
    <article className="panel wide">
      <div className="panel-heading inline"><div><p className="eyebrow">Binding</p><h2>ผูก Series กับโฟลเดอร์ในเครื่อง</h2></div><button type="button" className="secondary-button" onClick={() => void loadSeries()} disabled={busy}>Refresh Series</button></div>
      <p className="subtle">เลือก Series จาก server แล้วผูก local root บนเครื่อง Worker เครื่องนี้ ไฟล์ต้นฉบับจะไม่ถูกส่งขึ้น server</p>
      {error ? <p className="connect-message error" role="alert">{error}</p> : null}
      {message ? <p className="connect-message" role="status" aria-live="polite">{message}</p> : null}
      <section aria-labelledby="binding-series-heading"><h3 id="binding-series-heading">Series ที่เข้าถึงได้</h3><label className="field-label" htmlFor="binding-series-search">ค้นหา Series</label><div className="button-row"><input id="binding-series-search" value={seriesQuery} onChange={event => setSeriesQuery(event.target.value)} placeholder="ชื่อ Series" autoComplete="off" /><button type="button" className="secondary-button" onClick={() => void loadSeries({ query: seriesQuery })} disabled={busy}>ค้นหา</button></div><ul className="series-list">{series.map(item => <li key={item.seriesId} className={item.seriesId === selectedSeriesId ? "selected" : ""}><button type="button" onClick={() => { setSelectedSeriesId(item.seriesId); setWorkspace(null); setSelectedRootId(null); setRootPath(""); }} aria-pressed={item.seriesId === selectedSeriesId}><strong>{item.title}</strong><span>ID {item.seriesId} · {item.accessMode === "operate" ? "จัดการได้" : "ดูได้อย่างเดียว"} · binding {item.bindingStatus ?? "ยังไม่ผูก"}</span></button></li>)}</ul>{series.length === 0 ? <p className="subtle">ไม่พบ Series ที่เข้าถึงได้</p> : null}{nextSeriesCursor ? <button type="button" className="secondary-button" onClick={() => void loadSeries({ append: true, cursor: nextSeriesCursor })} disabled={busy}>โหลด Series เพิ่ม</button> : null}</section>
      <section aria-labelledby="binding-root-heading"><h3 id="binding-root-heading">Local root</h3><label className="field-label" htmlFor="binding-root-path">โฟลเดอร์ footage</label><div className="button-row"><input id="binding-root-path" value={rootPath} onChange={event => setRootPath(event.target.value)} placeholder="เลือกโฟลเดอร์บนเครื่อง Worker" autoComplete="off" /><button type="button" className="secondary-button" onClick={() => void chooseRoot()} disabled={!selected || busy}>เลือกโฟลเดอร์</button></div><p className="field-help">path นี้ถูกใช้ใน native Worker เท่านั้น และไม่ถูกส่งกลับเป็น remote projection</p><div className="button-row"><button type="button" className="primary-button" onClick={() => void selectRoot()} disabled={!selected || !rootPath.trim() || busy}>ตรวจสอบ root</button><button type="button" className="primary-button" onClick={() => void bind()} disabled={!selected || !workspace || selected.accessMode !== "operate" || busy}>ผูก Series</button><button type="button" className="secondary-button" onClick={() => void revoke()} disabled={!workspace || busy}>ยกเลิกการผูก</button>{onNavigate ? <button type="button" className="secondary-button" onClick={() => onNavigate("media-workspace")}>ไปเตรียมสื่อ</button> : null}</div>{workspace ? <p className="workspace-status-card" role="status"><strong>{workspace.status}</strong><span>root {workspace.rootId} · {workspace.fileCount} files · {workspace.workspaceMode}</span></p> : <p className="subtle">ยังไม่ได้เลือก local root</p>}</section>
    </article>
  </section>;
}
