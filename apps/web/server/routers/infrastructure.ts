/**
 * Infrastructure Settings tRPC Router
 *
 * Admin-only routes for GCP configuration, task processing mode
 * (Celery vs Cloud Tasks), queue status dashboard, Redis/cache
 * provider configuration, and monitoring/observability settings.
 */

import { z } from "zod";
import { router, adminProcedure, rateLimitedAdminProcedure, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { getFeatureFlag, setFeatureFlag } from "../services/featureFlags";
import {
  getAllQueueMetrics,
  getDeadLetterCount,
  getFailedTaskEvents,
} from "../services/cloudTasksMetrics";
import { isCacheHealthy, isRealtimeHealthy } from "../services/redisClients";
import { isRedisHealthy, getRedisStatus } from "../services/redis";
import { encrypt, decrypt } from "../services/crypto";
import { refreshAppRuntimeConfigCache } from "../services/appRuntimeConfig";
import {
  SCALE_TIERS,
  SCALE_TIER_IDS,
  applyScaleTier as applyTierConfig,
  detectCurrentTier,
  getDeployMode,
  setDeployMode,
} from "../services/scaleTier";
import type { ScaleTierId, DeployMode, ApplyStepResult } from "../services/scaleTier";

// ============================================================
// Constants
// ============================================================

const CATEGORY = "infrastructure" as const;

const GCP_CONFIG_KEYS = [
  "gcp_project_id",
  "gcp_region",
  "cloud_run_python_url",
  "cloud_run_node_url",
  "cloud_run_sa_email",
] as const;

/** Map DB key → process.env fallback name */
const ENV_FALLBACK: Record<string, string> = {
  gcp_project_id: "GCP_PROJECT_ID",
  gcp_region: "GCP_REGION",
  cloud_run_python_url: "CLOUD_RUN_PYTHON_URL",
  cloud_run_node_url: "CLOUD_RUN_NODE_URL",
  cloud_run_sa_email: "CLOUD_RUN_SA_EMAIL",
};

const REDIS_CONFIG_KEYS = [
  "redis_provider",
  "redis_local_url",
  "redis_upstash_url",
  "redis_cloud_url",
  "redis_memorystore_url",
  "redis_password",
] as const;

const REDIS_ENV_FALLBACK: Record<string, string> = {
  redis_provider: "REDIS_PROVIDER",
  redis_local_url: "REDIS_URL",
  redis_upstash_url: "REDIS_UPSTASH_URL",
  redis_cloud_url: "REDIS_CLOUD_URL",
  redis_memorystore_url: "REDIS_MEMORYSTORE_URL",
  redis_password: "REDIS_PASSWORD",
};

/** Keys that contain credentials and must be encrypted in DB */
const REDIS_SENSITIVE_KEYS = new Set([
  "redis_upstash_url",
  "redis_cloud_url",
  "redis_local_url",
  "redis_memorystore_url",
  "redis_password",
]);

const MONITORING_CONFIG_KEYS = [
  "sentry_dsn_node",
  "sentry_dsn_python",
  "analytics_provider",
  "posthog_api_key_node",
  "posthog_api_key_python",
  "posthog_host",
  "ga4_measurement_id",
  "ga4_api_secret",
  "firebase_api_key",
  "firebase_project_id",
  "log_level",
  "sentry_traces_sample_rate",
  "sentry_environment",
] as const;

const MONITORING_ENV_FALLBACK: Record<string, string> = {
  sentry_dsn_node: "SENTRY_DSN_NODE",
  sentry_dsn_python: "SENTRY_DSN",
  analytics_provider: "ANALYTICS_PROVIDER",
  posthog_api_key_node: "POSTHOG_API_KEY",
  posthog_api_key_python: "POSTHOG_API_KEY",
  posthog_host: "POSTHOG_HOST",
  ga4_measurement_id: "GA4_MEASUREMENT_ID",
  ga4_api_secret: "GA4_API_SECRET",
  firebase_api_key: "FIREBASE_API_KEY",
  firebase_project_id: "FIREBASE_PROJECT_ID",
  log_level: "LOG_LEVEL",
  sentry_traces_sample_rate: "SENTRY_TRACES_SAMPLE_RATE",
  sentry_environment: "ENVIRONMENT",
};

const MONITORING_SENSITIVE_KEYS = new Set([
  "sentry_dsn_node",
  "sentry_dsn_python",
  "posthog_api_key_node",
  "posthog_api_key_python",
  "ga4_api_secret",
  "firebase_api_key",
]);

const APP_RUNTIME_CONFIG_KEYS = [
  "python_backend_url",
  "smartspec_proxy_token",
  "smartspec_web_gateway_token",
  "smartspec_mcp_token",
  "smartspec_internal_url",
  "node_server_internal_url",
  "upload_post_api_base_url",
  "public_url",
  "app_public_url",
  "app_url",
  "s3_endpoint",
  "r2_public_url",
  "oauth_server_url",
  "forge_api_url",
  "forge_api_key",
  "llm_gateway_service_account_id",
] as const;

const APP_RUNTIME_ENV_FALLBACK: Record<string, string> = {
  python_backend_url: "PYTHON_BACKEND_URL",
  smartspec_proxy_token: "SMARTSPEC_PROXY_TOKEN",
  smartspec_web_gateway_token: "SMARTSPEC_WEB_GATEWAY_TOKEN",
  smartspec_mcp_token: "SMARTSPEC_MCP_TOKEN",
  smartspec_internal_url: "SMARTSPEC_INTERNAL_URL",
  node_server_internal_url: "NODE_SERVER_INTERNAL_URL",
  upload_post_api_base_url: "UPLOAD_POST_API_BASE_URL",
  public_url: "PUBLIC_URL",
  app_public_url: "APP_PUBLIC_URL",
  app_url: "APP_URL",
  s3_endpoint: "S3_ENDPOINT",
  r2_public_url: "R2_PUBLIC_URL",
  oauth_server_url: "OAUTH_SERVER_URL",
  forge_api_url: "FORGE_API_URL",
  forge_api_key: "FORGE_API_KEY",
  llm_gateway_service_account_id: "LLM_GATEWAY_SERVICE_ACCOUNT_ID",
};

const APP_RUNTIME_SENSITIVE_KEYS = new Set([
  "smartspec_proxy_token",
  "smartspec_web_gateway_token",
  "smartspec_mcp_token",
  "forge_api_key",
]);

// ============================================================
// Helpers
// ============================================================

async function upsertSetting(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  key: string,
  value: string,
  userId?: number,
  sensitive = false,
) {
  const storedValue = sensitive && value ? encrypt(value) : value;

  const [existing] = await db
    .select()
    .from(systemSettings)
    .where(and(eq(systemSettings.category, CATEGORY), eq(systemSettings.key, key)))
    .limit(1);

  if (existing) {
    await db
      .update(systemSettings)
      .set({ value: storedValue, isSensitive: sensitive, updatedBy: userId, updatedAt: new Date() })
      .where(eq(systemSettings.id, existing.id));
  } else {
    await db.insert(systemSettings).values({
      category: CATEGORY,
      key,
      value: storedValue,
      isSensitive: sensitive,
      updatedBy: userId,
    });
  }
}

/** Read a setting value, decrypting if sensitive */
function readSettingValue(row: { value: string | null; isSensitive: boolean }): string {
  if (!row.value) return "";
  if (row.isSensitive) {
    try {
      return decrypt(row.value);
    } catch {
      return row.value;
    }
  }
  return row.value;
}

/** Mask a URL for display (show host but hide credentials) */
function maskUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    if (u.password) u.password = "***";
    if (u.username && u.username !== "") u.username = "***";
    return u.toString();
  } catch {
    return url.replace(/\/\/[^@]+@/, "//***@");
  }
}

