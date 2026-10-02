import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { systemSettings, workerJobs } from "../../drizzle/schema";

export type JobFamily = "python" | "image" | "audio" | "video" | "general";
export type FamilyDeadlineSetting = { retryMinutes: number; maxMinutes: number };
export type WorkerJobDeadlineSettings = {
  adaptive: boolean;
  families: Record<JobFamily, FamilyDeadlineSetting>;
};

export const DEFAULT_WORKER_JOB_DEADLINE_SETTINGS: WorkerJobDeadlineSettings = {
  adaptive: true,
  families: {
    python: { retryMinutes: 10, maxMinutes: 10 },
    image: { retryMinutes: 10, maxMinutes: 10 },
    audio: { retryMinutes: 10, maxMinutes: 10 },
    video: { retryMinutes: 60, maxMinutes: 60 },
    general: { retryMinutes: 10, maxMinutes: 10 },
  },
};

export const HARD_MAX_DEADLINE_MINUTES: Record<JobFamily, number> = {
  python: 60,
  image: 60,
  audio: 120,
  video: 120,
  general: 120,
};

const JOB_FAMILIES = ["python", "image", "audio", "video", "general"] as const;

const SETTINGS_CATEGORY = "worker_queue";
const SETTINGS_KEY = "deadline_policy_v1";
const CACHE_MS = 15_000;
let cachedSettings: WorkerJobDeadlineSettings | null = null;
let cachedAt = 0;
let cachedMetrics: DeadlineMetric[] | null = null;
let settingsDegraded = false;
let metricsDegraded = false;

export type DeadlineMetric = {
  family: JobFamily;
  queued: number;
  active: number;
  activeUsers: number;
  avgQueueWaitMs: number | null;
  p95QueueWaitMs: number | null;
  avgExecutionMs: number | null;
  p95ExecutionMs: number | null;
  avgEndToEndMs: number | null;
  p95EndToEndMs: number | null;
  completedLastHour: number;
};

function isFamily(value: unknown): value is JobFamily {
  return JOB_FAMILIES.includes(value as JobFamily);
}

export function validateWorkerJobDeadlineSettings(value: unknown): WorkerJobDeadlineSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("WORKER_JOB_DEADLINE_SETTINGS_INVALID");
  }
  const candidate = value as Partial<WorkerJobDeadlineSettings>;
  if (typeof candidate.adaptive !== "boolean" || !candidate.families || typeof candidate.families !== "object") {
    throw new Error("WORKER_JOB_DEADLINE_SETTINGS_INVALID");
  }
  const families = {} as Record<JobFamily, FamilyDeadlineSetting>;
  for (const family of JOB_FAMILIES) {
    // Older persisted policies only contain Python, image and video.
    const setting = candidate.families[family] ?? DEFAULT_WORKER_JOB_DEADLINE_SETTINGS.families[family];
    if (!setting || !Number.isInteger(setting.retryMinutes) || !Number.isInteger(setting.maxMinutes)) {
      throw new Error("WORKER_JOB_DEADLINE_SETTINGS_INVALID");
    }
    if (setting.retryMinutes < 1 || setting.retryMinutes > setting.maxMinutes || setting.maxMinutes > HARD_MAX_DEADLINE_MINUTES[family]) {
      throw new Error("WORKER_JOB_DEADLINE_SETTINGS_OUT_OF_RANGE");
    }
    families[family] = { retryMinutes: setting.retryMinutes, maxMinutes: setting.maxMinutes };
  }
  return { adaptive: candidate.adaptive, families };
}

