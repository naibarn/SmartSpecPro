Now I have sufficient context. Let me produce the section content.

# Section 02: Sensor Framework

## Overview

This section implements the sensor base interface, sensor registry, per-tenant config loading from the database, and 11 sensor implementations. Sensors are the data-collection layer of the System Guardian: they poll infrastructure and per-tenant metrics on a configurable interval and return `SensorReading` objects consumed by the rule engine (section-03).

**Depends on:** section-01-schema-system-user (database tables `virtual_admin_sensor_config`, enums, system user)
**Blocks:** section-03-rule-engine, section-10-scheduler-watchdog

---

## Files to Create

| File | Purpose |
|------|---------|
| `apps/web/server/services/virtualAdmin/types.ts` | Shared types (Sensor, SensorReading, etc.) |
| `apps/web/server/services/virtualAdmin/sensorRegistry.ts` | Base class, registry array, config loader |
| `apps/web/server/services/virtualAdmin/sensors/queueHealth.ts` | Wraps existing `getQueueHealthStatus()` |
| `apps/web/server/services/virtualAdmin/sensors/celeryHealth.ts` | HTTP to Python `/api/internal/virtual-admin/celery-health` |
| `apps/web/server/services/virtualAdmin/sensors/errorSpike.ts` | Audit JSONL tail + error rate calculation |
| `apps/web/server/services/virtualAdmin/sensors/llmProvider.ts` | Provider health from registry / circuit breaker |
| `apps/web/server/services/virtualAdmin/sensors/creditBalance.ts` | Per-tenant credit sum query |
| `apps/web/server/services/virtualAdmin/sensors/diskStorage.ts` | `media_storage/` disk usage check |
| `apps/web/server/services/virtualAdmin/sensors/dbHealth.ts` | PostgreSQL ping + connection pool stats |
| `apps/web/server/services/virtualAdmin/sensors/certExpiry.ts` | TLS certificate expiry for production domain |
| `apps/web/server/services/virtualAdmin/sensors/apiLatency.ts` | Self-ping latency to key endpoints |
| `apps/web/server/services/virtualAdmin/sensors/mediaPipeline.ts` | Per-tenant stuck/failed media generation check |
| `apps/web/server/services/virtualAdmin/sensors/teamEscalation.ts` | Unresolved critical incidents count |
| `apps/web/server/services/virtualAdmin/__tests__/sensorRegistry.test.ts` | Registry unit tests |
| `apps/web/server/services/virtualAdmin/__tests__/sensors/queueHealth.test.ts` | Queue sensor tests |
| `apps/web/server/services/virtualAdmin/__tests__/sensors/creditBalance.test.ts` | Credit sensor tests |
| `apps/web/server/services/virtualAdmin/__tests__/sensors/errorSpike.test.ts` | Error spike sensor tests |

---

## Tests (Write First)

All tests use Vitest. Sensor tests mock their external dependencies (Redis, DB, HTTP, filesystem) so they run without infrastructure.

### Registry Tests

**File:** `apps/web/server/services/virtualAdmin/__tests__/sensorRegistry.test.ts`

```typescript
// sensorRegistry.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("SensorRegistry", () => {
  it("registers sensor with id and interval");
  it("returns SensorReading with required fields (sensorId, timestamp, status, metrics, message)");
  it("handles sensor timeout (>10s) gracefully — returns status 'unknown'");
  it("handles sensor exception without crashing loop — catches, logs, returns unknown reading");
  it("marks sensor as unknown when source unreachable");
  it("loads config overrides from DB per tenant (enabled, intervalMs, thresholdsJson)");
  it("uses default config when no DB override exists");
});
```

**Key behaviors to verify:**
- `registerSensor(sensor)` adds to internal array; `getSensors()` returns all.
- `collectSafe(sensor, tenantId)` wraps `sensor.collect()` in a try/catch with a 10-second `AbortSignal.timeout`. On failure or timeout, it returns a reading with `status: "unknown"` and the error in `message`.
- `loadSensorConfig(tenantId, sensorId)` queries `virtual_admin_sensor_config` table. Returns DB row if found, otherwise `null` (caller uses sensor defaults).

### Per-Sensor Tests (Representative)

**File:** `apps/web/server/services/virtualAdmin/__tests__/sensors/queueHealth.test.ts`

```typescript
describe("QueueHealthSensor", () => {
  it("returns healthy when all queues below threshold");
  it("returns degraded when queue depth > warning threshold");
  it("returns critical when queue depth > critical threshold");
  it("includes queue name and depth in metrics");
});
```

