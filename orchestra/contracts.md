# Orchestra Contracts — Monitoring System

## Interface: DB Schema → Backend tRPC Router
**Owner:** ssp-database (Wave 1) produces; ssp-backend (Wave 2) consumes

### Tables
```typescript
// monitoringChecks
{
  id: serial PK,
  checkType: text,           // "health_check" | "crash_monitor" | "celery_health" | "memory_check"
  status: text,              // "ok" | "warning" | "critical" | "error"
  details: json,             // { services: {...}, memory: {...}, ... }
  alertSent: boolean,
  alertChannel: text | null, // "slack" | "discord" | "webhook" | null
  source: text,              // "cron_script" | "celery_task" | "guardian"
  createdAt: timestamp
}

// monitoringAlerts
{
  id: serial PK,
  severity: text,            // "info" | "warning" | "error" | "critical"
  title: text,
  message: text,
  channel: text,             // "slack" | "discord" | "webhook" | "log"
  acknowledged: boolean,
  acknowledgedBy: integer | null,  // users.id FK
  acknowledgedAt: timestamp | null,
  metadata: json,            // { checkId, service, threshold, ... }
  createdAt: timestamp
}

// systemMetricsHistory
{
  id: serial PK,
  memoryUsedMb: integer,
  memoryTotalMb: integer,
  memoryPercent: real,
  cpuPercent: real | null,
  diskUsedGb: real | null,
  diskTotalGb: real | null,
  serviceStatuses: json,     // { web: "active"|"failed", backend: "active"|"failed", ... }
  processRestartCounts: json, // { web: N, backend: N }
  createdAt: timestamp
}
```

## Interface: tRPC Router → Frontend
**Owner:** ssp-backend (Wave 2) produces; ssp-frontend (Wave 3) consumes

### Procedures (all under `monitoring.*`, all adminProcedure)
```typescript
// monitoring.getChecks — paginated list
input: { page: number, limit: number, status?: string, checkType?: string, since?: string }
output: { checks: MonitoringCheck[], total: number, page: number }

// monitoring.getAlerts — paginated + filter
input: { page: number, limit: number, severity?: string, acknowledged?: boolean }
output: { alerts: MonitoringAlert[], total: number }

// monitoring.acknowledgeAlert — mark as read
input: { alertId: number }
output: { success: boolean }

// monitoring.getMetricsHistory — for charts
input: { hours: number }  // 1, 6, 24, 48
output: { metrics: MetricPoint[], latestMemoryPercent: number, latestCpuPercent: number }

// monitoring.getCurrentStatus — live status
input: (none)
output: { services: ServiceStatus[], alerts: { critical: number, warning: number }, lastCheck: string | null }
```

### Types
```typescript
type ServiceStatus = { name: string; status: "ok" | "warning" | "critical" | "unknown"; restarts: number; memoryMb?: number }
type MetricPoint = { ts: string; memoryPercent: number; cpuPercent: number | null; diskPercent: number | null }
```

## Interface: Python Celery → Internal Express Route (POST /api/internal/metrics/push)
**Owner:** ssp-infrastructure + ssp-backend define endpoint; ssp-python consumes

### Auth: `X-Internal-Token: {SMARTSPEC_WEB_GATEWAY_TOKEN}` (same pattern as internalSocialActions.ts)

### Payload
```json
{
  "checkType": "celery_health_monitor",
  "status": "ok" | "warning" | "critical",
  "source": "celery_task",
  "details": {
    "memoryUsedMb": 1200,
    "memoryTotalMb": 8192,
    "memoryPercent": 14.6,
    "cpuPercent": 23.1,
    "diskUsedGb": 45.2,
    "diskTotalGb": 100.0,
    "services": { "web": "active", "backend": "active" },
    "processRestartCounts": { "web": 0, "backend": 0 }
  },
  "alert": null | {
    "severity": "warning" | "critical",
    "title": "...",
    "message": "...",
    "channel": "log"
  }
}
```

## File Ownership
| File | Owner Wave | Agent |
|------|-----------|-------|
| apps/web/drizzle/schema.ts | Wave 1 | ssp-database |
| apps/web/drizzle/0120_*.sql | Wave 1 | ssp-database |
| scripts/health-check.sh | Wave 1 | ssp-infrastructure |
| scripts/system-crash-monitor.sh | Wave 1 | ssp-infrastructure |
| scripts/alert-monitor.sh | Wave 1 | ssp-infrastructure |
| apps/web/.env (VIRTUAL_ADMIN_ENABLED only) | Wave 1 | ssp-infrastructure |
| apps/web/server/routes/internalMetrics.ts | Wave 2 | ssp-backend |
| apps/web/server/routers/monitoring.ts | Wave 2 | ssp-backend |
| apps/web/server/services/monitoringService.ts | Wave 2 | ssp-backend |
| apps/web/server/routers.ts | Wave 2 | ssp-backend |
| apps/web/server/_core/index.ts | Wave 2 | ssp-backend |
| python-backend/app/tasks/system_health_task.py | Wave 2 | ssp-python |
| python-backend/app/core/celery_app.py | Wave 2 | ssp-python |
| apps/web/client/src/pages/AdminMonitoring.tsx | Wave 3 | ssp-frontend |
| apps/web/client/src/App.tsx | Wave 3 | ssp-frontend |
