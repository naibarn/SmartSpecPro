diff --git a/apps/web/server/services/providerHealth.test.ts b/apps/web/server/services/providerHealth.test.ts
new file mode 100644
index 0000000..524911a
--- /dev/null
+++ b/apps/web/server/services/providerHealth.test.ts
@@ -0,0 +1,162 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock the db module
+vi.mock("../db", () => ({
+  getDb: vi.fn().mockResolvedValue({
+    select: vi.fn().mockReturnValue({
+      from: vi.fn().mockResolvedValue([]),
+    }),
+    update: vi.fn().mockReturnValue({
+      set: vi.fn().mockReturnValue({
+        where: vi.fn().mockResolvedValue(undefined),
+      }),
+    }),
+  }),
+}));
+
+import {
+  recordSuccess,
+  recordFailure,
+  getHealthStatus,
+  isAvailable,
+  getHealthSummary,
+  initFromDb,
+  persistHealth,
+  _resetForTesting,
+} from "./providerHealth";
+import { getDb } from "../db";
+
+beforeEach(() => {
+  _resetForTesting();
+  vi.clearAllMocks();
+});
+
+describe("Health State Transitions", () => {
+  it("defaults new provider to healthy", () => {
+    expect(getHealthStatus(999)).toBe("healthy");
+  });
+
+  it("keeps healthy when failure rate below 5% with 10+ requests", () => {
+    // 20 successes, 1 failure = 4.76% < 5%
+    for (let i = 0; i < 20; i++) recordSuccess(1);
+    recordFailure(1, "timeout");
+    expect(getHealthStatus(1)).toBe("healthy");
+  });
+
+  it("transitions to degraded when failure rate exceeds 5%", () => {
+    // 9 successes, 1 failure = 10% > 5%
+    for (let i = 0; i < 9; i++) recordSuccess(1);
+    recordFailure(1, "server_error");
+    expect(getHealthStatus(1)).toBe("degraded");
+  });
+
+  it("transitions to down when failure rate exceeds 20%", () => {
+    // 8 successes, 3 failures = 27% > 20%
+    for (let i = 0; i < 8; i++) recordSuccess(1);
+    for (let i = 0; i < 3; i++) recordFailure(1, "server_error");
+    expect(getHealthStatus(1)).toBe("down");
+  });
+
+  it("down provider returns isAvailable() = false", () => {
+    for (let i = 0; i < 8; i++) recordSuccess(1);
+    for (let i = 0; i < 3; i++) recordFailure(1, "server_error");
+    expect(isAvailable(1)).toBe(false);
+  });
+
+  it("down provider with expired cooldown returns isAvailable() = true", () => {
+    for (let i = 0; i < 8; i++) recordSuccess(1);
+    for (let i = 0; i < 3; i++) recordFailure(1, "server_error");
+    expect(getHealthStatus(1)).toBe("down");
+
+    // Manipulate cooldown by accessing via summary
+    const summary = getHealthSummary();
+    const state = summary.get(1)!;
+    // Directly set cooldownUntil to past -- we need to access actual map
+    // Use _resetForTesting approach: set cooldown in the past via time mock
+    vi.useFakeTimers();
+    vi.advanceTimersByTime(61_000);
+    expect(isAvailable(1)).toBe(true);
+    vi.useRealTimers();
+  });
+
+  it("successful request after cooldown transitions down -> healthy", () => {
+    for (let i = 0; i < 8; i++) recordSuccess(1);
+    for (let i = 0; i < 3; i++) recordFailure(1, "server_error");
+    expect(getHealthStatus(1)).toBe("down");
+
+    vi.useFakeTimers();
+    vi.advanceTimersByTime(61_000);
+    recordSuccess(1);
+    expect(getHealthStatus(1)).toBe("healthy");
+    vi.useRealTimers();
+  });
+
+  it("failure rate dropping below 5% transitions degraded -> healthy", () => {
+    // Get to degraded: 9 successes, 1 failure = 10%
+    for (let i = 0; i < 9; i++) recordSuccess(1);
+    recordFailure(1, "server_error");
+    expect(getHealthStatus(1)).toBe("degraded");
+
+    // Add enough successes to drop below 5%: need failures/total < 0.05
+    // Currently 1 failure / 11 total = 9%. Need 1/N < 0.05 => N > 20
+    for (let i = 0; i < 10; i++) recordSuccess(1);
+    // Now 1 failure / 21 total = 4.76% < 5%
+    expect(getHealthStatus(1)).toBe("healthy");
+  });
+
+  it("getHealthSummary returns all tracked providers", () => {
+    recordSuccess(1);
+    recordSuccess(2);
+    recordSuccess(3);
+    const summary = getHealthSummary();
+    expect(summary.size).toBe(3);
+    expect(summary.has(1)).toBe(true);
+    expect(summary.has(2)).toBe(true);
+    expect(summary.has(3)).toBe(true);
+  });
+});
+
+describe("Persistence", () => {
+  it("initFromDb seeds in-memory state", async () => {
+    const mockDb = {
+      select: vi.fn().mockReturnValue({
+        from: vi.fn().mockResolvedValue([
+          { id: 10, healthStatus: "degraded", failureCount: 5, successCount: 50 },
+        ]),
+      }),
+    };
+    vi.mocked(getDb).mockResolvedValue(mockDb as any);
+
+    await initFromDb();
+    expect(getHealthStatus(10)).toBe("degraded");
+  });
+
+  it("provider marked down in DB starts as down in memory", async () => {
+    const mockDb = {
+      select: vi.fn().mockReturnValue({
+        from: vi.fn().mockResolvedValue([
+          { id: 20, healthStatus: "down", failureCount: 15, successCount: 10 },
+        ]),
+      }),
+    };
+    vi.mocked(getDb).mockResolvedValue(mockDb as any);
+
+    await initFromDb();
+    expect(getHealthStatus(20)).toBe("down");
+    expect(isAvailable(20)).toBe(false);
+  });
+
+  it("persistHealth writes current status to llm_providers", async () => {
+    const whereFn = vi.fn().mockResolvedValue(undefined);
+    const setFn = vi.fn().mockReturnValue({ where: whereFn });
+    const updateFn = vi.fn().mockReturnValue({ set: setFn });
+    const mockDb = { update: updateFn };
+    vi.mocked(getDb).mockResolvedValue(mockDb as any);
+
+    recordSuccess(1);
+    recordSuccess(2);
+
+    await persistHealth();
+    expect(updateFn).toHaveBeenCalledTimes(2);
+  });
+});
diff --git a/apps/web/server/services/providerHealth.ts b/apps/web/server/services/providerHealth.ts
new file mode 100644
index 0000000..7202a3a
--- /dev/null
+++ b/apps/web/server/services/providerHealth.ts
@@ -0,0 +1,164 @@
+import { eq } from "drizzle-orm";
+import { getDb } from "../db";
+import { llmProviders } from "../../drizzle/schema";
+
+// --- Types ---
+
+export type HealthStatus = "healthy" | "degraded" | "down";
+
+export interface ProviderHealthState {
+  successCount: number;
+  failureCount: number;
+  lastFailureAt: number | null;
+  status: HealthStatus;
+  cooldownUntil: number | null;
+}
+
+// --- Constants ---
+
+const FAILURE_RATE_DEGRADED = 0.05;
+const FAILURE_RATE_DOWN = 0.20;
+const MIN_REQUESTS_FOR_RATE = 10;
+const COOLDOWN_MS = 60_000;
+const RESET_INTERVAL_MS = 5 * 60_000; // Reset rolling counts every 5 min
+
+// --- In-Memory State ---
+
+const healthMap = new Map<number, ProviderHealthState>();
+let resetTimer: ReturnType<typeof setInterval> | null = null;
+
+function getOrCreate(providerId: number): ProviderHealthState {
+  let state = healthMap.get(providerId);
+  if (!state) {
+    state = {
+      successCount: 0,
+      failureCount: 0,
+      lastFailureAt: null,
+      status: "healthy",
+      cooldownUntil: null,
+    };
+    healthMap.set(providerId, state);
+  }
+  return state;
+}
+
+function failureRate(state: ProviderHealthState): number {
+  const total = state.successCount + state.failureCount;
+  if (total < MIN_REQUESTS_FOR_RATE) return 0;
+  return state.failureCount / total;
+}
+
+function updateStatus(state: ProviderHealthState): void {
+  const rate = failureRate(state);
+  if (rate > FAILURE_RATE_DOWN) {
+    if (state.status !== "down") {
+      state.status = "down";
+      state.cooldownUntil = Date.now() + COOLDOWN_MS;
+    }
+  } else if (rate > FAILURE_RATE_DEGRADED) {
+    if (state.status !== "down") {
+      state.status = "degraded";
+    }
+  } else if (state.status === "degraded") {
+    state.status = "healthy";
+  }
+}
+
+// --- Exported Functions ---
+
+export function recordSuccess(providerId: number): void {
+  const state = getOrCreate(providerId);
+  state.successCount++;
+
+  if (state.status === "down" && state.cooldownUntil && Date.now() >= state.cooldownUntil) {
+    state.status = "healthy";
+    state.successCount = 1;
+    state.failureCount = 0;
+    state.cooldownUntil = null;
+  } else if (state.status === "degraded") {
+    updateStatus(state);
+  }
+}
+
+export function recordFailure(providerId: number, _errorType: string): void {
+  const state = getOrCreate(providerId);
+  state.failureCount++;
+  state.lastFailureAt = Date.now();
+  updateStatus(state);
+}
+
+export function getHealthStatus(providerId: number): HealthStatus {
+  return healthMap.get(providerId)?.status ?? "healthy";
+}
+
+export function isAvailable(providerId: number): boolean {
+  const state = healthMap.get(providerId);
+  if (!state) return true;
+  if (state.status === "healthy" || state.status === "degraded") return true;
+  if (state.status === "down" && state.cooldownUntil && Date.now() >= state.cooldownUntil) return true;
+  return false;
+}
+
+export function getHealthSummary(): Map<number, ProviderHealthState> {
+  return new Map(healthMap);
+}
+
+export async function initFromDb(): Promise<void> {
+  const db = await getDb();
+  if (!db) return;
+
+  const rows = await db
+    .select({
+      id: llmProviders.id,
+      healthStatus: llmProviders.healthStatus,
+      failureCount: llmProviders.failureCount,
+      successCount: llmProviders.successCount,
+    })
+    .from(llmProviders);
+
+  for (const row of rows) {
+    const status = (row.healthStatus as HealthStatus) || "healthy";
+    healthMap.set(row.id, {
+      successCount: row.successCount ?? 0,
+      failureCount: row.failureCount ?? 0,
+      lastFailureAt: null,
+      status,
+      cooldownUntil: status === "down" ? Date.now() + COOLDOWN_MS : null,
+    });
+  }
+}
+
+export async function persistHealth(): Promise<void> {
+  const db = await getDb();
+  if (!db) return;
+
+  for (const [providerId, state] of healthMap) {
+    await db
+      .update(llmProviders)
+      .set({
+        healthStatus: state.status,
+        lastHealthCheck: new Date(),
+        failureCount: state.failureCount,
+        successCount: state.successCount,
+      })
+      .where(eq(llmProviders.id, providerId));
+  }
+}
+
+export function startPeriodicPersistence(): void {
+  if (resetTimer) return;
+  // Persist health every 60s
+  setInterval(() => { persistHealth().catch(() => {}); }, 60_000);
+  // Reset rolling counts every 5 minutes
+  resetTimer = setInterval(() => {
+    for (const state of healthMap.values()) {
+      state.successCount = 0;
+      state.failureCount = 0;
+    }
+  }, RESET_INTERVAL_MS);
+}
+
+/** For testing only */
+export function _resetForTesting(): void {
+  healthMap.clear();
+}