/** Mask a Sentry DSN (hide auth token: https://TOKEN@sentry.io/123) */
function maskDsn(dsn: string): string {
  if (!dsn) return "";
  try {
    const u = new URL(dsn);
    if (u.username) u.username = "***";
    return u.toString();
  } catch {
    return dsn.replace(/\/\/[^@]+@/, "//***@");
  }
}

/** Mask a sensitive value for display (show first/last 4 chars) */
function maskApiKey(key: string): string {
  if (!key || key.length < 12) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

// ============================================================
// Router
// ============================================================

export const infrastructureRouter = router({
  // ----------------------------------------------------------
  // GCP Configuration
  // ----------------------------------------------------------

  getGcpConfig: adminProcedure.query(async () => {
    const db = await getDb();

    const dbValues: Record<string, string> = {};
    if (db) {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.category, CATEGORY));
      for (const row of rows) {
        if (GCP_CONFIG_KEYS.includes(row.key as any)) {
          dbValues[row.key] = row.value ?? "";
        }
      }
    }

    const result: Record<string, { value: string; source: "db" | "env" | "none" }> = {};
    for (const key of GCP_CONFIG_KEYS) {
      if (dbValues[key]) {
        result[key] = { value: dbValues[key], source: "db" };
      } else if (process.env[ENV_FALLBACK[key]]) {
        result[key] = { value: process.env[ENV_FALLBACK[key]]!, source: "env" };
      } else {
        result[key] = { value: "", source: "none" };
      }
    }

    return result;
  }),

  updateGcpConfig: rateLimitedAdminProcedure
    .input(
      z.object({
        gcp_project_id: z.string().max(256).optional(),
        gcp_region: z.string().max(128).optional(),
        cloud_run_python_url: z.string().url().or(z.literal("")).optional(),
        cloud_run_node_url: z.string().url().or(z.literal("")).optional(),
        cloud_run_sa_email: z.string().email().or(z.literal("")).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      for (const key of GCP_CONFIG_KEYS) {
        const value = input[key];
        if (value !== undefined) {
          await upsertSetting(db, key, value, ctx.user?.id);
        }
      }

      return { success: true };
    }),

  getAppRuntimeConfig: adminProcedure.query(async () => {
    const db = await getDb();
    const dbValues: Record<string, { value: string; isSensitive: boolean }> = {};
    if (db) {
      const rows = await db.select().from(systemSettings).where(eq(systemSettings.category, CATEGORY));
      for (const row of rows) {
        if (APP_RUNTIME_CONFIG_KEYS.includes(row.key as any)) {
          dbValues[row.key] = {
            value: readSettingValue(row as any),
            isSensitive: row.isSensitive ?? false,
          };
        }
      }
    }

    const result: Record<string, { value: string; maskedValue: string; source: "db" | "env" | "none" }> = {};
    for (const key of APP_RUNTIME_CONFIG_KEYS) {
      const isSensitive = APP_RUNTIME_SENSITIVE_KEYS.has(key);
      if (dbValues[key]?.value) {
        const val = dbValues[key].value;
        result[key] = {
          value: isSensitive ? "" : val,
          maskedValue: isSensitive ? maskApiKey(val) : val,
          source: "db",
        };
      } else if (process.env[APP_RUNTIME_ENV_FALLBACK[key]]) {
        const val = process.env[APP_RUNTIME_ENV_FALLBACK[key]]!;
        result[key] = {
          value: isSensitive ? "" : val,
          maskedValue: isSensitive ? maskApiKey(val) : val,
          source: "env",
        };
      } else {
        result[key] = { value: "", maskedValue: "", source: "none" };
      }
    }

    return result;
  }),

  updateAppRuntimeConfig: rateLimitedAdminProcedure
    .input(z.object({
      python_backend_url: z.string().url().or(z.literal("")).optional(),
      smartspec_proxy_token: z.string().max(512).optional(),
      smartspec_web_gateway_token: z.string().max(512).optional(),
      smartspec_mcp_token: z.string().max(512).optional(),
      smartspec_internal_url: z.string().url().or(z.literal("")).optional(),
      node_server_internal_url: z.string().url().or(z.literal("")).optional(),
      upload_post_api_base_url: z.string().url().or(z.literal("")).optional(),
      public_url: z.string().url().or(z.literal("")).optional(),
      app_public_url: z.string().url().or(z.literal("")).optional(),
      app_url: z.string().url().or(z.literal("")).optional(),
      s3_endpoint: z.string().url().or(z.literal("")).optional(),
      r2_public_url: z.string().url().or(z.literal("")).optional(),
      oauth_server_url: z.string().url().or(z.literal("")).optional(),
      forge_api_url: z.string().url().or(z.literal("")).optional(),
      forge_api_key: z.string().max(512).optional(),
      llm_gateway_service_account_id: z.string().regex(/^\d*$/).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      for (const key of APP_RUNTIME_CONFIG_KEYS) {
        const value = input[key];
        if (value !== undefined) {
          const sensitive = APP_RUNTIME_SENSITIVE_KEYS.has(key);
          if (sensitive && value === "") continue;
          await upsertSetting(db, key, value, ctx.user?.id, sensitive);
        }
      }

      await refreshAppRuntimeConfigCache();

      return { success: true };
    }),

  // ----------------------------------------------------------
  // Task Processing Mode (Celery vs Cloud Tasks)
  // ----------------------------------------------------------

  getTaskProcessingMode: adminProcedure.query(async () => {
    // Priority: Redis → DB → env → default
    try {
      const redisFlag = await getFeatureFlag("USE_CLOUD_TASKS");
      // getFeatureFlag returns false as default, so we need to check Redis directly
      // to distinguish "explicitly set to false" from "not set"
      const { getRedisClient } = await import("../services/redis");
      const redis = getRedisClient();
      const raw = await redis.get("feature-flag:USE_CLOUD_TASKS");
      if (raw !== null) {
        return { mode: raw === "true" ? "cloud_tasks" : "celery", source: "redis" as const };
      }
    } catch {
      // Redis unavailable
    }

    // Check DB
    const db = await getDb();
    if (db) {
      const [row] = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, CATEGORY),
            eq(systemSettings.key, "task_processing_mode"),
          ),
        )
        .limit(1);
      if (row?.value) {
        return { mode: row.value as "celery" | "cloud_tasks", source: "db" as const };
      }
    }

    // Check env
    const envVal = process.env.USE_CLOUD_TASKS;
    if (envVal) {
      return { mode: envVal === "true" ? "cloud_tasks" : "celery", source: "env" as const };
    }

    return { mode: "celery" as const, source: "default" as const };
  }),

  setTaskProcessingMode: rateLimitedAdminProcedure
    .input(
      z.object({
        mode: z.enum(["celery", "cloud_tasks"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      console.log(`[infra-audit] setTaskProcessingMode: user=${ctx.user?.id}, mode=${input.mode}`);

      // 1. Persist to DB
      await upsertSetting(db, "task_processing_mode", input.mode, ctx.user?.id);

      // 2. Update Redis for immediate effect
      await setFeatureFlag("USE_CLOUD_TASKS", input.mode === "cloud_tasks");

      return { success: true, mode: input.mode };
    }),

  // ----------------------------------------------------------
  // Queue Status Dashboard
  // ----------------------------------------------------------

  getQueueDashboard: adminProcedure.query(async () => {
    const [queues, deadLetterCount, failedTasks, modeFlag] = await Promise.all([
      getAllQueueMetrics(),
      getDeadLetterCount(),
      getFailedTaskEvents(10),
      getFeatureFlag("USE_CLOUD_TASKS"),
    ]);

    return {
      queues,
      deadLetterCount,
      failedTasks: failedTasks.map((t: any) => ({
        id: t.id,
        taskId: t.taskId,
        queueName: t.queueName,
        status: t.status,
        attemptCount: t.attemptCount,
        errorMessage: t.errorMessage,
        createdAt: t.createdAt,
      })),
      currentMode: modeFlag ? "cloud_tasks" : "celery",
    };
  }),

  // ----------------------------------------------------------
  // Redis / Cache Configuration
  // ----------------------------------------------------------

  getRedisConfig: adminProcedure.query(async () => {
    const db = await getDb();

    // Read DB values
    const dbValues: Record<string, { value: string; isSensitive: boolean }> = {};
    if (db) {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.category, CATEGORY));
      for (const row of rows) {
        if (REDIS_CONFIG_KEYS.includes(row.key as any)) {
          dbValues[row.key] = {
            value: readSettingValue(row as any),
            isSensitive: row.isSensitive ?? false,
          };
        }
      }
    }

    const result: Record<string, { value: string; maskedValue: string; source: "db" | "env" | "none" }> = {};
    for (const key of REDIS_CONFIG_KEYS) {
      const isSensitive = REDIS_SENSITIVE_KEYS.has(key);
      if (dbValues[key]?.value) {
        const val = dbValues[key].value;
        result[key] = {
          value: isSensitive ? "" : val,
          maskedValue: isSensitive ? maskUrl(val) : val,
          source: "db",
        };
      } else if (process.env[REDIS_ENV_FALLBACK[key]]) {
        const val = process.env[REDIS_ENV_FALLBACK[key]]!;
        result[key] = {
          value: isSensitive ? "" : val,
          maskedValue: isSensitive ? maskUrl(val) : val,
          source: "env",
        };
      } else {
        result[key] = { value: "", maskedValue: "", source: "none" };
      }
    }

    return result;
  }),

  updateRedisConfig: rateLimitedAdminProcedure
    .input(
      z.object({
        redis_provider: z.enum(["local", "upstash", "redis_cloud", "memorystore"]).optional(),
        redis_local_url: z.string().max(512).optional(),
        redis_upstash_url: z.string().max(512).optional(),
        redis_cloud_url: z.string().max(512).optional(),
        redis_memorystore_url: z.string().max(512).optional(),
        redis_password: z.string().max(256).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      for (const key of REDIS_CONFIG_KEYS) {
        const value = input[key];
        if (value !== undefined) {
          const sensitive = REDIS_SENSITIVE_KEYS.has(key);
          // Skip empty strings for sensitive keys — means "keep existing value"
          if (sensitive && value === "") continue;
          await upsertSetting(db, key, value, ctx.user?.id, sensitive);
        }
      }

      return { success: true };
    }),

  testRedisConnection: adminProcedure
    .input(
      z.object({
        url: z.string().min(1),
      }),
    )
    .mutation(async ({ input }) => {
      const Redis = (await import("ioredis")).default;
      const client = new Redis(input.url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        lazyConnect: true,
      });

      try {
        await client.connect();
        const pong = await client.ping();
        const info = await client.info("server");
        const versionMatch = info.match(/redis_version:(\S+)/);
        const memMatch = info.match(/used_memory_human:(\S+)/);
        await client.quit();

        return {
          success: true,
          latency: "OK",
          version: versionMatch?.[1] ?? "unknown",
          memory: memMatch?.[1] ?? "unknown",
        };
      } catch (err: any) {
        try { await client.disconnect(); } catch {}
        return {
          success: false,
          error: err.message ?? "Connection failed",
        };
      }
    }),

  getRedisHealth: adminProcedure.query(async () => {
    const [cacheHealthy, realtimeHealthy, legacyHealthy] = await Promise.all([
      isCacheHealthy(),
      isRealtimeHealthy(),
      isRedisHealthy(),
    ]);

    const legacyStatus = getRedisStatus();

    // Determine which URLs are active from env (priority: upstash > redis_cloud > local)
    const cacheUrl = process.env.REDIS_UPSTASH_URL || process.env.REDIS_CLOUD_URL || process.env.REDIS_URL || "";
    const realtimeUrl = process.env.REDIS_MEMORYSTORE_URL || process.env.REDIS_URL || "";
    const legacyUrl = process.env.REDIS_URL || "";

    const cacheProvider = process.env.REDIS_UPSTASH_URL
      ? "upstash"
      : process.env.REDIS_CLOUD_URL
        ? "redis_cloud"
        : "local";

    return {
      cache: {
        healthy: cacheHealthy,
        url: maskUrl(cacheUrl),
        provider: cacheProvider,
      },
      realtime: {
        healthy: realtimeHealthy,
        url: maskUrl(realtimeUrl),
        provider: process.env.REDIS_MEMORYSTORE_URL ? "memorystore" : "local",
      },
      legacy: {
        healthy: legacyHealthy,
        connected: legacyStatus.connected,
        url: legacyStatus.url,
        error: legacyStatus.error,
      },
    };
  }),

  // ----------------------------------------------------------
  // Monitoring & Observability
  // ----------------------------------------------------------

  getMonitoringConfig: adminProcedure.query(async () => {
    const db = await getDb();

    const dbValues: Record<string, { value: string; isSensitive: boolean }> = {};
    if (db) {
      const rows = await db
        .select()
        .from(systemSettings)
        .where(eq(systemSettings.category, CATEGORY));
      for (const row of rows) {
        if (MONITORING_CONFIG_KEYS.includes(row.key as any)) {
          dbValues[row.key] = {
            value: readSettingValue(row as any),
            isSensitive: row.isSensitive ?? false,
          };
        }
      }
    }

    const result: Record<string, { value: string; maskedValue: string; source: "db" | "env" | "none" }> = {};
    for (const key of MONITORING_CONFIG_KEYS) {
      const isSensitive = MONITORING_SENSITIVE_KEYS.has(key);
      if (dbValues[key]?.value) {
        const val = dbValues[key].value;
        result[key] = {
          value: isSensitive ? "" : val,
          maskedValue: isSensitive
            ? (key.includes("dsn") ? maskDsn(val) : maskApiKey(val))
            : val,
          source: "db",
        };
      } else if (process.env[MONITORING_ENV_FALLBACK[key]]) {
        const val = process.env[MONITORING_ENV_FALLBACK[key]]!;
        result[key] = {
          value: isSensitive ? "" : val,
          maskedValue: isSensitive
            ? (key.includes("dsn") ? maskDsn(val) : maskApiKey(val))
            : val,
          source: "env",
        };
      } else {
        result[key] = { value: "", maskedValue: "", source: "none" };
      }
    }

    return result;
  }),

  updateMonitoringConfig: rateLimitedAdminProcedure
    .input(
      z.object({
        sentry_dsn_node: z.string().max(512).optional(),
        sentry_dsn_python: z.string().max(512).optional(),
        analytics_provider: z.enum(["posthog", "ga4", "both", "none"]).optional(),
        posthog_api_key_node: z.string().max(256).optional(),
        posthog_api_key_python: z.string().max(256).optional(),
        posthog_host: z.string().max(256).optional(),
        ga4_measurement_id: z.string().max(64).optional(),
        ga4_api_secret: z.string().max(256).optional(),
        firebase_api_key: z.string().max(256).optional(),
        firebase_project_id: z.string().max(128).optional(),
        log_level: z.enum(["debug", "info", "warn", "error"]).optional(),
        sentry_traces_sample_rate: z.string().max(10).optional(),
        sentry_environment: z.enum(["development", "staging", "production"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      for (const key of MONITORING_CONFIG_KEYS) {
        const value = input[key];
        if (value !== undefined) {
          const sensitive = MONITORING_SENSITIVE_KEYS.has(key);
          // Skip empty strings for sensitive keys — means "keep existing value"
          if (sensitive && value === "") continue;
          await upsertSetting(db, key, value, ctx.user?.id, sensitive);
        }
      }

      return { success: true };
    }),

  getMonitoringStatus: adminProcedure.query(async () => {
    const sentryNodeDsn = process.env.SENTRY_DSN_NODE;
    const sentryPythonDsn = process.env.SENTRY_DSN;
    const posthogKey = process.env.POSTHOG_API_KEY;
    const ga4MeasurementId = process.env.GA4_MEASUREMENT_ID;
    const firebaseApiKey = process.env.FIREBASE_API_KEY;
    const logLevel = process.env.LOG_LEVEL || "info";

    return {
      sentry: {
        nodeConfigured: !!sentryNodeDsn,
        pythonConfigured: !!sentryPythonDsn,
        environment: process.env.ENVIRONMENT || process.env.NODE_ENV || "development",
        tracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE || "0.05",
      },
      posthog: {
        configured: !!posthogKey,
        host: process.env.POSTHOG_HOST || "https://us.i.posthog.com",
      },
      ga4: {
        configured: !!ga4MeasurementId,
        measurementId: ga4MeasurementId ? `${ga4MeasurementId.slice(0, 4)}...` : "",
      },
      firebase: {
        configured: !!firebaseApiKey,
        projectId: process.env.FIREBASE_PROJECT_ID || "",
      },
      analyticsProvider: process.env.ANALYTICS_PROVIDER || "posthog",
      logging: {
        level: logLevel,
      },
    };
  }),

  getSystemHealth: adminProcedure.query(async () => {
    const { ENV } = await import("../_core/env");
    const baseUrl = ENV.pythonBackendUrl || "http://localhost:8000";

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${baseUrl}/api/v1/health/system`, {
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        return { status: "error" as const, error: `HTTP ${res.status}`, services: null };
      }

      const data = await res.json();
      return {
        status: data.status as string,
        timestamp: data.timestamp as string,
        responseTimeMs: data.response_time_ms as number,
        services: data.services as Record<string, any>,
      };
    } catch (err: any) {
      return {
        status: "unreachable" as const,
        error: err.message ?? "Python backend unreachable",
        services: null,
      };
    }
  }),

  // ----------------------------------------------------------
  // Scale Tier Management
  // ----------------------------------------------------------

  getScaleTier: adminProcedure.query(async () => {
    const db = await getDb();

    let tier: ScaleTierId = detectCurrentTier();
    let appliedAt: string | null = null;

    if (db) {
      const [tierRow] = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, CATEGORY),
            eq(systemSettings.key, "scale_tier"),
          ),
        )
        .limit(1);

      if (tierRow?.value && SCALE_TIER_IDS.includes(tierRow.value as ScaleTierId)) {
        tier = tierRow.value as ScaleTierId;
      }

      const [appliedAtRow] = await db
        .select()
        .from(systemSettings)
        .where(
          and(
            eq(systemSettings.category, CATEGORY),
            eq(systemSettings.key, "scale_tier_applied_at"),
          ),
        )
        .limit(1);

      if (appliedAtRow?.value) {
        appliedAt = appliedAtRow.value;
      }
    }

    const deployModeResult = await getDeployMode();

    return {
      tier,
      appliedAt,
      config: SCALE_TIERS[tier],
      allTiers: Object.values(SCALE_TIERS),
      deployMode: deployModeResult.mode,
      deployModeSource: deployModeResult.source,
    };
  }),

  setScaleTier: rateLimitedAdminProcedure
    .input(
      z.object({
        tier: z.enum(["starter", "growth", "pro", "business", "enterprise"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      console.log(`[infra-audit] setScaleTier: user=${ctx.user?.id}, tier=${input.tier}`);
      await upsertSetting(db, "scale_tier", input.tier, ctx.user?.id);

      return { success: true as const, tier: input.tier as ScaleTierId };
    }),

  applyScaleTier: rateLimitedAdminProcedure
    .input(
      z.object({
        tier: z.enum(["starter", "growth", "pro", "business", "enterprise"]),
        mode: z.enum(["localhost", "cloudrun"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const startTime = Date.now();
      console.log(`[infra-audit] applyScaleTier: user=${ctx.user?.id}, tier=${input.tier}, mode=${input.mode ?? "auto"}`);

      // 1. Persist the tier selection
      await upsertSetting(db, "scale_tier", input.tier, ctx.user?.id);

      // 2. Apply configuration across all services (mode-aware)
      const results: ApplyStepResult[] = await applyTierConfig(
        input.tier as ScaleTierId,
        input.mode as DeployMode | undefined,
      );

      // 3. Record the timestamp of the last successful apply
      await upsertSetting(
        db,
        "scale_tier_applied_at",
        new Date().toISOString(),
        ctx.user?.id,
      );

      const errors = results.filter((r) => r.status === "error");
      console.log(`[infra-audit] applyScaleTier complete: tier=${input.tier}, steps=${results.length}, errors=${errors.length}, durationMs=${Date.now() - startTime}`);

      return { success: true as const, results };
    }),

  // ----------------------------------------------------------
  // Content Automation Feature Flag
  // ----------------------------------------------------------

  getContentAutomationEnabled: protectedProcedure.query(async () => {
    const enabled = await getFeatureFlag("ENABLE_CONTENT_AUTOMATION");
    return { contentAutomation: enabled };
  }),

  // ----------------------------------------------------------
  // Deploy Mode Management
  // ----------------------------------------------------------

  getDeployModeInfo: adminProcedure.query(async () => {
    const result = await getDeployMode();
    let gcpConfigured = false;
    try {
      const { resolveGcpConfig } = await import("../services/scaleTier");
      await resolveGcpConfig();
      gcpConfigured = true;
    } catch { /* GCP not configured */ }
    return { ...result, gcpConfigured };
  }),

  setDeployModeInfo: rateLimitedAdminProcedure
    .input(z.object({ mode: z.enum(["localhost", "cloudrun"]) }))
    .mutation(async ({ input, ctx }) => {
      // Validate GCP config before allowing cloudrun mode
      if (input.mode === "cloudrun") {
        try {
          const { resolveGcpConfig } = await import("../services/scaleTier");
          await resolveGcpConfig();
        } catch (err: unknown) {
          const { TRPCError } = await import("@trpc/server");
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Cannot switch to Cloud Run: ${err instanceof Error ? err.message : "GCP configuration incomplete"}. Configure GCP settings first.`,
          });
        }
      }
      console.log(`[infra-audit] setDeployMode: user=${ctx.user?.id}, mode=${input.mode}`);
      await setDeployMode(input.mode as DeployMode, ctx.user?.id);
      return { success: true, mode: input.mode };
    }),
});
