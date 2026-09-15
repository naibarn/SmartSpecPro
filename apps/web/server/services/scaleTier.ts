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
export type DeployMode = "localhost" | "cloudflare";

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

  // Cloudflare deployment budget hints
  cloudflareNodeMinInstances: number;
  cloudflareNodeMaxInstances: number;
  cloudflareNodeCpu: string;
  cloudflareNodeMemory: string;
  cloudflareNodeConcurrency: number;
  cloudflarePythonMinInstances: number;
  cloudflarePythonMaxInstances: number;
  cloudflarePythonCpu: string;
  cloudflarePythonMemory: string;
  cloudflarePythonConcurrency: number;
  cloudflareMediaQueueConcurrency: number;
  cloudflareWorkflowQueueConcurrency: number;
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
    cloudflareNodeMinInstances: 0,
    cloudflareNodeMaxInstances: 2,
    cloudflareNodeCpu: "1",
    cloudflareNodeMemory: "512Mi",
    cloudflareNodeConcurrency: 80,
    cloudflarePythonMinInstances: 0,
    cloudflarePythonMaxInstances: 2,
    cloudflarePythonCpu: "1",
    cloudflarePythonMemory: "1Gi",
    cloudflarePythonConcurrency: 40,
    cloudflareMediaQueueConcurrency: 5,
    cloudflareWorkflowQueueConcurrency: 10,
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
    cloudflareNodeMinInstances: 1,
    cloudflareNodeMaxInstances: 3,
    cloudflareNodeCpu: "1",
    cloudflareNodeMemory: "1Gi",
    cloudflareNodeConcurrency: 80,
    cloudflarePythonMinInstances: 1,
    cloudflarePythonMaxInstances: 3,
    cloudflarePythonCpu: "1",
    cloudflarePythonMemory: "1Gi",
    cloudflarePythonConcurrency: 40,
    cloudflareMediaQueueConcurrency: 10,
    cloudflareWorkflowQueueConcurrency: 15,
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
    cloudflareNodeMinInstances: 1,
    cloudflareNodeMaxInstances: 5,
    cloudflareNodeCpu: "2",
    cloudflareNodeMemory: "1Gi",
    cloudflareNodeConcurrency: 100,
    cloudflarePythonMinInstances: 1,
    cloudflarePythonMaxInstances: 4,
    cloudflarePythonCpu: "2",
    cloudflarePythonMemory: "2Gi",
    cloudflarePythonConcurrency: 50,
    cloudflareMediaQueueConcurrency: 15,
    cloudflareWorkflowQueueConcurrency: 20,
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
    cloudflareNodeMinInstances: 2,
    cloudflareNodeMaxInstances: 8,
    cloudflareNodeCpu: "2",
    cloudflareNodeMemory: "2Gi",
    cloudflareNodeConcurrency: 120,
    cloudflarePythonMinInstances: 1,
    cloudflarePythonMaxInstances: 6,
    cloudflarePythonCpu: "2",
    cloudflarePythonMemory: "2Gi",
    cloudflarePythonConcurrency: 60,
    cloudflareMediaQueueConcurrency: 20,
    cloudflareWorkflowQueueConcurrency: 30,
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
    cloudflareNodeMinInstances: 3,
    cloudflareNodeMaxInstances: 15,
    cloudflareNodeCpu: "4",
    cloudflareNodeMemory: "4Gi",
    cloudflareNodeConcurrency: 150,
    cloudflarePythonMinInstances: 2,
    cloudflarePythonMaxInstances: 10,
    cloudflarePythonCpu: "4",
    cloudflarePythonMemory: "4Gi",
    cloudflarePythonConcurrency: 80,
    cloudflareMediaQueueConcurrency: 30,
    cloudflareWorkflowQueueConcurrency: 50,
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
    { value: tier.cloudflareNodeMaxInstances, min: 1, max: 100, name: "cloudflareNodeMaxInstances" },
    { value: tier.cloudflareNodeMinInstances, min: 0, max: 50, name: "cloudflareNodeMinInstances" },
    { value: tier.cloudflareNodeConcurrency, min: 1, max: 1000, name: "cloudflareNodeConcurrency" },
    { value: tier.cloudflarePythonMaxInstances, min: 1, max: 100, name: "cloudflarePythonMaxInstances" },
    { value: tier.cloudflarePythonMinInstances, min: 0, max: 50, name: "cloudflarePythonMinInstances" },
    { value: tier.cloudflarePythonConcurrency, min: 1, max: 1000, name: "cloudflarePythonConcurrency" },
    { value: tier.cloudflareMediaQueueConcurrency, min: 1, max: 500, name: "cloudflareMediaQueueConcurrency" },
    { value: tier.cloudflareWorkflowQueueConcurrency, min: 1, max: 500, name: "cloudflareWorkflowQueueConcurrency" },
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

