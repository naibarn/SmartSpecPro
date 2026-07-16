/**
 * Feature 135 — Hermes Grok media worker admin settings. TTL-cached read of
 * `system_settings` (`category="infrastructure"`, `key IN (...)`), modeled on
 * `renderWorkerSettings.ts`'s cache-trio convention
 * (`cachedValue`/`cacheExpiresAt`/`refreshPromise`, `CACHE_TTL_MS`, de-duped
 * in-flight refresh). All keys are loaded in a single query.
 *
 * Namespace note: this is the `hermesMedia`/`hermes_media` namespace — it has
 * nothing to do with the pre-existing agent-gateway Hermes lane's
 * worker-queueing helper or its own tenant runtime flag. See
 * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`, which
 * enforces this at the file-content level.
 *
 * Parsing is defensive: booleans come from the literal string `"true"`,
 * integers are parsed with `Number.parseInt` + `Number.isFinite` +
 * non-negativity checks, and anything malformed silently falls back to the
 * documented default — this loader never throws.
 *
 * The limit-coherence invariant (reject queued-cap < max batch size 4 at
 * config WRITE time) is validated and enforced in section 05 — this reader
 * only exposes the parsed values as-is.
 */
import { and, eq, inArray } from "drizzle-orm";

import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";

const CATEGORY = "infrastructure" as const;
const CACHE_TTL_MS = 30_000;

/** Setting key names — section 05's write-path validator and section 12's admin panel reference these same strings. */
export const HERMES_WORKER_SETTINGS_KEYS = {
  enabled: "hermes_worker_enabled",
  sharedPoolEnabled: "hermes_worker_shared_pool_enabled",
  serverPersonalEnabled: "hermes_worker_server_personal_enabled",
  privateEnabled: "hermes_worker_private_enabled",
  videoEnabled: "hermes_worker_video_enabled",
  sharedPoolFeeCredits: "hermes_shared_pool_fee_credits",
  maxRunningPerConnection: "hermes_max_running_per_connection",
  maxConcurrentPerSharedWorker: "hermes_max_concurrent_per_shared_worker",
  maxQueuedPerUser: "hermes_max_queued_per_user",
  maxQueuedPerTenantSharedPool: "hermes_max_queued_per_tenant_shared_pool",
  submitWindowPerUser: "hermes_submit_window_per_user",
  submitWindowPerTenant: "hermes_submit_window_per_tenant",
  minHermesVersion: "hermes_worker_min_version",
  sharedWorkerId: "hermes_shared_worker_id",
  webProcessWorkerEnabled: "web_process_hermes_worker_enabled",
} as const;

export interface HermesWorkerSettings {
  enabled: boolean; // hermes_worker_enabled (default false — kill switch)
  sharedPoolEnabled: boolean; // hermes_worker_shared_pool_enabled (false)
  serverPersonalEnabled: boolean; // hermes_worker_server_personal_enabled (false)
  privateEnabled: boolean; // hermes_worker_private_enabled (false)
  videoEnabled: boolean; // hermes_worker_video_enabled (false)
  sharedPoolFeeCredits: number; // hermes_shared_pool_fee_credits (0)
  maxRunningPerConnection: number; // hermes_max_running_per_connection (1)
  maxConcurrentPerSharedWorker: number; // hermes_max_concurrent_per_shared_worker (2)
  maxQueuedPerUser: number; // hermes_max_queued_per_user (8)
  maxQueuedPerTenantSharedPool: number; // hermes_max_queued_per_tenant_shared_pool (20)
  submitWindowPerUser: number; // hermes_submit_window_per_user (10 / 10 min sliding)
  submitWindowPerTenant: number; // hermes_submit_window_per_tenant (60 / 10 min sliding)
  minHermesVersion: string; // hermes_worker_min_version ("" = no floor)
  sharedWorkerId: string | null; // hermes_shared_worker_id (null until pairing script writes it)
  webProcessWorkerEnabled: boolean; // web_process_hermes_worker_enabled (false; env fallback
  //   SMARTSPEC_INLINE_HERMES_WORKER === "true", dev only)
}

const DEFAULT_HERMES_WORKER_SETTINGS: Omit<HermesWorkerSettings, "webProcessWorkerEnabled"> = {
  enabled: false,
  sharedPoolEnabled: false,
  serverPersonalEnabled: false,
  privateEnabled: false,
  videoEnabled: false,
  sharedPoolFeeCredits: 0,
  maxRunningPerConnection: 1,
  maxConcurrentPerSharedWorker: 2,
  maxQueuedPerUser: 8,
  maxQueuedPerTenantSharedPool: 20,
  submitWindowPerUser: 10,
  submitWindowPerTenant: 60,
  minHermesVersion: "",
  sharedWorkerId: null,
};

let cachedValue: HermesWorkerSettings | null = null;
let cacheExpiresAt = 0;
let refreshPromise: Promise<HermesWorkerSettings> | null = null;

function readWebProcessWorkerEnvFallback(): boolean {
  return process.env.SMARTSPEC_INLINE_HERMES_WORKER === "true";
}

