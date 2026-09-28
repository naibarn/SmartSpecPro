diff --git a/apps/web/client/src/components/admin/HermesWorkerAdminPanel.tsx b/apps/web/client/src/components/admin/HermesWorkerAdminPanel.tsx
new file mode 100644
index 000000000..f79b24630
--- /dev/null
+++ b/apps/web/client/src/components/admin/HermesWorkerAdminPanel.tsx
@@ -0,0 +1,204 @@
+/**
+ * HermesWorkerAdminPanel — Feature 135 (Hermes Grok media worker) section 12.
+ *
+ * Read-only admin monitoring panel: connections per scope, quota
+ * consumption, and kill-switch states, sourced from
+ * `trpc.hermesConnections.adminOverview`. This panel is deliberately
+ * READ-ONLY by design — admin mutations (connect shared / quota / disable)
+ * live solely in `HermesConnectPanel`'s admin sub-panel
+ * (Settings → AI Providers → "Grok via Hermes"), so the two admin surfaces
+ * can never diverge (one-writer rule, section-10). This panel links there
+ * for changes instead of wiring its own mutations.
+ *
+ * Mounted inside `AdminMonitoring.tsx` adjacent to the existing worker-fleet
+ * section. Thai copy primary, English secondary — consistent with the
+ * section-10 panels.
+ */
+import { Link } from "wouter";
+import { Loader2, ShieldCheck, ShieldOff } from "lucide-react";
+
+import { trpc } from "@/lib/trpc";
+import { DashboardCard } from "@/components/dashboard";
+import { Badge } from "@/components/ui/badge";
+import { Progress } from "@/components/ui/progress";
+
+type HermesScope = "server_shared" | "server_personal" | "private_worker";
+
+const SCOPE_LABEL: Record<HermesScope, string> = {
+  server_shared: "ส่วนกลาง (Shared pool)",
+  server_personal: "ส่วนตัวบนเซิร์ฟเวอร์ (Server personal)",
+  private_worker: "เครื่องส่วนตัว (Private worker)",
+};
+
+const SCOPE_ORDER: HermesScope[] = ["server_shared", "server_personal", "private_worker"];
+
+interface HermesAdminOverviewConnection {
+  id: string;
+  scope: HermesScope;
+  status: string;
+  accountLabel: string | null;
+  accountHint: string | null;
+  dailyJobQuota: number | null;
+  usedToday: number;
+  queueDepth: number;
+}
+
+interface HermesAdminOverviewScopeGroup {
+  scope: HermesScope;
+  connections: HermesAdminOverviewConnection[];
+}
+
+interface HermesAdminOverviewSettings {
+  hermesWorkerEnabled: boolean;
+  sharedPoolEnabled: boolean;
+  serverPersonalEnabled: boolean;
+  privateEnabled: boolean;
+  videoEnabled: boolean;
+  sharedPoolFeeCredits: number;
+  minHermesVersion: string;
+}
+
+interface HermesAdminOverviewData {
+  scopes: HermesAdminOverviewScopeGroup[];
+  settings: HermesAdminOverviewSettings;
+}
+
+export interface HermesFleetSummary {
+  ready: boolean;
+  version: string | null;
+}
+
+/**
+ * Small, independently-testable presentational unit for the worker-fleet
+ * row badge (`AdminMonitoring.tsx`'s fleet rendering, section-12 §4.3) — a
+ * pure projection of `WorkerFleetSummary.hermes`. Exported so
+ * `HermesWorkerAdminPanel.test.tsx` can assert the badge/version rendering
+ * and the "renders unchanged when absent" regression without mounting the
+ * whole (heavy) AdminMonitoring page.
+ */
+export function HermesFleetBadge({ hermes, workerId }: { hermes: HermesFleetSummary; workerId: string }) {
+  return (
+    <Badge
+      variant={hermes.ready ? "outline" : "secondary"}
+      data-testid={`hermes-fleet-badge-${workerId}`}
+    >
+      Hermes media {hermes.ready ? "ready" : "not ready"}
+      {hermes.version ? ` v${hermes.version}` : ""}
+    </Badge>
+  );
+}
+
+function KillSwitchBadge({ label, enabled }: { label: string; enabled: boolean }) {
+  return (
+    <Badge
+      variant={enabled ? "default" : "outline"}
+      className={enabled ? "" : "text-gray-400"}
+      data-testid={`hermes-kill-switch-${label}`}
+      data-enabled={enabled ? "true" : "false"}
+    >
+      {enabled ? <ShieldCheck className="mr-1 h-3 w-3" /> : <ShieldOff className="mr-1 h-3 w-3" />}
+      {label}: {enabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}
+    </Badge>
+  );
+}
+
+export function HermesWorkerAdminPanel() {
+  const overviewQuery = trpc.hermesConnections.adminOverview.useQuery();
+
+  if (overviewQuery.isLoading) {
+    return (
+      <DashboardCard className="p-5" data-testid="hermes-worker-admin-panel">
+        <div className="flex items-center gap-2 text-sm text-muted-foreground">
+          <Loader2 className="h-4 w-4 animate-spin" />
+          กำลังโหลดข้อมูล Hermes...
+        </div>
+      </DashboardCard>
+    );
+  }
+
+  const overview = overviewQuery.data as HermesAdminOverviewData | undefined;
+  if (!overview) return null;
+
+  const groupsByScope = new Map(overview.scopes.map((group) => [group.scope, group]));
+
+  return (
+    <DashboardCard className="p-5" data-testid="hermes-worker-admin-panel">
+      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
+        <div>
+          <h2 className="text-base font-semibold text-gray-950">
+            Hermes Grok Media Worker (Admin)
+          </h2>
+          <p className="mt-1 text-sm text-gray-500">
+            ภาพรวมการเชื่อมต่อ โควต้าการใช้งาน และสถานะ kill-switch (มุมมองอ่านอย่างเดียว)
+          </p>
+        </div>
+        <Link href="/settings?tab=integrations" data-testid="hermes-admin-panel-settings-link">
+          จัดการที่หน้า Settings
+        </Link>
+      </div>
+
+      <div className="mt-4 flex flex-wrap gap-2" data-testid="hermes-admin-panel-kill-switches">
+        <KillSwitchBadge label="Hermes Worker" enabled={overview.settings.hermesWorkerEnabled} />
+        <KillSwitchBadge label="ส่วนกลาง" enabled={overview.settings.sharedPoolEnabled} />
+        <KillSwitchBadge label="ส่วนตัวบนเซิร์ฟเวอร์" enabled={overview.settings.serverPersonalEnabled} />
+        <KillSwitchBadge label="เครื่องส่วนตัว" enabled={overview.settings.privateEnabled} />
+        <KillSwitchBadge label="วิดีโอ" enabled={overview.settings.videoEnabled} />
+      </div>
+      <p className="mt-2 text-xs text-gray-500">
+        ค่าธรรมเนียม pool กลาง: {overview.settings.sharedPoolFeeCredits} เครดิต ·
+        เวอร์ชันต่ำสุดที่รองรับ: {overview.settings.minHermesVersion || "ไม่กำหนด"}
+      </p>
+
+      <div className="mt-5 space-y-4">
+        {SCOPE_ORDER.map((scope) => {
+          const group = groupsByScope.get(scope);
+          const connections = group?.connections ?? [];
+          return (
+            <div key={scope} data-testid={`hermes-admin-scope-${scope}`}>
+              <h3 className="text-sm font-medium text-gray-800">{SCOPE_LABEL[scope]}</h3>
+              {connections.length === 0 ? (
+                <p className="mt-1 text-xs text-gray-400">ไม่มีบัญชีที่เชื่อมต่อในกลุ่มนี้</p>
+              ) : (
+                <div className="mt-2 space-y-2">
+                  {connections.map((connection) => {
+                    const quota = connection.dailyJobQuota;
+                    const percent = quota
+                      ? Math.min(100, Math.round((connection.usedToday / quota) * 100))
+                      : 0;
+                    return (
+                      <div
+                        key={connection.id}
+                        className="rounded-md border p-2"
+                        data-testid={`hermes-admin-connection-${connection.id}`}
+                      >
+                        <div className="flex items-center justify-between text-sm">
+                          <span>{connection.accountLabel ?? connection.accountHint ?? connection.id}</span>
+                          <Badge variant="outline">{connection.status}</Badge>
+                        </div>
+                        <div className="mt-1 text-xs text-gray-500">
+                          คิวงานค้าง: {connection.queueDepth}
+                        </div>
+                        {quota != null ? (
+                          <div className="mt-1" data-testid={`hermes-admin-quota-${connection.id}`}>
+                            <Progress value={percent} />
+                            <span className="text-xs text-gray-500">
+                              {connection.usedToday}/{quota} วันนี้
+                            </span>
+                          </div>
+                        ) : (
+                          <span className="text-xs text-gray-400">
+                            โควต้า: ไม่จำกัด · ใช้ไปวันนี้ {connection.usedToday}
+                          </span>
+                        )}
+                      </div>
+                    );
+                  })}
+                </div>
+              )}
+            </div>
+          );
+        })}
+      </div>
+    </DashboardCard>
+  );
+}
diff --git a/apps/web/server/routes/workerRuntime.ts b/apps/web/server/routes/workerRuntime.ts
index ce20926f7..06a8adac0 100644
--- a/apps/web/server/routes/workerRuntime.ts
+++ b/apps/web/server/routes/workerRuntime.ts
@@ -25,6 +25,7 @@ import {
   mintHermesMediaReferenceUrls,
 } from "../services/hermesMediaAdapter";
 import { finalizeHermesMediaArtifact } from "../services/hermesMediaFinalizeService";
