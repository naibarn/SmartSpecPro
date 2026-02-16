/**
 * Scale Tier Configuration Service
 *
 * Defines preset scaling tiers and applies configuration changes
 * across Node.js, Python, Nginx, Redis, and Celery.
 *
 * Each tier bundles connection pools, rate limits, worker counts,
 * and resource allocations tuned for a target concurrent-user range.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const execFileAsync = promisify(execFile);

// ============================================================
// Tier Definitions
// ============================================================

export const SCALE_TIER_IDS = [
  "starter",
  "growth",
  "pro",
  "business",
  "enterprise",
] as const;

export type ScaleTierId = (typeof SCALE_TIER_IDS)[number];
export type DeployMode = "localhost" | "cloudrun";

export interface ScaleTierConfig {
  id: ScaleTierId;
  label: string;
  description: string;
  targetUsers: number;
  recommendedCpu: number;
  recommendedRamGb: number;

  // Node.js
  nodeDbPoolSize: number;
  nodeMaxOldSpaceMb: number;
  nodeLlmRpm: number;
  nodeMcpRpm: number;

  // Python
  pythonDbPoolSize: number;
  pythonDbMaxOverflow: number;
  pythonRedisMaxConn: number;
  pythonRateLimitPerMin: number;
  pythonRateLimitBurst: number;
  pythonRateLimitGenPerMin: number;
  pythonMaxParallelWorkflows: number;
  uvicornWorkers: number;

  // Nginx (localhost only)
  nginxWorkerConnections: number;
  nginxKeepalive: number;
  nginxApiLimitRate: string;
  nginxWebLimitRate: string;

  // Redis
  redisMaxmemoryMb: number;

  // Celery (localhost only)
  celeryMediaConcurrency: number;
  celeryVideoConcurrency: number;

  // Cloud Run scaling
  cloudRunNodeMinInstances: number;
  cloudRunNodeMaxInstances: number;
  cloudRunNodeCpu: string;
  cloudRunNodeMemory: string;
  cloudRunNodeConcurrency: number;
  cloudRunPythonMinInstances: number;
  cloudRunPythonMaxInstances: number;
  cloudRunPythonCpu: string;
  cloudRunPythonMemory: string;
  cloudRunPythonConcurrency: number;
  cloudRunMediaQueueConcurrency: number;
  cloudRunWorkflowQueueConcurrency: number;
}

export const SCALE_TIERS: Record<ScaleTierId, ScaleTierConfig> = {
  starter: {
    id: "starter",
    label: "Starter",
    description: "Small team or development use",
    targetUsers: 50,
    recommendedCpu: 4,
    recommendedRamGb: 8,
    nodeDbPoolSize: 5,
    nodeMaxOldSpaceMb: 4096,
    nodeLlmRpm: 60,
    nodeMcpRpm: 120,
    pythonDbPoolSize: 5,
    pythonDbMaxOverflow: 5,
    pythonRedisMaxConn: 20,
    pythonRateLimitPerMin: 30,
    pythonRateLimitBurst: 5,
    pythonRateLimitGenPerMin: 5,
    pythonMaxParallelWorkflows: 2,
    uvicornWorkers: 1,
    nginxWorkerConnections: 512,
    nginxKeepalive: 16,
    nginxApiLimitRate: "15r/s",
    nginxWebLimitRate: "30r/s",
    redisMaxmemoryMb: 128,
    celeryMediaConcurrency: 2,
    celeryVideoConcurrency: 1,
    cloudRunNodeMinInstances: 0,
    cloudRunNodeMaxInstances: 2,
    cloudRunNodeCpu: "1",
    cloudRunNodeMemory: "512Mi",
    cloudRunNodeConcurrency: 80,
    cloudRunPythonMinInstances: 0,
    cloudRunPythonMaxInstances: 2,
    cloudRunPythonCpu: "1",
    cloudRunPythonMemory: "1Gi",
    cloudRunPythonConcurrency: 40,
    cloudRunMediaQueueConcurrency: 5,
    cloudRunWorkflowQueueConcurrency: 10,
  },
  growth: {
    id: "growth",
    label: "Growth",
    description: "Growing team with moderate AI usage",
    targetUsers: 100,
    recommendedCpu: 8,
    recommendedRamGb: 16,
    nodeDbPoolSize: 10,
    nodeMaxOldSpaceMb: 8192,
    nodeLlmRpm: 120,
    nodeMcpRpm: 240,
    pythonDbPoolSize: 10,
    pythonDbMaxOverflow: 10,
    pythonRedisMaxConn: 50,
    pythonRateLimitPerMin: 60,
    pythonRateLimitBurst: 10,
    pythonRateLimitGenPerMin: 10,
    pythonMaxParallelWorkflows: 5,
    uvicornWorkers: 2,
    nginxWorkerConnections: 1024,
    nginxKeepalive: 32,
    nginxApiLimitRate: "30r/s",
    nginxWebLimitRate: "60r/s",
    redisMaxmemoryMb: 256,
    celeryMediaConcurrency: 4,
    celeryVideoConcurrency: 2,
    cloudRunNodeMinInstances: 1,
    cloudRunNodeMaxInstances: 3,
    cloudRunNodeCpu: "1",
    cloudRunNodeMemory: "1Gi",
    cloudRunNodeConcurrency: 80,
    cloudRunPythonMinInstances: 1,
    cloudRunPythonMaxInstances: 3,
    cloudRunPythonCpu: "1",
    cloudRunPythonMemory: "1Gi",
    cloudRunPythonConcurrency: 40,
    cloudRunMediaQueueConcurrency: 10,
    cloudRunWorkflowQueueConcurrency: 15,
  },
  pro: {
    id: "pro",
    label: "Pro",
    description: "Heavy AI and media workloads",
    targetUsers: 200,
    recommendedCpu: 12,
    recommendedRamGb: 32,
    nodeDbPoolSize: 20,
    nodeMaxOldSpaceMb: 12288,
    nodeLlmRpm: 240,
    nodeMcpRpm: 480,
    pythonDbPoolSize: 15,
    pythonDbMaxOverflow: 15,
    pythonRedisMaxConn: 100,
    pythonRateLimitPerMin: 120,
    pythonRateLimitBurst: 20,
    pythonRateLimitGenPerMin: 20,
    pythonMaxParallelWorkflows: 10,
    uvicornWorkers: 4,
    nginxWorkerConnections: 2048,
    nginxKeepalive: 48,
    nginxApiLimitRate: "60r/s",
    nginxWebLimitRate: "120r/s",
    redisMaxmemoryMb: 512,
    celeryMediaConcurrency: 6,
    celeryVideoConcurrency: 3,
    cloudRunNodeMinInstances: 1,
    cloudRunNodeMaxInstances: 5,
    cloudRunNodeCpu: "2",
    cloudRunNodeMemory: "1Gi",
    cloudRunNodeConcurrency: 100,
    cloudRunPythonMinInstances: 1,
    cloudRunPythonMaxInstances: 4,
    cloudRunPythonCpu: "2",
    cloudRunPythonMemory: "2Gi",
    cloudRunPythonConcurrency: 50,
    cloudRunMediaQueueConcurrency: 15,
    cloudRunWorkflowQueueConcurrency: 20,
  },
  business: {
    id: "business",
    label: "Business",
    description: "Large-scale production deployment",
    targetUsers: 500,
    recommendedCpu: 16,
    recommendedRamGb: 48,
    nodeDbPoolSize: 30,
    nodeMaxOldSpaceMb: 16384,
    nodeLlmRpm: 360,
    nodeMcpRpm: 720,
    pythonDbPoolSize: 20,
    pythonDbMaxOverflow: 20,
    pythonRedisMaxConn: 150,
    pythonRateLimitPerMin: 240,
    pythonRateLimitBurst: 30,
    pythonRateLimitGenPerMin: 30,
    pythonMaxParallelWorkflows: 15,
    uvicornWorkers: 4,
    nginxWorkerConnections: 4096,
    nginxKeepalive: 64,
    nginxApiLimitRate: "100r/s",
    nginxWebLimitRate: "200r/s",
    redisMaxmemoryMb: 1024,
    celeryMediaConcurrency: 8,
    celeryVideoConcurrency: 4,
    cloudRunNodeMinInstances: 2,
    cloudRunNodeMaxInstances: 8,
    cloudRunNodeCpu: "2",
    cloudRunNodeMemory: "2Gi",
    cloudRunNodeConcurrency: 120,
    cloudRunPythonMinInstances: 1,
    cloudRunPythonMaxInstances: 6,
    cloudRunPythonCpu: "2",
    cloudRunPythonMemory: "2Gi",
    cloudRunPythonConcurrency: 60,
    cloudRunMediaQueueConcurrency: 20,
    cloudRunWorkflowQueueConcurrency: 30,
  },
  enterprise: {
    id: "enterprise",
    label: "Enterprise",
    description: "Maximum scale for 1000+ concurrent users",
    targetUsers: 1000,
    recommendedCpu: 32,
    recommendedRamGb: 64,
    nodeDbPoolSize: 50,
    nodeMaxOldSpaceMb: 16384,
    nodeLlmRpm: 600,
    nodeMcpRpm: 1200,
    pythonDbPoolSize: 30,
    pythonDbMaxOverflow: 30,
    pythonRedisMaxConn: 300,
    pythonRateLimitPerMin: 480,
    pythonRateLimitBurst: 50,
    pythonRateLimitGenPerMin: 50,
    pythonMaxParallelWorkflows: 25,
    uvicornWorkers: 8,
    nginxWorkerConnections: 8192,
    nginxKeepalive: 128,
    nginxApiLimitRate: "200r/s",
    nginxWebLimitRate: "400r/s",
    redisMaxmemoryMb: 2048,
    celeryMediaConcurrency: 12,
    celeryVideoConcurrency: 6,
    cloudRunNodeMinInstances: 3,
    cloudRunNodeMaxInstances: 15,
    cloudRunNodeCpu: "4",
    cloudRunNodeMemory: "4Gi",
    cloudRunNodeConcurrency: 150,
    cloudRunPythonMinInstances: 2,
    cloudRunPythonMaxInstances: 10,
    cloudRunPythonCpu: "4",
    cloudRunPythonMemory: "4Gi",
    cloudRunPythonConcurrency: 80,
    cloudRunMediaQueueConcurrency: 30,
    cloudRunWorkflowQueueConcurrency: 50,
  },
};

// ============================================================
// Project Paths
// ============================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../../../..");
const WEB_ENV_PATH = path.join(PROJECT_ROOT, "apps/web/.env");
const PYTHON_ENV_PATH = path.join(PROJECT_ROOT, "python-backend/.env");
const NGINX_CONF_PATH = path.join(PROJECT_ROOT, "nginx/nginx.conf");
const NGINX_DEV_CONF_PATH = path.join(PROJECT_ROOT, "nginx/nginx-dev.conf");
const BACKEND_SERVICE_SRC = path.join(PROJECT_ROOT, "docker/systemd/smartspec-backend.service");
const BACKEND_SERVICE_DEST = "/etc/systemd/system/smartspec-backend.service";

// ============================================================
// Validation
// ============================================================

function validateTierConfig(tier: ScaleTierConfig): void {
  const checks: Array<{ value: number; min: number; max: number; name: string }> = [
    { value: tier.nodeDbPoolSize, min: 1, max: 100, name: "nodeDbPoolSize" },
    { value: tier.pythonDbPoolSize, min: 1, max: 100, name: "pythonDbPoolSize" },
    { value: tier.pythonDbMaxOverflow, min: 0, max: 100, name: "pythonDbMaxOverflow" },
    { value: tier.uvicornWorkers, min: 1, max: 32, name: "uvicornWorkers" },
    { value: tier.nginxWorkerConnections, min: 256, max: 16384, name: "nginxWorkerConnections" },
    { value: tier.nginxKeepalive, min: 4, max: 256, name: "nginxKeepalive" },
    { value: tier.redisMaxmemoryMb, min: 64, max: 8192, name: "redisMaxmemoryMb" },
    { value: tier.nodeLlmRpm, min: 1, max: 10000, name: "nodeLlmRpm" },
    { value: tier.nodeMcpRpm, min: 1, max: 10000, name: "nodeMcpRpm" },
    { value: tier.pythonRateLimitPerMin, min: 1, max: 10000, name: "pythonRateLimitPerMin" },
    { value: tier.celeryMediaConcurrency, min: 1, max: 32, name: "celeryMediaConcurrency" },
    { value: tier.celeryVideoConcurrency, min: 1, max: 16, name: "celeryVideoConcurrency" },
    { value: tier.cloudRunNodeMaxInstances, min: 1, max: 100, name: "cloudRunNodeMaxInstances" },
    { value: tier.cloudRunNodeMinInstances, min: 0, max: 50, name: "cloudRunNodeMinInstances" },
    { value: tier.cloudRunNodeConcurrency, min: 1, max: 1000, name: "cloudRunNodeConcurrency" },
    { value: tier.cloudRunPythonMaxInstances, min: 1, max: 100, name: "cloudRunPythonMaxInstances" },
    { value: tier.cloudRunPythonMinInstances, min: 0, max: 50, name: "cloudRunPythonMinInstances" },
    { value: tier.cloudRunPythonConcurrency, min: 1, max: 1000, name: "cloudRunPythonConcurrency" },
    { value: tier.cloudRunMediaQueueConcurrency, min: 1, max: 500, name: "cloudRunMediaQueueConcurrency" },
    { value: tier.cloudRunWorkflowQueueConcurrency, min: 1, max: 500, name: "cloudRunWorkflowQueueConcurrency" },
  ];

  for (const { value, min, max, name } of checks) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new Error(`Invalid ${name}: ${value} (must be integer ${min}-${max})`);
    }
  }
}

/**
 * Validate a file path stays within the expected project directory.
 */
