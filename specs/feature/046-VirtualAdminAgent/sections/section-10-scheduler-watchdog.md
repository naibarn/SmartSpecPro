Now I have all the context needed. Here is the section content:

# Section 10: Scheduler and Watchdog

## Overview

This section implements the Guardian lifecycle manager (scheduler) and self-monitoring watchdog. The scheduler is responsible for starting sensor polling intervals in a staggered fashion, responding to the `VIRTUAL_ADMIN_ENABLED` environment flag, and performing graceful shutdown on SIGTERM/SIGINT. The watchdog is a separate periodic job that monitors the Guardian itself -- detecting stuck sensors, runaway incidents, excessive memory usage, and stale SSE connections -- and exposes a `/api/virtual-admin/health` HTTP endpoint for external monitoring.

**Depends on:** section-02-sensor-framework (sensor registry, `SensorReading`, `Sensor` interface, sensor config loading)

**Does not block any other section.** Can be implemented in parallel with section-06, section-07, or section-09 (batch 5).

---

## Files to Create / Modify

| File | Purpose |
|------|---------|
| `apps/web/server/services/virtualAdmin/scheduler.ts` | Guardian lifecycle: `startGuardian()`, `stopGuardian()`, staggered sensor interval management |
| `apps/web/server/jobs/guardianWatchdog.ts` | Self-monitoring: stuck sensor detection, incident count check, memory check, SSE listener pruning, `/health` response data |
| `apps/web/server/services/virtualAdmin/__tests__/scheduler.test.ts` | Scheduler unit tests |
| `apps/web/server/services/virtualAdmin/__tests__/guardianWatchdog.test.ts` | Watchdog unit tests |
| `apps/web/server/_core/index.ts` | **Modify** -- import and call `startGuardian()` during startup, call `stopGuardian()` during SIGTERM/SIGINT shutdown |

---

## Background Context

### Existing Patterns in This Codebase

The server at `apps/web/server/_core/index.ts` follows a consistent pattern for background jobs:

1. **Initialization** happens after the HTTP server is listening (around line 1235+). Jobs export an `initialize*()` or `start*()` function that is called there.
2. **Shutdown** happens in the `process.on("SIGTERM", ...)` handler (around line 1312). Jobs export a `shutdown*()` function that clears intervals/timeouts and is called with `.catch(() => {})`.
3. **SIGINT** mirrors SIGTERM with the same shutdown calls (around line 1377).

Example from `purgeOldTrashItems.ts`:
- Exports `initializeTrashPurgeJob()` which sets a `setTimeout` then `setInterval`
- Exports `shutdownTrashPurgeWorker()` which clears both timeout and interval
- Uses a module-level `intervalId` variable to track the timer

The queue health monitor (`queueHealthMonitor.ts`) is imported lazily in the SIGTERM handler via dynamic `import()` and exports `startQueueHealthMonitor()` / `stopQueueHealthMonitor()`.

### Sensor Framework (from section-02)

The sensor registry in `apps/web/server/services/virtualAdmin/sensorRegistry.ts` provides:
- An array of registered `Sensor` instances, each with `id`, `name`, `defaultIntervalMs`, and `collect(tenantId?)` method
- A config loader that reads `virtual_admin_sensor_config` table for per-tenant overrides (custom `intervalMs`, `enabled` flag, `thresholdsJson`)
- Each `collect()` call returns a `SensorReading` with `sensorId`, `timestamp`, `status`, `metrics`, `message`, and optional `tenantId`

### Environment Variable

`VIRTUAL_ADMIN_ENABLED` (boolean string, default `"true"`) controls whether the Guardian starts at all. When false, `startGuardian()` should return immediately without scheduling anything.

---

## Tests (Write First)

All tests use Vitest with `vi.useFakeTimers()` for timer control. No real infrastructure needed.

### Scheduler Tests