Mock: `vi.mock("../../../queueHealthMonitor", () => ({ getQueueHealthStatus: vi.fn() }))`. Provide fake `QueueHealthStatus` objects with varying `activeAlerts` and queue lengths.

**File:** `apps/web/server/services/virtualAdmin/__tests__/sensors/creditBalance.test.ts`

```typescript
describe("CreditBalanceSensor", () => {
  it("returns healthy when balance > soft limit");
  it("returns degraded when balance < soft limit but > hard limit");
  it("returns critical when balance <= hard limit");
  it("runs per-tenant and includes tenantId in reading");
});
```

Mock: Drizzle `db.select()` chain. Return various sum values to test threshold logic. The soft limit defaults to 100, hard limit to -50 (loaded from system_settings or env).

**File:** `apps/web/server/services/virtualAdmin/__tests__/sensors/errorSpike.test.ts`

```typescript
describe("ErrorSpikeSensor", () => {
  it("returns healthy when error rate < baseline");
  it("returns degraded when error rate > 3x baseline");
  it("handles missing audit log file gracefully");
  it("counts only last 5 minutes of errors");
});
```

Mock: `fs.readFileSync` or `fs.createReadStream` to return fake JSONL lines with timestamps. Verify that only lines within the last 5 minutes are counted and compared against the 1-hour rolling baseline.

---

## Implementation Details

### types.ts — Core Type Definitions

**File:** `apps/web/server/services/virtualAdmin/types.ts`

This file is shared across all virtualAdmin modules. Define at minimum:

```typescript
/** Base sensor interface — every sensor implements this. */
export interface Sensor {
  /** Unique identifier, e.g. "queue_health", "credit_balance" */
  id: string;
  /** Human-readable name for dashboard display */
  name: string;
  /** Default polling interval in milliseconds */
  defaultIntervalMs: number;
  /** Sensor category for grouping */
  category: "system" | "per_tenant" | "cross_system";
  /**
   * Collect a reading. For per-tenant sensors, tenantId is provided
   * and the sensor should scope its query accordingly.
   */
  collect(tenantId?: string): Promise<SensorReading>;
}

export interface SensorReading {
  sensorId: string;
  timestamp: Date;
  status: "healthy" | "degraded" | "critical" | "unknown";
  metrics: Record<string, number | string>;
  message: string;
  tenantId?: string;
}

export interface SensorConfig {
  id: string;         // compound key: "{tenantId}:{sensorId}"
  tenantId: string;
  sensorId: string;
  enabled: boolean;
  intervalMs: number;
  thresholdsJson: Record<string, unknown>;
  updatedAt: Date;
}
```

Additional types for rules, incidents, approvals, and actuators are defined in section-03 and section-04 and can be added to this same file as those sections are implemented. Keep all virtualAdmin types centralized here.

### sensorRegistry.ts — Registry and Safe Collection

**File:** `apps/web/server/services/virtualAdmin/sensorRegistry.ts`

Key responsibilities:

1. **Sensor storage**: Maintain an array of registered `Sensor` instances. Export `registerSensor(s: Sensor)` and `getSensors(): Sensor[]`.

2. **Safe collection wrapper**: Export `collectSafe(sensor: Sensor, tenantId?: string): Promise<SensorReading>`. This wraps `sensor.collect(tenantId)` with:
   - A 10-second timeout using `AbortSignal.timeout(10_000)` or a `Promise.race` with a timer.
   - A try/catch that converts any error into a `SensorReading` with `status: "unknown"` and the error message in `message`.
   - Logging via the existing `auditLogger` (event type `guardian_sensor_check`) on every collection.

3. **Config loader**: Export `loadSensorConfig(tenantId: string, sensorId: string): Promise<SensorConfig | null>`. Query the `virtual_admin_sensor_config` table:
   ```
   SELECT * FROM virtual_admin_sensor_config
   WHERE id = '{tenantId}:{sensorId}'
   ```
   Return the row or `null`. The scheduler (section-10) uses this to override `intervalMs` and `enabled` per tenant. Sensors themselves can read `thresholdsJson` to adjust warning/critical thresholds.

4. **Bulk registration**: Export `registerAllSensors()` that instantiates and registers all 11 sensors. Called once at Guardian startup.

### Sensor Categories and Scope

Sensors are grouped into three categories that determine how the scheduler invokes them:

| Category | Sensors | How Called |
|----------|---------|-----------|
| **system** (system-wide) | queue_health, celery_health, db_health, cert_expiry, api_latency | `collect()` with no tenantId — one call covers all tenants |
| **per_tenant** | credit_balance, media_pipeline | `collect(tenantId)` — scheduler iterates over active tenants |
| **cross_system** | error_spike, llm_provider, disk_storage, team_escalation | `collect()` with no tenantId — reads cross-tenant data |