function validatePathPrefix(filePath: string, expectedPrefix: string): void {
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(expectedPrefix)) {
    throw new Error(`Path traversal detected: ${filePath}`);
  }
}

// ============================================================
// .env File Helpers
// ============================================================

/**
 * Read an .env file into a Map of key→value.
 * Preserves comments and blank lines via a separate ordered list.
 */
async function readEnvFile(filePath: string): Promise<{ lines: string[]; vars: Map<string, number> }> {
  validatePathPrefix(filePath, PROJECT_ROOT);
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch {
    content = "";
  }
  const lines = content.split("\n");
  const vars = new Map<string, number>();
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^([A-Z_][A-Z0-9_]*)=/);
    if (match) vars.set(match[1], i);
  }
  return { lines, vars };
}

/**
 * Set a variable in a parsed .env structure.
 * Updates in-place if the key exists, appends otherwise.
 */
function setEnvVar(env: { lines: string[]; vars: Map<string, number> }, key: string, value: string | number) {
  const lineIdx = env.vars.get(key);
  if (lineIdx !== undefined) {
    env.lines[lineIdx] = `${key}=${value}`;
  } else {
    env.lines.push(`${key}=${value}`);
    env.vars.set(key, env.lines.length - 1);
  }
}

/**
 * Write the env structure back to disk.
 */