**File:** `apps/web/server/services/virtualAdmin/__tests__/scheduler.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("GuardianScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts all sensor intervals on startGuardian()");
  // Verify: after calling startGuardian(), each registered sensor
  // has an active setInterval. Advance timers past each sensor's
  // intervalMs and confirm collect() was called.

  it("clears all intervals on stopGuardian()");
  // Verify: after startGuardian() then stopGuardian(), advancing
  // timers does NOT trigger additional collect() calls.

  it("staggers sensor starts (not all at once)");
  // Verify: sensors do not all fire at t=0. Each sensor's first
  // collect() should be delayed by (index * staggerDelayMs).
  // Default stagger: 2000ms per sensor. So sensor[0] fires at 2s,
  // sensor[1] at 4s, sensor[2] at 6s, etc.

  it("respects VIRTUAL_ADMIN_ENABLED=false");
  // Verify: when env var is "false", startGuardian() returns
  // immediately and no intervals are created.

  it("feeds sensor readings to the rule engine after each collect()");
  // Verify: after a sensor's collect() resolves, the result is
  // passed to ruleEngine.evaluate(reading). Mock ruleEngine.

  it("logs 'System Guardian started' audit event on startup");
  // Verify: auditLogger.log() called with eventType containing
  // "guardian" and message indicating startup.

  it("logs 'System Guardian stopped' audit event on shutdown");
  // Verify: after stopGuardian(), auditLogger.log() called with
  // shutdown message.

  it("handles sensor collect() rejection without stopping other sensors");
  // Verify: if one sensor's collect() throws, the interval for
  // that sensor continues, and other sensors are unaffected.

  it("marks in-progress actions as interrupted on stopGuardian()");
  // Verify: any pending approval records that were mid-execution
  // get their status noted (or at minimum, no crash occurs).
});
```

### Watchdog Tests

**File:** `apps/web/server/services/virtualAdmin/__tests__/guardianWatchdog.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("GuardianWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("detects stuck sensor (no run in 3x interval)");
  // Verify: if a sensor with intervalMs=60000 has lastRunAt older
  // than 180000ms ago, watchdog flags it and attempts restart.

  it("detects too many open incidents (>100)");
  // Verify: when open incident count exceeds 100, watchdog
  // auto-expires the oldest warning-level incidents to bring
  // count below threshold.

  it("reports healthy when all checks pass");
  // Verify: getHealthStatus() returns { status: "healthy", ... }
  // when no stuck sensors, incident count normal, memory OK.

  it("external /health endpoint returns status");
  // Verify: the health check data structure includes fields:
  // status, sensorCount, stuckSensors, openIncidents,
  // memoryUsageMb, uptimeSeconds, lastWatchdogRunAt.

  it("detects high memory usage (>200MB)");
  // Verify: when process.memoryUsage().heapUsed > 200MB,
  // watchdog logs a critical warning.

  it("runs on 5-minute interval");
  // Verify: watchdog check fires every 300000ms.

  it("restarts stuck sensor by clearing and re-creating its interval");
  // Verify: after detecting a stuck sensor, the old interval is
  // cleared and a new one is set up.
});
```

---

## Implementation Details

### scheduler.ts

**File:** `apps/web/server/services/virtualAdmin/scheduler.ts`

This module manages the full Guardian lifecycle. It is the single entry point called from the server startup code.

**Exported functions:**

- `startGuardian(): Promise<void>` -- called once at server startup
- `stopGuardian(): Promise<void>` -- called during SIGTERM/SIGINT graceful shutdown
- `isGuardianRunning(): boolean` -- returns whether the scheduler is active
- `getSensorLastRunTimes(): Map<string, Date>` -- used by the watchdog to detect stuck sensors

**Module-level state:**

- `sensorIntervals: Map<string, NodeJS.Timeout>` -- maps sensorId to its `setInterval` handle
- `sensorLastRun: Map<string, Date>` -- tracks when each sensor last completed a `collect()` call
- `staggerTimeouts: NodeJS.Timeout[]` -- the initial `setTimeout` handles used for staggering
- `running: boolean` -- flag to prevent double-start

**startGuardian() logic:**

