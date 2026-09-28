import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useWorkerAppContext } from "../app/workerContext";

type Job = {
  jobId: string;
  jobType: string;
  status: string;
  phase: string;
  progressPercent: number;
  createdAt: string;
  updatedAt: string;
  seriesTitle: string | null;
  episodeId: string | null;
  shotId: string | null;
  workflowId: string | null;
  workflowVersion: string | null;
  connectionProfileId?: string | null;
  remoteExecutionId?: string | null;
  workerDisplayName: string | null;
  workerMachineName?: string | null;
  failureReason?: string | null;
  latestEventMessage?: string | null;
  outputCount?: number;
};

type Summary = {
  items?: Job[];
  active?: Job[];
  waiting?: Job[];
  recent?: Job[];
  counts?: { active: number; waiting: number; recent: number; total: number };
  serverNow?: string;
  staleAfterSeconds?: number;
};

const COMFY_TYPES = new Set(["comfy_image_generation", "comfy_video_generation", "shot_video_generation", "comfy_workflow_run"]);
const copy = {
  th: { title: "งาน ComfyUI", body: "มุมมองงาน ComfyUI จากคิวกลางของ Worker ใช้ข้อมูลชุดเดียวกับ Overview และไม่สร้างคิวแยก", refresh: "รีเฟรช", active: "กำลังทำงาน", waiting: "รอคิว", recent: "ล่าสุด", idle: "ยังไม่มีงาน ComfyUI", stale: "ข้อมูลอาจล้าสมัย", created: "สร้างเมื่อ", updated: "อัปเดตล่าสุด", worker: "Worker", workflow: "Workflow", output: "ผลลัพธ์", error: "อ่านคิว ComfyUI ไม่สำเร็จ" },
  en: { title: "ComfyUI jobs", body: "ComfyUI jobs from the global Worker queue. This is a filtered view, not a second queue or scheduler.", refresh: "Refresh", active: "In progress", waiting: "Waiting", recent: "Recent", idle: "No ComfyUI jobs", stale: "Data may be stale", created: "Created", updated: "Last updated", worker: "Worker", workflow: "Workflow", output: "Outputs", error: "Could not read ComfyUI queue" },
} as const;

function formatTime(value: string, locale: "th" | "en") {
  return new Date(value).toLocaleString(locale === "th" ? "th-TH" : "en-US");
}

function JobCard({ job, locale }: { job: Job; locale: "th" | "en" }) {
  const t = copy[locale];
  return <article className="workspace-status-card" data-testid={`comfy-job-${job.jobId}`}>
    <div className="panel-heading"><strong>{job.jobType.replaceAll("_", " ")}</strong><span className="loop-badge">{job.status} · {job.progressPercent}%</span></div>
    <span className="manual-command-text">{job.jobId}</span>
    <span>{job.seriesTitle || "—"}{job.episodeId ? ` · ${job.episodeId}` : ""}{job.shotId ? ` · ${job.shotId}` : ""}</span>
    <span>{t.workflow}: {job.workflowId || "—"}{job.workflowVersion ? ` (${job.workflowVersion})` : ""}</span>
    <span>{t.worker}: {job.workerDisplayName || "—"}{job.workerMachineName ? ` · ${job.workerMachineName}` : ""}</span>
    <span>{t.created}: {formatTime(job.createdAt, locale)} · {t.updated}: {formatTime(job.updatedAt, locale)}</span>
    {typeof job.outputCount === "number" ? <span>{t.output}: {job.outputCount}</span> : null}
    {job.failureReason || job.latestEventMessage ? <span className="warning">{job.failureReason || job.latestEventMessage}</span> : null}
  </article>;
}

export function ComfyJobsScreen() {
  const { locale } = useWorkerAppContext();
  const t = copy[locale];
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const load = () => void invoke<Summary>("worker_app_get_worker_job_summary").then(value => {
    const items = (value.items || []).filter(job => COMFY_TYPES.has(job.jobType));
    setSummary({ ...value, items, active: (value.active || []).filter(job => COMFY_TYPES.has(job.jobType)), waiting: (value.waiting || []).filter(job => COMFY_TYPES.has(job.jobType)), recent: (value.recent || []).filter(job => COMFY_TYPES.has(job.jobType)) });
    setError("");
  }).catch(value => setError(`${t.error}: ${String(value)}`));
  useEffect(() => { load(); const timer = window.setInterval(load, 5_000); return () => window.clearInterval(timer); }, []);
  const jobs = summary?.items || [];
  const active = jobs.filter(job => ["claimed", "preparing", "preflight", "staging", "submitted", "running", "collecting", "validating", "saved", "uploading", "publishing", "indexing", "reconciling"].includes(job.status));
  const waiting = jobs.filter(job => job.status === "queued");
  const recent = jobs.filter(job => ["completed", "failed", "canceled", "expired"].includes(job.status));
  const sections: Array<[string, Job[]]> = [[t.active, active], [t.waiting, waiting], [t.recent, recent]];
  return <section className="dashboard-grid" role="tabpanel" data-testid="worker-screen-comfy-jobs">
    <article className="panel wide">
      <div className="panel-heading"><div><p className="eyebrow">ComfyUI MCP</p><h2>{t.title}</h2></div><button type="button" className="secondary-button" onClick={load}>{t.refresh}</button></div>
      <p className="subtle">{t.body}</p>
      {error ? <p className="connect-message error" role="alert">{error}</p> : null}
      {summary?.serverNow && summary.staleAfterSeconds ? <p className="subtle">{t.updated}: {formatTime(summary.serverNow, locale)} · {t.stale} {summary.staleAfterSeconds}s</p> : null}
      {sections.map(([label, entries]) => <section key={label} aria-label={label}><h3>{label} ({entries.length})</h3>{entries.length ? <div className="comfy-profile-grid">{entries.map(job => <JobCard key={job.jobId} job={job} locale={locale} />)}</div> : <p className="subtle">{t.idle}</p>}</section>)}
    </article>
  </section>;
}