export function inferJobFamily(input: {
  jobType: string;
  runtimeType?: string;
  executionClass?: string;
  input?: Record<string, unknown>;
}): JobFamily {
  const type = input.jobType.toLowerCase();
  const queue = typeof input.input?.queue === "string" ? input.input.queue.toLowerCase() : "";
  if (queue === "video" || type.includes("video") || input.executionClass === "video") return "video";
  if (queue === "image" || type.includes("image") || type.includes("character_prompt") || type.includes("cover")) return "image";
  if (queue === "audio" || type.includes("audio") || type.includes("speech") || type.includes("tts")) return "audio";
  if (input.runtimeType === "python_job_worker" || type.startsWith("python.") || type.includes("skill")) return "python";
  return "general";
}

export function recommendRetryDeadlineMs(
  setting: FamilyDeadlineSetting,
  metric: DeadlineMetric | null,
  adaptive: boolean,
): { deadlineMs: number; confidence: "low" | "medium" | "high"; estimatedQueueWaitMs: number | null; capApplied: boolean } {
  const baseMs = setting.retryMinutes * 60_000;
  const maxMs = setting.maxMinutes * 60_000;
  if (!adaptive || !metric || (metric.p95ExecutionMs == null && metric.p95EndToEndMs == null) || metric.completedLastHour < 5) {
    return { deadlineMs: baseMs, confidence: "low", estimatedQueueWaitMs: null, capApplied: false };
  }
  const throughputPerMinute = metric.completedLastHour / 60;
  const throughputQueueWaitMs = metric.queued > 0
    ? Math.ceil(metric.queued / Math.max(throughputPerMinute, 1 / 60)) * 60_000
    : 0;
  const concurrencyQueueWaitMs = metric.queued > 0 && metric.active > 0 && metric.p95ExecutionMs != null
    ? Math.ceil(metric.queued / metric.active) * metric.p95ExecutionMs
    : 0;
  const estimatedQueueWaitMs = metric.queued > 0
    ? Math.max(throughputQueueWaitMs, concurrencyQueueWaitMs, metric.p95QueueWaitMs ?? 0)
    : 0;
  const executionAndQueueMs = metric.p95ExecutionMs == null ? 0 : metric.p95ExecutionMs * 1.5 + estimatedQueueWaitMs;
  const observedEndToEndMs = metric.p95EndToEndMs == null ? 0 : metric.p95EndToEndMs * 1.1;
  const evidenceMs = Math.ceil(Math.max(executionAndQueueMs, observedEndToEndMs));
  const uncappedDeadlineMs = Math.max(baseMs, evidenceMs);
  return {
    deadlineMs: Math.min(maxMs, uncappedDeadlineMs),
    confidence: metric.completedLastHour >= 30 ? "high" : "medium",
    estimatedQueueWaitMs,
    capApplied: uncappedDeadlineMs > maxMs,
  };
}

export async function getWorkerJobDeadlineSettings(): Promise<WorkerJobDeadlineSettings> {
  if (cachedSettings && Date.now() - cachedAt < CACHE_MS) return cachedSettings;
  try {
    const db = await getDb();
    if (!db) {
      settingsDegraded = true;
      return DEFAULT_WORKER_JOB_DEADLINE_SETTINGS;
    }
    const [row] = await db.select({ valueJson: systemSettings.valueJson })
      .from(systemSettings)
      .where(and(eq(systemSettings.category, SETTINGS_CATEGORY), eq(systemSettings.key, SETTINGS_KEY)))
      .limit(1);
    if (row?.valueJson) {
      cachedSettings = validateWorkerJobDeadlineSettings(row.valueJson);
    } else {
      cachedSettings = DEFAULT_WORKER_JOB_DEADLINE_SETTINGS;
    }
    settingsDegraded = false;
  } catch {
    cachedSettings = DEFAULT_WORKER_JOB_DEADLINE_SETTINGS;
    settingsDegraded = true;
  }
  cachedAt = Date.now();
  return cachedSettings;
}