function buildDefaults(): HermesWorkerSettings {
  return {
    ...DEFAULT_HERMES_WORKER_SETTINGS,
    webProcessWorkerEnabled: readWebProcessWorkerEnvFallback(),
  };
}

function parseBoolean(value: string | null | undefined, fallback: boolean): boolean {
  if (value === undefined || value === null || value === "") return fallback;
  return value === "true";
}

function parseNonNegativeInt(value: string | null | undefined, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function parseStringSetting(value: string | null | undefined, fallback: string): string {
  if (value === undefined || value === null) return fallback;
  return value;
}

async function loadHermesWorkerSettings(): Promise<HermesWorkerSettings> {
  try {
    const db = await getDb();
    if (!db) return buildDefaults();

    const keys = Object.values(HERMES_WORKER_SETTINGS_KEYS);
    const rows = await db
      .select({ key: systemSettings.key, value: systemSettings.value })
      .from(systemSettings)
      .where(and(eq(systemSettings.category, CATEGORY), inArray(systemSettings.key, keys)));

    const byKey = new Map(rows.map((row) => [row.key, row.value]));

    const webProcessRaw = byKey.get(HERMES_WORKER_SETTINGS_KEYS.webProcessWorkerEnabled);
    const webProcessWorkerEnabled =
      webProcessRaw === undefined || webProcessRaw === null || webProcessRaw === ""
        ? readWebProcessWorkerEnvFallback()
        : webProcessRaw === "true";

    return {
      enabled: parseBoolean(byKey.get(HERMES_WORKER_SETTINGS_KEYS.enabled), DEFAULT_HERMES_WORKER_SETTINGS.enabled),
      sharedPoolEnabled: parseBoolean(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.sharedPoolEnabled),
        DEFAULT_HERMES_WORKER_SETTINGS.sharedPoolEnabled,
      ),
      serverPersonalEnabled: parseBoolean(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.serverPersonalEnabled),
        DEFAULT_HERMES_WORKER_SETTINGS.serverPersonalEnabled,
      ),
      privateEnabled: parseBoolean(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.privateEnabled),
        DEFAULT_HERMES_WORKER_SETTINGS.privateEnabled,
      ),
      videoEnabled: parseBoolean(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.videoEnabled),
        DEFAULT_HERMES_WORKER_SETTINGS.videoEnabled,
      ),
      sharedPoolFeeCredits: parseNonNegativeInt(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.sharedPoolFeeCredits),
        DEFAULT_HERMES_WORKER_SETTINGS.sharedPoolFeeCredits,
      ),
      maxRunningPerConnection: parseNonNegativeInt(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.maxRunningPerConnection),
        DEFAULT_HERMES_WORKER_SETTINGS.maxRunningPerConnection,
      ),
      maxConcurrentPerSharedWorker: parseNonNegativeInt(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.maxConcurrentPerSharedWorker),
        DEFAULT_HERMES_WORKER_SETTINGS.maxConcurrentPerSharedWorker,
      ),
      maxQueuedPerUser: parseNonNegativeInt(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerUser),
        DEFAULT_HERMES_WORKER_SETTINGS.maxQueuedPerUser,
      ),
      maxQueuedPerTenantSharedPool: parseNonNegativeInt(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerTenantSharedPool),
        DEFAULT_HERMES_WORKER_SETTINGS.maxQueuedPerTenantSharedPool,
      ),
      submitWindowPerUser: parseNonNegativeInt(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.submitWindowPerUser),
        DEFAULT_HERMES_WORKER_SETTINGS.submitWindowPerUser,
      ),
      submitWindowPerTenant: parseNonNegativeInt(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.submitWindowPerTenant),
        DEFAULT_HERMES_WORKER_SETTINGS.submitWindowPerTenant,
      ),
      minHermesVersion: parseStringSetting(
        byKey.get(HERMES_WORKER_SETTINGS_KEYS.minHermesVersion),
        DEFAULT_HERMES_WORKER_SETTINGS.minHermesVersion,
      ),
      sharedWorkerId: byKey.get(HERMES_WORKER_SETTINGS_KEYS.sharedWorkerId) || null,
      webProcessWorkerEnabled,
    };
  } catch {
    return buildDefaults();
  }
}

/** TTL-cached (30s) Hermes worker settings, with a de-duped in-flight refresh. */
export async function getHermesWorkerSettings(): Promise<HermesWorkerSettings> {
  const now = Date.now();
  if (cachedValue !== null && now < cacheExpiresAt) {
    return cachedValue;
  }
  if (!refreshPromise) {
    refreshPromise = loadHermesWorkerSettings()
      .then((settings) => {
        cachedValue = settings;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return settings;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/** Force the next `getHermesWorkerSettings()` call to re-read the DB — called by
 *  the admin `systemSettings.updateSetting` cache-clear hook right after any
 *  `hermes_*` / `web_process_hermes_worker_enabled` setting is written or cleared. */
export function clearHermesWorkerSettingsCache(): void {
  cachedValue = null;
  cacheExpiresAt = 0;
  refreshPromise = null;
}
