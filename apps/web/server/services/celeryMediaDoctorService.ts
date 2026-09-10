import Docker from "dockerode";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { getRedisClient } from "./redis";

export const CELERY_MEDIA_STALE_AFTER_SECONDS = 180;
const execFileAsync = promisify(execFile);
const EXPECTED_PROJECT = process.env.CELERY_DOCTOR_COMPOSE_PROJECT || "smartspecpro";
const SERVICE_DEFINITIONS = [
  { key: "media" as const, service: "celery-media", container: "smartspec-celery-media" },
  { key: "beat" as const, service: "celery-beat", container: "smartspec-celery-beat" },
];

export type DoctorHealth = "healthy" | "degraded" | "critical" | "unavailable";
export type ContainerHealth = "running" | "stopped" | "missing" | "unavailable" | "unhealthy" | "duplicate";

export type CeleryContainerStatus = {
  service: string;
  containerName: string;
  status: ContainerHealth;
  project: string | null;
  health: string | null;
  restartCount: number | null;
  startedAt: string | null;
  duplicate: boolean;
  candidates: Array<{ name: string; id: string; project: string | null; state: string }>;
};

export type CeleryQueueUser = {
  userId: number;
  name: string | null;
  email: string | null;
  pendingCount: number;
  processingCount: number;
  activeCount: number;
  stalePendingCount: number;
  oldestPendingAt: string | null;
};

export type CeleryMediaDoctorStatus = {
  checkedAt: string;
  overallStatus: DoctorHealth;
  workers: { media: CeleryContainerStatus; beat: CeleryContainerStatus };
  queue: {
    redisMediaDepth: number | null;
    pendingCount: number;
    processingCount: number;
    stalePendingCount: number;
  };
  users: CeleryQueueUser[];
  selectedUser: CeleryQueueUser | null;
  repair: { available: boolean; reason: string | null };
};

type ContainerCandidate = { name: string; id: string; project: string | null; state: string };

export function hasDuplicateComposeContainers(candidates: ContainerCandidate[]): boolean {
  return candidates.length > 1 || candidates.some((candidate) => candidate.project !== EXPECTED_PROJECT);
}

export function shouldInvokeSafeRepair(status: CeleryMediaDoctorStatus): boolean {
  return status.repair.available && !status.workers.media.duplicate && !status.workers.beat.duplicate;
}

