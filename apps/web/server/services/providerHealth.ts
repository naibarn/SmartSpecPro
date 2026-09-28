import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { llmProviders } from "../../drizzle/schema";

// --- Types ---

export type HealthStatus = "healthy" | "degraded" | "down";

export interface ProviderHealthState {
  successCount: number;
  failureCount: number;
  lastFailureAt: number | null;
  status: HealthStatus;
  cooldownUntil: number | null;
}

// --- Constants ---

const FAILURE_RATE_DEGRADED = 0.05;
const FAILURE_RATE_DOWN = 0.20;
const MIN_REQUESTS_FOR_RATE = 10;
const COOLDOWN_MS = 60_000;
const RESET_INTERVAL_MS = 5 * 60_000; // Reset rolling counts every 5 min

// --- In-Memory State ---

const healthMap = new Map<number, ProviderHealthState>();
let resetTimer: ReturnType<typeof setInterval> | null = null;

function getOrCreate(providerId: number): ProviderHealthState {
  let state = healthMap.get(providerId);
  if (!state) {
    state = {
      successCount: 0,
      failureCount: 0,
      lastFailureAt: null,
      status: "healthy",
      cooldownUntil: null,
    };
    healthMap.set(providerId, state);
  }
  return state;
}

function failureRate(state: ProviderHealthState): number {
  const total = state.successCount + state.failureCount;
  if (total < MIN_REQUESTS_FOR_RATE) return 0;
  return state.failureCount / total;
}

function updateStatus(state: ProviderHealthState): void {
  const rate = failureRate(state);
  const prev = state.status;
  if (rate > FAILURE_RATE_DOWN) {
    if (state.status !== "down") {
      state.status = "down";
      state.cooldownUntil = Date.now() + COOLDOWN_MS;
    }
  } else if (rate > FAILURE_RATE_DEGRADED) {
    if (state.status !== "down") {
      state.status = "degraded";
    }
  } else if (state.status === "degraded") {
    state.status = "healthy";
  }
  // Persist on critical state transitions
  if (prev !== state.status && (state.status === "down" || state.status === "healthy")) {
    persistHealth().catch(() => {});
  }
}

// --- Exported Functions ---

export function recordSuccess(providerId: number): void {
  const state = getOrCreate(providerId);
  state.successCount++;

  if (state.status === "down" && state.cooldownUntil && Date.now() >= state.cooldownUntil) {
    state.status = "healthy";
    state.successCount = 1;
    state.failureCount = 0;
    state.cooldownUntil = null;
  } else if (state.status === "degraded") {
    updateStatus(state);
  }
}

export function recordFailure(providerId: number, _errorType: string): void {
  // Provider-side reference download failures are specific to one request or
  // asset. They must not contribute to provider-wide health, otherwise one
  // stale/unauthorized media URL can remove a healthy vision provider from
  // routing for every tenant.
  if (_errorType === "reference_unavailable") return;

  const state = getOrCreate(providerId);
  state.failureCount++;
  state.lastFailureAt = Date.now();
  updateStatus(state);
}

export function getHealthStatus(providerId: number): HealthStatus {
  return healthMap.get(providerId)?.status ?? "healthy";
}

export function isAvailable(providerId: number): boolean {
  const state = healthMap.get(providerId);
  if (!state) return true;
  if (state.status === "healthy" || state.status === "degraded") return true;
  if (state.status === "down" && state.cooldownUntil && Date.now() >= state.cooldownUntil) return true;
  return false;
}

export function getHealthSummary(): Map<number, ProviderHealthState> {
  return new Map(healthMap);
}

export async function initFromDb(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const rows = await db
    .select({
      id: llmProviders.id,
      healthStatus: llmProviders.healthStatus,
      failureCount: llmProviders.failureCount,
      successCount: llmProviders.successCount,
    })
    .from(llmProviders);

  for (const row of rows) {
    const status = (row.healthStatus as HealthStatus) || "healthy";
    healthMap.set(row.id, {
      successCount: row.successCount ?? 0,
      failureCount: row.failureCount ?? 0,
      lastFailureAt: null,
      status,
      cooldownUntil: status === "down" ? Date.now() + COOLDOWN_MS : null,
    });
  }
}

export async function persistHealth(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  for (const [providerId, state] of healthMap) {
    await db
      .update(llmProviders)
      .set({
        healthStatus: state.status,
        lastHealthCheck: new Date(),
        failureCount: state.failureCount,
        successCount: state.successCount,
      })
      .where(eq(llmProviders.id, providerId));
  }
}

export function startPeriodicPersistence(): void {
  if (resetTimer) return;
  // Persist health every 60s
  setInterval(() => { persistHealth().catch(() => {}); }, 60_000);
  // Reset rolling counts every 5 minutes
  resetTimer = setInterval(() => {
    for (const state of healthMap.values()) {
      if (state.status === "down") continue; // Don't reset counts for downed providers
      state.successCount = 0;
      state.failureCount = 0;
    }
  }, RESET_INTERVAL_MS);
}

/** For testing only */
export function _resetForTesting(): void {
  healthMap.clear();
}