export async function updateWorkerJobDeadlineSettings(value: unknown, updatedBy?: number): Promise<WorkerJobDeadlineSettings> {
  const settings = validateWorkerJobDeadlineSettings(value);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const [existing] = await db.select({ id: systemSettings.id })
    .from(systemSettings)
    .where(and(eq(systemSettings.category, SETTINGS_CATEGORY), eq(systemSettings.key, SETTINGS_KEY)))
    .limit(1);
  if (existing) {
    await db.update(systemSettings).set({ valueJson: settings, updatedBy, updatedAt: new Date() })
      .where(eq(systemSettings.id, existing.id));
  } else {
    await db.insert(systemSettings).values({
      category: SETTINGS_CATEGORY,
      key: SETTINGS_KEY,
      value: null,
      valueJson: settings,
      isSensitive: false,
      description: "Bounded worker job retry deadline policy",
      updatedBy,
    });
  }
  cachedSettings = settings;
  cachedMetrics = null;
  cachedAt = Date.now();
  settingsDegraded = false;
  return settings;
}

export async function getWorkerJobDeadlineMetrics(): Promise<DeadlineMetric[]> {
  if (cachedMetrics && Date.now() - cachedAt < CACHE_MS) return cachedMetrics;
  try {
    const db = await getDb();
    if (!db) {
      metricsDegraded = true;
      return [];
    }
    const result = await db.execute(sql`
    SELECT family,
      count(*) FILTER (WHERE status IN ('pending', 'queued', 'retry_scheduled'))::int AS queued,
      count(*) FILTER (WHERE status IN ('leased', 'claimed', 'preparing', 'running', 'uploading', 'publishing', 'indexing'))::int AS active,
      count(DISTINCT "requestedByUserId") FILTER (WHERE status IN ('pending', 'queued', 'retry_scheduled', 'leased', 'claimed', 'preparing', 'running', 'uploading', 'publishing', 'indexing'))::int AS "activeUsers",
      avg(EXTRACT(EPOCH FROM ("firstStartedAt" - "createdAt")) * 1000)
        FILTER (WHERE "firstStartedAt" IS NOT NULL AND "createdAt" > now() - interval '7 days') AS "avgQueueWaitMs",
      percentile_disc(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("firstStartedAt" - "createdAt")) * 1000)
        FILTER (WHERE "firstStartedAt" IS NOT NULL AND "createdAt" > now() - interval '7 days') AS "p95QueueWaitMs",
      avg("attemptExecutionMs")
        FILTER (WHERE "attemptExecutionMs" IS NOT NULL AND status IN ('succeeded', 'completed') AND "finishedAt" > now() - interval '7 days') AS "avgExecutionMs",
      percentile_disc(0.95) WITHIN GROUP (ORDER BY "attemptExecutionMs")
        FILTER (WHERE "attemptExecutionMs" IS NOT NULL AND status IN ('succeeded', 'completed') AND "finishedAt" > now() - interval '7 days') AS "p95ExecutionMs",
      avg(EXTRACT(EPOCH FROM ("finishedAt" - "createdAt")) * 1000)
        FILTER (WHERE status IN ('succeeded', 'completed') AND "finishedAt" > now() - interval '7 days') AS "avgEndToEndMs",
      percentile_disc(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM ("finishedAt" - "createdAt")) * 1000)
        FILTER (WHERE status IN ('succeeded', 'completed') AND "finishedAt" > now() - interval '7 days') AS "p95EndToEndMs",
      count(*) FILTER (WHERE status IN ('succeeded', 'completed') AND "finishedAt" > now() - interval '1 hour')::int AS "completedLastHour"
    FROM (
      SELECT j.*,
        min(a."startedAt") AS "firstStartedAt",
        sum(EXTRACT(EPOCH FROM (a."finishedAt" - a."startedAt")) * 1000) FILTER (
          WHERE a."startedAt" IS NOT NULL AND a."finishedAt" IS NOT NULL
        ) AS "attemptExecutionMs",
        CASE
          WHEN lower(j."jobType") LIKE '%video%' OR lower(COALESCE(j."inputJson"->>'queue', '')) = 'video' THEN 'video'
          WHEN lower(j."jobType") LIKE '%image%' OR lower(j."jobType") LIKE '%character_prompt%' OR lower(j."jobType") LIKE '%cover%'
            OR lower(COALESCE(j."inputJson"->>'queue', '')) = 'image' THEN 'image'
          WHEN lower(j."jobType") LIKE '%audio%' OR lower(j."jobType") LIKE '%speech%' OR lower(j."jobType") LIKE '%tts%'
            OR lower(COALESCE(j."inputJson"->>'queue', '')) = 'audio' THEN 'audio'
          WHEN j."runtimeType" = 'python_job_worker' OR lower(j."jobType") LIKE '%skill%' OR lower(j."jobType") LIKE 'python.%' THEN 'python'
          ELSE 'general' END AS family
      FROM worker_jobs j
      LEFT JOIN worker_job_attempts a ON a."workerJobId" = j.id
      WHERE j."createdAt" > now() - interval '7 days'
      GROUP BY j.id
    ) jobs
    GROUP BY family
    `);
    const rows = ((result as any)?.rows ?? result) as Array<Record<string, unknown>>;
    cachedMetrics = rows.filter(row => isFamily(row.family)).map(row => ({
      family: row.family as JobFamily,
      queued: Number(row.queued ?? 0),
      active: Number(row.active ?? 0),
      activeUsers: Number(row.activeUsers ?? 0),
      avgQueueWaitMs: row.avgQueueWaitMs == null ? null : Number(row.avgQueueWaitMs),
      p95QueueWaitMs: row.p95QueueWaitMs == null ? null : Number(row.p95QueueWaitMs),
      avgExecutionMs: row.avgExecutionMs == null ? null : Number(row.avgExecutionMs),
      p95ExecutionMs: row.p95ExecutionMs == null ? null : Number(row.p95ExecutionMs),
      avgEndToEndMs: row.avgEndToEndMs == null ? null : Number(row.avgEndToEndMs),
      p95EndToEndMs: row.p95EndToEndMs == null ? null : Number(row.p95EndToEndMs),
      completedLastHour: Number(row.completedLastHour ?? 0),
    }));
    metricsDegraded = false;
  } catch {
    cachedMetrics = [];
    metricsDegraded = true;
  }
  cachedAt = Date.now();
  return cachedMetrics ?? [];
}