async function writeEnvFile(filePath: string, env: { lines: string[] }) {
  validatePathPrefix(filePath, PROJECT_ROOT);
  await writeFile(filePath, env.lines.join("\n"), "utf-8");
}

// ============================================================
// Deploy Mode Detection (Redis → DB → ENV → Default)
// ============================================================

interface GcpConfig {
  projectId: string;
  region: string;
  nodeServiceName: string;
  pythonServiceName: string;
}

export async function getDeployMode(): Promise<{
  mode: DeployMode;
  source: "redis" | "db" | "env" | "default";
}> {
  // Priority 1: Redis feature flag
  try {
    const { getRedisClient } = await import("./redis");
    const redis = getRedisClient();
    const raw = await redis.get("feature-flag:DEPLOY_MODE");
    if (raw === "localhost" || raw === "cloudrun") {
      return { mode: raw, source: "redis" };
    }
  } catch { /* Redis unavailable */ }

  // Priority 2: DB systemSettings
  try {
    const { getDb } = await import("../db");
    const { systemSettings } = await import("../../drizzle/schema");
    const { eq, and } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      const [row] = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, "infrastructure"),
            eq(systemSettings.key, "deploy_mode"),
          ),
        )
        .limit(1);
      if (row?.value === "localhost" || row?.value === "cloudrun") {
        return { mode: row.value, source: "db" };
      }
    }
  } catch { /* DB unavailable */ }

  // Priority 3: ENV var
  const envVal = process.env.DEPLOY_MODE;
  if (envVal === "localhost" || envVal === "cloudrun") {
    return { mode: envVal, source: "env" };
  }

  return { mode: "localhost", source: "default" };
}

