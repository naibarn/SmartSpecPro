diff --git a/apps/web/client/src/pages/AdminMediaModels.tsx b/apps/web/client/src/pages/AdminMediaModels.tsx
index 053d9c105..dee5a6fe7 100644
--- a/apps/web/client/src/pages/AdminMediaModels.tsx
+++ b/apps/web/client/src/pages/AdminMediaModels.tsx
@@ -9,6 +9,7 @@ import {
   getMediaModelTransportLabel,
   resolveMediaModelTransportConfig,
 } from "@shared/mediaModelTransport";
+import type { MediaTransport } from "@shared/mcpConnectTypes";
 import { LocaleToggle } from "@/components/LocaleToggle";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
@@ -155,8 +156,13 @@ interface FormData {
   voices: string;
   isEnabled: boolean;
   priority: number;
-  // API Config (configJson)
-  transport: "gateway_api" | "mcp";
+  // API Config (configJson). Widened to the full `MediaTransport` union
+  // (Feature 135 added a third "hermes_worker" arm) so an edit/duplicate
+  // round-trip preserves the real transport value even though this admin
+  // UI only exposes a picker for the two pre-existing arms so far — see
+  // the pass-through comment at the handleEditModel/handleDuplicateModel
+  // call sites (hermes-aware admin UI ships in a later section).
+  transport: MediaTransport;
   providerModelId: string;
   mcpProviderKey: string;
   mcpToolName: string;
@@ -1752,6 +1758,13 @@ export default function AdminMediaModels() {
       voices: (model.voices || []).join("\n"),
       isEnabled: model.isEnabled,
       priority: model.priority,
+      // Feature 135 widened MediaTransport with a third "hermes_worker" arm.
+      // This admin form only renders a picker for the two pre-existing arms
+      // so far (hermes-aware admin UI ships in a later section), but the
+      // REAL resolved transport must still flow into state — Save writes
+      // `formData.transport` straight back into configJson.transport, so
+      // coercing here would silently clobber an existing hermes_worker row
+      // to gateway_api on every edit/duplicate round-trip.
       transport: transportConfig.transport,
       providerModelId: transportConfig.providerModelId || "",
       mcpProviderKey: transportConfig.providerKey || "",
@@ -1822,6 +1835,13 @@ export default function AdminMediaModels() {
       voices: (model.voices || []).join("\n"),
       isEnabled: false, // Start disabled for safety
       priority: model.priority,
+      // Feature 135 widened MediaTransport with a third "hermes_worker" arm.
+      // This admin form only renders a picker for the two pre-existing arms
+      // so far (hermes-aware admin UI ships in a later section), but the
+      // REAL resolved transport must still flow into state — Save writes
+      // `formData.transport` straight back into configJson.transport, so
+      // coercing here would silently clobber an existing hermes_worker row
+      // to gateway_api on every edit/duplicate round-trip.
       transport: transportConfig.transport,
       providerModelId: transportConfig.providerModelId || "",
       mcpProviderKey: transportConfig.providerKey || "",
diff --git a/apps/web/client/src/pages/StoryboardReviewPage.tsx b/apps/web/client/src/pages/StoryboardReviewPage.tsx
index 8396d75ca..dca1bc845 100644
--- a/apps/web/client/src/pages/StoryboardReviewPage.tsx
+++ b/apps/web/client/src/pages/StoryboardReviewPage.tsx
@@ -32,6 +32,7 @@ import {
   storyboardHistoryTaskMatchesProduct,
 } from "@/lib/storyboardHistoryGalleryFilter";
 import { resolveMediaModelTransportConfig } from "@shared/mediaModelTransport";
+import type { MediaTransport } from "@shared/mcpConnectTypes";
 import {
   buildHyperframesRenderLibrarySession,
   getHyperframesRenderLibraryReadyOutput,
@@ -337,7 +338,12 @@ type StoryboardReviewVideoModelOption = {
   value: string;
   label: string;
   provider: string;
-  transport: "gateway_api" | "mcp";
+  // Widened to the full `MediaTransport` union (Feature 135 added a third
+  // "hermes_worker" arm) so this option shape can carry the real resolved
+  // transport through; only the label falls back to existing "MCP"/"API"
+  // copy for the not-yet-built hermes UI (see the `label` computation
+  // below), which is fine for display purposes.
+  transport: MediaTransport;
   providerKey: string | null;
   providerModelId?: string | null;
   toolName?: string | null;
@@ -534,7 +540,12 @@ function buildStoryboardReviewCurrentVideoModelOption(input: {
     modelId: normalizedModelId,
     configJson: input.model?.configJson,
   });
-  const transport = explicitTransport ?? resolvedTransport.transport;
+  // Feature 135 widened MediaTransport with a third "hermes_worker" arm.
+  // Pass the REAL resolved transport through (not coerced) — this option's
+  // `label` ternary below only distinguishes "mcp" vs. everything else, so
+  // a hermes_worker model falls back to the existing "API" label copy fine
+  // until hermes-aware UI ships in a later section.
+  const transport: MediaTransport = explicitTransport ?? resolvedTransport.transport;
   const legacyProviderKey =
     typeof firstTaskTransportMetadata?.providerKey === "string"
       ? firstTaskTransportMetadata.providerKey.trim()
diff --git a/apps/web/server/routers/systemSettings.ts b/apps/web/server/routers/systemSettings.ts
index 2b3747441..62b16c61c 100644
--- a/apps/web/server/routers/systemSettings.ts
+++ b/apps/web/server/routers/systemSettings.ts
@@ -766,6 +766,20 @@ export const systemSettingsRouter = router({
           }
         }
 
+        // Feature 135 — Hermes Grok media worker admin settings live under
+        // `category: "infrastructure"` with a `hermes_`/`web_process_hermes_worker_enabled`
+        // key prefix. Clearing a row falls back to its documented default —
+        // clear the TTL cache so the next read picks that up immediately.
+        // Start/stop of an in-web drainer for `web_process_hermes_worker_enabled`
+        // is section 07's concern; only the cache clear happens here.
+        if (
+          input.category === "infrastructure"
+          && (input.key.startsWith("hermes_") || input.key === "web_process_hermes_worker_enabled")
+        ) {
+          const { clearHermesWorkerSettingsCache } = await import("../services/hermesWorkerSettings");
+          clearHermesWorkerSettingsCache();
+        }
+
         return { success: true };
       }
 
@@ -831,6 +845,19 @@ export const systemSettingsRouter = router({
         }
       }
 
+      // Feature 135 — Hermes Grok media worker admin settings. Lazy
+      // `await import(...)` for cross-service wiring (see memory note:
+      // lazy-import chain convention). Only clears the TTL cache — the
+      // in-web drainer start/stop for `web_process_hermes_worker_enabled`
+      // is section 07's concern.
+      if (
+        input.category === "infrastructure"
+        && (input.key.startsWith("hermes_") || input.key === "web_process_hermes_worker_enabled")
+      ) {
+        const { clearHermesWorkerSettingsCache } = await import("../services/hermesWorkerSettings");
+        clearHermesWorkerSettingsCache();
+      }
+
       return { success: true };
     }),
 
diff --git a/apps/web/server/services/__tests__/hermesMediaNamespaceGuard.test.ts b/apps/web/server/services/__tests__/hermesMediaNamespaceGuard.test.ts
new file mode 100644
index 000000000..6f0840c5b
--- /dev/null
+++ b/apps/web/server/services/__tests__/hermesMediaNamespaceGuard.test.ts
@@ -0,0 +1,88 @@
+/**
+ * Feature 135 — Hermes Grok media worker namespace guard.
+ *
+ * Grep-style test (fs walk + content scan, same style as
+ * `server/__tests__/migrationOrdering.test.ts`) enforcing the critical
+ * namespace rule from section-01: nothing under the `hermesMedia` /
+ * `hermes_media` namespace may reference the unrelated pre-existing
+ * agent-gateway Hermes lane (`queueHermesWorkerJob`,
+ * `hermesAgentRuntime` — both in `server/services/workerSchedulerService.ts`
+ * / `shared/featureFlags.ts`).
+ *
+ * This test intentionally grows in coverage automatically as later sections
+ * (02-12) add more `hermes*` files matching the globs below.
+ */
+import fs from "fs";
+import path from "path";
+import { describe, expect, it } from "vitest";
+
+const FORBIDDEN_TERMS = ["queueHermesWorkerJob", "hermesAgentRuntime"];
+
+function walkDirRecursive(dir: string): string[] {
+  if (!fs.existsSync(dir)) return [];
+  const result: string[] = [];
+  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
+    const fullPath = path.join(dir, entry.name);
+    if (entry.isDirectory()) {
+      result.push(...walkDirRecursive(fullPath));
+    } else if (entry.isFile()) {
+      result.push(fullPath);
+    }
+  }
+  return result;
+}
+
+/** Top-level entries of `baseDir` whose name starts with one of `prefixes`.
+ *  Matching directories are walked recursively (mirrors shell glob
+ *  semantics for `server/services/hermes*` / `shared/hermesMedia*`). */
+function collectMatchingFiles(baseDir: string, prefixes: string[]): string[] {
+  if (!fs.existsSync(baseDir)) return [];
+  const result: string[] = [];
+  for (const entry of fs.readdirSync(baseDir, { withFileTypes: true })) {
+    if (!prefixes.some((prefix) => entry.name.startsWith(prefix))) continue;
+    const fullPath = path.join(baseDir, entry.name);
+    if (entry.isDirectory()) {
+      result.push(...walkDirRecursive(fullPath));
+    } else if (entry.isFile()) {
+      result.push(fullPath);
+    }
+  }
+  return result;
+}
+
+describe("Feature 135 Hermes media namespace guard", () => {
+  it("no hermes-media file references the unrelated agent-gateway Hermes lane", () => {
+    const selfPath = path.resolve(
+      import.meta.dirname,
+      "hermesMediaNamespaceGuard.test.ts",
+    );
+    const serverServicesDir = path.resolve(import.meta.dirname, "..");
+    const sharedDir = path.resolve(import.meta.dirname, "../../../shared");
+    // Section-07's shared worker process directory — does not exist yet as of
+    // this section; skipped when absent (walkDirRecursive/collectMatchingFiles
+    // both return [] for a missing directory).
+    const hermesWorkerDir = path.resolve(import.meta.dirname, "../../hermesWorker");
+
+    const candidateFiles = [
+      ...collectMatchingFiles(serverServicesDir, ["hermes"]),
+      ...collectMatchingFiles(sharedDir, ["hermesMedia"]),
+      ...walkDirRecursive(hermesWorkerDir),
+    ]
+      .map((file) => path.resolve(file))
+      .filter((file) => file !== selfPath);
+
+    // Sanity: this section ships at least `server/services/hermesWorkerSettings.ts`
+    // and `shared/hermesMedia.ts` — if this is ever 0, the globs are broken.
+    expect(candidateFiles.length).toBeGreaterThan(0);
+
+    for (const file of candidateFiles) {
+      const content = fs.readFileSync(file, "utf-8");
+      for (const term of FORBIDDEN_TERMS) {
+        expect(
+          content.includes(term),
+          `${path.relative(process.cwd(), file)} must not reference "${term}" (unrelated agent-gateway Hermes lane)`,
+        ).toBe(false);
+      }
+    }
+  });
+});
diff --git a/apps/web/server/services/__tests__/hermesWorkerSettings.test.ts b/apps/web/server/services/__tests__/hermesWorkerSettings.test.ts
new file mode 100644
index 000000000..d6f0830da
--- /dev/null
+++ b/apps/web/server/services/__tests__/hermesWorkerSettings.test.ts
@@ -0,0 +1,191 @@
+import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
+
+const { mockGetDb } = vi.hoisted(() => ({
+  mockGetDb: vi.fn(),
+}));
+
+vi.mock("../../db", () => ({
+  getDb: mockGetDb,
+}));
+
+import {
+  HERMES_WORKER_SETTINGS_KEYS,
+  clearHermesWorkerSettingsCache,
+  getHermesWorkerSettings,
+} from "../hermesWorkerSettings";
+
+function createDbMock(rows: Array<{ key: string; value: string | null }>) {
+  const selectChain: any = {
+    from: vi.fn().mockReturnThis(),
+    where: vi.fn().mockResolvedValue(rows),
+  };
+  return {
+    select: vi.fn(() => selectChain),
+    selectChain,
+  };
+}
+
+describe("hermesWorkerSettings", () => {
+  const originalEnv = process.env.SMARTSPEC_INLINE_HERMES_WORKER;
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+    clearHermesWorkerSettingsCache();
+    delete process.env.SMARTSPEC_INLINE_HERMES_WORKER;
+  });
+
+  afterEach(() => {
+    if (originalEnv === undefined) {
+      delete process.env.SMARTSPEC_INLINE_HERMES_WORKER;
+    } else {
+      process.env.SMARTSPEC_INLINE_HERMES_WORKER = originalEnv;
+    }
+  });
+
+  it("returns the documented defaults when no rows exist", async () => {
+    const db = createDbMock([]);
+    mockGetDb.mockResolvedValue(db);
+
+    const settings = await getHermesWorkerSettings();
+
+    expect(settings).toEqual({
+      enabled: false,
+      sharedPoolEnabled: false,
+      serverPersonalEnabled: false,
+      privateEnabled: false,
+      videoEnabled: false,
+      sharedPoolFeeCredits: 0,
+      maxRunningPerConnection: 1,
+      maxConcurrentPerSharedWorker: 2,
+      maxQueuedPerUser: 8,
+      maxQueuedPerTenantSharedPool: 20,
+      submitWindowPerUser: 10,
+      submitWindowPerTenant: 60,
+      minHermesVersion: "",
+      sharedWorkerId: null,
+      webProcessWorkerEnabled: false,
+    });
+  });
+
+  it("falls back to the env var for webProcessWorkerEnabled only when no row exists", async () => {
+    process.env.SMARTSPEC_INLINE_HERMES_WORKER = "true";
+    const db = createDbMock([]);
+    mockGetDb.mockResolvedValue(db);
+
+    const settings = await getHermesWorkerSettings();
+    expect(settings.webProcessWorkerEnabled).toBe(true);
+  });
+
+  it("overrides defaults with parsed DB rows", async () => {
+    const db = createDbMock([
+      { key: HERMES_WORKER_SETTINGS_KEYS.enabled, value: "true" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.sharedPoolEnabled, value: "true" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.serverPersonalEnabled, value: "true" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.privateEnabled, value: "true" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.videoEnabled, value: "true" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.sharedPoolFeeCredits, value: "5" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.maxRunningPerConnection, value: "3" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.maxConcurrentPerSharedWorker, value: "6" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerUser, value: "12" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerTenantSharedPool, value: "40" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.submitWindowPerUser, value: "20" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.submitWindowPerTenant, value: "80" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.minHermesVersion, value: "1.2.0" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.sharedWorkerId, value: "worker-123" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.webProcessWorkerEnabled, value: "true" },
+    ]);
+    mockGetDb.mockResolvedValue(db);
+
+    const settings = await getHermesWorkerSettings();
+
+    expect(settings).toEqual({
+      enabled: true,
+      sharedPoolEnabled: true,
+      serverPersonalEnabled: true,
+      privateEnabled: true,
+      videoEnabled: true,
+      sharedPoolFeeCredits: 5,
+      maxRunningPerConnection: 3,
+      maxConcurrentPerSharedWorker: 6,
+      maxQueuedPerUser: 12,
+      maxQueuedPerTenantSharedPool: 40,
+      submitWindowPerUser: 20,
+      submitWindowPerTenant: 80,
+      minHermesVersion: "1.2.0",
+      sharedWorkerId: "worker-123",
+      webProcessWorkerEnabled: true,
+    });
+  });
+
+  it("a DB row value of \"false\" wins over the env var for webProcessWorkerEnabled", async () => {
+    process.env.SMARTSPEC_INLINE_HERMES_WORKER = "true";
+    const db = createDbMock([
+      { key: HERMES_WORKER_SETTINGS_KEYS.webProcessWorkerEnabled, value: "false" },
+    ]);
+    mockGetDb.mockResolvedValue(db);
+
+    const settings = await getHermesWorkerSettings();
+    expect(settings.webProcessWorkerEnabled).toBe(false);
+  });
+
+  it("falls back to defaults for malformed integer values without throwing", async () => {
+    const db = createDbMock([
+      { key: HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerUser, value: "not-a-number" },
+      { key: HERMES_WORKER_SETTINGS_KEYS.sharedPoolFeeCredits, value: "-5" },
+    ]);
+    mockGetDb.mockResolvedValue(db);
+
+    const settings = await getHermesWorkerSettings();
+    expect(settings.maxQueuedPerUser).toBe(8);
+    expect(settings.sharedPoolFeeCredits).toBe(0);
+  });
+
+  it("never throws when the DB read rejects — falls back to defaults", async () => {
+    mockGetDb.mockRejectedValue(new Error("db unavailable"));
+
+    await expect(getHermesWorkerSettings()).resolves.toMatchObject({
+      enabled: false,
+      maxRunningPerConnection: 1,
+    });
+  });
+
+  it("caches the result within the TTL window (only reads the DB once)", async () => {
+    const db = createDbMock([{ key: HERMES_WORKER_SETTINGS_KEYS.enabled, value: "true" }]);
+    mockGetDb.mockResolvedValue(db);
+
+    await getHermesWorkerSettings();
+    await getHermesWorkerSettings();
+    await getHermesWorkerSettings();
+
+    expect(mockGetDb).toHaveBeenCalledTimes(1);
+  });
+
+  it("clearHermesWorkerSettingsCache() forces a re-read on the next call", async () => {
+    const db1 = createDbMock([{ key: HERMES_WORKER_SETTINGS_KEYS.enabled, value: "true" }]);
+    mockGetDb.mockResolvedValueOnce(db1);
+    await expect(getHermesWorkerSettings()).resolves.toMatchObject({ enabled: true });
+
+    clearHermesWorkerSettingsCache();
+
+    const db2 = createDbMock([{ key: HERMES_WORKER_SETTINGS_KEYS.enabled, value: "false" }]);
+    mockGetDb.mockResolvedValueOnce(db2);
+    await expect(getHermesWorkerSettings()).resolves.toMatchObject({ enabled: false });
+
+    expect(mockGetDb).toHaveBeenCalledTimes(2);
+  });
+
+  it("de-dupes concurrent first calls into a single in-flight refresh", async () => {
+    const db = createDbMock([{ key: HERMES_WORKER_SETTINGS_KEYS.enabled, value: "true" }]);
+    mockGetDb.mockResolvedValue(db);
+
+    const [a, b, c] = await Promise.all([
+      getHermesWorkerSettings(),
+      getHermesWorkerSettings(),
+      getHermesWorkerSettings(),
+    ]);
+
+    expect(a).toEqual(b);
+    expect(b).toEqual(c);
+    expect(mockGetDb).toHaveBeenCalledTimes(1);
+  });
+});
diff --git a/apps/web/server/services/hermesWorkerSettings.ts b/apps/web/server/services/hermesWorkerSettings.ts
new file mode 100644
index 000000000..6057b47ba
--- /dev/null
+++ b/apps/web/server/services/hermesWorkerSettings.ts
@@ -0,0 +1,222 @@
+/**
+ * Feature 135 — Hermes Grok media worker admin settings. TTL-cached read of
+ * `system_settings` (`category="infrastructure"`, `key IN (...)`), modeled on
+ * `renderWorkerSettings.ts`'s cache-trio convention
+ * (`cachedValue`/`cacheExpiresAt`/`refreshPromise`, `CACHE_TTL_MS`, de-duped
+ * in-flight refresh). All keys are loaded in a single query.
+ *
+ * Namespace note: this is the `hermesMedia`/`hermes_media` namespace — it has
+ * nothing to do with the pre-existing agent-gateway Hermes lane's
+ * worker-queueing helper or its own tenant runtime flag. See
+ * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`, which
+ * enforces this at the file-content level.
+ *
+ * Parsing is defensive: booleans come from the literal string `"true"`,
+ * integers are parsed with `Number.parseInt` + `Number.isFinite` +
+ * non-negativity checks, and anything malformed silently falls back to the
+ * documented default — this loader never throws.
+ *
+ * The limit-coherence invariant (reject queued-cap < max batch size 4 at
+ * config WRITE time) is validated and enforced in section 05 — this reader
+ * only exposes the parsed values as-is.
+ */
+import { and, eq, inArray } from "drizzle-orm";
+
+import { systemSettings } from "../../drizzle/schema";
+import { getDb } from "../db";
+
+const CATEGORY = "infrastructure" as const;
+const CACHE_TTL_MS = 30_000;
+
+/** Setting key names — section 05's write-path validator and section 12's admin panel reference these same strings. */
+export const HERMES_WORKER_SETTINGS_KEYS = {
+  enabled: "hermes_worker_enabled",
+  sharedPoolEnabled: "hermes_worker_shared_pool_enabled",
+  serverPersonalEnabled: "hermes_worker_server_personal_enabled",
+  privateEnabled: "hermes_worker_private_enabled",
+  videoEnabled: "hermes_worker_video_enabled",
+  sharedPoolFeeCredits: "hermes_shared_pool_fee_credits",
+  maxRunningPerConnection: "hermes_max_running_per_connection",
+  maxConcurrentPerSharedWorker: "hermes_max_concurrent_per_shared_worker",
+  maxQueuedPerUser: "hermes_max_queued_per_user",
+  maxQueuedPerTenantSharedPool: "hermes_max_queued_per_tenant_shared_pool",
+  submitWindowPerUser: "hermes_submit_window_per_user",
+  submitWindowPerTenant: "hermes_submit_window_per_tenant",
+  minHermesVersion: "hermes_worker_min_version",
+  sharedWorkerId: "hermes_shared_worker_id",
+  webProcessWorkerEnabled: "web_process_hermes_worker_enabled",
+} as const;
+
+export interface HermesWorkerSettings {
+  enabled: boolean; // hermes_worker_enabled (default false — kill switch)
+  sharedPoolEnabled: boolean; // hermes_worker_shared_pool_enabled (false)
+  serverPersonalEnabled: boolean; // hermes_worker_server_personal_enabled (false)
+  privateEnabled: boolean; // hermes_worker_private_enabled (false)
+  videoEnabled: boolean; // hermes_worker_video_enabled (false)
+  sharedPoolFeeCredits: number; // hermes_shared_pool_fee_credits (0)
+  maxRunningPerConnection: number; // hermes_max_running_per_connection (1)
+  maxConcurrentPerSharedWorker: number; // hermes_max_concurrent_per_shared_worker (2)
+  maxQueuedPerUser: number; // hermes_max_queued_per_user (8)
+  maxQueuedPerTenantSharedPool: number; // hermes_max_queued_per_tenant_shared_pool (20)
+  submitWindowPerUser: number; // hermes_submit_window_per_user (10 / 10 min sliding)
+  submitWindowPerTenant: number; // hermes_submit_window_per_tenant (60 / 10 min sliding)
+  minHermesVersion: string; // hermes_worker_min_version ("" = no floor)
+  sharedWorkerId: string | null; // hermes_shared_worker_id (null until pairing script writes it)
+  webProcessWorkerEnabled: boolean; // web_process_hermes_worker_enabled (false; env fallback
+  //   SMARTSPEC_INLINE_HERMES_WORKER === "true", dev only)
+}
+
+const DEFAULT_HERMES_WORKER_SETTINGS: Omit<HermesWorkerSettings, "webProcessWorkerEnabled"> = {
+  enabled: false,
+  sharedPoolEnabled: false,
+  serverPersonalEnabled: false,
+  privateEnabled: false,
+  videoEnabled: false,
+  sharedPoolFeeCredits: 0,
+  maxRunningPerConnection: 1,
+  maxConcurrentPerSharedWorker: 2,
+  maxQueuedPerUser: 8,
+  maxQueuedPerTenantSharedPool: 20,
+  submitWindowPerUser: 10,
+  submitWindowPerTenant: 60,
+  minHermesVersion: "",
+  sharedWorkerId: null,
+};
+
+let cachedValue: HermesWorkerSettings | null = null;
+let cacheExpiresAt = 0;
+let refreshPromise: Promise<HermesWorkerSettings> | null = null;
+
+function readWebProcessWorkerEnvFallback(): boolean {
+  return process.env.SMARTSPEC_INLINE_HERMES_WORKER === "true";
+}
+
+function buildDefaults(): HermesWorkerSettings {
+  return {
+    ...DEFAULT_HERMES_WORKER_SETTINGS,
+    webProcessWorkerEnabled: readWebProcessWorkerEnvFallback(),
+  };
+}
+
+function parseBoolean(value: string | null | undefined, fallback: boolean): boolean {
+  if (value === undefined || value === null || value === "") return fallback;
+  return value === "true";
+}
+
+function parseNonNegativeInt(value: string | null | undefined, fallback: number): number {
+  if (value === undefined || value === null || value === "") return fallback;
+  const parsed = Number.parseInt(value, 10);
+  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
+  return parsed;
+}
+
+function parseStringSetting(value: string | null | undefined, fallback: string): string {
+  if (value === undefined || value === null) return fallback;
+  return value;
+}
+
+async function loadHermesWorkerSettings(): Promise<HermesWorkerSettings> {
+  try {
+    const db = await getDb();
+    if (!db) return buildDefaults();
+
+    const keys = Object.values(HERMES_WORKER_SETTINGS_KEYS);
+    const rows = await db
+      .select({ key: systemSettings.key, value: systemSettings.value })
+      .from(systemSettings)
+      .where(and(eq(systemSettings.category, CATEGORY), inArray(systemSettings.key, keys)));
+
+    const byKey = new Map(rows.map((row) => [row.key, row.value]));
+
+    const webProcessRaw = byKey.get(HERMES_WORKER_SETTINGS_KEYS.webProcessWorkerEnabled);
+    const webProcessWorkerEnabled =
+      webProcessRaw === undefined || webProcessRaw === null || webProcessRaw === ""
+        ? readWebProcessWorkerEnvFallback()
+        : webProcessRaw === "true";
+
+    return {
+      enabled: parseBoolean(byKey.get(HERMES_WORKER_SETTINGS_KEYS.enabled), DEFAULT_HERMES_WORKER_SETTINGS.enabled),
+      sharedPoolEnabled: parseBoolean(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.sharedPoolEnabled),
+        DEFAULT_HERMES_WORKER_SETTINGS.sharedPoolEnabled,
+      ),
+      serverPersonalEnabled: parseBoolean(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.serverPersonalEnabled),
+        DEFAULT_HERMES_WORKER_SETTINGS.serverPersonalEnabled,
+      ),
+      privateEnabled: parseBoolean(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.privateEnabled),
+        DEFAULT_HERMES_WORKER_SETTINGS.privateEnabled,
+      ),
+      videoEnabled: parseBoolean(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.videoEnabled),
+        DEFAULT_HERMES_WORKER_SETTINGS.videoEnabled,
+      ),
+      sharedPoolFeeCredits: parseNonNegativeInt(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.sharedPoolFeeCredits),
+        DEFAULT_HERMES_WORKER_SETTINGS.sharedPoolFeeCredits,
+      ),
+      maxRunningPerConnection: parseNonNegativeInt(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.maxRunningPerConnection),
+        DEFAULT_HERMES_WORKER_SETTINGS.maxRunningPerConnection,
+      ),
+      maxConcurrentPerSharedWorker: parseNonNegativeInt(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.maxConcurrentPerSharedWorker),
+        DEFAULT_HERMES_WORKER_SETTINGS.maxConcurrentPerSharedWorker,
+      ),
+      maxQueuedPerUser: parseNonNegativeInt(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerUser),
+        DEFAULT_HERMES_WORKER_SETTINGS.maxQueuedPerUser,
+      ),
+      maxQueuedPerTenantSharedPool: parseNonNegativeInt(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.maxQueuedPerTenantSharedPool),
+        DEFAULT_HERMES_WORKER_SETTINGS.maxQueuedPerTenantSharedPool,
+      ),
+      submitWindowPerUser: parseNonNegativeInt(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.submitWindowPerUser),
+        DEFAULT_HERMES_WORKER_SETTINGS.submitWindowPerUser,
+      ),
+      submitWindowPerTenant: parseNonNegativeInt(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.submitWindowPerTenant),
+        DEFAULT_HERMES_WORKER_SETTINGS.submitWindowPerTenant,
+      ),
+      minHermesVersion: parseStringSetting(
+        byKey.get(HERMES_WORKER_SETTINGS_KEYS.minHermesVersion),
+        DEFAULT_HERMES_WORKER_SETTINGS.minHermesVersion,
+      ),
+      sharedWorkerId: byKey.get(HERMES_WORKER_SETTINGS_KEYS.sharedWorkerId) || null,
+      webProcessWorkerEnabled,
+    };
+  } catch {
+    return buildDefaults();
+  }
+}
+
+/** TTL-cached (30s) Hermes worker settings, with a de-duped in-flight refresh. */
+export async function getHermesWorkerSettings(): Promise<HermesWorkerSettings> {
+  const now = Date.now();
+  if (cachedValue !== null && now < cacheExpiresAt) {
+    return cachedValue;
+  }
+  if (!refreshPromise) {
+    refreshPromise = loadHermesWorkerSettings()
+      .then((settings) => {
+        cachedValue = settings;
+        cacheExpiresAt = Date.now() + CACHE_TTL_MS;
+        return settings;
+      })
+      .finally(() => {
+        refreshPromise = null;
+      });
+  }
+  return refreshPromise;
+}
+
+/** Force the next `getHermesWorkerSettings()` call to re-read the DB — called by
+ *  the admin `systemSettings.updateSetting` cache-clear hook right after any
+ *  `hermes_*` / `web_process_hermes_worker_enabled` setting is written or cleared. */
+export function clearHermesWorkerSettingsCache(): void {
+  cachedValue = null;
+  cacheExpiresAt = 0;
+  refreshPromise = null;
+}
diff --git a/apps/web/shared/__tests__/hermesMedia.test.ts b/apps/web/shared/__tests__/hermesMedia.test.ts
new file mode 100644
index 000000000..2fea8ccf2
--- /dev/null
+++ b/apps/web/shared/__tests__/hermesMedia.test.ts
@@ -0,0 +1,268 @@
+import { describe, expect, it } from "vitest";
+
+import {
+  HERMES_MEDIA_ERROR_CODES,
+  effectiveHermesCapability,
+  formatHermesErrorMessage,
+  hermesErrorCopy,
+  hermesMediaJobContractSchema,
+  maskTokenLike,
+  parseHermesErrorMessage,
+  type HermesConnectionCapabilityManifest,
+} from "../hermesMedia";
+
+function buildReference(overrides: Partial<{
+  assetId: string;
+  index: number;
+  role: string;
+  label: string;
+  sha256: string;
+}> = {}) {
+  return {
+    assetId: "asset-1",
+    index: 1,
+    role: "subject",
+    label: "primary",
+    sha256: "a".repeat(64),
+    ...overrides,
+  };
+}
+
+function buildContract(overrides: Partial<Record<string, unknown>> = {}) {
+  return {
+    contractVersion: 1,
+    operation: "image.edit",
+    connectionId: "conn-1",
+    prompt: "a cinematic portrait",
+    settings: { model: "grok-imagine-image" },
+    references: [
+      buildReference({ index: 1, label: "primary" }),
+      buildReference({ index: 2, label: "secondary" }),
+      buildReference({ index: 3, label: "tertiary" }),
+    ],
+    traceId: "trace-1",
+    ...overrides,
+  };
+}
+
+describe("hermesMediaJobContractSchema", () => {
+  it("accepts a valid image.edit contract with 3 continuous, uniquely labeled references", () => {
+    const result = hermesMediaJobContractSchema.safeParse(buildContract());
+    expect(result.success).toBe(true);
+  });
+
+  it("rejects an image.edit contract with 4 references (operation-static max 3)", () => {
+    const result = hermesMediaJobContractSchema.safeParse(
+      buildContract({
+        references: [
+          buildReference({ index: 1, label: "a" }),
+          buildReference({ index: 2, label: "b" }),
+          buildReference({ index: 3, label: "c" }),
+          buildReference({ index: 4, label: "d" }),
+        ],
+      }),
+    );
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects video.image_to_video with 0 references (exactly 1 required)", () => {
+    const result = hermesMediaJobContractSchema.safeParse(
+      buildContract({
+        operation: "video.image_to_video",
+        settings: { model: "grok-imagine-video" },
+        references: [],
+      }),
+    );
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects video.image_to_video with 2 references (exactly 1 required)", () => {
+    const result = hermesMediaJobContractSchema.safeParse(
+      buildContract({
+        operation: "video.image_to_video",
+        settings: { model: "grok-imagine-video" },
+        references: [
+          buildReference({ index: 1, label: "a" }),
+          buildReference({ index: 2, label: "b" }),
+        ],
+      }),
+    );
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects references with non-continuous indices (e.g. 1, 3)", () => {
+    const result = hermesMediaJobContractSchema.safeParse(
+      buildContract({
+        references: [
+          buildReference({ index: 1, label: "a" }),
+          buildReference({ index: 3, label: "b" }),
+        ],
+      }),
+    );
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects two references with duplicate labels", () => {
+    const result = hermesMediaJobContractSchema.safeParse(
+      buildContract({
+        references: [
+          buildReference({ index: 1, label: "same" }),
+          buildReference({ index: 2, label: "same" }),
+        ],
+      }),
+    );
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects a reference containing an extra downloadUrl key (URL ban, .strict())", () => {
+    const result = hermesMediaJobContractSchema.safeParse(
+      buildContract({
+        references: [
+          { ...buildReference({ index: 1, label: "a" }), downloadUrl: "https://example.com/a.png" },
+        ],
+      }),
+    );
+    expect(result.success).toBe(false);
+  });
+
+  it("rejects an unknown operation string", () => {
+    const result = hermesMediaJobContractSchema.safeParse(
+      buildContract({ operation: "image.upscale" }),
+    );
+    expect(result.success).toBe(false);
+  });
+});
+
+describe("hermesErrorCopy", () => {
+  it("has non-empty th/en copy and a boolean retryable flag for every one of the 22 codes", () => {
+    expect(HERMES_MEDIA_ERROR_CODES.length).toBe(22);
+    for (const code of HERMES_MEDIA_ERROR_CODES) {
+      const copy = hermesErrorCopy(code);
+      expect(copy.th.length).toBeGreaterThan(0);
+      expect(copy.en.length).toBeGreaterThan(0);
+      expect(typeof copy.retryable).toBe("boolean");
+    }
+  });
+
+  it("matches spec §13.7 retryability for spot-checked codes", () => {
+    expect(hermesErrorCopy("HERMES_RATE_LIMITED").retryable).toBe(true);
+    expect(hermesErrorCopy("HERMES_ENTITLEMENT_RESTRICTED").retryable).toBe(false);
+    expect(hermesErrorCopy("HERMES_JOB_CANCELLED").retryable).toBe(false);
+  });
+
+  it("uses the exact spec §12.3 Thai copy for HERMES_ENTITLEMENT_RESTRICTED", () => {
+    expect(hermesErrorCopy("HERMES_ENTITLEMENT_RESTRICTED").th).toBe(
+      "เชื่อมต่อบัญชี Grok สำเร็จ แต่ xAI ยังไม่อนุญาตให้บัญชีนี้ใช้การสร้างสื่อผ่าน OAuth API กรุณาตรวจสอบระดับสมาชิก",
+    );
+  });
+
+  it("round-trips every error code through format/parse", () => {
+    for (const code of HERMES_MEDIA_ERROR_CODES) {
+      const formatted = formatHermesErrorMessage(code, "detail");
+      expect(parseHermesErrorMessage(formatted)).toBe(code);
+      expect(formatted.startsWith("[HERMES_")).toBe(true);
+      expect(formatted).toContain(hermesErrorCopy(code).en);
+    }
+  });
+
+  it("returns null for a plain, non-prefixed message", () => {
+    expect(parseHermesErrorMessage("Something went wrong")).toBeNull();
+  });
+});
+
+describe("effectiveHermesCapability", () => {
+  const baseManifest: HermesConnectionCapabilityManifest = {
+    hermesVersion: "1.0.0",
+    probedAt: new Date().toISOString(),
+    operations: {},
+    models: { image: [], video: [] },
+  };
+
+  it("takes the min(maxReferences) of the model row and the manifest (row lower)", () => {
+    const manifest: HermesConnectionCapabilityManifest = {
+      ...baseManifest,
+      operations: { "image.edit": { enabled: true, maxReferences: 7 } },
+    };
+    const result = effectiveHermesCapability({ enabled: true, maxReferences: 1 }, manifest, "image.edit");
+    expect(result.maxReferences).toBe(1);
+  });
+
+  it("takes the min(maxReferences) of the model row and the manifest (manifest lower)", () => {
+    const manifest: HermesConnectionCapabilityManifest = {
+      ...baseManifest,
+      operations: { "image.edit": { enabled: true, maxReferences: 1 } },
+    };
+    const result = effectiveHermesCapability({ enabled: true, maxReferences: 7 }, manifest, "image.edit");
+    expect(result.maxReferences).toBe(1);
+  });
+
+  it("disables the operation when the model row disables it, even if the manifest allows it", () => {
+    const manifest: HermesConnectionCapabilityManifest = {
+      ...baseManifest,
+      operations: { "image.edit": { enabled: true } },
+    };
+    const result = effectiveHermesCapability({ enabled: false }, manifest, "image.edit");
+    expect(result.enabled).toBe(false);
+  });
+
+  it("disables the operation when the manifest disables it and surfaces the manifest reason", () => {
+    const manifest: HermesConnectionCapabilityManifest = {
+      ...baseManifest,
+      operations: { "image.edit": { enabled: false, reason: "not entitled for this connection" } },
+    };
+    const result = effectiveHermesCapability({ enabled: true }, manifest, "image.edit");
+    expect(result.enabled).toBe(false);
+    expect(result.reason).toBe("not entitled for this connection");
+  });
+
+  it("a model-row value never widens a lower manifest value", () => {
+    const manifest: HermesConnectionCapabilityManifest = {
+      ...baseManifest,
+      operations: { "image.edit": { enabled: true, maxReferences: 1 } },
+    };
+    const result = effectiveHermesCapability({ enabled: true, maxReferences: 7 }, manifest, "image.edit");
+    expect(result.maxReferences).toBe(1);
+  });
+
+  it("falls back to the model row default when the manifest has no opinion on a field", () => {
+    const result = effectiveHermesCapability(
+      { enabled: true, maxReferences: 3, maxOutputs: 2 },
+      null,
+      "image.edit",
+    );
+    expect(result.enabled).toBe(true);
+    expect(result.maxReferences).toBe(3);
+    expect(result.maxOutputs).toBe(2);
+  });
+});
+
+describe("maskTokenLike", () => {
+  it("reveals only the first 4 characters plus a fixed ellipsis mask for values 8+ chars long", () => {
+    expect(maskTokenLike("sk-abc123456789")).toBe("sk-a…");
+  });
+
+  it("reveals only the first 4 characters for a value that is exactly 8 characters long", () => {
+    const value = "12345678";
+    expect(value.length).toBe(8);
+    const masked = maskTokenLike(value);
+    expect(masked).toBe("1234…");
+    expect(masked.replace("…", "")).toBe(value.slice(0, 4));
+  });
+
+  it("fully masks a value shorter than 8 characters (never partially reveals it)", () => {
+    const value = "1234567";
+    expect(value.length).toBe(7);
+    const masked = maskTokenLike(value);
+    expect(masked).toBe("***");
+    expect(masked).not.toContain(value);
+  });
+
+  it("fully masks an empty string safely", () => {
+    expect(maskTokenLike("")).toBe("***");
+  });
+
+  it("fully masks null/undefined safely", () => {
+    expect(maskTokenLike(null)).toBe("***");
+    expect(maskTokenLike(undefined)).toBe("***");
+  });
+});
diff --git a/apps/web/shared/__tests__/hermesMediaTransport.test.ts b/apps/web/shared/__tests__/hermesMediaTransport.test.ts
new file mode 100644
index 000000000..679ff9d48
--- /dev/null
+++ b/apps/web/shared/__tests__/hermesMediaTransport.test.ts
@@ -0,0 +1,66 @@
+import { describe, expect, it } from "vitest";
+
+import {
+  getMediaModelTransportLabel,
+  resolveMediaModelTransportConfig,
+} from "../mediaModelTransport";
+
+describe("hermes_worker transport resolution (Feature 135)", () => {
+  it("resolves the hermes_worker transport arm from configJson", () => {
+    const config = resolveMediaModelTransportConfig({
+      provider: "xai",
+      modelId: "grok-imagine-image",
+      configJson: {
+        transport: "hermes_worker",
+        hermes: { providerType: "xai_grok", providerModelId: "grok-imagine-image" },
+      },
+    });
+
+    expect(config).toEqual({
+      transport: "hermes_worker",
+      providerKey: "hermes-grok",
+      providerModelId: "grok-imagine-image",
+      toolName: undefined,
+      argumentShape: undefined,
+      defaultParams: {},
+      creditSource: "provider_account",
+    });
+  });
+
+  it("returns a distinct label for the hermes arm", () => {
+    expect(
+      getMediaModelTransportLabel({ transport: "hermes_worker", creditSource: "provider_account" }),
+    ).toBe("Hermes");
+  });
+
+  it("regression: an existing mcp fixture still resolves to mcp / provider_account", () => {
+    const config = resolveMediaModelTransportConfig({
+      configJson: {
+        transport: "mcp",
+        mcp: {
+          providerKey: "magnific",
+          providerModelId: "magnific-upscale",
+          toolName: "upscale",
+          argumentShape: "flat",
+        },
+      },
+    });
+
+    expect(config.transport).toBe("mcp");
+    expect(config.creditSource).toBe("provider_account");
+    expect(config.providerKey).toBe("magnific");
+    expect(getMediaModelTransportLabel(config)).toBe("MCP");
+  });
+
+  it("regression: a plain/absent transport still resolves to gateway_api / smartspec_credits", () => {
+    const config = resolveMediaModelTransportConfig({
+      provider: "kie",
+      modelId: "some-model",
+      configJson: {},
+    });
+
+    expect(config.transport).toBe("gateway_api");
+    expect(config.creditSource).toBe("smartspec_credits");
+    expect(getMediaModelTransportLabel(config)).toBe("API");
+  });
+});
diff --git a/apps/web/shared/__tests__/hermesMediaWorkerFeatureFlag.test.ts b/apps/web/shared/__tests__/hermesMediaWorkerFeatureFlag.test.ts
new file mode 100644
index 000000000..526abddf6
--- /dev/null
+++ b/apps/web/shared/__tests__/hermesMediaWorkerFeatureFlag.test.ts
@@ -0,0 +1,18 @@
+import { describe, expect, it } from "vitest";
+
+import { ALLOWED_FEATURE_FLAGS, FEATURE_FLAG_DEFAULTS } from "../featureFlags";
+
+describe("hermesMediaWorker feature flag (Feature 135)", () => {
+  it("is allowlisted, typed, and defaults to false", () => {
+    expect(ALLOWED_FEATURE_FLAGS.has("hermesMediaWorker")).toBe(true);
+    expect(FEATURE_FLAG_DEFAULTS.hermesMediaWorker).toBe(false);
+  });
+
+  it("is a distinct key from hermesAgentRuntime (guard against accidental rename/merge)", () => {
+    expect(ALLOWED_FEATURE_FLAGS.has("hermesAgentRuntime")).toBe(true);
+    expect(ALLOWED_FEATURE_FLAGS.has("hermesMediaWorker")).toBe(true);
+    expect("hermesMediaWorker").not.toBe("hermesAgentRuntime");
+    expect(FEATURE_FLAG_DEFAULTS.hermesAgentRuntime).toBe(false);
+    expect(FEATURE_FLAG_DEFAULTS.hermesMediaWorker).toBe(false);
+  });
+});
diff --git a/apps/web/shared/__tests__/hermesMediaWorkerRuntimeConstants.test.ts b/apps/web/shared/__tests__/hermesMediaWorkerRuntimeConstants.test.ts
new file mode 100644
index 000000000..eeb392c96
--- /dev/null
+++ b/apps/web/shared/__tests__/hermesMediaWorkerRuntimeConstants.test.ts
@@ -0,0 +1,48 @@
+import { describe, expect, it } from "vitest";
+
+import {
+  HERMES_CONNECTION_AUTH_JOB_TYPE,
+  HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
+  HERMES_CONNECTION_PROBE_JOB_TYPE,
+  HERMES_MEDIA_CAPABILITY_FAMILIES,
+  HERMES_MEDIA_IMAGE_JOB_TYPE,
+  HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY,
+  HERMES_MEDIA_VIDEO_JOB_TYPE,
+} from "../workerRuntime";
+import * as workerRuntime from "../workerRuntime";
+
+describe("Feature 135 Hermes media worker runtime constants", () => {
+  it("freezes the exact wire values for every job type and capability constant", () => {
+    expect(HERMES_MEDIA_IMAGE_JOB_TYPE).toBe("hermes_media_image_generate");
+    expect(HERMES_MEDIA_VIDEO_JOB_TYPE).toBe("hermes_media_video_generate");
+    expect(HERMES_CONNECTION_AUTH_JOB_TYPE).toBe("hermes_connection_authorize");
+    expect(HERMES_CONNECTION_PROBE_JOB_TYPE).toBe("hermes_connection_probe");
+    expect(HERMES_CONNECTION_DISCONNECT_JOB_TYPE).toBe("hermes_connection_disconnect");
+    expect(HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY).toBe("hermes_media");
+    expect(HERMES_MEDIA_CAPABILITY_FAMILIES).toEqual(["hermes-media-generation"]);
+  });
+
+  it("does not collide with any existing job-type constant exported from workerRuntime.ts", () => {
+    const hermesMediaJobTypes: readonly string[] = [
+      HERMES_MEDIA_IMAGE_JOB_TYPE,
+      HERMES_MEDIA_VIDEO_JOB_TYPE,
+      HERMES_CONNECTION_AUTH_JOB_TYPE,
+      HERMES_CONNECTION_PROBE_JOB_TYPE,
+      HERMES_CONNECTION_DISCONNECT_JOB_TYPE,
+    ];
+
+    const allJobTypeConstantValues = Object.entries(workerRuntime)
+      .filter(([name, value]) => name.endsWith("_JOB_TYPE") && typeof value === "string")
+      .map(([, value]) => value as string);
+
+    const otherJobTypeConstants = allJobTypeConstantValues.filter(
+      (value) => !hermesMediaJobTypes.includes(value),
+    );
+
+    expect(otherJobTypeConstants).toContain("vertical_drama_ffmpeg_assembly");
+    for (const hermesJobType of hermesMediaJobTypes) {
+      expect(otherJobTypeConstants).not.toContain(hermesJobType);
+    }
+    expect(allJobTypeConstantValues).not.toContain("external_agent_task");
+  });
+});
diff --git a/apps/web/shared/featureFlags.ts b/apps/web/shared/featureFlags.ts
index ec7e7699c..de50212b7 100644
--- a/apps/web/shared/featureFlags.ts
+++ b/apps/web/shared/featureFlags.ts
@@ -56,6 +56,7 @@ export interface TenantFeatureFlags {
   nemoClawSecureWorkerPool: boolean; // F48 — NemoClaw secure worker pools
   hiClawClusterRuntime: boolean; // F49 — HiClaw collaborative cluster runtime
   hermesAgentRuntime: boolean; // F50 — Hermes bridge-backed external runtime foundation
+  hermesMediaWorker: boolean; // F135 — Hermes Grok media worker; unrelated to hermesAgentRuntime
   desktopHostEnabled: boolean; // F51 — Unified Desktop Host control plane
   desktopAdvancedLocalMode: boolean; // F52 — Step-up desktop local power
   desktopPackageSync: boolean; // F53 — Signed desktop package sync and materialization
@@ -264,6 +265,7 @@ export const ALLOWED_FEATURE_FLAGS: ReadonlySet<string> = new Set<TenantFeatureF
   "nemoClawSecureWorkerPool",
   "hiClawClusterRuntime",
   "hermesAgentRuntime",
+  "hermesMediaWorker",
   "desktopHostEnabled",
   "desktopAdvancedLocalMode",
   "desktopPackageSync",
@@ -471,6 +473,7 @@ export const FEATURE_FLAG_DEFAULTS: Readonly<TenantFeatureFlags> = {
   nemoClawSecureWorkerPool: false, // Secure sandbox pools are explicitly admin-gated
   hiClawClusterRuntime: false, // Collaborative cluster runtime is explicitly admin-gated
   hermesAgentRuntime: false, // Hermes bridge-backed runtime stays disabled until rollout and policy surfaces are ready
+  hermesMediaWorker: false, // F135 — Hermes Grok media worker stays disabled until rollout is ready (unrelated to hermesAgentRuntime)
   desktopHostEnabled: false, // Desktop Host control plane rollout is explicit and fail-closed
   desktopAdvancedLocalMode: false, // High-power local mode requires explicit tenant opt-in
   desktopPackageSync: false, // Signed package sync stays disabled until registry/policy is ready
diff --git a/apps/web/shared/hermesMedia.ts b/apps/web/shared/hermesMedia.ts
new file mode 100644
index 000000000..2b145cde5
--- /dev/null
+++ b/apps/web/shared/hermesMedia.ts
@@ -0,0 +1,385 @@
+/**
+ * Feature 135 — Hermes Grok media worker: shared contracts and constants.
+ *
+ * Single source of truth for the job contract, connection capability
+ * manifest, typed error codes/copy, and the capability-intersection helper.
+ * This module is deliberately dependency-free besides `zod` — it must stay
+ * importable by the client, the web server, and the section-07 shared
+ * worker process (no `db`/server imports here, ever).
+ *
+ * Namespace note: this feature (`hermesMedia` / `hermes_media`) is UNRELATED
+ * to the pre-existing agent-gateway Hermes lane (its worker-queueing helper
+ * in `server/services/workerSchedulerService.ts`, its own tenant runtime
+ * flag, and job type `external_agent_task`). This file intentionally does
+ * not reference any of those unrelated symbols by name — see
+ * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`, which
+ * enforces this at the file-content level.
+ */
+import { z } from "zod";
+
+/** Provider-neutral operation taxonomy (spec §13.1). */
+export const HERMES_MEDIA_OPERATIONS = [
+  "image.generate",
+  "image.edit",
+  "video.generate",
+  "video.image_to_video",
+  "video.reference_to_video",
+] as const;
+
+export type HermesMediaOperation = (typeof HERMES_MEDIA_OPERATIONS)[number];
+
+/**
+ * Operation-static reference bounds (spec §13.1). The per-connection
+ * capability manifest may narrow these bounds further (see
+ * `effectiveHermesCapability`), but it may never widen them.
+ */
+export const HERMES_OPERATION_REFERENCE_BOUNDS: Record<
+  HermesMediaOperation,
+  { min: number; max: number }
+> = {
+  "image.generate": { min: 0, max: 0 },
+  "image.edit": { min: 1, max: 3 },
+  "video.generate": { min: 0, max: 0 },
+  "video.image_to_video": { min: 1, max: 1 },
+  "video.reference_to_video": { min: 1, max: 7 },
+};
+
+/**
+ * Reference schema is `.strict()` — this is the URL ban (spec §13.1
+ * claim-time-minting rule). Any extra key (e.g. `downloadUrl`, `url`) must be
+ * a hard parse failure so a reference can never carry a pre-resolved URL at
+ * rest; URLs are minted fresh at claim time by the section-08/09 resolver.
+ */
+export const hermesMediaReferenceSchema = z
+  .object({
+    assetId: z.string().min(1),
+    index: z.number().int().positive(),
+    role: z.string().min(1),
+    label: z.string().min(1),
+    sha256: z.string().length(64),
+  })
+  .strict();
+
+export type HermesMediaReference = z.infer<typeof hermesMediaReferenceSchema>;
+
+function validateHermesMediaReferences(
+  data: { operation: HermesMediaOperation; references: HermesMediaReference[] },
+  ctx: z.RefinementCtx,
+): void {
+  const bounds = HERMES_OPERATION_REFERENCE_BOUNDS[data.operation];
+  const refs = data.references;
+
+  if (refs.length < bounds.min || refs.length > bounds.max) {
+    ctx.addIssue({
+      code: z.ZodIssueCode.custom,
+      path: ["references"],
+      message: `operation "${data.operation}" requires between ${bounds.min} and ${bounds.max} references (received ${refs.length})`,
+    });
+    return;
+  }
+
+  if (refs.length === 0) return;
+
+  const indices = refs.map((ref) => ref.index);
+  const sortedIndices = [...indices].sort((a, b) => a - b);
+  const isContinuousFromOne = sortedIndices.every((value, position) => value === position + 1);
+  if (!isContinuousFromOne) {
+    ctx.addIssue({
+      code: z.ZodIssueCode.custom,
+      path: ["references"],
+      message: "reference indices must be continuous starting at 1",
+    });
+  }
+
+  if (new Set(indices).size !== indices.length) {
+    ctx.addIssue({
+      code: z.ZodIssueCode.custom,
+      path: ["references"],
+      message: "reference indices must be unique",
+    });
+  }
+
+  const labels = refs.map((ref) => ref.label);
+  if (new Set(labels).size !== labels.length) {
+    ctx.addIssue({
+      code: z.ZodIssueCode.custom,
+      path: ["references"],
+      message: "reference labels must be unique",
+    });
+  }
+}
+
+export const hermesMediaJobContractSchema = z
+  .object({
+    contractVersion: z.literal(1),
+    operation: z.enum(HERMES_MEDIA_OPERATIONS),
+    connectionId: z.string().min(1),
+    prompt: z.string().min(1),
+    settings: z
+      .object({
+        model: z.string().min(1),
+        aspectRatio: z.string().optional(),
+        resolution: z.string().optional(),
+        outputCount: z.number().int().min(1).max(4).optional(),
+        durationSeconds: z.number().int().positive().nullable().optional(),
+      })
+      .strict(),
+    references: z.array(hermesMediaReferenceSchema),
+    entity: z.object({ type: z.string(), id: z.string() }).passthrough().optional(),
+    storage: z.object({ libraryFolderId: z.string().optional() }).strict().optional(),
+    traceId: z.string().min(1),
+  })
+  .strict()
+  .superRefine(validateHermesMediaReferences);
+
+export type HermesMediaJobContract = z.infer<typeof hermesMediaJobContractSchema>;
+
+/** Capability manifest stored in `hermes_provider_connections.capabilitiesJson` (spec §12.2). */
+export interface HermesConnectionCapabilityManifest {
+  hermesVersion: string;
+  probedAt: string;
+  operations: Partial<
+    Record<
+      HermesMediaOperation,
+      {
+        enabled: boolean;
+        maxReferences?: number;
+        maxOutputs?: number;
+        reason?: string;
+      }
+    >
+  >;
+  models: { image: string[]; video: string[] };
+}
+
+/** Exactly the 22 codes of spec §13.7, in table order. */
+export const HERMES_MEDIA_ERROR_CODES = [
+  "HERMES_DISABLED",
+  "HERMES_CONNECTION_REQUIRED",
+  "HERMES_CONNECTION_BUSY",
+  "HERMES_WORKER_UNAVAILABLE",
+  "HERMES_RATE_LIMITED",
+  "HERMES_QUEUE_FULL",
+  "HERMES_QUOTA_EXHAUSTED",
+  "HERMES_OAUTH_SESSION_EXPIRED",
+  "HERMES_OAUTH_DENIED",
+  "HERMES_REAUTH_REQUIRED",
+  "HERMES_ENTITLEMENT_RESTRICTED",
+  "HERMES_OPERATION_UNSUPPORTED",
+  "HERMES_REFERENCE_LIMIT_EXCEEDED",
+  "HERMES_REFERENCE_MAPPING_CONFLICT",
+  "HERMES_REFERENCE_DOWNLOAD_FAILED",
+  "HERMES_PROCESS_FAILED",
+  "HERMES_TIMEOUT",
+  "HERMES_RESULT_INVALID",
+  "HERMES_OUTPUT_INVALID",
+  "HERMES_UPLOAD_FAILED",
+  "HERMES_LIBRARY_REGISTRATION_FAILED",
+  "HERMES_JOB_CANCELLED",
+] as const;
+
+export type HermesMediaErrorCode = (typeof HERMES_MEDIA_ERROR_CODES)[number];
+
+/** Codes that are safe to retry automatically (spec §13.7). All other codes are not retryable. */
+const HERMES_RETRYABLE_ERROR_CODES: ReadonlySet<HermesMediaErrorCode> = new Set([
+  "HERMES_CONNECTION_BUSY",
+  "HERMES_RATE_LIMITED",
+  "HERMES_QUEUE_FULL",
+  "HERMES_REFERENCE_DOWNLOAD_FAILED",
+  "HERMES_PROCESS_FAILED",
+  "HERMES_TIMEOUT",
+  "HERMES_RESULT_INVALID",
+  "HERMES_UPLOAD_FAILED",
+  "HERMES_LIBRARY_REGISTRATION_FAILED",
+]);
+
+interface HermesErrorCopyEntry {
+  th: string;
+  en: string;
+}
+
+/** Thai-primary + English copy per spec §13.7. Keep messages user-safe — no paths/tokens/internal ids. */
+const HERMES_ERROR_COPY: Record<HermesMediaErrorCode, HermesErrorCopyEntry> = {
+  HERMES_DISABLED: {
+    th: "ระบบ Hermes Grok media worker ถูกปิดใช้งานอยู่ในขณะนี้",
+    en: "Hermes Grok media worker is currently disabled.",
+  },
+  HERMES_CONNECTION_REQUIRED: {
+    th: "กรุณาเชื่อมต่อบัญชี Grok ก่อนสร้างสื่อ",
+    en: "Connect your Grok account before generating media.",
+  },
+  HERMES_CONNECTION_BUSY: {
+    th: "การเชื่อมต่อ Grok นี้กำลังประมวลผลงานอื่นอยู่ กรุณาลองใหม่อีกครั้ง",
+    en: "This Grok connection is currently busy with another job. Please try again.",
+  },
+  HERMES_WORKER_UNAVAILABLE: {
+    th: "ไม่มี worker ที่พร้อมใช้งานสำหรับ Hermes ในขณะนี้",
+    en: "No Hermes worker is currently available.",
+  },
+  HERMES_RATE_LIMITED: {
+    th: "ถูกจำกัดอัตราการส่งคำขอ กรุณาลองใหม่ภายหลัง",
+    en: "Request rate limited. Please try again shortly.",
+  },
+  HERMES_QUEUE_FULL: {
+    th: "คิวงานเต็มในขณะนี้ กรุณาลองใหม่ภายหลัง",
+    en: "The job queue is currently full. Please try again later.",
+  },
+  HERMES_QUOTA_EXHAUSTED: {
+    th: "โควต้าการใช้งานหมดแล้ว",
+    en: "Usage quota has been exhausted.",
+  },
+  HERMES_OAUTH_SESSION_EXPIRED: {
+    th: "เซสชัน OAuth หมดอายุ กรุณาเชื่อมต่อบัญชีใหม่",
+    en: "The OAuth session has expired. Please reconnect your account.",
+  },
+  HERMES_OAUTH_DENIED: {
+    th: "การอนุญาต OAuth ถูกปฏิเสธ",
+    en: "OAuth authorization was denied.",
+  },
+  HERMES_REAUTH_REQUIRED: {
+    th: "จำเป็นต้องเชื่อมต่อบัญชีใหม่อีกครั้ง",
+    en: "Re-authorization is required for this connection.",
+  },
+  HERMES_ENTITLEMENT_RESTRICTED: {
+    th: "เชื่อมต่อบัญชี Grok สำเร็จ แต่ xAI ยังไม่อนุญาตให้บัญชีนี้ใช้การสร้างสื่อผ่าน OAuth API กรุณาตรวจสอบระดับสมาชิก",
+    en: "Grok account connected successfully, but xAI has not authorized this account for OAuth API media generation. Please check your membership tier.",
+  },
+  HERMES_OPERATION_UNSUPPORTED: {
+    th: "การดำเนินการนี้ไม่รองรับสำหรับบัญชีหรือรุ่นที่เลือก",
+    en: "This operation is not supported for the selected account or model.",
+  },
+  HERMES_REFERENCE_LIMIT_EXCEEDED: {
+    th: "จำนวนภาพอ้างอิงเกินขีดจำกัดที่อนุญาต",
+    en: "The number of reference images exceeds the allowed limit.",
+  },
+  HERMES_REFERENCE_MAPPING_CONFLICT: {
+    th: "การจับคู่ภาพอ้างอิงขัดแย้งกัน",
+    en: "Reference image mapping conflict detected.",
+  },
+  HERMES_REFERENCE_DOWNLOAD_FAILED: {
+    th: "ดาวน์โหลดภาพอ้างอิงไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
+    en: "Failed to download a reference image. Please try again.",
+  },
+  HERMES_PROCESS_FAILED: {
+    th: "การประมวลผลของ Hermes ล้มเหลว กรุณาลองใหม่อีกครั้ง",
+    en: "Hermes processing failed. Please try again.",
+  },
+  HERMES_TIMEOUT: {
+    th: "การประมวลผลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง",
+    en: "Processing timed out. Please try again.",
+  },
+  HERMES_RESULT_INVALID: {
+    th: "ผลลัพธ์ที่ได้รับไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
+    en: "The result received was invalid. Please try again.",
+  },
+  HERMES_OUTPUT_INVALID: {
+    th: "ไฟล์ผลลัพธ์ไม่ถูกต้องหรือไม่สามารถใช้งานได้",
+    en: "The output file is invalid or unusable.",
+  },
+  HERMES_UPLOAD_FAILED: {
+    th: "อัปโหลดผลลัพธ์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
+    en: "Failed to upload the result. Please try again.",
+  },
+  HERMES_LIBRARY_REGISTRATION_FAILED: {
+    th: "ลงทะเบียนไฟล์ในคลังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
+    en: "Failed to register the file in the library. Please try again.",
+  },
+  HERMES_JOB_CANCELLED: {
+    th: "งานถูกยกเลิก",
+    en: "The job was cancelled.",
+  },
+};
+
+/** Thai-primary + English copy and retryability per spec §13.7. */
+export function hermesErrorCopy(
+  code: HermesMediaErrorCode,
+): { th: string; en: string; retryable: boolean } {
+  const copy = HERMES_ERROR_COPY[code];
+  return {
+    th: copy.th,
+    en: copy.en,
+    retryable: HERMES_RETRYABLE_ERROR_CODES.has(code),
+  };
+}
+
+const HERMES_ERROR_MESSAGE_PATTERN = /^\[(HERMES_[A-Z_]+)\]/;
+
+/**
+ * THE canonical error-code wire convention (pure string helpers — this file
+ * must stay importable by the client, so no `@trpc/server` import here).
+ * Server sections (03/05/08/09) throw
+ * `new TRPCError({ code: <httpish>, message: formatHermesErrorMessage(code, detail?) })`
+ * — i.e. message = `[HERMES_X] <english copy>[ — detail]`. A TRPCError's
+ * `cause` does NOT serialize to the client, so the message prefix is the
+ * one zero-infrastructure channel; section-10's `extractHermesErrorCode`
+ * parses it back with `parseHermesErrorMessage`. Never hand-format codes.
+ */
+export function formatHermesErrorMessage(code: HermesMediaErrorCode, detail?: string): string {
+  const { en } = hermesErrorCopy(code);
+  const base = `[${code}] ${en}`;
+  const trimmedDetail = detail?.trim();
+  return trimmedDetail ? `${base} — ${trimmedDetail}` : base;
+}
+
+export function parseHermesErrorMessage(message: string): HermesMediaErrorCode | null {
+  const match = HERMES_ERROR_MESSAGE_PATTERN.exec(message);
+  if (!match) return null;
+  const candidate = match[1];
+  return (HERMES_MEDIA_ERROR_CODES as readonly string[]).includes(candidate)
+    ? (candidate as HermesMediaErrorCode)
+    : null;
+}
+
+function minDefined(a?: number, b?: number): number | undefined {
+  if (a === undefined) return b;
+  if (b === undefined) return a;
+  return Math.min(a, b);
+}
+
+/**
+ * Effective capability = intersection of the global media_models row and the
+ * per-connection manifest (spec §12.2 rule): enabled = row AND manifest;
+ * numeric limits = min(row, manifest); row supplies defaults only when the
+ * manifest has no opinion. Used by the section-05 submit validator, the
+ * section-09 reference trimmer, and the section-10/13 client forms.
+ */
+export function effectiveHermesCapability(
+  modelRow: { enabled?: boolean; maxReferences?: number; maxOutputs?: number },
+  manifest: HermesConnectionCapabilityManifest | null | undefined,
+  operation: HermesMediaOperation,
+): { enabled: boolean; maxReferences?: number; maxOutputs?: number; reason?: string } {
+  const manifestOperation = manifest?.operations?.[operation];
+
+  const rowEnabled = modelRow.enabled !== false;
+  const manifestEnabled = manifestOperation ? manifestOperation.enabled !== false : true;
+  const enabled = rowEnabled && manifestEnabled;
+
+  const maxReferences = minDefined(modelRow.maxReferences, manifestOperation?.maxReferences);
+  const maxOutputs = minDefined(modelRow.maxOutputs, manifestOperation?.maxOutputs);
+
+  const result: { enabled: boolean; maxReferences?: number; maxOutputs?: number; reason?: string } = {
+    enabled,
+  };
+  if (maxReferences !== undefined) result.maxReferences = maxReferences;
+  if (maxOutputs !== undefined) result.maxOutputs = maxOutputs;
+  if (manifestOperation?.reason) result.reason = manifestOperation.reason;
+  return result;
+}
+
+/**
+ * Masks a token-like secret for safe display/logging. This is its own
+ * convention (not the same threshold/reveal rule as `maskApiKey` in
+ * `server/routers/infrastructure.ts`, which reveals first+last 4 chars for
+ * values 12+ chars long): values of 8 or more characters keep only their
+ * first 4 characters, followed by a fixed ellipsis mask ("…") — never more
+ * than 4 original characters are ever revealed. Anything shorter than 8
+ * characters (including empty/null/undefined) is fully masked to a fixed
+ * `"***"` string with zero original characters revealed.
+ */
+export function maskTokenLike(value: string | null | undefined): string {
+  if (!value) return "***";
+  if (value.length >= 8) {
+    return `${value.slice(0, 4)}…`;
+  }
+  return "***";
+}
diff --git a/apps/web/shared/mcpConnectTypes.ts b/apps/web/shared/mcpConnectTypes.ts
index 6fe557c11..e5f04e60c 100644
--- a/apps/web/shared/mcpConnectTypes.ts
+++ b/apps/web/shared/mcpConnectTypes.ts
@@ -1,4 +1,9 @@
-export type MediaTransport = "gateway_api" | "mcp";
+// Feature 135 — Hermes Grok media worker adds a third transport arm,
+// `hermes_worker`. This widening is intentionally additive/dark: existing
+// `gateway_api`/`mcp` resolution stays byte-identical (see
+// `shared/mediaModelTransport.ts`). The routing/validation behavior for the
+// new arm belongs to later sections (08+), not this one.
+export type MediaTransport = "gateway_api" | "mcp" | "hermes_worker";
 export type MediaAssetType = "image" | "video";
 export type MediaOriginSurface =
   | "media_studio"
diff --git a/apps/web/shared/mediaModelTransport.ts b/apps/web/shared/mediaModelTransport.ts
index 6b45413b1..290b24b23 100644
--- a/apps/web/shared/mediaModelTransport.ts
+++ b/apps/web/shared/mediaModelTransport.ts
@@ -35,14 +35,22 @@ export function resolveMediaModelTransportConfig(input: {
 }): MediaModelTransportConfig {
   const config = asRecord(input.configJson);
   const mcp = asRecord(config.mcp);
+  // Feature 135 — Hermes Grok media worker transport arm. Reading `config.hermes`
+  // here is additive/dark: existing mcp/gateway resolution below is untouched.
+  const hermes = asRecord(config.hermes);
   const rawTransport = asString(config.transport) ?? asString(config.mediaTransport);
-  const transport: MediaTransport = rawTransport === "mcp" ? "mcp" : "gateway_api";
+  const transport: MediaTransport =
+    rawTransport === "hermes_worker" ? "hermes_worker" : rawTransport === "mcp" ? "mcp" : "gateway_api";
+
   const providerKey =
-    asString(mcp.providerKey) ??
-    asString(config.providerKey) ??
-    asString(config.provider) ??
-    asString(input.provider);
+    transport === "hermes_worker"
+      ? "hermes-grok"
+      : asString(mcp.providerKey) ??
+        asString(config.providerKey) ??
+        asString(config.provider) ??
+        asString(input.provider);
   const providerModelId =
+    (transport === "hermes_worker" ? asString(hermes.providerModelId) : undefined) ??
     asString(mcp.providerModelId) ??
     asString(config.providerModelId) ??
     asString(config.kieModelId) ??
@@ -55,10 +63,12 @@ export function resolveMediaModelTransportConfig(input: {
     toolName: asString(mcp.toolName) ?? asString(config.mcpToolName),
     argumentShape: asString(mcp.argumentShape) ?? asString(config.mcpArgumentShape),
     defaultParams: asRecord(mcp.defaultParams),
-    creditSource: transport === "mcp" ? "provider_account" : "smartspec_credits",
+    creditSource:
+      transport === "mcp" || transport === "hermes_worker" ? "provider_account" : "smartspec_credits",
   };
 }
 
 export function getMediaModelTransportLabel(config: MediaModelTransportConfig): string {
+  if (config.transport === "hermes_worker") return "Hermes";
   return config.transport === "mcp" ? "MCP" : "API";
 }
diff --git a/apps/web/shared/workerRuntime.ts b/apps/web/shared/workerRuntime.ts
index 43e22fff7..05f19b9e5 100644
--- a/apps/web/shared/workerRuntime.ts
+++ b/apps/web/shared/workerRuntime.ts
@@ -2028,4 +2028,30 @@ export type ComfyImageGenerationJobContract = z.infer<typeof comfyImageGeneratio
 export type ComfyWorkflowRunJobContract = z.infer<typeof comfyWorkflowRunJobContractSchema>;
 export type LocalAiProviderConfig = z.infer<typeof localAiProviderConfigSchema>;
 export type LocalAiWorkerJobContract = z.infer<typeof localAiWorkerJobContractSchema>;
+
+/**
+ * Feature 135 — Hermes Grok media worker (namespace: `hermes_media` /
+ * `hermesMedia`). NOT related to the pre-existing agent-gateway Hermes lane
+ * (`queueHermesWorkerJob`, tenant flag `hermesAgentRuntime`, job type
+ * `external_agent_task` — all in `server/services/workerSchedulerService.ts`
+ * / `shared/featureFlags.ts`). See
+ * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts` for the
+ * grep-style guard that enforces this separation across the whole feature.
+ *
+ * `HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY` follows the same claim-capability
+ * precedent as the Remotion render worker (`REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES`
+ * above): section 05 wires it into `claimWorkerJob` so only a worker that
+ * declares the `hermes_media` capability (and the `hermes-media-generation`
+ * family) can claim these five job types.
+ */
+export const HERMES_MEDIA_IMAGE_JOB_TYPE = "hermes_media_image_generate" as const;
+export const HERMES_MEDIA_VIDEO_JOB_TYPE = "hermes_media_video_generate" as const;
+export const HERMES_CONNECTION_AUTH_JOB_TYPE = "hermes_connection_authorize" as const;
+export const HERMES_CONNECTION_PROBE_JOB_TYPE = "hermes_connection_probe" as const;
+export const HERMES_CONNECTION_DISCONNECT_JOB_TYPE = "hermes_connection_disconnect" as const;
+export const HERMES_MEDIA_REQUIRED_CLAIM_CAPABILITY = "hermes_media" as const;
+export const HERMES_MEDIA_CAPABILITY_FAMILIES = ["hermes-media-generation"] as const;
+
+export type HermesMediaCapabilityFamily = (typeof HERMES_MEDIA_CAPABILITY_FAMILIES)[number];
+export const hermesMediaCapabilityFamilySchema = z.enum(HERMES_MEDIA_CAPABILITY_FAMILIES);
 export type McpWorkerCompletionPayload = z.infer<typeof mcpWorkerCompletionPayloadSchema>;