export async function getWorkerJobDeadlineDashboard() {
  const [settings, metrics] = await Promise.all([getWorkerJobDeadlineSettings(), getWorkerJobDeadlineMetrics()]);
  const byFamily = new Map(metrics.map(metric => [metric.family, metric]));
  return {
    settings,
    settingsDegraded,
    metricsDegraded,
    hardMaximumMinutes: HARD_MAX_DEADLINE_MINUTES,
    metrics: JOB_FAMILIES.map(family => {
      const metric = byFamily.get(family) ?? null;
      const recommendation = recommendRetryDeadlineMs(settings.families[family], metric, settings.adaptive);
      return { family, ...(metric ?? { queued: 0, active: 0, activeUsers: 0, avgQueueWaitMs: null, p95QueueWaitMs: null, avgExecutionMs: null, p95ExecutionMs: null, avgEndToEndMs: null, p95EndToEndMs: null, completedLastHour: 0 }),
        recommendedRetryMinutes: Math.ceil(recommendation.deadlineMs / 60_000),
        confidence: recommendation.confidence,
        capApplied: recommendation.capApplied,
        estimatedQueueWaitMs: recommendation.estimatedQueueWaitMs };
    }),
  };
}

export async function applyWorkerJobRetryDeadline<T extends {
  jobType: string;
  executionClass?: string;
  input: Record<string, unknown>;
  retryPolicy: { deadlineMs: number; deadlineMode?: "adaptive" | "fixed"; [key: string]: unknown };
}>(definition: T, runtimeType: string): Promise<T> {
  const family = inferJobFamily({ jobType: definition.jobType, runtimeType, executionClass: definition.executionClass, input: definition.input });
  const [settings, metrics] = await Promise.all([getWorkerJobDeadlineSettings(), getWorkerJobDeadlineMetrics()]);
  const metric = metrics.find(row => row.family === family) ?? null;
  const familySetting = settings.families[family];
  const result = recommendRetryDeadlineMs(familySetting, metric, settings.adaptive);
  const deadlineMs = definition.retryPolicy.deadlineMode === "fixed"
    ? Math.min(definition.retryPolicy.deadlineMs, familySetting.maxMinutes * 60_000)
    : Math.min(definition.retryPolicy.deadlineMs, result.deadlineMs);
  return {
    ...definition,
    retryPolicy: {
      ...definition.retryPolicy,
      deadlineMs,
      deadlineMode: definition.retryPolicy.deadlineMode ?? "adaptive",
    },
  };
}