+import { settleHermesConnectionJob } from "../services/hermesConnectionJobs";
 import {
   delegatedSessionRequestSchema,
   delegatedWorkerCallbackPayloadSchema,
@@ -1480,6 +1481,37 @@ export function registerWorkerRuntimeRoutes(
             // loose `Record<string, any>` row shape — cast to the strict
             // Drizzle row type at this one crossing point.
             await finalizeHermesMediaArtifact({ job, artifact: result.artifact as unknown as WorkerArtifact });
+
+            // Feature 135 section 12 (code review fix) — settle THIS job
+            // immediately after finalize moves it to `completed`, through
+            // the SAME `settleHermesConnectionJob` the 60s sweep uses: fee
+            // reconciliation + usage row/quota bump (via
+            // `onTerminalHermesMediaJob`) AND appending the
+            // `hermes_connection_settled` worker_job_events marker.
+            // Writing that marker HERE (not only from the sweep) is what
+            // makes `listTerminalUnsettledHermesJobs` correctly exclude
+            // this job on the sweep's next tick — before this fix, NO path
+            // ever marked a job settled except the sweep itself, so every
+            // completed job sat "unsettled" for up to 60s and was
+            // re-processed (re-invoking `recordHermesUsage`) on the very
+            // next tick, making a Redis hiccup during that window a
+            // routine double-usage-row / double-quota-bump risk rather
+            // than a rare one. The sweep is now a genuine backstop for
+            // jobs THIS call didn't reach (a crash between finalize and
+            // here, or a true lease-expiry completion this route never
+            // observes at all) — not the only place settlement happens.
+            // Re-fetches the row so the `status === "completed"` gates
+            // inside see the POST-finalize state (`job` above was read
+            // BEFORE finalize ran). Never throws into this route — a
+            // settlement failure must not un-complete the job (§4.2).
+            try {
+              const completedJob = await defaultHermesMediaAdapterRepo.getJobById(req.params.jobId);
+              if (completedJob) {
+                await settleHermesConnectionJob(completedJob);
+              }
+            } catch (settleError) {
+              debugError("workerRuntime", `Failed to settle hermes job ${req.params.jobId} after finalize`, settleError);
+            }
           } catch (finalizeError) {
             // finalizeHermesMediaArtifact already fails the job internally
             // (typed failureReason) on a validation/safety-gate rejection —
diff --git a/apps/web/server/services/auditLogger.ts b/apps/web/server/services/auditLogger.ts
index 7ecf6e36a..a9d153d9f 100644
--- a/apps/web/server/services/auditLogger.ts
+++ b/apps/web/server/services/auditLogger.ts
@@ -181,6 +181,15 @@ export type AuditEventType =
   | "worker_budget_updated"
   | "worker_callback_published"
   | "worker_legacy_data_redacted"
+  | "hermes_connection_connect_started"
+  | "hermes_connection_authorized"
+  | "hermes_connection_disconnected"
+  | "hermes_connection_revoked"
+  | "hermes_connection_entitlement_restricted"
+  | "hermes_connection_reauth_required"
+  | "hermes_media_job_submitted"
+  | "hermes_media_admission_rejected"
+  | "hermes_media_usage_recorded"
   | "vertical_drama_season_critique_apply_error"
   | "vertical_drama_deep_generate_error"
   | "error";
diff --git a/apps/web/server/services/hermesMediaObservability.ts b/apps/web/server/services/hermesMediaObservability.ts
new file mode 100644
index 000000000..8f4f68ac5
--- /dev/null
+++ b/apps/web/server/services/hermesMediaObservability.ts
@@ -0,0 +1,520 @@
+/**
+ * Feature 135 — Hermes Grok media worker: observability + hardening
+ * (section 12).
+ *
+ * One thin module: typed audit-emit helpers for every hermes lifecycle
+ * event (connection connect/authorize/disconnect/revoke/entitlement-
+ * restricted, media-job submit/admission-rejected/usage-recorded), plus
+ * `recordHermesUsage` — the single completion-time hook that writes one
+ * `provider_usage_log` row and bumps the section-05 daily quota counter for
+ * a completed `hermes_media_*` job.
+ *
+ * Hard rule (spec §16, locked in by `hermesTokenLeakGuard.test.ts`): every
+ * helper here logs IDS ONLY — jobId/connectionId/tenantId/userId/traceId/
+ * error codes. NEVER a prompt, a reference URL, a device code, or more than
+ * 4 characters of any token. `sanitizePayload` is not a license to log
+ * secrets — none of these helpers accept a payload shape that could carry
+ * one in the first place.
+ *
+ * Namespace note: this is the `hermesMedia` / `hermes_media` namespace — see
+ * `server/services/__tests__/hermesMediaNamespaceGuard.test.ts`.
+ */
+import { and, eq } from "drizzle-orm";
+
+import { getDb } from "../db";
+import { llmProviders, providerUsageLog, workerJobEvents } from "../../drizzle/schema";
+import { buildHermesQuotaKey } from "./hermesMediaAdmission";
+import type { HermesConnectionScope } from "./hermesConnectionService";
+import {
+  HERMES_MEDIA_USAGE_RECORDED_EVENT_TYPE,
+  type HermesMediaErrorCode,
+  type HermesMediaJobContract,
+} from "../../shared/hermesMedia";
+import { auditLogger } from "./auditLogger";
+import { debugError } from "../_core/logger";
+
+// ────────────────────────────────────────────────────────────────────────
+// Audit helpers — connection lifecycle
+// ────────────────────────────────────────────────────────────────────────
+
+export interface AuditHermesConnectionLifecycleParams {
+  traceId?: string;
+  userId: number | null;
+  tenantId: string;
+  connectionId: string;
+  scope?: HermesConnectionScope;
+}
+
+export function auditHermesConnectStarted(params: AuditHermesConnectionLifecycleParams): void {
+  auditLogger.log({
+    eventType: "hermes_connection_connect_started",
+    userId: params.userId,
+    traceId: params.traceId,
+    metadata: {
+      tenantId: params.tenantId,
+      connectionId: params.connectionId,
+      ...(params.scope ? { scope: params.scope } : {}),
+    },
+  });
+}
+
+export function auditHermesConnectionAuthorized(params: AuditHermesConnectionLifecycleParams): void {
+  auditLogger.log({
+    eventType: "hermes_connection_authorized",
+    userId: params.userId,
+    traceId: params.traceId,
+    metadata: {
+      tenantId: params.tenantId,
+      connectionId: params.connectionId,
+      ...(params.scope ? { scope: params.scope } : {}),
+    },
+  });
+}
+
+export function auditHermesConnectionDisconnected(params: AuditHermesConnectionLifecycleParams): void {
+  auditLogger.log({
+    eventType: "hermes_connection_disconnected",
+    userId: params.userId,
+    traceId: params.traceId,
+    metadata: {
+      tenantId: params.tenantId,
+      connectionId: params.connectionId,
+      ...(params.scope ? { scope: params.scope } : {}),
+    },
+  });
+}
+
+export function auditHermesConnectionRevoked(params: AuditHermesConnectionLifecycleParams): void {
+  auditLogger.log({
+    eventType: "hermes_connection_revoked",
+    userId: params.userId,
+    traceId: params.traceId,
+    metadata: {
+      tenantId: params.tenantId,
+      connectionId: params.connectionId,
+      ...(params.scope ? { scope: params.scope } : {}),
+    },
+  });
+}
+
+export function auditHermesConnectionEntitlementRestricted(params: AuditHermesConnectionLifecycleParams): void {
+  auditLogger.log({
+    eventType: "hermes_connection_entitlement_restricted",
+    userId: params.userId,
+    traceId: params.traceId,
+    metadata: {
+      tenantId: params.tenantId,
+      connectionId: params.connectionId,
+      ...(params.scope ? { scope: params.scope } : {}),
+    },
+  });
+}
+
+/**
+ * Code review FIX 4 — the actual most-common provider-side revocation
+ * signal (an auth/session-invalidation failure classified `reauth_required`
+ * on the authorize job, the probe job, or a `hermes_media_*` job) mutates
+ * the connection's status but previously emitted NO audit event at all,
+ * despite `hermes_connection_revoked` existing for the (rarer) admin-forced
+ * disable path. An admin debugging "why did this connection stop working"
+ * found nothing for the most common cause. Emitted at all three
+ * `reauth_required`-classification call sites.
+ */
+export function auditHermesConnectionReauthRequired(params: AuditHermesConnectionLifecycleParams): void {
+  auditLogger.log({
+    eventType: "hermes_connection_reauth_required",
+    userId: params.userId,
+    traceId: params.traceId,
+    metadata: {
+      tenantId: params.tenantId,
+      connectionId: params.connectionId,
+      ...(params.scope ? { scope: params.scope } : {}),
+    },
+  });
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Audit helpers — media job submit / admission rejection / usage recorded
+// ────────────────────────────────────────────────────────────────────────
+
+export interface AuditHermesSubmitParams {
+  traceId: string;
+  userId: number;
+  tenantId: string;
+  jobId: string;
+  jobType: string;
+  connectionId: string;
+  scope: HermesConnectionScope;
+  operation: string;
+  batchSize?: number;
+}
+
+/** Metadata is ids/enums only — NEVER the prompt text or reference URLs. */
+export function auditHermesSubmit(params: AuditHermesSubmitParams): void {
+  auditLogger.log({
+    eventType: "hermes_media_job_submitted",
+    userId: params.userId,
+    traceId: params.traceId,
+    metadata: {
+      tenantId: params.tenantId,
+      jobId: params.jobId,
+      jobType: params.jobType,
+      connectionId: params.connectionId,
+      scope: params.scope,
+      operation: params.operation,
+      ...(params.batchSize !== undefined ? { batchSize: params.batchSize } : {}),
+    },
+  });
+}
+
+export interface AuditHermesAdmissionRejectedParams {
+  traceId: string;
+  userId: number;
+  tenantId: string;
+  connectionId?: string;
+  code: HermesMediaErrorCode;
+  retryAfterSeconds?: number;
+}
+
+export function auditHermesAdmissionRejected(params: AuditHermesAdmissionRejectedParams): void {
+  auditLogger.log({
+    eventType: "hermes_media_admission_rejected",
+    userId: params.userId,
+    traceId: params.traceId,
+    metadata: {
+      tenantId: params.tenantId,
+      ...(params.connectionId ? { connectionId: params.connectionId } : {}),
+      code: params.code,
+      ...(params.retryAfterSeconds !== undefined ? { retryAfterSeconds: params.retryAfterSeconds } : {}),
+    },
+  });
+}
+
+export interface AuditHermesUsageRecordedParams {
+  traceId?: string;
+  userId: number | null;
+  tenantId: string;
+  jobId: string;
+  connectionId: string;
+  providerId: number;
+  modelUsed: string;
+  creditsCharged: number;
+}
+
+export function auditHermesUsageRecorded(params: AuditHermesUsageRecordedParams): void {
+  auditLogger.log({
+    eventType: "hermes_media_usage_recorded",
+    userId: params.userId,
+    traceId: params.traceId,
+    metadata: {
+      tenantId: params.tenantId,
+      jobId: params.jobId,
+      connectionId: params.connectionId,
+      providerId: params.providerId,
+      modelUsed: params.modelUsed,
+      creditsCharged: params.creditsCharged,
+    },
+  });
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// xai-hermes provider row resolution (find-or-create, cached)
+// ────────────────────────────────────────────────────────────────────────
+
+const HERMES_USAGE_PROVIDER_NAME = "xai-hermes";
+const HERMES_USAGE_PROVIDER_DISPLAY_NAME = "xAI Hermes (provider account)";
+
+export interface HermesUsageRepo {
+  findProviderIdByName(providerName: string): Promise<number | null>;
+  insertProviderRow(values: { providerName: string; displayName: string }): Promise<{ id: number }>;
+  insertUsageLogRow(values: Record<string, unknown>): Promise<void>;
+  /** Durable (DB-level) idempotency backstop, independent of Redis — see
+   *  `HERMES_MEDIA_USAGE_RECORDED_EVENT_TYPE`'s doc comment
+   *  (`shared/hermesMedia.ts`) and `recordHermesUsage`'s. */
+  hasUsageRecordedMarker(jobId: string): Promise<boolean>;
+  insertUsageRecordedMarker(jobId: string): Promise<void>;
+}
+
+export const defaultHermesUsageRepo: HermesUsageRepo = {
+  async findProviderIdByName(providerName) {
+    const db = getDb();
+    const [row] = await db
+      .select({ id: llmProviders.id })
+      .from(llmProviders)
+      .where(eq(llmProviders.providerName, providerName))
+      .limit(1);
+    return row?.id ?? null;
+  },
+
+  async insertProviderRow(values) {
+    const db = getDb();
+    // Row created disabled / no API key — this provider row exists ONLY so
+    // `provider_usage_log.providerId` (NOT NULL, schema.ts) has a target; it
+    // must never become routable/enabled for real LLM traffic.
+    const [row] = await db
+      .insert(llmProviders)
+      .values({
+        providerName: values.providerName,
+        displayName: values.displayName,
+        hasApiKey: false,
+        isEnabled: false,
+      } as any)
+      .returning({ id: llmProviders.id });
+    return row;
+  },
+
+  async insertUsageLogRow(values) {
+    const db = getDb();
+    await db.insert(providerUsageLog).values(values as any);
+  },
+
+  async hasUsageRecordedMarker(jobId) {
+    const db = getDb();
+    const [row] = await db
+      .select({ id: workerJobEvents.id })
+      .from(workerJobEvents)
+      .where(and(
+        eq(workerJobEvents.workerJobId, jobId),
+        eq(workerJobEvents.eventType, HERMES_MEDIA_USAGE_RECORDED_EVENT_TYPE),
+      ))
+      .limit(1);
+    return Boolean(row);
+  },
+
+  async insertUsageRecordedMarker(jobId) {
+    const db = getDb();
+    await db.insert(workerJobEvents).values({
+      workerJobId: jobId,
+      eventType: HERMES_MEDIA_USAGE_RECORDED_EVENT_TYPE,
+      payloadJson: {},
+    });
+  },
+};
+
+let cachedHermesUsageProviderId: number | null = null;
+
+/** Find-or-create the `xai-hermes` `llm_providers` row id, module-level
+ *  cached so repeated completions never re-query/re-insert. */
+export async function resolveHermesUsageProviderId(repo: HermesUsageRepo = defaultHermesUsageRepo): Promise<number> {
+  if (cachedHermesUsageProviderId !== null) return cachedHermesUsageProviderId;
+
+  const existing = await repo.findProviderIdByName(HERMES_USAGE_PROVIDER_NAME);
+  if (existing !== null) {
+    cachedHermesUsageProviderId = existing;
+    return existing;
+  }
+
+  const inserted = await repo.insertProviderRow({
+    providerName: HERMES_USAGE_PROVIDER_NAME,
+    displayName: HERMES_USAGE_PROVIDER_DISPLAY_NAME,
+  });
+  cachedHermesUsageProviderId = inserted.id;
+  return inserted.id;
+}
+
+/** Test-only — resets the module-level provider-id cache between test cases. */
+export function __resetHermesUsageProviderIdCacheForTests(): void {
+  cachedHermesUsageProviderId = null;
+}
+
+// ────────────────────────────────────────────────────────────────────────
+// Usage + quota counter store (Redis-backed by default, fully injectable)
+// ────────────────────────────────────────────────────────────────────────
+
+const HERMES_USAGE_IDEMPOTENCY_TTL_SECONDS = 7 * 24 * 3600; // ~7d
+const HERMES_QUOTA_COUNTER_TTL_SECONDS = 48 * 3600; // 48h
+
+export interface HermesUsageCounterStore {
+  /** Atomic "mark as recorded if not already recorded" (SET NX semantics) —
+   *  resolves `true` the FIRST time a given jobId is marked (proceed),
+   *  `false` on every subsequent call for the same jobId (already recorded
+   *  — idempotent no-op). This is what makes double invocation (poll path +
+   *  sweep path) write exactly one usage row and one quota increment. */
+  markUsageRecordedIfNew(jobId: string): Promise<boolean>;
+  /** Atomically increments the section-05 daily quota counter
+   *  (`buildHermesQuotaKey`) and refreshes its expiry. */
+  incrementDailyQuota(connectionId: string, dateKey: string): Promise<void>;
+}
+
+async function redisMarkUsageRecordedIfNew(jobId: string): Promise<boolean> {
+  try {
+    const { getCacheClient } = await import("./redisClients");
+    const redis = getCacheClient();
+    const result = await redis.set(
+      `hermes:usage:recorded:${jobId}`,
+      "1",
+      "EX",
+      HERMES_USAGE_IDEMPOTENCY_TTL_SECONDS,
+      "NX",
+    );
+    return result === "OK";
+  } catch (error) {
+    // Fail-open: a Redis outage must never silently drop a completed job's
+    // usage row forever — recording it (possibly a second time, later
+    // reconciled) is a lesser evil than losing it. This mirrors the
+    // "usage-recording failure must not un-complete the job" rule (§4.2).
+    debugError("hermesMediaObservability", "Failed to check hermes usage idempotency marker", error);
+    return true;
+  }
+}
+
+async function redisIncrementDailyQuota(connectionId: string, dateKey: string): Promise<void> {
+  const { getCacheClient } = await import("./redisClients");
+  const redis = getCacheClient();
+  const key = buildHermesQuotaKey(connectionId, dateKey);
+  await redis.incr(key);
+  await redis.expire(key, HERMES_QUOTA_COUNTER_TTL_SECONDS);
+}
+
+export const defaultHermesUsageCounterStore: HermesUsageCounterStore = {
+  markUsageRecordedIfNew: redisMarkUsageRecordedIfNew,
+  incrementDailyQuota: redisIncrementDailyQuota,
+};
+
+// ────────────────────────────────────────────────────────────────────────
+// recordHermesUsage
+// ────────────────────────────────────────────────────────────────────────
+
+export interface RecordHermesUsageJob {
+  id: string;
+  tenantId: string;
+  requestedByUserId: number | null;
+  status: string;
+  capabilityRequirementsJson?: Record<string, unknown> | null;
+  instructionsJson?: Record<string, unknown> | null;
+}
+
+export interface RecordHermesUsageParams {
+  /** A completed `hermes_media_*` job row (or the subset of fields needed
+   *  here) — non-completed statuses are a guaranteed no-op (§3.2). */
+  job: RecordHermesUsageJob;
+  /** Only `settings.model` is read (never the prompt/references). */
+  contract: Pick<HermesMediaJobContract, "settings">;
+  /** The platform fee actually kept (0 for personal/private connections,
+   *  or a shared-pool job with no fee configured). */
+  feeCreditsKept: number;
+}
+
+export interface RecordHermesUsageDeps {
+  repo?: HermesUsageRepo;
+  counters?: HermesUsageCounterStore;
+  now?: () => Date;
+}
+
+function readConnectionIdFromJob(job: RecordHermesUsageJob): string | null {
+  const fromCapabilities = job.capabilityRequirementsJson?.connectionId;
+  if (typeof fromCapabilities === "string" && fromCapabilities.length > 0) return fromCapabilities;
+  return null;
+}
+
+function readTraceIdFromJob(job: RecordHermesUsageJob): string | undefined {
+  const traceId = job.instructionsJson?.traceId;
+  return typeof traceId === "string" && traceId.length > 0 ? traceId : undefined;
+}
+
+/**
+ * The single completion-time hook (§4.2): writes exactly one
+ * `provider_usage_log` row for a completed `hermes_media_*` job and bumps
+ * the section-05 daily quota counter.
+ *
+ * Called from TWO sites, both expected to run for the SAME job under
+ * normal conditions (code review fix — this is by design, not a rare
+ * corner case): (1) `workerRuntime.ts`'s artifacts/complete dispatch,
+ * immediately after `finalizeHermesMediaArtifact` succeeds — which ALSO
+ * appends the `hermes_connection_settled` marker via
+ * `settleHermesConnectionJob`, so this job is excluded from
+ * `listTerminalUnsettledHermesJobs` on the sweep's next tick; and (2) the
+ * section-04/06 terminal-state sweep's `onTerminalHermesMediaJob`, now a
+ * genuine backstop for whatever call site (1) never reached (a crash
+ * between finalize and settlement, or a true lease-expiry completion no
+ * poll/callback path ever observes) rather than the routine, every-job,
+ * up-to-60s-window re-processing it was before that fix.
+ *
+ * Idempotency is TWO independent, layered gates (neither backed by a new
+ * migration/unique constraint):
+ *   1. Redis `hermes:usage:recorded:<jobId>` (SET NX) — fast path; fails
+ *      OPEN (treats an error as "proceed") on a Redis outage, per the
+ *      "must not silently drop a completed job's usage forever" rule.
+ *   2. A durable `worker_job_events` row of type
+ *      `HERMES_MEDIA_USAGE_RECORDED_EVENT_TYPE`, checked BEFORE inserting
+ *      the `provider_usage_log` row — independent of Redis, so a Redis
+ *      outage during the window between the two call sites above degrades
+ *      to "usage delayed" rather than "usage duplicated". This is a
+ *      check-then-insert, not an atomic `ON CONFLICT` (no unique index
+ *      backs `(workerJobId, eventType)` — adding one would need a
+ *      migration), so it does not fully close a true simultaneous race
+ *      between the two call sites; it closes the practical, routine case.
+ *
+ * Never throws — a usage-recording failure is logged + audited, but must
+ * never un-complete the job (§4.2).
+ */
+export async function recordHermesUsage(
+  params: RecordHermesUsageParams,
+  deps: RecordHermesUsageDeps = {},
+): Promise<void> {
+  if (params.job.status !== "completed") return;
+
+  const repo = deps.repo ?? defaultHermesUsageRepo;
+  const counters = deps.counters ?? defaultHermesUsageCounterStore;
+  const now = deps.now ?? (() => new Date());
+
+  const connectionId = readConnectionIdFromJob(params.job);
+  const traceId = readTraceIdFromJob(params.job);
+  const modelUsed = params.contract.settings?.model ?? "unknown";
+  const creditsCharged = Math.max(0, Math.trunc(params.feeCreditsKept));
+
+  try {
+    // Durable gate FIRST — independent of Redis, so it still catches a
+    // genuine repeat even when the Redis fast-path below fails open (e.g.
+    // a Redis outage during the completion-callback <-> sweep window).
+    const alreadyRecordedInDb = await repo.hasUsageRecordedMarker(params.job.id);
+    if (alreadyRecordedInDb) return;
+
+    const isNew = await counters.markUsageRecordedIfNew(params.job.id);
+    if (!isNew) return;
+
+    const providerId = await resolveHermesUsageProviderId(repo);
+
+    await repo.insertUsageLogRow({
+      userId: params.job.requestedByUserId,
+      providerId,
+      modelUsed,
+      inputTokens: 0,
+      outputTokens: 0,
+      costUsd: "0",
+      creditsCharged,
+      statusCode: 200,
+      requestType: "hermes_media",
+      traceId: traceId ?? null,
+    });
+    await repo.insertUsageRecordedMarker(params.job.id);
+
+    if (connectionId) {
+      const dateKey = now().toISOString().slice(0, 10);
+      await counters.incrementDailyQuota(connectionId, dateKey);
+    }
+
+    auditHermesUsageRecorded({
+      traceId,
+      userId: params.job.requestedByUserId,
+      tenantId: params.job.tenantId,
+      jobId: params.job.id,
+      connectionId: connectionId ?? "",
+      providerId,
+      modelUsed,
+      creditsCharged,
+    });
+  } catch (error) {
+    debugError("hermesMediaObservability", `Failed to record hermes usage for job ${params.job.id}`, error);
+    auditLogger.log({
+      eventType: "error",
+      userId: params.job.requestedByUserId,
+      traceId,
+      metadata: {
+        tenantId: params.job.tenantId,
+        jobId: params.job.id,
+        context: "hermes_media_usage_recording_failed",
+      },
+    });
+  }
+}
diff --git a/run-services.sh b/run-services.sh
index d8fa57494..e6352a30d 100755
--- a/run-services.sh
+++ b/run-services.sh
@@ -593,6 +593,14 @@ cmd_stop() {
     sudo systemctl stop smartspec-backend.service 2>/dev/null || true
     log_info "Backend stopped"
 
+    # Feature 135 (Hermes Grok media worker) — optional, admin-installed
+    # unit (docs/HERMES_MEDIA_WORKER_OPS.md). Stop is idempotent/harmless
+    # when the unit was never installed (systemctl stop on an unknown unit
+    # just no-ops via the `|| true`).
+    log_step "Stopping Hermes Grok media worker (systemd, if installed)..."
+    sudo systemctl stop smartspec-hermes-worker.service 2>/dev/null || true
+    log_info "Hermes worker stopped"
+
     # Stop Docker Status UI
     stop_docker_status
 
@@ -704,6 +712,18 @@ cmd_status() {
         echo -e "  ${RED}x${NC} Web Application  $web_active [systemd, restarts: $web_restarts]"
     fi
 
+    # Feature 135 (Hermes Grok media worker) — optional, admin-installed
+    # unit; see docs/HERMES_MEDIA_WORKER_OPS.md for install/pairing steps.
+    # NEVER auto-started by this script (install/enable is a deliberate
+    # admin step, spec §8).
+    local hermes_worker_active=$(systemd_is_active smartspec-hermes-worker.service)
+    if [ "$hermes_worker_active" = "active" ]; then
+        local hermes_worker_restarts=$(systemd_restart_count smartspec-hermes-worker.service)
+        echo -e "  ${GREEN}✓${NC} Hermes Worker    Running [systemd, restarts: $hermes_worker_restarts]"
+    else
+        echo -e "  ${YELLOW}-${NC} Hermes Worker    Not running ($hermes_worker_active) [optional — install per docs/HERMES_MEDIA_WORKER_OPS.md]"
+    fi
+
     # Docker Status (systemd or screen)
     local docker_status_active=$(systemd_is_active smartspec-docker-status.service)
     if [ "$docker_status_active" = "active" ]; then
