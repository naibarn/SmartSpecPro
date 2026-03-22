diff --git a/apps/web/client/src/lib/i18n/__tests__/notificationTranslations.test.ts b/apps/web/client/src/lib/i18n/__tests__/notificationTranslations.test.ts
new file mode 100644
index 00000000..861ca254
--- /dev/null
+++ b/apps/web/client/src/lib/i18n/__tests__/notificationTranslations.test.ts
@@ -0,0 +1,70 @@
+import { describe, it, expect } from "vitest";
+import en from "../locales/en";
+import th from "../locales/th";
+
+describe("Notification i18n translations", () => {
+  const REQUIRED_KEYS = [
+    "notifications.category.system_health",
+    "notifications.category.media_jobs",
+    "notifications.category.workflow",
+    "notifications.category.skill",
+    "notifications.category.feedback",
+    "notifications.category.agency",
+    "notifications.category.follow",
+    "notifications.category.scheduled",
+    "notifications.category.security",
+    "notifications.category.business",
+    "notifications.settings.title",
+    "notifications.settings.inApp",
+    "notifications.settings.email",
+    "notifications.settings.telegram",
+    "notifications.settings.minSeverity",
+    "notifications.settings.mute",
+    "notifications.settings.save",
+    "notifications.alertRules.title",
+    "notifications.alertRules.name",
+    "notifications.alertRules.metric",
+    "notifications.alertRules.operator",
+    "notifications.alertRules.threshold",
+    "notifications.alertRules.cooldown",
+    "notifications.alertRules.enabled",
+    "notifications.alertRules.create",
+    "notifications.escalation.title",
+    "notifications.escalation.triggerSeverity",
+    "notifications.escalation.triggerMinutes",
+    "notifications.escalation.target",
+    "notifications.webhooks.title",
+    "notifications.webhooks.name",
+    "notifications.webhooks.url",
+    "notifications.webhooks.secret",
+    "notifications.webhooks.categories",
+    "notifications.webhooks.test",
+    "notifications.webhooks.create",
+    "notifications.admin.title",
+    "notifications.admin.total",
+    "notifications.admin.unread",
+    "notifications.admin.critical",
+    "notifications.admin.today",
+    "notifications.group.expand",
+    "notifications.group.occurrences",
+    "notifications.group.latest",
+  ];
+
+  it("all notification keys exist in EN locale with non-empty string values", () => {
+    for (const key of REQUIRED_KEYS) {
+      const value = (en as Record<string, string>)[key];
+      expect(value, `EN missing key: ${key}`).toBeDefined();
+      expect(typeof value, `EN key ${key} is not a string`).toBe("string");
+      expect(value.length, `EN key ${key} is empty`).toBeGreaterThan(0);
+    }
+  });
+
+  it("all notification keys exist in TH locale with non-empty string values", () => {
+    for (const key of REQUIRED_KEYS) {
+      const value = (th as Record<string, string>)[key];
+      expect(value, `TH missing key: ${key}`).toBeDefined();
+      expect(typeof value, `TH key ${key} is not a string`).toBe("string");
+      expect(value.length, `TH key ${key} is empty`).toBeGreaterThan(0);
+    }
+  });
+});
diff --git a/apps/web/client/src/lib/i18n/locales/en.ts b/apps/web/client/src/lib/i18n/locales/en.ts
index cf982054..eee38757 100644
--- a/apps/web/client/src/lib/i18n/locales/en.ts
+++ b/apps/web/client/src/lib/i18n/locales/en.ts
@@ -869,6 +869,52 @@ const en: TranslationDictionary = {
   "teams.category.operations": "Operations",
   "teams.category.support": "Support",
 
+  // -- Notifications (Feature 049) --
+  "notifications.category.system_health": "System Health",
+  "notifications.category.media_jobs": "Media Jobs",
+  "notifications.category.workflow": "Workflows",
+  "notifications.category.skill": "Skills",
+  "notifications.category.feedback": "Feedback",
+  "notifications.category.agency": "Agencies",
+  "notifications.category.follow": "Follows",
+  "notifications.category.scheduled": "Scheduled Messages",
+  "notifications.category.security": "Security",
+  "notifications.category.business": "Business",
+  "notifications.settings.title": "Notification Preferences",
+  "notifications.settings.inApp": "In-App",
+  "notifications.settings.email": "Email",
+  "notifications.settings.telegram": "Telegram",
+  "notifications.settings.minSeverity": "Minimum Severity",
+  "notifications.settings.mute": "Mute",
+  "notifications.settings.save": "Save Preferences",
+  "notifications.alertRules.title": "Alert Rules",
+  "notifications.alertRules.name": "Rule Name",
+  "notifications.alertRules.metric": "Metric",
+  "notifications.alertRules.operator": "Operator",
+  "notifications.alertRules.threshold": "Threshold",
+  "notifications.alertRules.cooldown": "Cooldown (minutes)",
+  "notifications.alertRules.enabled": "Enabled",
+  "notifications.alertRules.create": "Create Alert Rule",
+  "notifications.escalation.title": "Escalation Policies",
+  "notifications.escalation.triggerSeverity": "Trigger Severity",
+  "notifications.escalation.triggerMinutes": "Trigger After (minutes)",
+  "notifications.escalation.target": "Escalation Target",
+  "notifications.webhooks.title": "Notification Webhooks",
+  "notifications.webhooks.name": "Webhook Name",
+  "notifications.webhooks.url": "Webhook URL",
+  "notifications.webhooks.secret": "Signing Secret",
+  "notifications.webhooks.categories": "Categories",
+  "notifications.webhooks.test": "Test Webhook",
+  "notifications.webhooks.create": "Create Webhook",
+  "notifications.admin.title": "Notification Center",
+  "notifications.admin.total": "Total",
+  "notifications.admin.unread": "Unread",
+  "notifications.admin.critical": "Critical",
+  "notifications.admin.today": "Today",
+  "notifications.group.expand": "Expand Group",
+  "notifications.group.occurrences": "Occurrences",
+  "notifications.group.latest": "Latest",
+
   // ── Shared UI labels ─────────────────────────────────────────
   "common.output": "Output",
   "common.example": "Example",
diff --git a/apps/web/client/src/lib/i18n/locales/th.ts b/apps/web/client/src/lib/i18n/locales/th.ts
index af8e7060..2dfb16de 100644
--- a/apps/web/client/src/lib/i18n/locales/th.ts
+++ b/apps/web/client/src/lib/i18n/locales/th.ts
@@ -844,6 +844,52 @@ const th: TranslationDictionary = {
   "teams.category.operations": "สายปฏิบัติการ",
   "teams.category.support": "สายซัพพอร์ต",
 
+  // -- การแจ้งเตือน (Feature 049) --
+  "notifications.category.system_health": "สุขภาพระบบ",
+  "notifications.category.media_jobs": "งานสื่อ",
+  "notifications.category.workflow": "เวิร์กโฟลว์",
+  "notifications.category.skill": "ทักษะ",
+  "notifications.category.feedback": "ข้อเสนอแนะ",
+  "notifications.category.agency": "เอเจนซี่",
+  "notifications.category.follow": "การติดตาม",
+  "notifications.category.scheduled": "ข้อความตั้งเวลา",
+  "notifications.category.security": "ความปลอดภัย",
+  "notifications.category.business": "ธุรกิจ",
+  "notifications.settings.title": "การตั้งค่าการแจ้งเตือน",
+  "notifications.settings.inApp": "ในแอป",
+  "notifications.settings.email": "อีเมล",
+  "notifications.settings.telegram": "เทเลแกรม",
+  "notifications.settings.minSeverity": "ระดับความรุนแรงขั้นต่ำ",
+  "notifications.settings.mute": "ปิดเสียง",
+  "notifications.settings.save": "บันทึกการตั้งค่า",
+  "notifications.alertRules.title": "กฎแจ้งเตือน",
+  "notifications.alertRules.name": "ชื่อกฎ",
+  "notifications.alertRules.metric": "เมตริก",
+  "notifications.alertRules.operator": "ตัวดำเนินการ",
+  "notifications.alertRules.threshold": "เกณฑ์",
+  "notifications.alertRules.cooldown": "คูลดาวน์ (นาที)",
+  "notifications.alertRules.enabled": "เปิดใช้งาน",
+  "notifications.alertRules.create": "สร้างกฎแจ้งเตือน",
+  "notifications.escalation.title": "นโยบายการยกระดับ",
+  "notifications.escalation.triggerSeverity": "ระดับความรุนแรงที่ทริกเกอร์",
+  "notifications.escalation.triggerMinutes": "ทริกเกอร์หลัง (นาที)",
+  "notifications.escalation.target": "เป้าหมายการยกระดับ",
+  "notifications.webhooks.title": "เว็บฮุกการแจ้งเตือน",
+  "notifications.webhooks.name": "ชื่อเว็บฮุก",
+  "notifications.webhooks.url": "URL เว็บฮุก",
+  "notifications.webhooks.secret": "คีย์ลงนาม",
+  "notifications.webhooks.categories": "หมวดหมู่",
+  "notifications.webhooks.test": "ทดสอบเว็บฮุก",
+  "notifications.webhooks.create": "สร้างเว็บฮุก",
+  "notifications.admin.title": "ศูนย์การแจ้งเตือน",
+  "notifications.admin.total": "ทั้งหมด",
+  "notifications.admin.unread": "ยังไม่อ่าน",
+  "notifications.admin.critical": "วิกฤต",
+  "notifications.admin.today": "วันนี้",
+  "notifications.group.expand": "ขยายกลุ่ม",
+  "notifications.group.occurrences": "จำนวนครั้ง",
+  "notifications.group.latest": "ล่าสุด",
+
   // ── Shared UI labels ─────────────────────────────────────────
   "common.output": "ผลลัพธ์",
   "common.example": "ตัวอย่าง",
diff --git a/apps/web/server/routes/notificationStream.ts b/apps/web/server/routes/notificationStream.ts
new file mode 100644
index 00000000..a0496244
--- /dev/null
+++ b/apps/web/server/routes/notificationStream.ts
@@ -0,0 +1,159 @@
+/**
+ * Notification SSE Stream — real-time notification push via Server-Sent Events.
+ *
+ * GET /api/notifications/stream
+ * Requires JWT authentication. Pushes new notifications as they arrive.
+ *
+ * Security hardening:
+ * - Per-user connection cap (max 5 concurrent SSE connections)
+ * - Redis messages parsed and re-serialized to prevent SSE frame injection
+ * - No userId leaked in connected event
+ */
+
+import { Router, type Request, type Response } from "express";
+import { sdk } from "../_core/sdk";
+
+const notificationStreamRouter = Router();
+
+const HEARTBEAT_INTERVAL_MS = 30_000;
+const MAX_SSE_PER_USER = 5;
+
+// Track active SSE subscribers per user to prevent resource leaks
+const activeSubscribers = new Map<number, Set<{ disconnect: () => void }>>();
+
+notificationStreamRouter.get("/api/notifications/stream", async (req: Request, res: Response) => {
+  // Authenticate
+  let user;
+  try {
+    user = await sdk.authenticateRequest(req);
+    if (!user) {
+      res.status(401).json({ error: "Unauthorized" });
+      return;
+    }
+  } catch {
+    res.status(401).json({ error: "Unauthorized" });
+    return;
+  }
+
+  // Setup SSE headers
+  res.writeHead(200, {
+    "Content-Type": "text/event-stream",
+    "Cache-Control": "no-cache",
+    Connection: "keep-alive",
+    "X-Accel-Buffering": "no",
+  });
+  res.write("\n");
+
+  const userId = user.id;
+  const channel = `notifications:user:${userId}`;
+
+  // Enforce per-user connection cap — close oldest if at limit
+  const userSubs = activeSubscribers.get(userId) ?? new Set();
+  if (userSubs.size >= MAX_SSE_PER_USER) {
+    const oldest = userSubs.values().next().value;
+    if (oldest) {
+      try { oldest.disconnect(); } catch { /* already closed */ }
+      userSubs.delete(oldest);
+    }
+  }
+  activeSubscribers.set(userId, userSubs);
+
+  // Subscribe to Redis
+  let subscriber: any = null;
+  let heartbeatTimer: NodeJS.Timeout | null = null;
+  let subEntry: { disconnect: () => void } | null = null;
+
+  try {
+    const { getRedisClient } = await import("../services/redis");
+    const redis = getRedisClient();
+    if (!redis) {
+      res.write("event: error\ndata: Redis unavailable\n\n");
+      res.end();
+      return;
+    }
+
+    // Duplicate connection for subscriber
+    subscriber = redis.duplicate();
+    await subscriber.subscribe(channel);
+
+    subscriber.on("message", (_ch: string, message: string) => {
+      try {
+        // Parse and re-serialize to prevent SSE frame injection via embedded newlines
+        const parsed = JSON.parse(message);
+        const safe = JSON.stringify(parsed);
+        res.write(`event: notification\ndata: ${safe}\n\n`);
+      } catch {
+        // Malformed JSON — drop silently, don't forward
+      }
+    });
+
+    // Heartbeat to keep connection alive
+    heartbeatTimer = setInterval(() => {
+      try {
+        res.write(": heartbeat\n\n");
+      } catch {
+        // Connection closed
+      }
+    }, HEARTBEAT_INTERVAL_MS);
+
+    // Send initial connected event — no userId to prevent unnecessary data exposure
+    res.write('event: connected\ndata: {"status":"connected"}\n\n');
+
+    // Register in active subscribers map
+    subEntry = {
+      disconnect: () => {
+        try {
+          subscriber?.unsubscribe(channel);
+          subscriber?.disconnect();
+        } catch { /* already closed */ }
+        if (heartbeatTimer) clearInterval(heartbeatTimer);
+        res.end();
+      },
+    };
+    userSubs.add(subEntry);
+
+  } catch (err) {
+    console.error("[NotificationStream] Redis subscribe failed:", err);
+    res.write("event: error\ndata: Subscribe failed\n\n");
+    res.end();
+    return;
+  }
+
+  // Cleanup on disconnect
+  const cleanup = async () => {
+    if (heartbeatTimer) clearInterval(heartbeatTimer);
+    heartbeatTimer = null;
+    if (subscriber) {
+      try {
+        await subscriber.unsubscribe(channel);
+        subscriber.disconnect();
+      } catch {
+        // Already disconnected
+      }
+      subscriber = null;
+    }
+    // Remove from active subscribers tracking
+    if (subEntry) {
+      const subs = activeSubscribers.get(userId);
+      if (subs) {
+        subs.delete(subEntry);
+        if (subs.size === 0) activeSubscribers.delete(userId);
+      }
+      subEntry = null;
+    }
+  };
+
+  req.on("close", cleanup);
+  req.on("error", cleanup);
+});
+
+/** Returns the total number of active SSE connections across all users. */
+export function getActiveSSEConnectionCount(): number {
+  let count = 0;
+  for (const subs of activeSubscribers.values()) {
+    count += subs.size;
+  }
+  return count;
+}
+
+export default notificationStreamRouter;
diff --git a/apps/web/server/services/notificationHealthChecks.ts b/apps/web/server/services/notificationHealthChecks.ts
new file mode 100644
index 00000000..ecc678d9
--- /dev/null
+++ b/apps/web/server/services/notificationHealthChecks.ts
@@ -0,0 +1,175 @@
+/**
+ * Notification Health Checks — probes for the notification subsystem.
+ *
+ * Three health check probes:
+ * 1. Redis pub/sub round-trip latency
+ * 2. Admin-broadcast endpoint error rate
+ * 3. SSE connection count gauge
+ */
+
+import { debugLog } from "../_core/logger";
+
+// ── Redis Pub/Sub Health Probe ──────────────────────────────────
+
+const HEALTH_CHANNEL = "notifications:health";
+const PUBSUB_TIMEOUT_MS = 5_000;
+
+export async function checkRedisPubSubHealth(): Promise<{
+  healthy: boolean;
+  latencyMs: number;
+}> {
+  try {
+    const { getRealtimeClient } = await import("./redisClients");
+    const pub = getRealtimeClient();
+    const sub = pub.duplicate();
+
+    const token = `health-${Date.now()}-${Math.random().toString(36).slice(2)}`;
+    const start = performance.now();
+
+    const result = await new Promise<{ healthy: boolean; latencyMs: number }>(
+      (resolve) => {
+        const timeout = setTimeout(() => {
+          sub.unsubscribe(HEALTH_CHANNEL).catch(() => {});
+          sub.disconnect();
+          debugLog(
+            "notification_health_check_failed",
+            "warn",
+            { probe: "redis_pubsub", reason: "timeout" },
+          );
+          resolve({ healthy: false, latencyMs: -1 });
+        }, PUBSUB_TIMEOUT_MS);
+
+        sub.subscribe(HEALTH_CHANNEL, (err) => {
+          if (err) {
+            clearTimeout(timeout);
+            sub.disconnect();
+            resolve({ healthy: false, latencyMs: -1 });
+            return;
+          }
+
+          sub.on("message", (_channel: string, message: string) => {
+            if (message === token) {
+              clearTimeout(timeout);
+              const latencyMs = Math.round(performance.now() - start);
+              sub.unsubscribe(HEALTH_CHANNEL).catch(() => {});
+              sub.disconnect();
+              resolve({ healthy: true, latencyMs });
+            }
+          });
+
+          pub.publish(HEALTH_CHANNEL, token).catch(() => {
+            clearTimeout(timeout);
+            sub.disconnect();
+            resolve({ healthy: false, latencyMs: -1 });
+          });
+        });
+      },
+    );
+
+    return result;
+  } catch {
+    debugLog(
+      "notification_health_check_failed",
+      "warn",
+      { probe: "redis_pubsub", reason: "exception" },
+    );
+    return { healthy: false, latencyMs: -1 };
+  }
+}
+
+// ── Admin-Broadcast Error Rate Probe ────────────────────────────
+
+const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
+const ERROR_RATE_THRESHOLD = 0.1; // 10%
+
+interface RateCounter {
+  total: number;
+  errors: number;
+  windowStart: number;
+}
+
+const broadcastCounter: RateCounter = {
+  total: 0,
+  errors: 0,
+  windowStart: Date.now(),
+};
+
+function resetCounterIfStale(): void {
+  const now = Date.now();
+  if (now - broadcastCounter.windowStart > WINDOW_MS) {
+    broadcastCounter.total = 0;
+    broadcastCounter.errors = 0;
+    broadcastCounter.windowStart = now;
+  }
+}
+
+/** Call from admin-broadcast endpoint on each request. */
+export function recordBroadcastRequest(success: boolean): void {
+  resetCounterIfStale();
+  broadcastCounter.total++;
+  if (!success) broadcastCounter.errors++;
+}
+
+export async function checkAdminBroadcastHealth(): Promise<{
+  healthy: boolean;
+  errorRate: number;
+}> {
+  resetCounterIfStale();
+  if (broadcastCounter.total === 0) {
+    return { healthy: true, errorRate: 0 };
+  }
+  const errorRate = broadcastCounter.errors / broadcastCounter.total;
+  return {
+    healthy: errorRate <= ERROR_RATE_THRESHOLD,
+    errorRate: Math.round(errorRate * 10000) / 10000,
+  };
+}
+
+// ── SSE Connection Count Gauge ──────────────────────────────────
+
+/** Import and read the activeSubscribers map size from notificationStream. */
+export async function getSSEConnectionCount(): Promise<number> {
+  // The notificationStream module exports activeSubscribers as a module-level Map.
+  // We read its total size across all users.
+  try {
+    const streamModule = await import("../routes/notificationStream");
+    if (typeof streamModule.getActiveSSEConnectionCount === "function") {
+      return streamModule.getActiveSSEConnectionCount();
+    }
+    return -1; // Function not exported yet
+  } catch {
+    return -1;
+  }
+}
+
+const SSE_ALERT_THRESHOLD = 500;
+
+// ── Combined Health Check ───────────────────────────────────────
+
+export interface NotificationHealthResult {
+  healthy: boolean;
+  probes: {
+    redisPubSub: { healthy: boolean; latencyMs: number };
+    adminBroadcast: { healthy: boolean; errorRate: number };
+    sseConnections: { count: number; healthy: boolean };
+  };
+}
+
+export async function checkNotificationHealth(): Promise<NotificationHealthResult> {
+  const [redisPubSub, adminBroadcast, sseCount] = await Promise.all([
+    checkRedisPubSubHealth(),
+    checkAdminBroadcastHealth(),
+    getSSEConnectionCount(),
+  ]);
+
+  const sseHealthy = sseCount < 0 || sseCount <= SSE_ALERT_THRESHOLD;
+
+  return {
+    healthy: redisPubSub.healthy && adminBroadcast.healthy && sseHealthy,
+    probes: {
+      redisPubSub,
+      adminBroadcast,
+      sseConnections: { count: sseCount, healthy: sseHealthy },
+    },
+  };
+}
diff --git a/apps/web/shared/__tests__/notificationFeatureFlags.test.ts b/apps/web/shared/__tests__/notificationFeatureFlags.test.ts
new file mode 100644
index 00000000..5eb44d57
--- /dev/null
+++ b/apps/web/shared/__tests__/notificationFeatureFlags.test.ts
@@ -0,0 +1,35 @@
+import { describe, it, expect } from "vitest";
+import {
+  type TenantFeatureFlags,
+  ALLOWED_FEATURE_FLAGS,
+  FEATURE_FLAG_DEFAULTS,
+} from "../featureFlags";
+
+describe("Notification feature flags", () => {
+  const NOTIFICATION_FLAGS: (keyof TenantFeatureFlags)[] = [
+    "notificationDedupEnabled",
+    "notificationPreferencesEnabled",
+    "notificationEscalationEnabled",
+    "notificationUnifiedCenter",
+    "notificationEmailDelivery",
+    "notificationWebhookDelivery",
+  ];
+
+  it("all 6 notification flags exist in FEATURE_FLAG_DEFAULTS", () => {
+    for (const flag of NOTIFICATION_FLAGS) {
+      expect(FEATURE_FLAG_DEFAULTS).toHaveProperty(flag);
+    }
+  });
+
+  it("all 6 notification flags default to false", () => {
+    for (const flag of NOTIFICATION_FLAGS) {
+      expect(FEATURE_FLAG_DEFAULTS[flag]).toBe(false);
+    }
+  });
+
+  it("all 6 notification flags are in ALLOWED_FEATURE_FLAGS set", () => {
+    for (const flag of NOTIFICATION_FLAGS) {
+      expect(ALLOWED_FEATURE_FLAGS.has(flag)).toBe(true);
+    }
+  });
+});
diff --git a/apps/web/shared/__tests__/notificationMenu.test.ts b/apps/web/shared/__tests__/notificationMenu.test.ts
new file mode 100644
index 00000000..37f5210c
--- /dev/null
+++ b/apps/web/shared/__tests__/notificationMenu.test.ts
@@ -0,0 +1,28 @@
+import { describe, it, expect } from "vitest";
+import { defaultMenuItems } from "@smartspec/shared";
+
+describe("Notification menu entries", () => {
+  it("has admin-notifications menu item at /admin/notifications with admin role", () => {
+    const item = defaultMenuItems.find((m) => m.id === "admin-notifications");
+    expect(item).toBeDefined();
+    expect(item!.path).toBe("/admin/notifications");
+    expect(item!.roles).toContain("admin");
+  });
+
+  it("has admin-alert-rules menu item at /admin/alert-rules with admin role", () => {
+    const item = defaultMenuItems.find((m) => m.id === "admin-alert-rules");
+    expect(item).toBeDefined();
+    expect(item!.path).toBe("/admin/alert-rules");
+    expect(item!.roles).toContain("admin");
+  });
+
+  it("admin-notifications requires feature notificationUnifiedCenter", () => {
+    const item = defaultMenuItems.find((m) => m.id === "admin-notifications");
+    expect(item!.requiresFeature).toBe("notificationUnifiedCenter");
+  });
+
+  it("admin-alert-rules requires feature notificationPreferencesEnabled", () => {
+    const item = defaultMenuItems.find((m) => m.id === "admin-alert-rules");
+    expect(item!.requiresFeature).toBe("notificationPreferencesEnabled");
+  });
+});
diff --git a/apps/web/shared/featureFlags.ts b/apps/web/shared/featureFlags.ts
index 1a23d8cf..18307649 100644
--- a/apps/web/shared/featureFlags.ts
+++ b/apps/web/shared/featureFlags.ts
@@ -27,8 +27,12 @@ export interface TenantFeatureFlags {
   multimodalMemory: boolean; // F20 — Multimodal chat memory (image analysis, embedding, retrieval)
   skillOrchestrator: boolean; // F21 — Hybrid Skill Orchestrator (multi-skill routing)
   orchestratorEnabled: boolean; // F22 — Virtual AI Office Orchestrator (team rooms, runs, scoped memory)
-  notificationUnifiedCenter: boolean; // F23 — Unified notification center admin dashboard
-  notificationEmailDelivery: boolean; // F24 — Email delivery channel for notifications
+  notificationDedupEnabled: boolean; // F23 — Notification deduplication with grouping
+  notificationPreferencesEnabled: boolean; // F24 — Per-category notification preferences
+  notificationEscalationEnabled: boolean; // F25 — Escalation policies for critical notifications
+  notificationUnifiedCenter: boolean; // F26 — Unified notification center admin dashboard
+  notificationEmailDelivery: boolean; // F27 — Email delivery channel for notifications
+  notificationWebhookDelivery: boolean; // F28 — Webhook delivery channel for notifications
 }
 
 export type TenantFeatureFlagKey = keyof TenantFeatureFlags;
@@ -60,8 +64,12 @@ export const ALLOWED_FEATURE_FLAGS: ReadonlySet<string> = new Set<TenantFeatureF
   "multimodalMemory",
   "skillOrchestrator",
   "orchestratorEnabled",
+  "notificationDedupEnabled",
+  "notificationPreferencesEnabled",
+  "notificationEscalationEnabled",
   "notificationUnifiedCenter",
   "notificationEmailDelivery",
+  "notificationWebhookDelivery",
 ]);
 
 /**
@@ -92,6 +100,10 @@ export const FEATURE_FLAG_DEFAULTS: Readonly<TenantFeatureFlags> = {
   multimodalMemory: false,
   skillOrchestrator: false,
   orchestratorEnabled: true,
+  notificationDedupEnabled: false,
+  notificationPreferencesEnabled: false,
+  notificationEscalationEnabled: false,
   notificationUnifiedCenter: false,
   notificationEmailDelivery: false,
+  notificationWebhookDelivery: false,
 };
diff --git a/packages/shared/src/constants/menu.ts b/packages/shared/src/constants/menu.ts
index e499676c..97e64e75 100644
--- a/packages/shared/src/constants/menu.ts
+++ b/packages/shared/src/constants/menu.ts
@@ -57,6 +57,7 @@ export const defaultMenuItems: MenuItem[] = [
   { id: 'admin-audit-logs',     label: 'Audit Logs',        labelTh: 'บันทึกตรวจสอบ', icon: 'Activity', path: '/admin/audit-logs', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.75 },
   { id: 'admin-orchestration-logs', label: 'Orchestration Logs', labelTh: 'บันทึก Orchestrator', icon: 'Workflow', path: '/admin/orchestration-logs', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.8 },
   { id: 'admin-notifications', label: 'Notifications', labelTh: 'การแจ้งเตือน', icon: 'Bell', path: '/admin/notifications', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.85, requiresFeature: 'notificationUnifiedCenter' },
+  { id: 'admin-alert-rules', label: 'Alert Rules', labelTh: 'กฎแจ้งเตือน', icon: 'BellRing', path: '/admin/alert-rules', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 21.9, requiresFeature: 'notificationPreferencesEnabled' },
   { id: 'admin-task-queue',     label: 'Task Queue',        labelTh: 'คิวงาน',  icon: 'ListChecks', path: '/tasks',                    platforms: ['web', 'desktop'], group: 'main', sortOrder: 9.6 },
   { id: 'admin-docker',         label: 'Docker Status',     icon: 'Activity',    path: 'https://docker.smartaihub.app',    platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 22,   external: true },
   { id: 'admin-glitchtip',      label: 'Error Tracking',    icon: 'Bug',         path: 'https://glitchtip.smartaihub.app', platforms: ['web', 'desktop'], roles: ['admin'], group: 'admin', sortOrder: 22.5, external: true },
