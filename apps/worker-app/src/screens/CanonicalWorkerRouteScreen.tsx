import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CanonicalWorkerRouteId } from "../app/workerRoutes";
import { useWorkerAppContext } from "../app/workerContext";
import { summarizeRemoteQueue, type WorkerRemoteQueueItem } from "../app/workerDashboard";
import type { WorkerConnectionPresentation } from "../app/workerDashboard";

export function CanonicalWorkerRouteScreen({
  route,
  connected,
  loopRunning,
  queueDepth,
  lastMessage,
  runtimeStatus,
  connectionStatus,
  executorState,
  onNavigate,
}: {
  route: CanonicalWorkerRouteId;
  connected: boolean;
  loopRunning: boolean;
  queueDepth: number;
  lastMessage: string;
  runtimeStatus: string;
  connectionStatus?: WorkerConnectionPresentation;
  executorState?: {
    acceptingJobs?: boolean;
    status?: string;
    currentJobId?: string | null;
    currentJobLabel?: string | null;
    activeJobs?: Array<{ jobId: string; jobLabel: string; jobType: string; createdAt?: string | null; progressPercent: number; message: string; projectName?: string | null }>;
    lastCompletedJob?: { jobLabel: string; status: string; message: string } | null;
  };
  onNavigate?: (route: CanonicalWorkerRouteId) => void;
}) {
  const { selectedSeriesId, locale } = useWorkerAppContext();
  const [published, setPublished] = useState<{ assets?: Array<{ id: string; pipelineState: string; vectorIndexStatus: string; assetKind: string }> } | null>(null);
  const [publishedError, setPublishedError] = useState("");
  const [doctor, setDoctor] = useState<{ status: string; checks: Array<{ id: string; status: string; message: string }>; recommendedActions: string[] } | null>(null);
  const [doctorError, setDoctorError] = useState("");
  const [queueState, setQueueState] = useState<{
    acceptingJobs?: boolean;
    status?: string;
    currentJobId?: string | null;
    currentJobLabel?: string | null;
    activeJobs?: Array<{ jobId: string; jobLabel: string; jobType: string; createdAt?: string | null; progressPercent: number; message: string; projectName?: string | null }>;
    lastCompletedJob?: { jobLabel: string; status: string; message: string } | null;
  } | null>(null);
  const [remoteQueue, setRemoteQueue] = useState<Array<{
    jobId: string;
    seriesId: string;
    seriesTitle: string;
    jobType: string;
    transportStatus: string;
    domainStatus: string;
    statusReason: string | null;
    workflowId: string | null;
    priority: number;
    createdAt: string;
  }>>([]);
  const [workerJobSummary, setWorkerJobSummary] = useState<Array<{
    jobId: string;
    jobType: string;
    status: string;
    phase: string;
    progressPercent: number;
    createdAt: string;
    updatedAt: string;
    workerId: string | null;
    workerDisplayName: string | null;
    seriesId: string | null;
    seriesTitle: string | null;
    episodeId: string | null;
    shotId: string | null;
    workflowId: string | null;
    workflowVersion: string | null;
    queuePosition: number | null;
    waitReason: string | null;
  }>>([]);
  const [workerJobSummaryError, setWorkerJobSummaryError] = useState("");
  useEffect(() => {
    if (route !== "media-workspace" || !selectedSeriesId) return;
    let cancelled = false;
    void invoke<{ assets?: Array<{ id: string; pipelineState: string; vectorIndexStatus: string; assetKind: string }> }>("worker_app_get_series_media_workspace", { seriesId: selectedSeriesId })
      .then(value => { if (!cancelled) { setPublished(value); setPublishedError(""); } })
      .catch(error => { if (!cancelled) setPublishedError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [route, selectedSeriesId]);
  useEffect(() => {
    if (!(["runtime", "workflows"].includes(route))) return;
    let cancelled = false;
    void invoke<{ status: string; checks: Array<{ id: string; status: string; message: string }>; recommendedActions: string[] }>("worker_app_run_doctor")
      .then(value => { if (!cancelled) { setDoctor(value); setDoctorError(""); } })
      .catch(error => { if (!cancelled) setDoctorError(error instanceof Error ? error.message : String(error)); });
    return () => { cancelled = true; };
  }, [route]);
  useEffect(() => {
    if (!(route === "queue" || route === "overview")) return;
    let cancelled = false;
    void invoke<typeof queueState>("worker_app_get_executor_state")
      .then(value => { if (!cancelled) setQueueState(value); })
      .catch(() => { if (!cancelled) setQueueState(null); });
    return () => { cancelled = true; };
  }, [route, queueDepth]);
  useEffect(() => {
    if (!(route === "queue" || route === "overview")) return;
    let cancelled = false;
    let inFlight = false;
    const loadQueue = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const value = await invoke<{ items?: typeof remoteQueue }>("worker_app_get_series_queue", { seriesId: route === "queue" ? (selectedSeriesId || null) : null });
        if (!cancelled) setRemoteQueue(value.items || []);
      } catch {
        if (!cancelled) setRemoteQueue([]);
      } finally {
        inFlight = false;
      }
    };
    void loadQueue();
    const timer = window.setInterval(() => void loadQueue(), 5_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [route, selectedSeriesId, queueDepth]);
  useEffect(() => {
    if (!(route === "overview" || route === "queue")) return;
    let cancelled = false;
    let inFlight = false;
    const loadSummary = async () => {
      if (cancelled || inFlight) return;
      inFlight = true;
      try {
        const value = await invoke<{ items?: typeof workerJobSummary }>("worker_app_get_worker_job_summary");
        if (!cancelled) {
          setWorkerJobSummary(value.items || []);
          setWorkerJobSummaryError("");
        }
      } catch (error) {
        if (!cancelled) {
          setWorkerJobSummary([]);
          setWorkerJobSummaryError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        inFlight = false;
      }
    };
    void loadSummary();
    const timer = window.setInterval(() => void loadSummary(), 3_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [route, queueDepth]);
  const executeRemoteJobAction = (jobId: string, seriesId: string, action: "pause" | "resume" | "cancel" | "retry") => {
    void invoke("worker_app_execute_series_quick_action", {
      seriesId,
      action,
      jobIds: [jobId],
      ...(action === "pause" ? { reason: "paused_from_worker_queue" } : action === "cancel" ? { reason: "canceled_from_worker_queue" } : {}),
    }).then(() => {
      if (action === "pause") {
        setRemoteQueue(items => items.map(item => item.jobId === jobId
          ? { ...item, domainStatus: "paused", statusReason: "paused:paused_from_worker_queue" }
          : item));
      } else if (action === "resume") {
        setRemoteQueue(items => items.map(item => item.jobId === jobId
          ? { ...item, domainStatus: "processing_local_derivatives", statusReason: null }
          : item));
      } else if (action === "cancel") {
        setRemoteQueue(items => items.map(item => item.jobId === jobId
          ? { ...item, transportStatus: "canceled", domainStatus: "canceled", statusReason: "canceled_from_worker_queue" }
          : item));
      } else {
        setRemoteQueue(items => items.filter(item => item.jobId !== jobId));
      }
    }).catch(() => undefined);
  };
  const copyTh: Record<CanonicalWorkerRouteId, { eyebrow: string; title: string; body: string }> = {
    overview: { eyebrow: "Overview", title: "Worker พร้อมทำงานแค่ไหน", body: "ตรวจสอบการเชื่อมต่อ คิวงาน และสถานะ runtime จากจุดเดียว" },
    queue: { eyebrow: "Queue", title: "คิวงานและความคืบหน้า", body: "งานที่เข้าคิวจะถูกประมวลผลโดย Worker loop และแสดงสถานะล่าสุดที่นี่" },
    workflows: { eyebrow: "AI / Workflows", title: "ComfyUI MCP workflows", body: "เลือก workflow ที่ประกาศโดย MCP และตรวจสถานะก่อนเริ่มงาน GPU" },
    "comfy-jobs": { eyebrow: "ComfyUI Jobs", title: "งาน ComfyUI", body: "ดูงาน GPU และผลลัพธ์จากคิวกลางของ Worker" },
    comfy: { eyebrow: "ComfyUI MCP", title: "ComfyUI connections", body: "จัดการ connection และ profile ของ ComfyUI ที่บันทึกไว้" },
    runtime: { eyebrow: "Runtime / GPU", title: "สถานะเครื่องและ GPU", body: "ดู readiness ของ runtime, ComfyUI และ worker loop" },
    connection: { eyebrow: "Connection", title: "เชื่อมต่อ Worker", body: "จัดการการเชื่อมต่อกับ Smart AI Hub" },
    series: { eyebrow: "Series", title: "Series media", body: "เลือก Series และผูกโฟลเดอร์ footage ในเครื่อง" },
    "media-workspace": { eyebrow: "Media Workspace", title: "เตรียมสื่อ", body: "สแกน วิเคราะห์ ตัดต่อ และส่ง derived assets" },
    settings: { eyebrow: "Settings", title: "ตั้งค่า Worker", body: "ตั้งค่าการรับงานและ runtime" },
  };
  const copyEn: Record<CanonicalWorkerRouteId, { eyebrow: string; title: string; body: string }> = {
    overview: { eyebrow: "Overview", title: "Worker readiness", body: "Check connection, queue, and runtime status in one place" },
    queue: { eyebrow: "Queue", title: "Jobs and progress", body: "Queued work is processed by the Worker loop and its latest status appears here" },
    workflows: { eyebrow: "AI / Workflows", title: "ComfyUI MCP workflows", body: "Choose workflows declared by MCP and verify readiness before GPU work" },
    "comfy-jobs": { eyebrow: "ComfyUI Jobs", title: "ComfyUI jobs", body: "View GPU jobs and outputs from the global Worker queue" },
    comfy: { eyebrow: "ComfyUI MCP", title: "ComfyUI connections", body: "Manage saved ComfyUI connections and profiles" },
    runtime: { eyebrow: "Runtime / agents", title: "Runtime and Hermes", body: "Manage Hermes readiness and local runtime diagnostics" },
    connection: { eyebrow: "Connection", title: "Connect Worker", body: "Manage the connection to Smart AI Hub" },
    series: { eyebrow: "Series", title: "Series media", body: "Choose a Series and bind its local footage folder" },
    "media-workspace": { eyebrow: "Media Workspace", title: "Prepare media", body: "Scan, analyze, preprocess, and publish derived assets" },
    settings: { eyebrow: "Settings", title: "Worker settings", body: "Configure language, job intake, and runtime" },
  };
  const copy = (locale === "th" ? copyTh : copyEn)[route];
  const selected = copy;
  const routeGuidance: Record<CanonicalWorkerRouteId, { label: string; detail: string; next?: CanonicalWorkerRouteId }> = locale === "th" ? {
    overview: { label: "เริ่มจาก Series media", detail: "เลือก Series และโฟลเดอร์ footage ในเครื่อง Worker เพื่อสร้าง inventory", next: "series" },
    queue: { label: "ตรวจงานที่ค้าง", detail: "ยกเลิกได้เฉพาะงาน queued; งานที่กำลังทำต้องรอให้ Worker คืนสถานะ", next: "queue" },
    workflows: { label: "ตรวจ capability", detail: "เลือก workflow จาก manifest ของ ComfyUI MCP เมื่อ runtime พร้อม", next: "workflows" },
    "comfy-jobs": { label: "ตรวจงาน ComfyUI", detail: "ดูสถานะ งานที่กำลังทำ งานรอ และผลลัพธ์จากคิวกลาง", next: "comfy-jobs" },
    comfy: { label: "จัดการ ComfyUI", detail: "เพิ่ม ทดสอบ เลือกใช้ หรือยกเลิก profile ของ ComfyUI", next: "comfy" },
    runtime: { label: "รัน readiness check", detail: "ตรวจ runtime, GPU และ ComfyUI ก่อนรับงานที่ต้องใช้ GPU", next: "runtime" },
    connection: { label: "เชื่อมต่อ server", detail: "ต้องเชื่อมต่อและผ่าน readiness ก่อนจึงรับงานได้", next: "connection" },
    series: { label: "จัดการ footage", detail: "เลือก Series แล้วผูก local root ที่อยู่บนเครื่องนี้", next: "series" },
    "media-workspace": { label: "ทำ preprocessing", detail: "ทำตามลำดับ Intake → Inventory → AI Plan → Review → QC → Publish", next: "media-workspace" },
    settings: { label: "ตั้งค่า Worker", detail: "ปรับ local root, runtime และการรับงานในหน้าตั้งค่า", next: "settings" },
  } : {
    overview: { label: "Start with Series media", detail: "Choose a Series and local footage folder to build an inventory", next: "series" },
    queue: { label: "Review queued work", detail: "Pause or cancel queued jobs and inspect the latest Worker result", next: "queue" },
    workflows: { label: "Check capabilities", detail: "Review ComfyUI MCP workflow capabilities before GPU processing", next: "workflows" },
    "comfy-jobs": { label: "Review ComfyUI jobs", detail: "Inspect active, waiting, and completed jobs from the global queue", next: "comfy-jobs" },
    comfy: { label: "Manage ComfyUI", detail: "Add, select, or revoke a saved ComfyUI profile", next: "comfy" },
    runtime: { label: "Check Hermes runtime", detail: "Verify Hermes installation, sign-in, and runtime readiness", next: "runtime" },
    connection: { label: "Connect to server", detail: "Connect and pass readiness checks before accepting work", next: "connection" },
    series: { label: "Manage footage", detail: "Choose a Series and bind a local root on this machine", next: "series" },
    "media-workspace": { label: "Preprocess media", detail: "Follow Intake → Inventory → AI Plan → Review → QC → Publish", next: "media-workspace" },
    settings: { label: "Configure Worker", detail: "Adjust language, local folders, runtime, and job intake", next: "settings" },
  };
  const guidance = routeGuidance[route];
  const remoteSummary = summarizeRemoteQueue(remoteQueue as WorkerRemoteQueueItem[]);
  const authoritativeActiveJobs = workerJobSummary.filter(job => ["claimed", "preparing", "preflight", "staging", "submitted", "running", "collecting", "validating", "uploading", "publishing", "indexing"].includes(job.status));
  const authoritativeWaitingJobs = workerJobSummary.filter(job => job.status === "queued");
  const authoritativeRecentJobs = workerJobSummary.filter(job => ["completed", "failed", "canceled", "expired"].includes(job.status));
  const isThai = locale === "th";
  const formatJobTime = (value: string) => new Date(value).toLocaleString(locale === "th" ? "th-TH" : "en-US");
  const formatLocalJobTime = (value?: string | null) => value
    ? formatJobTime(value)
    : (isThai ? "ไม่พบเวลาสร้างจาก Server" : "Creation time unavailable from Server");
  const jobTypeLabel = (value: string) => value.replaceAll("_", " ");
  const readableJobSummaryError = workerJobSummaryError.includes("401") || workerJobSummaryError.includes("403")
    ? (isThai ? "สิทธิ์อ่านสถานะงานของ Worker ยังไม่พร้อม ให้เชื่อมต่อ Worker ใหม่เพื่อรับ workers:jobs:read" : "This Worker token cannot read the job projection. Reconnect the Worker to receive workers:jobs:read.")
    : workerJobSummaryError;
  const liveExecutorState = executorState ?? queueState;
  const localActiveJobs = liveExecutorState?.activeJobs ?? [];
  const currentLocalJob = liveExecutorState?.currentJobId
    ? localActiveJobs.find(job => job.jobId === liveExecutorState.currentJobId)
    : undefined;
  const localAttention = liveExecutorState?.lastCompletedJob?.status === "error" || liveExecutorState?.lastCompletedJob?.status === "failed" ? 1 : 0;
  return (
    <section className="dashboard-grid" role="tabpanel" aria-label={selected.title} data-testid={`worker-screen-${route}`}>
      <article className="panel wide">
        <div className="panel-heading"><div><p className="eyebrow">{selected.eyebrow}</p><h2>{selected.title}</h2></div></div>
        <p className="subtle">{selected.body}</p>
        <div className="queue-summary" aria-label="Worker status summary">
          <div><span>{isThai ? "การเชื่อมต่อ" : "Connection"}</span><strong>{connected ? (isThai ? "เชื่อมต่อแล้ว" : "Connected") : (isThai ? "ยังไม่เชื่อมต่อ" : "Not connected")}</strong></div>
          <div><span>{isThai ? "Worker loop" : "Worker loop"}</span><strong>{loopRunning ? (isThai ? "กำลังทำงาน" : "Running") : (isThai ? "หยุดอยู่" : "Stopped")}</strong></div>
          <div><span>{isThai ? "คิวงาน" : "Queue"}</span><strong>{queueDepth}</strong></div>
          <div><span>Runtime</span><strong>{runtimeStatus}</strong></div>
        </div>
        {route === "overview" && connectionStatus ? <div className={`workspace-status-card ${connectionStatus.tone}`} aria-label="Connection detail">
          <strong>{locale === "th" ? "การเชื่อมต่อ" : "Connection"}: {connectionStatus.label}</strong>
          <span>{connectionStatus.detail}</span>
          <span>{locale === "th" ? "หมดอายุ" : "Expires"}: {connectionStatus.expiresAt ? new Date(connectionStatus.expiresAt).toLocaleString() : (locale === "th" ? "ไม่ได้ระบุจาก Server" : "Not provided by server")}</span>
          <span>{locale === "th" ? "ตรวจล่าสุด" : "Last checked"}: {connectionStatus.checkedAt ? new Date(connectionStatus.checkedAt).toLocaleString() : (locale === "th" ? "กำลังตรวจ" : "Checking")}</span>
        </div> : null}
        {route === "overview" ? <>
          <div className="workspace-status-card active-job-panel" aria-label="Authoritative active worker jobs">
            <strong>{isThai ? `งานที่กำลังทำอยู่จาก Server (${authoritativeActiveJobs.length})` : `Active jobs from Server (${authoritativeActiveJobs.length})`}</strong>
            {authoritativeActiveJobs.length === 0 ? <span>{isThai ? "Worker ว่าง ไม่มีงานกำลัง process" : "Worker is idle; no job is processing"}</span> : authoritativeActiveJobs.slice(0, 8).map(job => <span key={job.jobId}>
              {job.jobId} · {isThai ? "ชนิดงาน" : "Type"}: {jobTypeLabel(job.jobType)} · {isThai ? "ช่วง" : "Phase"}: {job.phase} · {isThai ? "คืบหน้า" : "Progress"}: {job.progressPercent}% · {isThai ? "สร้างเมื่อ" : "Created"}: {formatJobTime(job.createdAt)}{job.seriesTitle ? ` · ${job.seriesTitle}` : ""}{job.workflowId ? ` · workflow ${job.workflowId}` : ""}
            </span>)}
            {authoritativeWaitingJobs.length > 0 ? <span>{isThai ? `มีงานรอ ${authoritativeWaitingJobs.length} งาน — งานใหม่จะรอจนกว่า Worker จะว่าง` : `${authoritativeWaitingJobs.length} job(s) waiting — new work waits until the Worker is available`}</span> : null}
            {workerJobSummaryError ? <span role="alert">{isThai ? `อ่านสถานะงานจาก Server ไม่สำเร็จ: ${readableJobSummaryError}` : `Unable to read the server job projection: ${readableJobSummaryError}`}</span> : null}
          </div>
          <div className="overview-dashboard-grid" aria-label="Live worker dashboard">
            <div className="workspace-status-card"><strong>{isThai ? "กำลังทำงาน" : "In progress"}</strong><span>{localActiveJobs.length + remoteSummary.processing} {isThai ? "งาน" : "jobs"}</span></div>
            <div className="workspace-status-card"><strong>{isThai ? "รอประมวลผล" : "Waiting"}</strong><span>{queueDepth + remoteSummary.queued} {isThai ? "งาน" : "jobs"}</span></div>
            <div className="workspace-status-card"><strong>{isThai ? "ต้องตรวจสอบ" : "Needs attention"}</strong><span>{remoteSummary.attention + localAttention} {isThai ? "งาน" : "jobs"}</span></div>
            <div className="workspace-status-card"><strong>{isThai ? "สถานะ Worker" : "Worker status"}</strong><span>{liveExecutorState?.acceptingJobs ? (isThai ? "พร้อมรับงาน" : "Ready for work") : loopRunning ? (isThai ? "กำลังตรวจคิว" : "Checking queue") : (isThai ? "หยุดรับงาน" : "Not accepting jobs")}</span></div>
          </div>
          <div className="workspace-status-card" aria-label="Active worker jobs">
            <strong>{isThai ? `งานที่กำลังทำ (${localActiveJobs.length})` : `Active jobs (${localActiveJobs.length})`}</strong>
            {localActiveJobs.length === 0 ? <span>{isThai ? "ไม่มีงานกำลังประมวลผลในเครื่องนี้" : "No jobs are currently processing on this machine"}</span> : localActiveJobs.map(job => <span key={job.jobId}>
              {job.jobLabel || job.jobType} · {job.progressPercent}% · {isThai ? "เลข Job" : "Job ID"}: {job.jobId} · {isThai ? "ชนิดงาน" : "Type"}: {job.jobType} · {isThai ? "สร้างเมื่อ" : "Created"}: {formatLocalJobTime(job.createdAt)} · {job.message}{job.projectName ? ` · ${job.projectName}` : ""}
            </span>)}
          </div>
          <div className="workspace-status-card" aria-label="Recent worker jobs">
            <strong>{isThai ? `งานล่าสุด (${authoritativeRecentJobs.length})` : `Recent jobs (${authoritativeRecentJobs.length})`}</strong>
            {authoritativeRecentJobs.length === 0 ? <span>{isThai ? "ยังไม่มีงานที่จบล่าสุด" : "No recent terminal jobs"}</span> : authoritativeRecentJobs.slice(0, 5).map(job => <span key={job.jobId}>{job.jobId} · {jobTypeLabel(job.jobType)} · {job.status} · {formatJobTime(job.updatedAt)}{job.seriesTitle ? ` · ${job.seriesTitle}` : ""}</span>)}
          </div>
          <div className="workspace-status-card" aria-label="All worker queue summary">
            <strong>{isThai ? `งานจาก Server (${remoteQueue.length})` : `Server jobs (${remoteQueue.length})`}</strong>
            <span>{isThai ? `กำลังทำ ${remoteSummary.processing} · รอ ${remoteSummary.queued} · ต้องตรวจสอบ ${remoteSummary.attention} · เสร็จแล้ว ${remoteSummary.completed} · อื่น ๆ ${remoteSummary.other}` : `Processing ${remoteSummary.processing} · waiting ${remoteSummary.queued} · attention ${remoteSummary.attention} · completed ${remoteSummary.completed} · other ${remoteSummary.other}`}</span>
            {remoteQueue.length === 0 ? <span>{isThai ? "ไม่มีงานค้างจาก Server" : "No outstanding Server jobs"}</span> : null}
            {onNavigate ? <button type="button" className="secondary-button" onClick={() => onNavigate("queue")}>{isThai ? "เปิดรายละเอียดคิวงาน" : "Open queue details"}</button> : null}
          </div>
          <div className="workspace-status-card" aria-label="Latest worker result">
            <strong>{isThai ? "ผลลัพธ์ล่าสุด" : "Latest result"}</strong>
            <span>{liveExecutorState?.lastCompletedJob ? `${liveExecutorState.lastCompletedJob.jobLabel} · ${liveExecutorState.lastCompletedJob.status} · ${liveExecutorState.lastCompletedJob.message}` : (isThai ? "ยังไม่มีผลลัพธ์งานล่าสุด" : "No completed result yet")}</span>
          </div>
        </> : null}
        <div className="workspace-status-card" data-testid={`worker-route-guidance-${route}`}>
          <strong>{guidance.label}</strong>
          <span>{guidance.detail}</span>
          {guidance.next && onNavigate ? <button type="button" className="secondary-button" onClick={() => onNavigate(guidance.next!)}>{isThai ? "เปิดหน้าที่เกี่ยวข้อง" : "Open related page"}</button> : null}
        </div>
        {lastMessage ? <p className="subtle" role="status">{lastMessage}</p> : null}
        {route === "queue" ? <div className="workspace-status-card" aria-label="Queue details"><strong>{isThai ? `งานที่กำลังทำ ${queueDepth > 0 ? "ยังมีรายการรอ" : "ไม่มีงานรอ"}` : `${queueDepth > 0 ? "Work is queued" : "Queue is empty"}`}</strong><span>{isThai ? "สถานะล่าสุดมาจาก Worker loop และใช้ job lease เดียวกับ execution จริง" : "Status is read from the Worker loop using the same execution lease."}</span></div> : null}
        {route === "queue" && liveExecutorState ? <div className="workspace-status-card" aria-label="Current queue job">
          <strong>{liveExecutorState.currentJobLabel || (isThai ? "ไม่มีงานกำลังทำ" : "No active job")}</strong>
          {liveExecutorState.currentJobId ? <span>{isThai ? "เลข Job" : "Job ID"}: {liveExecutorState.currentJobId}</span> : null}
          {currentLocalJob ? <span>{isThai ? "ชนิดงาน" : "Type"}: {currentLocalJob.jobType} · {isThai ? "สร้างเมื่อ" : "Created"}: {formatLocalJobTime(currentLocalJob.createdAt)} · {currentLocalJob.progressPercent}% · {currentLocalJob.message}</span> : null}
          <span>{liveExecutorState.lastCompletedJob ? `${isThai ? "ล่าสุด: " : "Latest: "}${liveExecutorState.lastCompletedJob.jobLabel} · ${liveExecutorState.lastCompletedJob.status} · ${liveExecutorState.lastCompletedJob.message}` : (isThai ? "ยังไม่มีงานที่เสร็จล่าสุด" : "No completed job yet")}</span>
        </div> : null}
        {route === "queue" ? <div className="workspace-status-card" aria-label="Server queue details">
          <strong>{isThai ? `งานทั้งหมดจาก Server (${workerJobSummary.length})` : `All jobs from Server (${workerJobSummary.length})`}</strong>
          {workerJobSummary.length === 0 ? <span>{readableJobSummaryError || (isThai ? "ไม่พบงาน หรือยังอ่านข้อมูลจาก Server ไม่ได้" : "No jobs found or the Server projection is unavailable")}</span> : workerJobSummary.slice(0, 20).map(job => <span key={job.jobId}>
            {job.jobId} · {isThai ? "ชนิดงาน" : "Type"}: {jobTypeLabel(job.jobType)} · {isThai ? "สถานะ" : "Status"}: {job.status} · {isThai ? "ช่วง" : "Phase"}: {job.phase} · {isThai ? "คืบหน้า" : "Progress"}: {job.progressPercent}% · {isThai ? "สร้างเมื่อ" : "Created"}: {formatJobTime(job.createdAt)}
            {job.seriesTitle ? ` · ${job.seriesTitle}` : ""}
            {job.workflowId ? ` · workflow ${job.workflowId}` : ""}
            {job.queuePosition ? ` · ${isThai ? "ลำดับ" : "queue"} ${job.queuePosition}` : ""}
            {job.status === "queued" && job.seriesId ? <button type="button" className="secondary-button" onClick={() => executeRemoteJobAction(job.jobId, job.seriesId!, "pause")}>พัก</button> : null}
            {job.status === "queued" && job.seriesId ? <button type="button" className="secondary-button" onClick={() => executeRemoteJobAction(job.jobId, job.seriesId!, "cancel")}>ยกเลิก</button> : null}
          </span>)}
          <span>{isThai ? "คำสั่งจัดการคิวของ Series จะแสดงเมื่อเลือก Series" : "Series queue actions appear when a Series is selected."}</span>
        </div> : null}
        {route === "queue" && remoteQueue.length > 0 ? <div className="workspace-status-card" aria-label="Series queue actions">
          <strong>{isThai ? "คำสั่งคิวของ Series ที่เลือก" : "Selected Series queue actions"}</strong>
          {remoteQueue.slice(0, 20).map(job => <span key={job.jobId}>
            {job.jobType} · {job.seriesTitle} · {job.domainStatus} · {job.transportStatus}
            {job.workflowId ? ` · workflow ${job.workflowId}` : ""}
            {job.transportStatus === "queued" && job.domainStatus !== "paused" ? <button type="button" className="secondary-button" onClick={() => executeRemoteJobAction(job.jobId, job.seriesId, "pause")}>{isThai ? "พัก" : "Pause"}</button> : null}
            {job.transportStatus === "queued" && job.domainStatus === "paused" ? <button type="button" className="secondary-button" onClick={() => executeRemoteJobAction(job.jobId, job.seriesId, "resume")}>{isThai ? "ทำต่อ" : "Resume"}</button> : null}
            {job.transportStatus === "queued" ? <button type="button" className="secondary-button" onClick={() => executeRemoteJobAction(job.jobId, job.seriesId, "cancel")}>{isThai ? "ยกเลิก" : "Cancel"}</button> : null}
            {["failed", "expired", "canceled"].includes(job.transportStatus) ? <button type="button" className="secondary-button" onClick={() => executeRemoteJobAction(job.jobId, job.seriesId, "retry")}>{isThai ? "ลองใหม่" : "Retry"}</button> : null}
            {(["failed", "needs_review"].includes(job.transportStatus) || job.domainStatus === "needs_review") && onNavigate ? <button type="button" className="secondary-button" onClick={() => onNavigate("media-workspace")}>{isThai ? "เปิดตรวจ" : "Review"}</button> : null}
          </span>)}
        </div> : null}
        {route === "media-workspace" ? <div className="workspace-status-card" aria-label="Published asset details"><strong>{published?.assets?.length ?? 0} derived assets</strong><span>{publishedError || (selectedSeriesId ? "แสดงเฉพาะ asset ที่ server ผูกกับ Series นี้" : "เลือก Series เพื่อดู published assets")}</span>{published?.assets?.slice(0, 8).map(asset => <span key={asset.id}>#{asset.id} · {asset.assetKind} · {asset.pipelineState} · index {asset.vectorIndexStatus}</span>)}</div> : null}
        {route === "workflows" || route === "runtime" ? <div className="workspace-status-card" aria-label="Runtime capability details"><strong>{doctor?.status || runtimeStatus}</strong><span>{doctorError || "ผลตรวจ native runtime ล่าสุด"}</span>{doctor?.checks.map(check => <span key={check.id}>{check.id} · {check.status} · {check.message}</span>)}{doctor?.recommendedActions.map(action => <span key={action}>แนะนำ: {action}</span>)}</div> : null}
      </article>
    </section>
  );
}