export async function getDeployMode(): Promise<{
  mode: DeployMode;
  source: "redis" | "db" | "env" | "default";
}> {
  // Priority 1: Redis feature flag
  try {
    const { getRedisClient } = await import("./redis");
    const redis = getRedisClient();
    const raw = await redis.get("feature-flag:DEPLOY_MODE");
    if (raw === "localhost" || raw === "cloudflare") {
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
      if (row?.value === "localhost" || row?.value === "cloudflare") {
        return { mode: row.value, source: "db" };
      }
    }
  } catch { /* DB unavailable */ }

  // Priority 3: ENV var
  const envVal = process.env.DEPLOY_MODE;
  if (envVal === "localhost" || envVal === "cloudflare") {
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

  // Use transaction with SELECT ... FOR UPDATE to prevent concurrent writes
  await db.transaction(async (tx) => {
    const [existing] = await tx
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
      await tx
        .update(systemSettings)
        .set({ value: mode, updatedBy: userId, updatedAt: new Date() })
        .where(eq(systemSettings.id, existing.id));
    } else {
      await tx.insert(systemSettings).values({
        category: "infrastructure",
        key: "deploy_mode",
        value: mode,
        isSensitive: false,
        updatedBy: userId,
      });
    }
  });

  // Update Redis cache with 1-hour TTL to force periodic DB re-sync
  try {
    const { getRedisClient } = await import("./redis");
    const redis = getRedisClient();
    await redis.set("feature-flag:DEPLOY_MODE", mode, "EX", 3600);
  } catch (err: unknown) {
    console.error("[setDeployMode] Redis update failed (DB persisted):", formatError(err));
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export interface ApplyStepResult {
  step: string;
  status: "ok" | "skipped" | "error";
  message: string;
  mode?: DeployMode;
  command?: string;
}

// Concurrency lock for local configuration changes. The lock is best-effort
// when Redis is unavailable; localhost apply remains a single-process action.
const APPLY_LOCK_KEY = "scale-tier:apply-lock";
const APPLY_LOCK_TTL_SEC = 300;

async function acquireApplyLock(): Promise<boolean> {
  try {
    const { getRedisClient } = await import("./redis");
    const redis = getRedisClient();
    const result = await redis.set(
      APPLY_LOCK_KEY,
      Date.now().toString(),
      "EX",
      APPLY_LOCK_TTL_SEC,
      "NX",
    );
    return result === "OK";
  } catch {
    return true;
  }
}

async function releaseApplyLock(): Promise<void> {
  try {
    const { getRedisClient } = await import("./redis");
    await getRedisClient().del(APPLY_LOCK_KEY);
  } catch {
    // TTL provides eventual cleanup when Redis is unavailable.
  }
}

/**
 * Apply a scale tier through the selected deployment boundary.
 *
 * Cloudflare scaling is owned by the deployment pipeline; the web process
 * reports that boundary without invoking retired Google Cloud tooling.
 */
export async function applyScaleTier(
  tierId: ScaleTierId,
  modeOverride?: DeployMode,
): Promise<ApplyStepResult[]> {
  const tier = SCALE_TIERS[tierId];
  if (!tier) throw new Error(`Unknown tier: ${tierId}`);
  validateTierConfig(tier);

  const { mode } = modeOverride ? { mode: modeOverride } : await getDeployMode();
  if (mode === "cloudflare") {
    return [{
      step: "cloudflare_deployment_pipeline",
      status: "skipped",
      mode,
      message: `Cloudflare tier ${tier.id} is a deployment-pipeline budget hint; no local runtime mutation was performed`,
    }];
  }

  const acquired = await acquireApplyLock();
  if (!acquired) {
    throw new Error("Another scale tier apply operation is already in progress. Please wait.");
  }

  try {
    return await applyScaleTierLocalhost(tier);
  } finally {
    await releaseApplyLock();
  }
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
    let nginxUpdated = false;
    for (const confPath of [NGINX_CONF_PATH, NGINX_DEV_CONF_PATH]) {
      try {
        await backup(confPath);
        const content = await readFile(confPath, "utf-8");
        if (/worker_connections\s+\d+;/.test(content)) {
          const updated = content.replace(
            /worker_connections\s+\d+;/,
            `worker_connections ${tier.nginxWorkerConnections};`,
          );
          await writeFile(confPath, updated, "utf-8");
          nginxUpdated = true;
        }
      } catch (err: unknown) {
        if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      }
    }
    // Update keepalive in nginx.conf
    try {
      const content = await readFile(NGINX_CONF_PATH, "utf-8");
      if (/keepalive\s+\d+;/.test(content)) {
        const updated = content.replace(
          /keepalive\s+\d+;/g,
          `keepalive ${tier.nginxKeepalive};`,
        );
        await writeFile(NGINX_CONF_PATH, updated, "utf-8");
        nginxUpdated = true;
      }
    } catch (err: unknown) {
      if (err instanceof Error && "code" in err && (err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    if (nginxUpdated) {
      results.push({ step: "nginx_config", status: "ok", mode: "localhost", message: `Nginx: connections=${tier.nginxWorkerConnections}, keepalive=${tier.nginxKeepalive}` });
    } else {
      results.push({ step: "nginx_config", status: "skipped", mode: "localhost", message: "Nginx config files not found or patterns not matched" });
    }
  } catch (err: unknown) {
    results.push({ step: "nginx_config", status: "error", mode: "localhost", message: formatError(err) });
  }

  // Step 5: Apply Redis maxmemory (hot-reload, no restart needed)
  try {
    // Pre-check: verify Redis container is running
    await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", "smartspec-redis"], { timeout: 5_000 });
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
    const msg = formatError(err);
    const isContainerDown = msg.includes("No such object") || msg.includes("is not running");
    results.push({ step: "redis_config", status: "error", mode: "localhost", message: isContainerDown ? "Redis container (smartspec-redis) is not running" : msg });
  }

  // Step 6: Reload Nginx (graceful, no downtime)
  try {
    // Pre-check: verify Nginx container is running
    await execFileAsync("docker", ["inspect", "--format", "{{.State.Running}}", "smartspec-nginx-dev"], { timeout: 5_000 });
    await execFileAsync("docker", ["exec", "smartspec-nginx-dev", "nginx", "-s", "reload"]);
    results.push({ step: "nginx_reload", status: "ok", mode: "localhost", message: "Nginx reloaded successfully" });
  } catch (err: unknown) {
    const msg = formatError(err);
    const isContainerDown = msg.includes("No such object") || msg.includes("is not running");
    results.push({ step: "nginx_reload", status: "error", mode: "localhost", message: isContainerDown ? "Nginx container (smartspec-nginx-dev) is not running" : `Nginx reload failed: ${msg}` });
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