1. Check `process.env.VIRTUAL_ADMIN_ENABLED`. If explicitly `"false"`, log a message and return early.
2. Call `ensureSystemUser()` from section-01's `systemUser.ts` to guarantee the system user and JWT exist.
3. Load all registered sensors from the sensor registry (section-02).
4. Load per-tenant sensor config overrides from DB.
5. For each sensor (index `i`), schedule a `setTimeout` with delay `i * 2000` (stagger). Inside the timeout callback:
   - Call the sensor's `collect()` (or iterate per tenant for per-tenant sensors).
   - Wrap in try/catch. On success, pass the `SensorReading` to `ruleEngine.evaluate()` (section-03). On failure, log the error and produce a fallback reading with `status: "unknown"`.
   - Update `sensorLastRun.set(sensor.id, new Date())`.
   - Then set up `setInterval(callback, effectiveIntervalMs)` where `effectiveIntervalMs` comes from DB config or `sensor.defaultIntervalMs`.
   - Store the interval handle in `sensorIntervals`.
6. Start the watchdog timer (call `startWatchdog()` from `guardianWatchdog.ts`).
7. Log `"System Guardian started"` to the audit logger.

**stopGuardian() logic:**

1. Set `running = false`.
2. Clear all stagger timeouts (`staggerTimeouts.forEach(clearTimeout)`).
3. Clear all sensor intervals (`sensorIntervals.forEach(clearInterval)`).
4. Stop the watchdog timer (`stopWatchdog()`).
5. Flush any pending notifications (call `notifier.flush()` if it exists, section-05).
6. Log `"System Guardian stopped"` to the audit logger.

**Per-tenant sensor iteration:**

For sensors in the "per-tenant" category (credit_balance, media_pipeline), the scheduler must iterate over all active tenants. Use a DB query to get active tenant IDs, then call `sensor.collect(tenantId)` for each. This happens inside the same interval callback -- one interval per sensor, but the callback loops over tenants.

### guardianWatchdog.ts

**File:** `apps/web/server/jobs/guardianWatchdog.ts`

The watchdog monitors the Guardian itself to prevent silent failures.

**Exported functions:**

- `startWatchdog(): void` -- creates a 5-minute `setInterval`
- `stopWatchdog(): void` -- clears the interval
- `getHealthStatus(): GuardianHealthStatus` -- returns current health data (used by the HTTP endpoint)

**GuardianHealthStatus type:**

```typescript
interface GuardianHealthStatus {
  status: "healthy" | "degraded" | "critical";
  guardianRunning: boolean;
  uptimeSeconds: number;
  sensorCount: number;
  stuckSensors: string[];       // sensor IDs that haven't run in 3x their interval
  openIncidentCount: number;
  memoryUsageMb: number;
  sseListenerCount: number;
  lastWatchdogRunAt: Date | null;
  checks: {
    sensorsOk: boolean;
    incidentsOk: boolean;
    memoryOk: boolean;
    sseOk: boolean;
  };
}
```

**Watchdog check logic (runs every 5 minutes):**

1. **Stuck sensor detection:** Call `getSensorLastRunTimes()` from the scheduler. For each sensor, if `now - lastRunAt > 3 * sensor.intervalMs`, add to `stuckSensors` list. For stuck sensors, attempt recovery by clearing the old interval and creating a new one (call a `restartSensor(sensorId)` helper exported from the scheduler).
2. **Open incident count:** Query `SELECT COUNT(*) FROM virtual_admin_incidents WHERE status = 'open'`. If count > 100, auto-expire the oldest warning-severity incidents: `UPDATE virtual_admin_incidents SET status = 'expired' WHERE severity = 'warning' AND status = 'open' ORDER BY createdAt ASC LIMIT (count - 80)`. This brings the count back to ~80, leaving headroom.
3. **Memory usage:** Read `process.memoryUsage().heapUsed`. If > 200MB, log a critical audit event. The watchdog does not kill the process -- systemd handles restarts.
4. **SSE listener count:** If the SSE module (section-05) exposes a `getListenerCount()` function, check it. If > 1000, call `pruneStaleListeners()` to force-close connections idle > 60 minutes.
5. **Aggregate status:** `healthy` if all checks pass, `degraded` if any non-critical issue, `critical` if stuck sensors > 2 or memory > 300MB.
6. Update `lastWatchdogRunAt`.

**Restart sensor helper:**

The scheduler should export a `restartSensor(sensorId: string): void` function that:
1. Clears the existing interval for that sensor.
2. Removes it from `sensorIntervals`.
3. Re-creates the interval with the same callback and interval timing.
4. Logs a warning audit event: `"Watchdog restarted stuck sensor: {sensorId}"`.

### Health Endpoint