function candidateFromInspect(info: any): ContainerCandidate {
  return {
    name: String(info?.Name || "").replace(/^\//, ""),
    id: String(info?.Id || "").slice(0, 16),
    project: info?.Config?.Labels?.["com.docker.compose.project"] || null,
    state: String(info?.State?.Status || "unknown"),
  };
}

async function inspectContainers(docker: Docker, definition: typeof SERVICE_DEFINITIONS[number]) {
  const listed = await docker.listContainers({
    all: true,
    filters: { label: [`com.docker.compose.service=${definition.service}`] },
  });
  const candidates = listed.map((item) => ({
    name: (item.Names?.[0] || "").replace(/^\//, ""),
    id: item.Id.slice(0, 16),
    project: item.Labels?.["com.docker.compose.project"] || null,
    state: item.State || "unknown",
  }));
  const expectedInfo = await docker.getContainer(definition.container).inspect().catch(() => null);
  const expected = expectedInfo ? candidateFromInspect(expectedInfo) : null;
  const duplicate = hasDuplicateComposeContainers(candidates) || (expected?.project != null && expected.project !== EXPECTED_PROJECT);
  const status: CeleryContainerStatus = {
    service: definition.service,
    containerName: definition.container,
    status: duplicate ? "duplicate" : expected?.state === "running" && expectedInfo?.State?.Health?.Status === "unhealthy" ? "unhealthy" : expected?.state === "running" ? "running" : expected ? "stopped" : "missing",
    project: expected?.project || candidates[0]?.project || null,
    health: expectedInfo?.State?.Health?.Status || null,
    restartCount: typeof expectedInfo?.RestartCount === "number" ? expectedInfo.RestartCount : null,
    startedAt: expectedInfo?.State?.StartedAt || null,
    duplicate,
    candidates,
  };
  return status;
}

async function readContainers(): Promise<{ media: CeleryContainerStatus; beat: CeleryContainerStatus }> {
  const docker = new Docker({ socketPath: "/var/run/docker.sock" });
  const [media, beat] = await Promise.all(SERVICE_DEFINITIONS.map((definition) => inspectContainers(docker, definition)));
  return { media, beat } as { media: CeleryContainerStatus; beat: CeleryContainerStatus };
}

function normalizeUsers(rows: unknown[], now = Date.now()): CeleryQueueUser[] {
  return rows.map((row: any) => ({
    userId: Number(row.user_id),
    name: row.user_name == null ? null : String(row.user_name),
    email: row.user_email == null ? null : String(row.user_email),
    pendingCount: Number(row.pending_count || 0),
    processingCount: Number(row.processing_count || 0),
    activeCount: Number(row.active_count || 0),
    stalePendingCount: Number(row.stale_pending_count || 0),
    oldestPendingAt: row.oldest_pending_at ? new Date(row.oldest_pending_at).toISOString() : null,
  })).filter((row) => Number.isFinite(row.userId) && row.userId > 0).map((row) => ({
    ...row,
    oldestPendingAt: row.oldestPendingAt && new Date(row.oldestPendingAt).getTime() <= now ? row.oldestPendingAt : row.oldestPendingAt,
  }));
}

async function readQueueUsers(): Promise<CeleryQueueUser[]> {
  const db = await getDb();
  const rows = await db.execute(sql`
    SELECT
      mt.user_id,
      u.name AS user_name,
      u.email AS user_email,
      COUNT(*) FILTER (WHERE mt.status = 'pending')::int AS pending_count,
      COUNT(*) FILTER (WHERE mt.status = 'processing')::int AS processing_count,
      COUNT(*)::int AS active_count,
      COUNT(*) FILTER (
        WHERE mt.status = 'pending' AND mt.created_at < now() - interval '3 minutes'
      )::int AS stale_pending_count,
      MIN(mt.created_at) FILTER (WHERE mt.status = 'pending') AS oldest_pending_at
    FROM media_tasks mt
    LEFT JOIN users u ON u.id = mt.user_id
    WHERE mt.status IN ('pending', 'processing') AND mt.media_type = 'image'
    GROUP BY mt.user_id, u.name, u.email
    ORDER BY stale_pending_count DESC, oldest_pending_at ASC NULLS LAST
    LIMIT 100
  `);
  return normalizeUsers(rows as unknown[]);
}

function aggregateQueue(users: CeleryQueueUser[]) {
  return users.reduce((result, user) => ({
    pendingCount: result.pendingCount + user.pendingCount,
    processingCount: result.processingCount + user.processingCount,
    stalePendingCount: result.stalePendingCount + user.stalePendingCount,
  }), { pendingCount: 0, processingCount: 0, stalePendingCount: 0 });
}

export async function getCeleryMediaDoctorStatus(userId?: number): Promise<CeleryMediaDoctorStatus> {
  const checkedAt = new Date().toISOString();
  const [workersResult, usersResult, redisResult] = await Promise.allSettled([
    readContainers(),
    readQueueUsers(),
    getRedisClient().llen("media"),
  ]);

  const unavailableContainer = (service: string, containerName: string): CeleryContainerStatus => ({
    service, containerName, status: "unavailable", project: null, health: null,
    restartCount: null, startedAt: null, duplicate: false, candidates: [],
  });
  const workers = workersResult.status === "fulfilled"
    ? workersResult.value
    : { media: unavailableContainer("celery-media", "smartspec-celery-media"), beat: unavailableContainer("celery-beat", "smartspec-celery-beat") };
  const users = usersResult.status === "fulfilled" ? usersResult.value : [];
  const queue = aggregateQueue(users);
  const redisMediaDepth = redisResult.status === "fulfilled" ? Number(redisResult.value) : null;
  const duplicate = workers.media.duplicate || workers.beat.duplicate;
  const containersHealthy = workers.media.status === "running" && workers.beat.status === "running"
    && workers.media.health !== "unhealthy" && workers.beat.health !== "unhealthy" && !duplicate;
  const overallStatus: DoctorHealth = duplicate
    ? "critical"
    : usersResult.status === "rejected" || redisResult.status === "rejected" || workersResult.status === "rejected"
      ? "degraded"
      : containersHealthy && queue.stalePendingCount === 0 ? "healthy" : "degraded";
  const repairReason = duplicate
    ? "Duplicate or foreign Compose container detected; automatic repair is blocked for safety."
    : workersResult.status === "rejected"
      ? "Docker daemon is unavailable."
      : containersHealthy ? null : "One or more managed Celery services are stopped or missing.";

  return {
    checkedAt,
    overallStatus,
    workers,
    queue: { redisMediaDepth, ...queue },
    users,
    selectedUser: userId == null ? null : users.find((user) => user.userId === userId) || null,
    repair: { available: !duplicate && (!containersHealthy || workersResult.status === "rejected"), reason: repairReason },
  };
}

function resolveDoctorScript(): { root: string; script: string } | null {
  const roots = [process.env.SMARTSPEC_PROJECT_ROOT, process.cwd(), path.resolve(process.cwd(), "../..")]
    .filter((root): root is string => Boolean(root));
  for (const root of roots) {
    const script = path.join(root, "scripts", "celery-doctor.sh");
    if (existsSync(script)) return { root, script };
  }
  return null;
}

export async function runCeleryMediaDoctor() {
  const target = resolveDoctorScript();
  if (!target) return { ok: false, output: "Doctor script is not installed.", status: await getCeleryMediaDoctorStatus() };
  try {
    const result = await execFileAsync(target.script, ["--once"], { cwd: target.root, timeout: 20_000, maxBuffer: 64 * 1024 });
    return { ok: true, output: `${result.stdout}${result.stderr}`.slice(-8000), status: await getCeleryMediaDoctorStatus() };
  } catch (error: any) {
    const output = `${error?.stdout || ""}${error?.stderr || ""}${error instanceof Error ? error.message : String(error)}`.slice(-8000);
    return { ok: false, output, status: await getCeleryMediaDoctorStatus() };
  }
}