export async function setDeployMode(mode: DeployMode, userId?: number): Promise<void> {
  const { getDb } = await import("../db");
  const { systemSettings } = await import("../../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(
      and(
        eq(systemSettings.category, "infrastructure"),
        eq(systemSettings.key, "deploy_mode"),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(systemSettings)
      .set({ value: mode, updatedBy: userId, updatedAt: new Date() })
      .where(eq(systemSettings.id, existing.id));
  } else {
    await db.insert(systemSettings).values({
      category: "infrastructure",
      key: "deploy_mode",
      value: mode,
      isSensitive: false,
      updatedBy: userId,
    });
  }

  try {
    const { getRedisClient } = await import("./redis");
    const redis = getRedisClient();
    await redis.set("feature-flag:DEPLOY_MODE", mode);
  } catch (err: unknown) {
    console.error("[setDeployMode] Redis update failed (DB persisted):", formatError(err));
  }
}

// GCP input validation — prevents argument injection via execFileAsync
const GCP_PROJECT_ID_RE = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const GCP_REGION_RE = /^[a-z]+-[a-z]+\d+$/;
const GCP_SERVICE_NAME_RE = /^[a-z][a-z0-9-]{0,62}$/;

function validateGcpProjectId(v: string): void {
  if (!GCP_PROJECT_ID_RE.test(v)) {
    throw new Error(`Invalid GCP project ID format: "${v}". Must be 6-30 lowercase alphanumeric + hyphens.`);
  }
}
function validateGcpRegion(v: string): void {
  if (!GCP_REGION_RE.test(v)) {
    throw new Error(`Invalid GCP region format: "${v}". Expected format like us-central1.`);
  }
}

export async function resolveGcpConfig(): Promise<GcpConfig> {
  let projectId = process.env.GCP_PROJECT_ID ?? "";
  let region = process.env.GCP_REGION ?? "";

  try {
    const { getDb } = await import("../db");
    const { systemSettings } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");
    const db = await getDb();
    if (db) {
      const rows = await db.select().from(systemSettings).where(eq(systemSettings.category, "infrastructure"));
      for (const row of rows) {
        if (row.key === "gcp_project_id" && row.value) projectId = row.value;
        if (row.key === "gcp_region" && row.value) region = row.value;
      }
    }
  } catch { /* fallback to env */ }

  if (!projectId) {
    throw new Error("GCP configuration incomplete: gcp_project_id not set in Infrastructure Settings or GCP_PROJECT_ID env");
  }
  if (!region) {
    throw new Error("GCP configuration incomplete: gcp_region not set in Infrastructure Settings or GCP_REGION env");
  }

  // Validate formats before using in CLI commands
  validateGcpProjectId(projectId);
  validateGcpRegion(region);

  const nodeServiceName = "node-api";
  const pythonServiceName = "python-orchestrator";

  return { projectId, region, nodeServiceName, pythonServiceName };
}

// ============================================================
// Cloud Run Helpers (via gcloud CLI)
// ============================================================

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

async function ensureGcloudInstalled(): Promise<void> {
  try {
    await execFileAsync("gcloud", ["--version"], { timeout: 10_000 });
  } catch (err: unknown) {
    const msg = err instanceof Error && "code" in err && (err as any).code === "ENOENT"
      ? "gcloud CLI not found. Install Google Cloud SDK: https://cloud.google.com/sdk/docs/install"
      : `gcloud CLI check failed: ${formatError(err)}`;
    throw new Error(msg);
  }
}

async function updateCloudRunService(
  gcp: GcpConfig,
  serviceName: string,
  opts: {
    maxInstances?: number;
    minInstances?: number;
    cpu?: string;
    memory?: string;
    concurrency?: number;
    envVars?: Record<string, string | number>;
  },
): Promise<string> {
  const args = [
    "run", "services", "update", serviceName,
    "--region", gcp.region,
    "--project", gcp.projectId,
    "--platform", "managed",
    "--quiet",
  ];

  if (opts.maxInstances !== undefined) args.push("--max-instances", String(opts.maxInstances));
  if (opts.minInstances !== undefined) args.push("--min-instances", String(opts.minInstances));
  if (opts.cpu) args.push("--cpu", opts.cpu);
  if (opts.memory) args.push("--memory", opts.memory);
  if (opts.concurrency !== undefined) args.push("--concurrency", String(opts.concurrency));

  if (opts.envVars && Object.keys(opts.envVars).length > 0) {
    const envStr = Object.entries(opts.envVars)
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    args.push("--update-env-vars", envStr);
  }

  const { stdout, stderr } = await execFileAsync("gcloud", args, { timeout: 120_000 });
  if (stderr && stderr.includes("ERROR")) {
    throw new Error(`gcloud error: ${stderr.trim()}`);
  }
  return stdout;
}

async function updateCloudTasksQueue(
  gcp: GcpConfig,
  queueName: string,
  maxConcurrentDispatches: number,
): Promise<string> {
  const { stdout, stderr } = await execFileAsync("gcloud", [
    "tasks", "queues", "update", queueName,
    "--location", gcp.region,
    "--project", gcp.projectId,
    "--max-concurrent-dispatches", String(maxConcurrentDispatches),
    "--quiet",
  ], { timeout: 30_000 });
  if (stderr && stderr.includes("ERROR")) {
    throw new Error(`gcloud error: ${stderr.trim()}`);
  }
  return stdout;
}

// ============================================================
// Apply Logic
// ============================================================

export interface ApplyStepResult {
  step: string;
  status: "ok" | "skipped" | "error";
  message: string;
  mode?: DeployMode;
  command?: string;
}

/**
 * Apply a scale tier configuration to all services.
 * Dispatches to localhost or Cloud Run apply logic based on deploy mode.
 *
 * Uses execFileAsync (no shell) to prevent command injection.
 * Each step is independent — failures are logged but don't block others.
 */
export async function applyScaleTier(
  tierId: ScaleTierId,
  modeOverride?: DeployMode,
): Promise<ApplyStepResult[]> {
  const tier = SCALE_TIERS[tierId];
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);

  validateTierConfig(tier);

  const { mode } = modeOverride ? { mode: modeOverride } : await getDeployMode();

  if (mode === "cloudrun") {
    return applyScaleTierCloudRun(tier);
  }
  return applyScaleTierLocalhost(tier);
}