/** Resolve the current bounded deadline for legacy jobs that predate deadlineMode. */
export function getEffectiveWorkerJobDeadlineMs(input: {
  jobType: string;
  runtimeType?: string;
  executionClass?: string;
  input: Record<string, unknown>;
  retryPolicy: { deadlineMs?: number; deadlineMode?: "adaptive" | "fixed" };
  timeoutSeconds?: number;
}): number {
  const family = inferJobFamily(input);
  const stored = Number(input.retryPolicy.deadlineMs);
  const storedDeadlineMs = Number.isFinite(stored) && stored > 0
    ? stored
    : Math.max(1, Number(input.timeoutSeconds ?? 600)) * 1000;

  if (input.retryPolicy.deadlineMode === undefined) {
    // Legacy rows had no mode marker and often persisted 6h/24h defaults.
    // Give them the current safe starting deadline on the next reconciler pass.
    return Math.min(storedDeadlineMs, DEFAULT_WORKER_JOB_DEADLINE_SETTINGS.families[family].retryMinutes * 60_000);
  }
  // New adaptive definitions already persist their load-based recommendation;
  // fixed definitions remain bounded by a non-configurable family hard cap.
  return Math.min(storedDeadlineMs, HARD_MAX_DEADLINE_MINUTES[family] * 60_000);
}

/** Fail-safe deadline normalization for legacy insert paths that bypass CP.create. */
export function withSafeWorkerJobDeadline<T extends {
  jobType: string;
  runtimeType?: string;
  executionClass?: string;
  inputJson?: Record<string, unknown>;
  timeoutSeconds?: number;
  retryPolicyJson?: Record<string, unknown>;
}>(values: T): T {
  const family = inferJobFamily({
    jobType: values.jobType,
    runtimeType: values.runtimeType,
    executionClass: values.executionClass,
    input: values.inputJson,
  });
  const policy = values.retryPolicyJson ?? {};
  const stored = Number(policy.deadlineMs);
  const hasStored = Number.isFinite(stored) && stored > 0;
  const baselineMs = DEFAULT_WORKER_JOB_DEADLINE_SETTINGS.families[family].retryMinutes * 60_000;
  const hardMaximumMs = HARD_MAX_DEADLINE_MINUTES[family] * 60_000;
  const deadlineMs = policy.deadlineMode === "fixed"
    ? Math.min(hasStored ? stored : baselineMs, hardMaximumMs)
    : Math.min(hasStored ? stored : baselineMs, baselineMs);
  return {
    ...values,
    retryPolicyJson: {
      ...policy,
      deadlineMs,
      deadlineMode: policy.deadlineMode === "fixed" ? "fixed" : "adaptive",
    },
  };
}

export function resetWorkerJobDeadlinePolicyCacheForTests(): void {
  cachedSettings = null;
  cachedMetrics = null;
  cachedAt = 0;
  settingsDegraded = false;
  metricsDegraded = false;
}