The scheduler (section-10) is responsible for iterating tenants for per_tenant sensors. The registry simply exposes the category metadata.

### Sensor Implementations

Each sensor file exports a single sensor instance (or a factory function). All sensors implement the `Sensor` interface from `types.ts`.

#### queue_health (`sensors/queueHealth.ts`)

- **Wraps**: `getQueueHealthStatus()` from `apps/web/server/services/queueHealthMonitor.ts`
- **defaultIntervalMs**: 60,000 (1 minute, matching the monitor's own interval)
- **Logic**: Call `getQueueHealthStatus()`. If `activeAlerts` is empty, return `healthy`. If any alert has `severity: "critical"`, return `critical`. Otherwise `degraded`. Put queue lengths into `metrics`.
- **No external calls** needed; the queue monitor already reads Redis internally.

#### celery_health (`sensors/celeryHealth.ts`)

- **Calls**: `GET http://localhost:8000/api/internal/virtual-admin/celery-health` (Python backend)
- **defaultIntervalMs**: 120,000 (2 minutes)
- **Logic**: Parse JSON response expecting `{ workers: number, activeTasks: number, queueLengths: Record<string, number> }`. If `workers === 0`, return `critical`. If any queue length > 500, return `degraded`. Otherwise `healthy`.
- **Note**: The Python endpoint must be created separately (it is a simple FastAPI route that calls `celery.control.inspect().active()` and `celery.control.inspect().stats()`). This sensor gracefully handles HTTP errors (connection refused, timeout) by returning `unknown`.

#### error_spike (`sensors/errorSpike.ts`)

- **Reads**: Today's audit JSONL file at `apps/web/logs/audit/audit-YYYY-MM-DD.jsonl`
- **defaultIntervalMs**: 300,000 (5 minutes)
- **Logic**:
  1. Read the last 1000 lines of the file (use `fs.readFileSync` + split, or stream the tail).
  2. Parse each line as JSON. Count entries where `eventType` includes "error" or `error` field is truthy, and `timestamp` is within last 5 minutes.
  3. Count entries in last 60 minutes for rolling baseline. Compute baseline rate = count_60min / 12 (per 5-min window).
  4. If recent count > 3x baseline rate, return `degraded`. If > 10x, return `critical`. Otherwise `healthy`.
  5. If file does not exist (e.g., first minute of the day), return `healthy` with a note.
- **Metrics**: `{ errorsLast5Min: N, baselineRate: N, ratio: N }`

#### llm_provider (`sensors/llmProvider.ts`)

- **Reads**: Provider health from the existing provider registry / circuit breaker state
- **defaultIntervalMs**: 180,000 (3 minutes)
- **Logic**: Query `llm_providers` table for all enabled providers. Check each provider's recent error rate from `provider_usage_log` (last 10 minutes). If any provider has >50% error rate, return `degraded`. If all providers are failing, return `critical`.
- **Metrics**: `{ totalProviders: N, healthyProviders: N, failingProviders: "provider1,provider2" }`

#### credit_balance (`sensors/creditBalance.ts`)

- **Per-tenant sensor**
- **defaultIntervalMs**: 600,000 (10 minutes)
- **Logic**: Query `SELECT SUM(amount) FROM credit_transactions WHERE "tenantId" = ?`. Compare against soft limit (default 100) and hard limit (default -50). Load limits from system_settings (`VIRTUAL_ADMIN_CREDIT_SOFT_LIMIT`, `VIRTUAL_ADMIN_CREDIT_HARD_LIMIT`) or use defaults.
  - balance > soft limit: `healthy`
  - balance <= soft limit and > hard limit: `degraded`
  - balance <= hard limit: `critical`
- **Metrics**: `{ balance: N, softLimit: N, hardLimit: N }`

#### disk_storage (`sensors/diskStorage.ts`)

- **Reads**: `media_storage/` directory size
- **defaultIntervalMs**: 3,600,000 (1 hour)
- **Logic**: Use `child_process.execFile("du", ["-sb", mediaStoragePath])` to get byte count. Compare against configurable threshold (default 10GB warning, 50GB critical). Also check available disk space via `os.freemem()` or `statvfs` equivalent.
- **Metrics**: `{ usedBytes: N, availableBytes: N, usedPercent: N }`

#### db_health (`sensors/dbHealth.ts`)

- **defaultIntervalMs**: 60,000 (1 minute)
- **Logic**: Execute `SELECT 1` via the Drizzle `db` instance with a 5-second timeout. If it succeeds, `healthy`. If timeout or error, `critical`. Optionally query `pg_stat_activity` for connection pool stats.
- **Metrics**: `{ latencyMs: N, activeConnections: N }`

#### cert_expiry (`sensors/certExpiry.ts`)

- **defaultIntervalMs**: 86,400,000 (24 hours — once per day)
- **Logic**: Use `tls.connect()` to `smartaihub.app:443`. Read the peer certificate's `valid_to` field. Calculate days remaining. If <7 days, `critical`. If <30 days, `degraded`. Otherwise `healthy`.
- **Metrics**: `{ daysRemaining: N, expiresAt: "ISO date string" }`

#### api_latency (`sensors/apiLatency.ts`)

- **defaultIntervalMs**: 300,000 (5 minutes)
- **Logic**: HTTP GET to `http://localhost:3000/api/health` (or a lightweight endpoint) and `http://localhost:8000/api/health`. Measure response time. If either >5s, `degraded`. If either >15s or no response, `critical`.
- **Metrics**: `{ webLatencyMs: N, pythonLatencyMs: N }`

#### media_pipeline (`sensors/mediaPipeline.ts`)

- **Per-tenant sensor**
- **defaultIntervalMs**: 600,000 (10 minutes)
- **Logic**: Query `media_generations` table for the tenant: count rows with `status = 'processing'` and `createdAt < NOW() - INTERVAL '30 minutes'` (stuck tasks). Count rows with `status = 'failed'` in last hour. If stuck > 0 or failed > 5, `degraded`. If stuck > 3 or failed > 20, `critical`.
- **Metrics**: `{ stuckTasks: N, failedLastHour: N, pendingCount: N }`

#### team_escalation (`sensors/teamEscalation.ts`)

- **defaultIntervalMs**: 300,000 (5 minutes)
- **Logic**: Query `virtual_admin_incidents` for `status = 'open' AND severity IN ('error', 'critical')` with no resolution for >1 hour. If count > 0, `degraded`. If count > 5, `critical`. This sensor detects when the Guardian itself is not resolving problems.
- **Metrics**: `{ unresolved1h: N, unresolvedCritical: N }`

---

## Python Backend Endpoint (Celery Health)

The `celery_health` sensor calls a Python endpoint that must exist. Create:

**File:** `python-backend/app/api/virtual_admin.py`

A FastAPI router with a single internal endpoint:

```
GET /api/internal/virtual-admin/celery-health
```

Response shape:

```json
{
  "workers": 2,
  "activeTasks": 5,
  "queueLengths": { "celery": 0, "media": 3, "video": 1 },
  "healthy": true
}
```

Implementation: Use `celery_app.control.inspect().active()` to get active tasks per worker, and `celery_app.control.inspect().stats()` for worker count. For queue lengths, use Redis `LLEN` on each Celery queue key. Wrap in try/except; if Celery/Redis is unreachable, return `{ workers: 0, healthy: false, error: "..." }`.

Register this router in `python-backend/app/main.py` under the internal API prefix.

**Test file:** `python-backend/tests/unit/test_virtual_admin_celery_health.py` -- mock `celery_app.control.inspect()` and verify the response shape and error handling.

---

## Integration Notes

- **Database access**: Sensors that query PostgreSQL should import `db` from the existing Drizzle setup (`apps/web/server/services/` or the core DB module). Use the schema tables defined in section-01.
- **Redis access**: Sensors needing Redis (queue lengths, cache stats) should use `getRedisClient()` from `apps/web/server/services/redis.ts`.
- **Audit logging**: Every sensor collection should be logged via `auditLogger.log()` with event type `guardian_sensor_check`. Include `sensorId`, `status`, and `latencyMs` in the audit payload.
- **No side effects**: Sensors are read-only. They never modify data, restart services, or send notifications. Those responsibilities belong to the rule engine (section-03) and actuators (section-04).

---

## Test Execution

```bash
# Run all sensor framework tests
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run server/services/virtualAdmin/__tests__/sensorRegistry.test.ts

# Run individual sensor tests
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run server/services/virtualAdmin/__tests__/sensors/queueHealth.test.ts
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run server/services/virtualAdmin/__tests__/sensors/creditBalance.test.ts
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --run server/services/virtualAdmin/__tests__/sensors/errorSpike.test.ts

# Run Python celery health test
cd /home/dev/projects/SmartSpecPro/python-backend && source .venv/bin/activate && pytest tests/unit/test_virtual_admin_celery_health.py -v
```