// ── Cloud Run Apply ─────────────────────────────────────────

async function applyScaleTierCloudRun(tier: ScaleTierConfig): Promise<ApplyStepResult[]> {
  const results: ApplyStepResult[] = [];

  // Pre-check: gcloud CLI must be installed
  try {
    await ensureGcloudInstalled();
  } catch (err: unknown) {
    results.push({ step: "cloudrun_gcloud_check", status: "error", mode: "cloudrun", message: formatError(err) });
    return results;
  }

  let gcp: GcpConfig;
  try {
    gcp = await resolveGcpConfig();
    results.push({ step: "cloudrun_gcp_check", status: "ok", mode: "cloudrun", message: `GCP: project=${gcp.projectId}, region=${gcp.region}` });
  } catch (err: unknown) {
    results.push({ step: "cloudrun_gcp_check", status: "error", mode: "cloudrun", message: formatError(err) });
    return results;
  }

  // Step 1+3: Update Node.js Cloud Run (env vars + scaling in single call)
  try {
    const cmd = `gcloud run services update ${gcp.nodeServiceName} --update-env-vars ... --max-instances=${tier.cloudRunNodeMaxInstances} --cpu=${tier.cloudRunNodeCpu} --memory=${tier.cloudRunNodeMemory}`;
    await updateCloudRunService(gcp, gcp.nodeServiceName, {
      maxInstances: tier.cloudRunNodeMaxInstances,
      minInstances: tier.cloudRunNodeMinInstances,
      cpu: tier.cloudRunNodeCpu,
      memory: tier.cloudRunNodeMemory,
      concurrency: tier.cloudRunNodeConcurrency,
      envVars: {
        DB_POOL_SIZE: tier.nodeDbPoolSize,
        WEB_LLM_RPM: tier.nodeLlmRpm,
        WEB_MCP_RPM: tier.nodeMcpRpm,
        NODE_OPTIONS: `--max-old-space-size=${tier.nodeMaxOldSpaceMb}`,
      },
    });
    results.push({
      step: "cloudrun_node",
      status: "ok",
      mode: "cloudrun",
      message: `${gcp.nodeServiceName}: instances=${tier.cloudRunNodeMinInstances}-${tier.cloudRunNodeMaxInstances}, cpu=${tier.cloudRunNodeCpu}, mem=${tier.cloudRunNodeMemory}, pool=${tier.nodeDbPoolSize}`,
      command: cmd,
    });
  } catch (err: unknown) {
    results.push({ step: "cloudrun_node", status: "error", mode: "cloudrun", message: formatError(err) });
  }

  // Step 2+4: Update Python Cloud Run (env vars + scaling in single call)
  try {
    const cmd = `gcloud run services update ${gcp.pythonServiceName} --update-env-vars ... --max-instances=${tier.cloudRunPythonMaxInstances} --cpu=${tier.cloudRunPythonCpu} --memory=${tier.cloudRunPythonMemory}`;
    await updateCloudRunService(gcp, gcp.pythonServiceName, {
      maxInstances: tier.cloudRunPythonMaxInstances,
      minInstances: tier.cloudRunPythonMinInstances,
      cpu: tier.cloudRunPythonCpu,
      memory: tier.cloudRunPythonMemory,
      concurrency: tier.cloudRunPythonConcurrency,
      envVars: {
        DB_POOL_SIZE: tier.pythonDbPoolSize,
        DB_MAX_OVERFLOW: tier.pythonDbMaxOverflow,
        DATABASE_POOL_SIZE: tier.pythonDbPoolSize,
        DATABASE_MAX_OVERFLOW: tier.pythonDbMaxOverflow,
        REDIS_MAX_CONNECTIONS: tier.pythonRedisMaxConn,
        RATE_LIMIT_PER_MINUTE: tier.pythonRateLimitPerMin,
        RATE_LIMIT_BURST: tier.pythonRateLimitBurst,
        RATE_LIMIT_GENERATION_PER_MINUTE: tier.pythonRateLimitGenPerMin,
        MAX_PARALLEL_WORKFLOWS: tier.pythonMaxParallelWorkflows,
      },
    });
    results.push({
      step: "cloudrun_python",
      status: "ok",
      mode: "cloudrun",
      message: `${gcp.pythonServiceName}: instances=${tier.cloudRunPythonMinInstances}-${tier.cloudRunPythonMaxInstances}, cpu=${tier.cloudRunPythonCpu}, pool=${tier.pythonDbPoolSize}`,
      command: cmd,
    });
  } catch (err: unknown) {
    results.push({ step: "cloudrun_python", status: "error", mode: "cloudrun", message: formatError(err) });
  }

  // Step 5: Redis — skip (Upstash is managed, memory per-plan)
  results.push({
    step: "cloudrun_redis",
    status: "skipped",
    mode: "cloudrun",
    message: "Redis is Upstash (managed) — memory is per-plan, not configurable at runtime",
  });

  // Step 6: Update Cloud Tasks queue concurrency
  const queues = [
    { name: "media-jobs", concurrency: tier.cloudRunMediaQueueConcurrency },
    { name: "workflow-tasks", concurrency: tier.cloudRunWorkflowQueueConcurrency },
  ];
  for (const q of queues) {
    try {
      const cmd = `gcloud tasks queues update ${q.name} --max-concurrent-dispatches=${q.concurrency}`;
      await updateCloudTasksQueue(gcp, q.name, q.concurrency);
      results.push({ step: `cloudrun_queue_${q.name}`, status: "ok", mode: "cloudrun", message: `Queue ${q.name}: max_concurrent=${q.concurrency}`, command: cmd });
    } catch (err: unknown) {
      results.push({ step: `cloudrun_queue_${q.name}`, status: "error", mode: "cloudrun", message: formatError(err) });
    }
  }

  return results;
}

