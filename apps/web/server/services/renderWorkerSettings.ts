/**
 * Vertical Drama Render Queue — admin toggle for "web server also acts as an
 * ffmpeg render worker" (`planning/vertical-drama-render-queue/plan.md`
 * §4.4, Wave 2). TTL-cached read of `system_settings`
 * (`category="infrastructure"`, `key="web_process_render_worker_enabled"`),
 * modeled on `documentOcrSettings.ts`'s cache-trio convention
 * (`cachedValue`/`cacheExpiresAt`/`refreshPromise`, `CACHE_TTL_MS`,
 * de-duped in-flight refresh).
 *
 * Env fallback mirrors `routers/infrastructure.ts`'s DB-then-env convention
 * (`ENV_FALLBACK` table, `getGcpConfig`/`getAppRuntimeConfig` handlers):
 * when no row exists yet, the value falls back to
 * `process.env.SMARTSPEC_INLINE_RENDER_WORKER === "true"`. Per the plan's
 * resolved decision (§9.2), the default is **OFF** — an absent row AND an
 * absent/false env var both resolve to `false`, so no in-server rendering
 * happens on deploy until an admin explicitly enables it (or the env var is
 * set for that host).
 */
import { and, eq } from "drizzle-orm";

import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";

const CATEGORY = "infrastructure" as const;
const KEY_WEB_PROCESS_RENDER_WORKER_ENABLED = "web_process_render_worker_enabled";
const CACHE_TTL_MS = 30_000;

let cachedEnabled: boolean | null = null;
let cacheExpiresAt = 0;
let refreshPromise: Promise<boolean> | null = null;

function readEnvFallback(): boolean {
  return process.env.SMARTSPEC_INLINE_RENDER_WORKER === "true";
}

async function loadWebProcessRenderWorkerEnabled(): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return readEnvFallback();

    const [row] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, CATEGORY),
          eq(systemSettings.key, KEY_WEB_PROCESS_RENDER_WORKER_ENABLED),
        ),
      )
      .limit(1);

    if (!row || row.value === null || row.value === undefined || row.value === "") {
      return readEnvFallback();
    }

    return row.value === "true";
  } catch {
    return readEnvFallback();
  }
}

/**
 * Whether THIS web server process should claim + run
 * `vertical_drama_ffmpeg_assembly` `worker_jobs` (see
 * `inlineRenderWorker.ts`). TTL-cached (30s) with a de-duped in-flight
 * refresh — same convention as `getDocumentOcrSettings`.
 */
export async function getWebProcessRenderWorkerEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cachedEnabled !== null && now < cacheExpiresAt) {
    return cachedEnabled;
  }
  if (!refreshPromise) {
    refreshPromise = loadWebProcessRenderWorkerEnabled()
      .then((enabled) => {
        cachedEnabled = enabled;
        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
        return enabled;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/** Force the next `getWebProcessRenderWorkerEnabled()` call to re-read the
 *  DB — called by the admin `systemSettings.updateSetting` cache-clear hook
 *  (a later wave) right after the toggle is flipped. */
export function clearRenderWorkerSettingsCache(): void {
  cachedEnabled = null;
  cacheExpiresAt = 0;
  refreshPromise = null;
}