**Modification:** `apps/web/server/_core/index.ts`

Register a lightweight Express GET endpoint (no tRPC, no auth required -- this is for monitoring tools like systemd or uptime checks):

```typescript
app.get("/api/virtual-admin/health", async (_req, res) => {
  try {
    const { getHealthStatus } = await import("../jobs/guardianWatchdog");
    const status = getHealthStatus();
    const httpCode = status.status === "healthy" ? 200 : status.status === "degraded" ? 200 : 503;
    res.status(httpCode).json(status);
  } catch {
    res.status(503).json({ status: "critical", error: "Guardian not initialized" });
  }
});
```

Place this near the existing `/healthz` endpoint (around line 198 of `_core/index.ts`). This endpoint is unauthenticated intentionally -- it returns only operational status, no sensitive data.

### Server Startup Integration

**Modification:** `apps/web/server/_core/index.ts`

Add import at the top of the file (alongside existing job imports around line 65):

```typescript
import { startGuardian, stopGuardian } from "../services/virtualAdmin/scheduler";
```

Call `startGuardian()` in the server initialization section (after existing job initializations, around line 1290):

```typescript
// Start System Guardian (virtual admin agent)
startGuardian().catch((err) => {
  console.error("[Guardian] Failed to start System Guardian:", err);
});
```

### Server Shutdown Integration

**Modification:** `apps/web/server/_core/index.ts`

In the `process.on("SIGTERM", ...)` handler (around line 1315), add `stopGuardian()` to the background scheduler shutdown block:

```typescript
import("../services/virtualAdmin/scheduler").then(({ stopGuardian }) => {
  stopGuardian();
}).catch(() => {});
```

Place it alongside the existing `stopQueueHealthMonitor()` call. Repeat the same addition in the `process.on("SIGINT", ...)` handler (around line 1380).

### Degraded Mode

When the Guardian detects persistent issues (watchdog reports `critical` status for 3 consecutive checks), it should enter degraded mode:

- Reduce sensor polling frequency to 2x the normal interval (less load on a struggling system).
- Suppress non-critical notifications (only send critical-severity alerts).
- Log a prominent audit event: `"System Guardian entered degraded mode"`.
- The health endpoint reflects `status: "degraded"` or `status: "critical"`.

To implement this, the scheduler maintains a `degradedMode: boolean` flag. The watchdog sets it to `true` after 3 consecutive critical checks. The sensor interval callback checks this flag and, if true, skips execution on alternating runs (effectively halving the frequency). The `stopGuardian()` and any manual override from the admin chat (section-06, "resume guardian") can reset this flag.

### Audit Events

The scheduler and watchdog emit these audit events (using the existing `auditLogger`):

| Event | When |
|-------|------|
| `guardian_started` | `startGuardian()` completes successfully |
| `guardian_stopped` | `stopGuardian()` completes |
| `guardian_sensor_stuck` | Watchdog detects a sensor that hasn't run in 3x interval |
| `guardian_sensor_restarted` | Watchdog successfully restarts a stuck sensor |
| `guardian_incidents_pruned` | Watchdog auto-expires old warnings to reduce count |
| `guardian_memory_high` | Heap usage exceeds 200MB |
| `guardian_degraded_mode` | Guardian enters or exits degraded mode |

---

## Relevant File Paths

- `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/scheduler.ts` (new)
- `/home/dev/projects/SmartSpecPro/apps/web/server/jobs/guardianWatchdog.ts` (new)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/__tests__/scheduler.test.ts` (new)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/__tests__/guardianWatchdog.test.ts` (new)
- `/home/dev/projects/SmartSpecPro/apps/web/server/_core/index.ts` (modify -- startup, shutdown, health endpoint)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/sensorRegistry.ts` (dependency from section-02 -- provides sensor list and config)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/types.ts` (dependency from section-02 -- `Sensor`, `SensorReading` types)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/systemUser.ts` (dependency from section-01 -- `ensureSystemUser()`)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/ruleEngine.ts` (dependency from section-03 -- `evaluate()`)
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/virtualAdmin/notifier.ts` (dependency from section-05 -- `flush()`)
- `/home/dev/projects/SmartSpecPro/apps/web/server/jobs/purgeOldTrashItems.ts` (reference for existing job pattern)