// ── Localhost Apply ──────────────────────────────────────────

async function applyScaleTierLocalhost(tier: ScaleTierConfig): Promise<ApplyStepResult[]> {
  const results: ApplyStepResult[] = [];
  const backups: Array<{ path: string; content: string }> = [];

  // Backup helper
  async function backup(filePath: string) {
    try {
      const content = await readFile(filePath, "utf-8");
      backups.push({ path: filePath, content });
    } catch {
      // File may not exist yet
    }
  }

  // Step 1: Update Node.js .env
  try {
    await backup(WEB_ENV_PATH);
    const env = await readEnvFile(WEB_ENV_PATH);
    setEnvVar(env, "DB_POOL_SIZE", tier.nodeDbPoolSize);
    setEnvVar(env, "WEB_LLM_RPM", tier.nodeLlmRpm);
    setEnvVar(env, "WEB_MCP_RPM", tier.nodeMcpRpm);
    await writeEnvFile(WEB_ENV_PATH, env);
    results.push({ step: "node_env", status: "ok", mode: "localhost", message: `Updated apps/web/.env (pool=${tier.nodeDbPoolSize}, llmRpm=${tier.nodeLlmRpm})` });
  } catch (err: unknown) {
    results.push({ step: "node_env", status: "error", mode: "localhost", message: formatError(err) });
  }

  // Step 2: Update Python .env
  try {
    await backup(PYTHON_ENV_PATH);
    const env = await readEnvFile(PYTHON_ENV_PATH);
    setEnvVar(env, "DB_POOL_SIZE", tier.pythonDbPoolSize);
    setEnvVar(env, "DB_MAX_OVERFLOW", tier.pythonDbMaxOverflow);
    setEnvVar(env, "DATABASE_POOL_SIZE", tier.pythonDbPoolSize);
    setEnvVar(env, "DATABASE_MAX_OVERFLOW", tier.pythonDbMaxOverflow);
    setEnvVar(env, "REDIS_MAX_CONNECTIONS", tier.pythonRedisMaxConn);
    setEnvVar(env, "RATE_LIMIT_PER_MINUTE", tier.pythonRateLimitPerMin);
    setEnvVar(env, "RATE_LIMIT_BURST", tier.pythonRateLimitBurst);
    setEnvVar(env, "RATE_LIMIT_GENERATION_PER_MINUTE", tier.pythonRateLimitGenPerMin);
    setEnvVar(env, "MAX_PARALLEL_WORKFLOWS", tier.pythonMaxParallelWorkflows);
    await writeEnvFile(PYTHON_ENV_PATH, env);
    results.push({ step: "python_env", status: "ok", mode: "localhost", message: `Updated python-backend/.env (pool=${tier.pythonDbPoolSize}, workers=${tier.uvicornWorkers})` });
  } catch (err: unknown) {
    results.push({ step: "python_env", status: "error", mode: "localhost", message: formatError(err) });
  }

  // Step 3: Update systemd backend service (uvicorn workers)
  try {
    await backup(BACKEND_SERVICE_SRC);
    const content = await readFile(BACKEND_SERVICE_SRC, "utf-8");
    const workerFlag = tier.uvicornWorkers > 1 ? ` --workers ${tier.uvicornWorkers}` : "";
    const regex = /^(ExecStart=.*uvicorn app\.main:app --host 0\.0\.0\.0 --port 8000)(?:\s+--workers\s+\d+)?(.*)$/m;

    if (!regex.test(content)) {
      throw new Error("ExecStart uvicorn line not found in systemd service file");
    }

    const updated = content.replace(regex, `$1${workerFlag}$2`);
    await writeFile(BACKEND_SERVICE_SRC, updated, "utf-8");
    await execFileAsync("sudo", ["cp", BACKEND_SERVICE_SRC, BACKEND_SERVICE_DEST]);
    await execFileAsync("sudo", ["systemctl", "daemon-reload"]);
    results.push({ step: "systemd_backend", status: "ok", mode: "localhost", message: `Uvicorn workers set to ${tier.uvicornWorkers}` });
  } catch (err: unknown) {
    results.push({ step: "systemd_backend", status: "error", mode: "localhost", message: formatError(err) });
  }

  // Step 4: Update Nginx worker_connections
  try {
    for (const confPath of [NGINX_CONF_PATH, NGINX_DEV_CONF_PATH]) {
      try {
        await backup(confPath);
        const content = await readFile(confPath, "utf-8");
        const updated = content.replace(
          /worker_connections\s+\d+;/,
          `worker_connections ${tier.nginxWorkerConnections};`,
        );
        await writeFile(confPath, updated, "utf-8");
      } catch (err: unknown) {
        if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }
    // Update keepalive in nginx.conf
    try {
      const content = await readFile(NGINX_CONF_PATH, "utf-8");
      const updated = content.replace(
        /keepalive\s+\d+;/g,
        `keepalive ${tier.nginxKeepalive};`,
      );
      await writeFile(NGINX_CONF_PATH, updated, "utf-8");
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    results.push({ step: "nginx_config", status: "ok", mode: "localhost", message: `Nginx: connections=${tier.nginxWorkerConnections}, keepalive=${tier.nginxKeepalive}` });
  } catch (err: unknown) {
    results.push({ step: "nginx_config", status: "error", mode: "localhost", message: formatError(err) });
  }

  // Step 5: Apply Redis maxmemory (hot-reload, no restart needed)
  try {
    await execFileAsync("docker", [
      "exec", "smartspec-redis", "redis-cli",
      "CONFIG", "SET", "maxmemory", `${tier.redisMaxmemoryMb}mb`,
    ]);
    await execFileAsync("docker", [
      "exec", "smartspec-redis", "redis-cli",
      "CONFIG", "SET", "maxmemory-policy", "allkeys-lru",
    ]);
    results.push({ step: "redis_config", status: "ok", mode: "localhost", message: `Redis maxmemory=${tier.redisMaxmemoryMb}mb, policy=allkeys-lru` });
  } catch (err: unknown) {
    results.push({ step: "redis_config", status: "error", mode: "localhost", message: formatError(err) });
  }

  // Step 6: Reload Nginx (graceful, no downtime)
  try {
    await execFileAsync("docker", ["exec", "smartspec-nginx-dev", "nginx", "-s", "reload"]);
    results.push({ step: "nginx_reload", status: "ok", mode: "localhost", message: "Nginx reloaded successfully" });
  } catch (err: unknown) {
    results.push({ step: "nginx_reload", status: "error", mode: "localhost", message: `Nginx reload failed: ${formatError(err)}` });
  }

  // Step 7: Restart Python backend (picks up new .env + uvicorn workers)
  try {
    await execFileAsync("sudo", ["systemctl", "restart", "smartspec-backend.service"]);
    results.push({ step: "restart_backend", status: "ok", mode: "localhost", message: "Python backend restarted" });
  } catch (err: unknown) {
    results.push({ step: "restart_backend", status: "error", mode: "localhost", message: formatError(err) });
  }

  // Step 8: Restart Node.js web (picks up new .env pool size + rate limits)
  try {
    await execFileAsync("sudo", ["systemctl", "restart", "smartspec-web.service"]);
    results.push({ step: "restart_web", status: "ok", mode: "localhost", message: "Web service restarted" });
  } catch (err: unknown) {
    results.push({ step: "restart_web", status: "error", mode: "localhost", message: formatError(err) });
  }

  return results;
}

/**
 * Detect the current effective tier by reading live env vars.
 */
export function detectCurrentTier(): ScaleTierId {
  const poolSize = parseInt(process.env.DB_POOL_SIZE || "5", 10);
  for (const tier of Object.values(SCALE_TIERS).reverse()) {
    if (poolSize >= tier.nodeDbPoolSize) return tier.id;
  }
  return "starter";
}
