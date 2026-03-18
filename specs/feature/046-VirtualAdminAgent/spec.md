# 046 — Virtual Admin Agent (System Guardian)

Version: 1.0
Date: 2026-03-18
Status: Proposed
Audience: Product, Architecture, Backend (Node + Python), Frontend

---

## 1. Executive Summary

เพิ่ม **Virtual Admin Agent** — "ผู้ดูแลระบบเสมือน" ที่ทำงานเป็น background user ในระบบ SmartSpecPro โดยอัตโนมัติ ทำหน้าที่:

1. **Monitor** — ตรวจจับปัญหาจาก queue health, error rates, LLM provider status, credit balance, Celery workers, disk/memory
2. **Detect & Triage** — จัดลำดับความรุนแรงและตัดสินใจว่าจะ auto-fix, notify, หรือ escalate
3. **Act** — แก้ไขปัญหาอัตโนมัติ (low risk) หรือแจ้ง admin/user ผ่าน in-app notification, email, Slack
4. **Approve Gate** — สำหรับ action ที่ high risk ต้องรอ admin approve ก่อนดำเนินการ

ต่างจาก Agency Templates (Spec 034) ตรงที่:
- **Agency Templates** = user-facing, user เป็นคนเริ่ม, สร้าง content
- **Virtual Admin Agent** = system-facing, ทำงานอัตโนมัติ 24/7, ดูแลระบบ

---

## 1.1 Key Research Findings

จากการ audit ระบบที่มีอยู่ พบว่า:

1. **Monitoring มีอยู่แล้วแต่เป็น read-only** — `QueueHealthMonitor` ตรวจทุก 60s, `ServicesRouter` ดู status ได้ แต่ไม่มีอะไร auto-trigger action เมื่อเกิดปัญหา → response time 30-60 นาที (admin ต้องเปิดดูเอง)
2. **Audit trail สมบูรณ์แต่ passive** — JSONL logs 50+ event types, DB tables 3 ตัว (providerUsageLog, apiAuditEvents, creditTransactions) เชื่อมกันด้วย traceId แต่ไม่มี pattern detection
3. **Notification channels พร้อมแต่ไม่ได้ต่อ** — In-app, Email, Telegram, Slack พร้อมใช้ แต่ไม่มี system alerts ส่งไปหาช่องทางเหล่านี้
4. **Agency system ต่อยอดได้** — AgencyBridge + Python orchestrator + builtin tools (Slack, skill execution) ใช้สำหรับ approval workflow ได้เลย
5. **Gap สำคัญ: ไม่มี threshold-triggered actions** — queue backlog, worker down, provider circuit open ทั้งหมดต้อง admin มาดูเอง

**Cost estimate:** ~$3/month (polling ฟรี, LLM diagnosis ใช้ cheapest model ~$0.01/ครั้ง)

**Effort estimate (revised):**

| Module | Hours | Description |
|--------|-------|-------------|
| Core monitoring (sensors + rules + scheduler) | 6h | S4-S5, S21 |
| Actuators + approval flow | 4h | S6, S16 |
| Notification integration | 2h | S8 |
| Admin dashboard (Guardian) | 4h | S9 |
| Feedback system (tables + API + processing) | 6h | S26 |
| Admin Feedback Hub UI | 5h | S27 |
| User Feedback UI (button + chat) | 3h | S27.5 |
| Orchestrator integration | 3h | S25 |
| Testing | 4h | S19 |
| Security hardening | 2h | S11, S28 |
| **Total** | **39h** | ~5 working days |

---

## 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Virtual Admin Agent                        │
│                  (system user id: -1)                        │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │   Sensors    │    │   Brain     │    │   Actuators     │  │
│  │  (collect)   │ →  │ (decide)    │ →  │  (act/notify)   │  │
│  └─────────────┘    └─────────────┘    └─────────────────┘  │
│        │                   │                    │            │
│  ┌─────┴─────┐     ┌──────┴──────┐     ┌──────┴──────┐     │
│  │ Health     │     │ Rule Engine │     │ Auto-Fix    │     │
│  │ Probes     │     │ + LLM       │     │ (low risk)  │     │
│  │            │     │ Analysis    │     ├─────────────┤     │
│  │ • Queue    │     │             │     │ Notify      │     │
│  │ • API      │     │ Severity:   │     │ (medium)    │     │
│  │ • LLM      │     │ • INFO      │     ├─────────────┤     │
│  │ • Celery   │     │ • WARNING   │     │ Escalate    │     │
│  │ • Credit   │     │ • ERROR     │     │ + Approval  │     │
│  │ • Disk     │     │ • CRITICAL  │     │ (high risk) │     │
│  │ • Cert     │     │             │     └─────────────┘     │
│  └───────────┘      └─────────────┘                         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │              Incident Log (DB)                        │    │
│  │  id | severity | sensor | message | action | status   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐    │
│  │           Admin Approval Queue (DB)                   │    │
│  │  id | incident_id | action | approved_by | status     │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

---

## 3. System User

Virtual Admin Agent ทำงานเป็น **system user** ในระบบ:

```
users table:
  id: -1 (หรือ reserved ID)
  email: "system-agent@internal"
  username: "System Guardian"
  role: "system_agent" (new role, above admin for read-only, limited write)
  isSystemUser: true (new flag)
```

- ไม่สามารถ login ผ่าน UI ได้
- มี JWT token เฉพาะที่ generate จาก server startup
- Audit log ทุก action เป็นชื่อ "System Guardian"
- Credit usage = 0 (ไม่คิด credit สำหรับ system operations)

---

## 4. Sensors (Data Collection Layer)

### 4.1 Sensor Types

| Sensor | Source | Check Interval | Description |
|--------|--------|---------------|-------------|
| `queue_health` | BullMQ + Redis | 60s | Queue depth, failed jobs, stalled jobs |
| `celery_health` | Celery inspect | 60s | Active/reserved/scheduled tasks, worker alive |
| `api_latency` | Express middleware | 30s | P95 latency per endpoint, error rate |
| `llm_provider` | Provider registry | 120s | Circuit breaker status, error rate per provider |
| `credit_balance` | `creditTransactions` | 300s | Low credit alerts per tenant |
| `disk_storage` | OS stats + S3 | 600s | Media storage usage, temp file cleanup |
| `db_health` | PostgreSQL | 60s | Connection pool, slow queries, table bloat |
| `cert_expiry` | TLS cert check | 86400s (daily) | SSL certificate expiration warning |
| `error_spike` | Audit JSONL logs | 30s | Sudden increase in error rate (anomaly detection) |
| `media_pipeline` | Celery + external APIs | 120s | Stuck tasks, external API failures (fal.ai, kie.ai) |

### 4.2 Sensor Implementation

```typescript
// apps/web/server/services/virtualAdmin/sensors/types.ts

export interface SensorReading {
  sensorId: string;
  timestamp: Date;
  status: "healthy" | "degraded" | "critical" | "unknown";
  metrics: Record<string, number | string>;
  message: string;
}

export interface SensorConfig {
  id: string;
  name: string;
  intervalMs: number;
  enabled: boolean;
  thresholds: {
    warning: Record<string, number>;
    critical: Record<string, number>;
  };
}
```

### 4.3 Reuse Existing Infrastructure

| Component | Already Exists | Reuse How |
|-----------|---------------|-----------|
| Queue monitoring | `queueHealthMonitor.ts` (297 lines) | Wrap as sensor, add threshold evaluation |
| Audit logs | `auditLogger.ts` (485 lines) | Read JSONL for error spike detection |
| Service status | `routers/services.ts` | Wrap as API latency sensor |
| Celery tasks | `celery_app.py` beat schedule | Add health check task |
| LLM circuit breaker | Provider registry | Read breaker state as sensor |
| Credit tracking | `creditService.ts` | Query balance per tenant |
| Notification | `notificationService.ts` | Deliver alerts via existing channels |
| Email | `emailService.ts` | Deliver email alerts |
| Approval system | `AdminApprovals.tsx` page | Extend for auto-action approvals |

---

## 5. Brain (Decision Engine)

### 5.1 Rule Engine (Fast Path)

Deterministic rules evaluated on every sensor reading:

```typescript
interface IncidentRule {
  id: string;
  sensor: string;
  condition: (reading: SensorReading) => boolean;
  severity: "info" | "warning" | "error" | "critical";
  action: ActionPlan;
  cooldownMs: number;  // prevent alert spam
}
```

**Built-in Rules:**

| Rule | Sensor | Condition | Severity | Action |
|------|--------|-----------|----------|--------|
| `queue_depth_high` | queue_health | depth > 1000 | warning | Notify admin |
| `queue_depth_critical` | queue_health | depth > 5000 | critical | Notify + pause new jobs |
| `failed_jobs_spike` | queue_health | failed > 50 in 5min | error | Retry failed, notify |
| `celery_worker_down` | celery_health | active_workers = 0 | critical | Restart worker, notify |
| `llm_provider_down` | llm_provider | breaker = open | error | Failover, notify |
| `all_providers_down` | llm_provider | all breakers open | critical | Emergency notify |
| `credit_low` | credit_balance | balance < 100 | warning | Notify tenant admin |
| `credit_exhausted` | credit_balance | balance <= 0 | error | Notify + suggest top-up |
| `disk_90_percent` | disk_storage | usage > 90% | warning | Cleanup temp, notify |
| `disk_95_percent` | disk_storage | usage > 95% | critical | Emergency cleanup, notify |
| `error_rate_spike` | error_spike | rate > 3x baseline | error | LLM analysis, notify |
| `api_latency_high` | api_latency | p95 > 5000ms | warning | Notify admin |
| `cert_expiring` | cert_expiry | days_left < 14 | warning | Notify admin |
| `cert_expiring_soon` | cert_expiry | days_left < 3 | critical | Urgent notify |
| `media_task_stuck` | media_pipeline | task stuck > 30min | warning | Retry task, notify user |
| `db_pool_exhausted` | db_health | idle = 0, waiting > 10 | critical | Notify admin |
| `team_agent_escalation` | team_escalation | unacknowledged escalation from team agent | error | LLM analysis, notify admin, respond to room |
| `feedback_spike` | feedback_tickets | > 5 bug reports in 1 hour from different users | warning | Correlate, notify admin |

### 5.2 LLM Analysis (Slow Path)

สำหรับปัญหาที่ rule engine ตรวจไม่ได้ หรือต้องวิเคราะห์ pattern ซับซ้อน:

- **Error Pattern Analysis** — รวบรวม error ล่าสุด 50 รายการ ส่งให้ LLM วิเคราะห์ root cause
- **Usage Anomaly** — เปรียบเทียบ usage pattern กับ baseline แล้ววิเคราะห์ว่าผิดปกติหรือไม่
- **Cost Optimization** — วิเคราะห์ provider usage แล้วแนะนำ cost-saving opportunities

```typescript
interface LLMAnalysisRequest {
  type: "error_pattern" | "usage_anomaly" | "cost_optimization";
  context: string;  // summarized data
  maxTokens: 500;
  model: "fast";  // use cheapest model
}
```

**ข้อจำกัด:**
- LLM analysis ทำงาน max 1 ครั้ง/5 นาที (rate limit)
- ใช้ cheapest model เสมอ (ไม่คิด credit)
- ไม่ส่ง sensitive data (API keys, passwords) ให้ LLM

---

## 6. Actuators (Action Layer)

### 6.1 Action Types

| Action | Risk Level | Requires Approval | Description |
|--------|-----------|-------------------|-------------|
| `notify_admin` | None | No | In-app notification + email to admin |
| `notify_user` | None | No | In-app notification to affected user |
| `notify_slack` | None | No | Slack message (if configured) |
| `retry_failed_job` | Low | No | Retry a specific failed BullMQ/Celery job |
| `cleanup_temp_files` | Low | No | Delete expired temp/export files |
| `clear_stale_cache` | Low | No | Clear Redis cache entries older than TTL |
| `failover_provider` | Medium | No | Switch LLM traffic to backup provider |
| `pause_queue` | Medium | **Yes** | Pause job processing on a queue |
| `restart_celery_worker` | Medium | **Yes** | Send restart signal to Celery worker |
| `disable_provider` | High | **Yes** | Disable an LLM provider entirely |
| `kill_stuck_task` | High | **Yes** | Force-terminate a stuck Celery task |
| `emergency_maintenance` | Critical | **Yes** | Set system to maintenance mode |

### 6.2 Approval Gate

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Incident   │ →   │  Approval    │ →   │   Execute    │
│   Created    │     │  Requested   │     │   Action     │
└──────────────┘     └──────┬───────┘     └──────────────┘
                            │
                     ┌──────┴───────┐
                     │ Admin Review │
                     │  (in-app or  │
                     │   email)     │
                     └──────┬───────┘
                            │
                   ┌────────┼────────┐
                   ▼        ▼        ▼
              Approved   Rejected   Expired
              (execute)  (log)     (24h, notify)
```

**Approval Flow:**
1. Virtual Admin creates incident + pending approval
2. Push notification to all admins (in-app + email)
3. Admin opens `AdminApprovals` page → sees pending action with context
4. Admin clicks Approve / Reject with optional comment
5. If approved: Virtual Admin executes the action
6. If rejected: Log reason, monitor continues
7. If no response in 24h: Auto-escalate or auto-expire based on severity

### 6.3 Auto-Expire Policy

| Severity | Auto-Expire | On Expire |
|----------|-------------|-----------|
| Warning | 24h | Archive, stop alerting |
| Error | 48h | Re-alert once, then archive |
| Critical | Never | Keep alerting every 4h until resolved |

---

## 7. Database Schema

### 7.1 New Tables

```sql
-- Incident log (all detected issues)
CREATE TABLE virtual_admin_incidents (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(36) REFERENCES tenants(id),
  sensor_id       VARCHAR(64) NOT NULL,
  rule_id         VARCHAR(64),
  severity        VARCHAR(16) NOT NULL,  -- info, warning, error, critical
  status          VARCHAR(16) NOT NULL DEFAULT 'open',  -- open, acknowledged, resolved, expired
  title           VARCHAR(255) NOT NULL,
  message         TEXT NOT NULL,
  metrics_json    JSONB,
  action_taken    VARCHAR(64),  -- action type executed (or null)
  action_result   TEXT,
  resolved_by     INTEGER REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Approval queue (actions requiring admin approval)
CREATE TABLE virtual_admin_approvals (
  id              SERIAL PRIMARY KEY,
  incident_id     INTEGER NOT NULL REFERENCES virtual_admin_incidents(id),
  action_type     VARCHAR(64) NOT NULL,
  action_params   JSONB,
  status          VARCHAR(16) NOT NULL DEFAULT 'pending',  -- pending, approved, rejected, expired
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by      INTEGER REFERENCES users(id),
  decided_at      TIMESTAMPTZ,
  decision_comment TEXT,
  expires_at      TIMESTAMPTZ NOT NULL
);

-- Sensor configuration (admin-customizable thresholds)
CREATE TABLE virtual_admin_sensor_config (
  id              VARCHAR(64) PRIMARY KEY,
  tenant_id       VARCHAR(36) REFERENCES tenants(id),
  enabled         BOOLEAN NOT NULL DEFAULT true,
  interval_ms     INTEGER NOT NULL DEFAULT 60000,
  thresholds_json JSONB NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 8. Notification Channels

### 8.1 Channel Matrix

| Channel | Already Exists | Used For |
|---------|---------------|----------|
| In-app notification | ✅ `notificationService.ts` | All severity levels |
| Email | ✅ `emailService.ts` | Warning+ (configurable) |
| Slack | ✅ `builtin-slack-message` tool | Error+ (if configured) |
| Admin Dashboard | ✅ `AdminApprovals.tsx` | Approval requests |
| Telegram | ✅ `notification.ts` core | Critical (if configured) |

### 8.2 Escalation Chain

```
INFO     →  In-app only (badge counter)
WARNING  →  In-app + Email digest (hourly)
ERROR    →  In-app + Email immediately + Slack
CRITICAL →  In-app + Email + Slack + Telegram + Sound alert in UI
```

---

## 9. Frontend Components

### 9.1 New Pages/Components

| Component | Location | Description |
|-----------|----------|-------------|
| `AdminSystemGuardian.tsx` | New admin page | Dashboard showing incidents, sensors, approvals |
| `IncidentTimeline.tsx` | Component | Timeline view of incidents with status badges |
| `SensorStatusGrid.tsx` | Component | Grid of all sensors with health indicators |
| `ApprovalActionCard.tsx` | Component | Card for pending approvals with Approve/Reject buttons |
| `GuardianSettingsPanel.tsx` | Component | Admin settings: thresholds, channels, enable/disable |
| `SystemHealthBanner.tsx` | Component | Global banner in app header when CRITICAL incident active |

### 9.2 User-Facing Notifications

Users see relevant notifications:
- "Your media generation task failed — System Guardian has retried it automatically"
- "Your credit balance is low (23 credits remaining)"
- "LLM provider X is experiencing issues — requests routed to backup provider"

---

## 10. Implementation Phases

### Phase 1: Foundation (MVP) — 3-4 days

**Scope:** Core monitoring loop + notification for critical issues

| Task | Description | Files |
|------|-------------|-------|
| DB schema | Create 3 new tables | `drizzle/schema.ts` |
| System user | Create reserved user + JWT | `server/services/virtualAdminUser.ts` |
| Sensor framework | Base class + registry | `server/services/virtualAdmin/sensorRegistry.ts` |
| 3 sensors | queue_health, celery_health, error_spike | `server/services/virtualAdmin/sensors/` |
| Rule engine | Evaluate rules → create incidents | `server/services/virtualAdmin/ruleEngine.ts` |
| Notification | Incidents → in-app + email | `server/services/virtualAdmin/notifier.ts` |
| Scheduler | Run sensor loop via setInterval | `server/services/virtualAdmin/scheduler.ts` |
| Admin page (basic) | List incidents + status | `client/src/pages/AdminSystemGuardian.tsx` |

**Deliverable:** System detects queue issues, error spikes, worker down → notifies admin in-app + email.

### Phase 2: Auto-Fix + Approvals — 2-3 days

**Scope:** Auto-remediation for low-risk + approval gate for high-risk

| Task | Description |
|------|-------------|
| Auto-fix actions | retry_failed_job, cleanup_temp, clear_cache, failover_provider |
| Approval flow | Create approval → notify → admin decides → execute or reject |
| AdminApprovals extension | Add "System Guardian" tab to existing approvals page |
| Cooldown system | Prevent alert spam (per-rule cooldown) |
| Escalation timer | Auto-re-alert if no response |

### Phase 3: Full Sensor Suite — 2 days

**Scope:** All 10 sensors operational

| Task | Description |
|------|-------------|
| LLM provider sensor | Circuit breaker state monitoring |
| Credit balance sensor | Per-tenant low balance alerts |
| Disk/storage sensor | S3 + local storage monitoring |
| DB health sensor | Connection pool + slow query detection |
| Cert expiry sensor | SSL certificate check |
| API latency sensor | P95 latency per endpoint |

### Phase 4: LLM Analysis + Dashboard — 2 days

**Scope:** Smart analysis + rich admin UI

| Task | Description |
|------|-------------|
| LLM error analysis | Batch errors → LLM → root cause suggestion |
| Cost optimization | Provider usage analysis → savings recommendations |
| Incident timeline | Visual timeline component |
| Sensor status grid | Health dashboard with sparklines |
| SystemHealthBanner | Global banner for critical incidents |
| Settings panel | Admin-configurable thresholds and channels |

### Phase 5: User-Facing Intelligence — 1-2 days

**Scope:** Users see relevant system actions

| Task | Description |
|------|-------------|
| User notifications | Contextual alerts for affected users |
| Media task recovery | Auto-retry + notify user of result |
| Provider failover UX | Show "using backup provider" notice |
| Guardian status in chat | Inline system messages in agency chat |

---

## 11. Security Considerations

| Concern | Mitigation |
|---------|-----------|
| System user privilege escalation | `system_agent` role: read-all, write only to incident/approval tables |
| Auto-fix running destructive commands | All actuators are whitelisted functions, no shell execution |
| LLM receiving sensitive data | Sanitize all data before sending to LLM (strip keys, tokens, passwords) |
| Alert fatigue | Cooldown per rule, digest emails (hourly for warnings) |
| Approval bypass | Approval required for medium+ risk; approval token is cryptographically signed |
| Resource exhaustion | Sensor loop has max concurrency; LLM analysis rate-limited to 1/5min |

---

## 12. Configuration

### 12.1 Environment Variables

```
VIRTUAL_ADMIN_ENABLED=true          # Master switch
VIRTUAL_ADMIN_SENSOR_INTERVAL=60000 # Default sensor interval (ms)
VIRTUAL_ADMIN_EMAIL_DIGEST=hourly   # Email digest frequency
VIRTUAL_ADMIN_SLACK_WEBHOOK=        # Slack webhook URL (optional)
VIRTUAL_ADMIN_LLM_ANALYSIS=true     # Enable LLM-powered analysis
```

### 12.2 Feature Flags (per tenant)

| Flag | Default | Description |
|------|---------|-------------|
| `VIRTUAL_ADMIN_ENABLED` | true | Enable system monitoring |
| `VIRTUAL_ADMIN_NOTIFICATIONS` | true | Send notifications to tenant admins |
| `VIRTUAL_ADMIN_AUTO_FIX` | false | Allow auto-fix actions (opt-in) |
| `VIRTUAL_ADMIN_LLM_ANALYSIS` | false | Enable LLM analysis (uses credits) |

---

## 13. Metrics & Observability

| Metric | Type | Description |
|--------|------|-------------|
| `virtual_admin.sensor.run_count` | Counter | Sensor executions |
| `virtual_admin.incident.created` | Counter | Incidents created (by severity) |
| `virtual_admin.action.executed` | Counter | Actions executed (by type) |
| `virtual_admin.approval.pending` | Gauge | Pending approvals count |
| `virtual_admin.approval.response_time` | Histogram | Time to admin decision |
| `virtual_admin.llm_analysis.latency` | Histogram | LLM analysis response time |

---

## 14. Not In Scope (Explicitly Excluded)

| Excluded | Reason |
|----------|--------|
| Auto-scaling infrastructure | Requires cloud-native infra, out of scope |
| Database failover | Handled at infrastructure level (pg_basebackup) |
| Code deployment | Handled by CI/CD pipeline |
| User behavior analysis | Privacy concern, separate feature |
| Financial/billing alerts | Separate billing system |
| Custom sensor plugins | Phase 1 uses built-in sensors only |

---

## 15. Success Criteria

| Metric | Target |
|--------|--------|
| Mean Time to Detect (MTTD) | < 2 minutes for critical issues |
| Mean Time to Notify (MTTN) | < 30 seconds after detection |
| False positive rate | < 10% of all alerts |
| Admin response to critical | < 1 hour (with escalation) |
| Auto-fix success rate | > 90% for low-risk actions |
| Zero downtime from auto-fix | No auto-fix action causes service disruption |

---

## 16. tRPC API Contracts

### 16.1 New tRPC Endpoints

```typescript
// apps/web/server/routers/virtualAdmin.ts

export const virtualAdminRouter = router({
  // ── Incidents ──
  listIncidents: adminProcedure
    .input(z.object({
      status: z.enum(["open", "acknowledged", "resolved", "expired"]).optional(),
      severity: z.enum(["info", "warning", "error", "critical"]).optional(),
      sensorId: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(/* returns { incidents, total } */),

  getIncident: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(/* returns single incident with related approvals */),

  acknowledgeIncident: adminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(/* sets status = acknowledged */),

  resolveIncident: adminProcedure
    .input(z.object({ id: z.number(), comment: z.string().optional() }))
    .mutation(/* sets status = resolved */),

  // ── Approvals ──
  listPendingApprovals: adminProcedure
    .query(/* returns pending approvals with incident context */),

  decideApproval: adminProcedure
    .input(z.object({
      id: z.number(),
      decision: z.enum(["approved", "rejected"]),
      comment: z.string().max(500).optional(),
    }))
    .mutation(/* approves/rejects, triggers action if approved */),

  // ── Sensors ──
  getSensorStatus: adminProcedure
    .query(/* returns all sensor readings with health status */),

  updateSensorConfig: adminProcedure
    .input(z.object({
      sensorId: z.string(),
      enabled: z.boolean().optional(),
      intervalMs: z.number().min(10000).max(86400000).optional(),
      thresholds: z.record(z.number()).optional(),
    }))
    .mutation(/* updates sensor thresholds */),

  // ── Dashboard stats ──
  getDashboardStats: adminProcedure
    .query(/* returns counts by severity, recent incidents, sensor health grid */),

  // ── Guardian control ──
  toggleGuardian: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(/* enable/disable the entire virtual admin */),
});
```

### 16.2 Python API Endpoints (for Celery sensor)

```python
# python-backend/app/api/virtual_admin.py

@router.get("/api/internal/virtual-admin/celery-health")
async def get_celery_health():
    """Returns Celery worker status, active tasks, queue lengths."""
    # Called by Node.js celery_health sensor

@router.get("/api/internal/virtual-admin/media-pipeline-status")
async def get_media_pipeline_status():
    """Returns stuck tasks, external API health."""
    # Called by Node.js media_pipeline sensor

@router.post("/api/internal/virtual-admin/restart-worker")
async def restart_celery_worker(queue: str):
    """Restarts a specific Celery worker. Requires gateway token."""
    # Called by actuator after admin approval
```

---

## 17. Multi-Tenancy

| Aspect | Behavior |
|--------|----------|
| Incidents | Scoped to `tenant_id` — each tenant sees only their incidents |
| Sensor config | Per-tenant thresholds via `virtual_admin_sensor_config` table |
| Notifications | Sent to tenant admins (role = admin or domain_admin) |
| System-wide sensors | `queue_health`, `celery_health`, `db_health` → visible to all tenant admins but actions only by domain_admin |
| Per-tenant sensors | `credit_balance`, `media_pipeline` → scoped to specific tenant |
| Approvals | Domain admin of the tenant, or super admin |
| LLM analysis | Credits charged to system pool (not tenant) |

---

## 18. Error Handling

### 18.1 Sensor Errors

| Scenario | Handling |
|----------|----------|
| Sensor throws exception | Catch, log error, mark sensor as `unknown`, retry next interval |
| Sensor timeout (>10s) | Abort, log timeout, mark as `degraded` |
| Redis unreachable | Queue sensors return `unknown`, incident not created (avoid noise) |
| PostgreSQL unreachable | DB sensors return `unknown`, notification via Telegram fallback (no DB needed) |
| All sensors failing | Circuit breaker: stop polling for 5 min, then resume one-by-one |

### 18.2 Actuator Errors

| Scenario | Handling |
|----------|----------|
| Auto-fix fails | Log failure, escalate to admin notification, do NOT retry automatically |
| Approval execution fails | Mark approval as `execution_failed`, notify admin with error details |
| Notification delivery fails | Retry 3x with exponential backoff (1s, 5s, 30s), then log and continue |
| LLM analysis fails | Fallback to rule-based response only, log LLM error |

---

## 19. Testing Strategy

### 19.1 Unit Tests

| Component | Test File | Coverage |
|-----------|-----------|----------|
| Rule engine | `server/services/virtualAdmin/__tests__/ruleEngine.test.ts` | All 16 rules with edge cases |
| Sensor readings | `server/services/virtualAdmin/__tests__/sensors.test.ts` | Mock Redis/DB/API responses |
| Notifier | `server/services/virtualAdmin/__tests__/notifier.test.ts` | Channel routing per severity |
| Approval flow | `server/services/virtualAdmin/__tests__/approvalFlow.test.ts` | approve/reject/expire paths |

### 19.2 Integration Tests

| Test | Description |
|------|-------------|
| End-to-end alert | Inject fake sensor reading → verify incident created → notification sent |
| Approval lifecycle | Create approval → admin approves → action executed → incident resolved |
| Cooldown | Trigger same rule twice within cooldown → second should be suppressed |
| Multi-tenant isolation | Tenant A incident → Tenant B admin cannot see or approve |

### 19.3 Test Utilities

```typescript
// test helpers
function createMockSensorReading(overrides?: Partial<SensorReading>): SensorReading;
function createMockIncident(severity: string): VirtualAdminIncident;
function simulateSensorFailure(sensorId: string): void;
```

---

## 20. Data Retention

| Data | Retention | Cleanup |
|------|-----------|---------|
| Incidents (resolved) | 90 days | Celery beat task: daily at 4:00 AM |
| Incidents (open) | Never deleted | Must be resolved first |
| Approvals | 90 days after decision | Cleaned with parent incident |
| Sensor config | Permanent | Admin-managed |
| Sensor readings (in-memory) | Last 100 readings per sensor | Ring buffer, no DB storage |
| LLM analysis results | Stored in incident `action_result` | Follows incident retention |

---

## 21. Startup & Shutdown Sequence

### 21.1 Startup (on server boot)

```
1. Server starts (apps/web/server/_core/index.ts)
2. Check VIRTUAL_ADMIN_ENABLED env var
3. If enabled:
   a. Load sensor configs from DB (or use defaults)
   b. Generate system JWT token for internal API calls
   c. Register sensor intervals via setInterval()
   d. Run initial health check (all sensors once)
   e. Log "System Guardian started" to audit log
4. If disabled:
   a. Log "System Guardian disabled" and skip
```

### 21.2 Graceful Shutdown

```
1. SIGTERM received
2. Clear all sensor intervals (clearInterval)
3. Flush pending notifications (await delivery)
4. Mark in-progress actions as "interrupted"
5. Log "System Guardian stopped" to audit log
6. Process exits
```

### 21.3 Crash Recovery

```
On restart after crash:
1. Query DB for incidents with status = 'open' and action_taken = in-progress
2. Mark interrupted actions as "failed_interrupted"
3. Re-evaluate their rules to decide if retry needed
4. Resume normal sensor loop
```

---

## 22. Rate Limiting & Resource Protection

| Resource | Limit | Why |
|----------|-------|-----|
| Sensor polling total | Max 10 concurrent sensor checks | Prevent CPU/network saturation |
| Notification per rule | 1 per cooldown period (default 15min) | Prevent alert spam |
| Email notifications | Max 20/hour per tenant | Email provider rate limits |
| Slack notifications | Max 30/hour global | Slack API rate limit |
| LLM analysis | Max 1 per 5 minutes | Cost control |
| Auto-fix actions | Max 5 per hour per action type | Prevent runaway automation |
| DB queries per sensor | Max 3 queries per check | Prevent DB overload |
| Incident creation | Max 100 open per tenant | Prevent table bloat |

---

## 23. Migration Path

### 23.1 From Current State

```
Current: No automated monitoring → admin manually checks dashboards
After:   Automated monitoring → proactive alerts → auto-fix or approval

Migration steps:
1. Deploy Phase 1 with VIRTUAL_ADMIN_AUTO_FIX=false (notification only)
2. Run 1 week in "observe mode" — log what WOULD happen, but don't act
3. Review false positive rate — tune thresholds
4. Enable auto-fix for low-risk actions (Phase 2)
5. Enable LLM analysis (Phase 4)
```

### 23.2 Rollback Plan

| Rollback Trigger | Action |
|-----------------|--------|
| False positive rate > 30% | Increase thresholds, add cooldown |
| Auto-fix causes issue | Set `VIRTUAL_ADMIN_AUTO_FIX=false` immediately |
| Excessive notifications | Set `VIRTUAL_ADMIN_NOTIFICATIONS=false` per tenant |
| Full rollback needed | Set `VIRTUAL_ADMIN_ENABLED=false` → agent stops completely |
| DB migration rollback | Tables are additive (no existing tables modified), safe to drop |

All rollback actions take effect immediately without restart (config read from DB/env on each cycle).

---

## 24. Open Questions (Requires Product Decision)

| # | Question | Options | Impact |
|---|----------|---------|--------|
| 1 | Should the agent have its own chat interface? | A) Dedicated admin chat B) Messages in existing chat C) Dashboard only | Determines UI complexity |
| 2 | Who is the escalation target for super-critical? | A) All domain_admins B) Specific "on-call" user C) External webhook | Affects notification routing |
| 3 | Should auto-fix be opt-in per tenant or global? | A) Per-tenant B) Global C) Per-action-type | Controls risk exposure |
| 4 | Budget enforcement: pause or warn? | A) Auto-pause workflows at 0 credits B) Warn-only, let spend continue | Affects user experience |
| 5 | Maintenance window: should guardian auto-suppress alerts? | A) Yes, configurable schedule B) No, always alert | Reduces noise during deploys |
| 6 | Should incidents be visible to non-admin users? | A) Own-related only B) Admins only C) Public status page | Privacy vs transparency |
| 7 | How long to wait for approval before auto-expire? | A) 24h B) 4h for critical C) Configurable per severity | Affects MTTR |
| 8 | Should guardian monitor itself? (meta-monitoring) | A) Yes, watchdog timer B) No, rely on systemd restart | Reliability concern |

---

## 25. Integration With Virtual AI Office Orchestrator

### 25.1 Cross-Spec Reference

This spec (046) is designed to integrate with the Virtual AI Office Orchestrator spec (`planning/virtual-ai-office-orchestrator/spec.md`), specifically Section 14G (Inter-Agent Communication Protocol).

### 25.2 New Actuator: Team Impact Notification

When the Virtual Admin Agent detects an incident that affects team runs, it must:

1. Call the impact assessment engine: `POST /api/internal/orchestrator/system-impact`
2. The orchestrator evaluates which active `team_runs` are affected
3. Affected runs receive system messages (visible in room timeline)
4. Orchestrator applies classified actions (notify / degrade / pause / stop)

### 25.3 New Sensor: Team Escalation

Add a new sensor to Section 4.1:

| Sensor | Source | Check Interval | Description |
|--------|--------|---------------|-------------|
| `team_escalation` | `inter_agent_messages` table | 10s | Team agents reporting persistent failures or anomalies |

When a team agent escalates:

1. Sensor reads unacknowledged messages where `channel = "team_escalation"`
2. Rule engine evaluates escalation urgency
3. If LLM analysis enabled: run diagnosis with error context
4. Send diagnosis result back to the originating room via `POST /api/internal/orchestrator/system-broadcast`
5. Mark escalation message as acknowledged

### 25.4 Extended Actuator Behaviors

Existing actuators gain inter-agent communication side effects:

| Actuator | Additional Behavior |
|----------|-------------------|
| `notify_admin` | Also send `system_direct` inter-agent message to orchestrator dashboard |
| `failover_provider` | Send `system_broadcast` to all rooms using the failed provider |
| `retry_failed_job` | Send `system_broadcast` to the room that created the failed job |
| `pause_queue` | Trigger `system_run_paused` for runs with pending jobs in that queue |
| `restart_celery_worker` | On success: send recovery broadcast; on failure: escalate to critical |
| `emergency_maintenance` | Trigger `system_stop_run` for ALL active runs with partial summary generation |

### 25.5 System Resource State Publishing

The Virtual Admin Agent sensors should update `system_resource_state` table on every check:

```typescript
// After each sensor reading
await updateSystemResourceState({
  id: `provider:${providerId}`,
  resourceType: "provider",
  status: reading.status === "healthy" ? "healthy" : reading.status === "degraded" ? "degraded" : "down",
  stateJson: {
    providerName: providerId,
    circuitBreakerState: reading.metrics.breakerState,
    errorRate: reading.metrics.errorRate,
    fallbackProvider: reading.metrics.fallbackProvider,
  },
  updatedBy: "system-guardian",
});
```

Team agents read this state during prompt assembly (Section 14A of the orchestrator spec) to avoid using unavailable resources.

### 25.6 Shared UI Requirements

The System Guardian admin page (`AdminSystemGuardian.tsx`) should include:

- **"Team Impact" tab** — shows which active team runs are affected by current incidents
- **Run impact badges** — each incident card shows count of affected runs
- **"View in Team Room" link** — from an incident, jump to the affected room's activity timeline
- **Escalation inbox** — shows team agent escalations alongside sensor-detected incidents

The orchestrator dashboard should include:

- **"System Status" indicator** — traffic light from `system_resource_state`
- **"System Messages" filter** — in the activity timeline, filter to see system agent messages only
- **"Affected by System"** badge on runs that are system-paused or system-degraded

### 25.7 Implementation Dependency

| Phase | Dependency |
|-------|-----------|
| 046 Phase 1-3 (sensors + rules + auto-fix) | No orchestrator dependency, standalone |
| 046 Phase 4 (LLM analysis + dashboard) | No orchestrator dependency |
| 046 Phase 5 (user-facing intelligence) | Requires orchestrator Phase 5 (inter-agent communication) |
| Orchestrator Phase 5 | Requires 046 Phase 1 minimum (sensors + incident table) |

Recommended sequence:

1. Ship 046 Phases 1-4 first (standalone system monitoring)
2. Ship orchestrator Phases 1-4 (team/room/run/monitoring)
3. Ship 046 Phase 5 + orchestrator Phase 5 together (inter-agent communication)

### 25.8 API Contracts Between Systems

#### Orchestrator → Virtual Admin (escalation)

```
POST /api/internal/virtual-admin/team-escalation
Body: {
  roomId: string,
  runId: string,
  assistantId: string,
  escalationType: "tool_failure" | "provider_error" | "latency_anomaly" | "budget_anomaly",
  context: {
    failedTool?: string,
    failureCount?: number,
    lastError?: string,
    affectedProvider?: string,
    latencyMs?: number,
  },
  urgency: "low" | "medium" | "high"
}
Response: {
  incidentId: number,
  status: "created" | "merged_with_existing",
  estimatedResponseTime: number
}
```

#### Virtual Admin → Orchestrator (impact notification)

```
POST /api/internal/orchestrator/system-impact
Body: {
  incidentId: number,
  incidentType: string,
  severity: "info" | "warning" | "error" | "critical",
  affectedResources: string[],
  recommendedAction: "notify" | "degrade" | "pause" | "stop",
  displayMessage: string,
  estimatedRecovery?: string,
  systemResourceState?: Record<string, any>
}
Response: {
  affectedRuns: Array<{
    runId: string,
    roomId: string,
    teamName: string,
    impactLevel: "unaffected" | "degraded" | "blocked" | "critical",
    actionTaken: "notified" | "degraded" | "paused" | "stopped",
  }>,
  messagesDelivered: number,
  notificationsSent: number
}
```

#### Virtual Admin → Orchestrator (diagnosis result)

```
POST /api/internal/orchestrator/system-broadcast
Body: {
  targetRoomIds: string[],          // specific rooms, or empty for all active rooms
  targetRunIds: string[],            // specific runs, or empty for all active runs
  messageType: "diagnosis_result" | "recovery_notice" | "maintenance_warning" | "resource_update",
  displayMessage: string,
  severity: "info" | "warning" | "error" | "critical",
  relatedIncidentId?: number,
  autoExpireMinutes?: number
}
Response: {
  messagesDelivered: number,
  roomsNotified: string[]
}
```

---

## 26. User & Agent Feedback Intake System

### 26.1 Overview

Virtual Admin Agent ทำหน้าที่เป็น **"ศูนย์รับเรื่อง" (Intake Center)** สำหรับ:

1. **Bug reports** — จาก user จริง หรือ virtual agent ที่พบ error ระหว่างทำงาน
2. **Feature suggestions** — ข้อเสนอแนะจาก user หรือ AI agent ที่วิเคราะห์ว่าระบบควรปรับปรุง
3. **System observations** — สิ่งที่ virtual agents สังเกตเห็นระหว่างทำงาน (latency สูง, UX ไม่ดี, missing feature)

ทุก message จาก user ทุกคน (ทั้ง human user และ virtual user/agent) สามารถส่ง feedback ผ่าน channel เดียวกัน

```
┌──────────────────────────────────────────────────────────────────┐
│                    Feedback Intake Flow                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Sources:                                                        │
│  ┌──────────┐  ┌───────────────┐  ┌────────────────┐           │
│  │ Human    │  │ Virtual Agent │  │ Team AI Agent  │           │
│  │ Users    │  │ (Orchestrator)│  │ (from rooms)   │           │
│  └────┬─────┘  └──────┬────────┘  └──────┬─────────┘           │
│       │               │                  │                      │
│       └───────────────┼──────────────────┘                      │
│                       ▼                                          │
│            ┌─────────────────────┐                               │
│            │  Feedback Inbox     │                               │
│            │  (unified table)    │                               │
│            └─────────┬───────────┘                               │
│                      │                                           │
│            ┌─────────▼───────────┐                               │
│            │  Virtual Admin      │                               │
│            │  Agent Processing   │                               │
│            │                     │                               │
│            │  1. Auto-classify   │                               │
│            │  2. Deduplicate     │                               │
│            │  3. Assign priority │                               │
│            │  4. Route to admin  │                               │
│            └─────────┬───────────┘                               │
│                      │                                           │
│         ┌────────────┼────────────────┐                          │
│         ▼            ▼                ▼                          │
│    ┌─────────┐  ┌──────────┐  ┌────────────┐                   │
│    │ Bug     │  │ Feature  │  │ Observation│                   │
│    │ Tracker │  │ Backlog  │  │ Archive    │                   │
│    └─────────┘  └──────────┘  └────────────┘                   │
│                                                                  │
│  Admin Actions:                                                  │
│  • Review & Respond • Assign Priority • Plan Development        │
│  • Mark Resolved    • Merge Duplicates • Schedule Fix           │
└──────────────────────────────────────────────────────────────────┘
```

### 26.2 Feedback Sources

| Source | User Type | How They Submit | Auto-Fields |
|--------|-----------|-----------------|-------------|
| **Human user (UI)** | Real user | "Report Bug" / "Suggest Feature" button in app | userId, tenantId, currentPage, browserInfo |
| **Human user (chat)** | Real user | Type in chat: "I found a bug..." → agent detects intent | userId, conversationId, message context |
| **Virtual Agent (orchestrator)** | System user | API call when agent encounters repeated errors | agentId, roomId, runId, error stack |
| **Team AI Agent** | Virtual user | Inter-agent message: `channel = "feedback"` | assistantId, roomId, toolContext |
| **System Guardian** | System user (id: -1) | Auto-generated from incident patterns | incidentId, sensorId, pattern analysis |

### 26.3 Database Schema

```sql
-- Unified feedback/bug report table
CREATE TABLE feedback_tickets (
  id                SERIAL PRIMARY KEY,
  tenant_id         VARCHAR(36) NOT NULL REFERENCES tenants(id),

  -- Who submitted
  submitted_by      INTEGER NOT NULL REFERENCES users(id),  -- human or virtual user
  submitted_by_type VARCHAR(16) NOT NULL DEFAULT 'human',   -- human, virtual_agent, system_guardian
  agent_source_id   VARCHAR(64),                             -- agentId if from virtual agent

  -- Classification
  ticket_type       VARCHAR(16) NOT NULL,                    -- bug, feature_request, observation, question
  category          VARCHAR(64),                             -- ui, api, llm, media, performance, security, other
  priority          VARCHAR(16) NOT NULL DEFAULT 'normal',   -- critical, high, normal, low
  severity          VARCHAR(16),                             -- blocker, major, minor, cosmetic (for bugs)

  -- Content
  title             VARCHAR(255) NOT NULL,
  description       TEXT NOT NULL,
  steps_to_reproduce TEXT,                                   -- for bugs
  expected_behavior TEXT,                                    -- for bugs
  actual_behavior   TEXT,                                    -- for bugs
  context_json      JSONB,                                   -- page URL, browser, error stack, agent context

  -- Auto-enrichment by Virtual Admin Agent
  auto_category     VARCHAR(64),                             -- LLM-classified category
  auto_priority     VARCHAR(16),                             -- LLM-assessed priority
  auto_summary      TEXT,                                    -- LLM-generated summary (for agent-submitted)
  duplicate_of      INTEGER REFERENCES feedback_tickets(id), -- linked duplicate
  related_incident_id INTEGER REFERENCES virtual_admin_incidents(id),

  -- Status & workflow
  status            VARCHAR(16) NOT NULL DEFAULT 'new',
    -- new → triaged → in_progress → resolved → closed
    -- new → triaged → deferred
    -- new → triaged → duplicate
  assigned_to       INTEGER REFERENCES users(id),            -- admin who owns this
  admin_response    TEXT,                                     -- response back to user
  resolution_notes  TEXT,                                     -- internal notes
  resolution_type   VARCHAR(32),                             -- fixed, wont_fix, duplicate, cannot_reproduce, planned

  -- Planning integration
  planned_version   VARCHAR(32),                             -- e.g. "v2.5", "Q2-2026"
  planning_doc_url  VARCHAR(500),                            -- link to spec or planning doc
  dev_branch        VARCHAR(100),                            -- git branch if fix in progress

  -- Timestamps
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  triaged_at        TIMESTAMPTZ,
  responded_at      TIMESTAMPTZ,
  resolved_at       TIMESTAMPTZ,
  closed_at         TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX feedback_tickets_tenant_idx ON feedback_tickets(tenant_id);
CREATE INDEX feedback_tickets_status_idx ON feedback_tickets(status);
CREATE INDEX feedback_tickets_type_idx ON feedback_tickets(ticket_type);
CREATE INDEX feedback_tickets_priority_idx ON feedback_tickets(priority);
CREATE INDEX feedback_tickets_submitted_by_idx ON feedback_tickets(submitted_by);
CREATE INDEX feedback_tickets_duplicate_of_idx ON feedback_tickets(duplicate_of);

-- Comments/activity on a ticket
CREATE TABLE feedback_ticket_comments (
  id                SERIAL PRIMARY KEY,
  ticket_id         INTEGER NOT NULL REFERENCES feedback_tickets(id) ON DELETE CASCADE,
  author_id         INTEGER NOT NULL REFERENCES users(id),  -- admin, user, or system
  author_type       VARCHAR(16) NOT NULL DEFAULT 'admin',   -- admin, user, system
  content           TEXT NOT NULL,
  is_internal       BOOLEAN NOT NULL DEFAULT false,          -- internal note (admin-only) vs public reply
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX feedback_comments_ticket_idx ON feedback_ticket_comments(ticket_id);

-- Attachments (screenshots, logs)
CREATE TABLE feedback_ticket_attachments (
  id                SERIAL PRIMARY KEY,
  ticket_id         INTEGER NOT NULL REFERENCES feedback_tickets(id) ON DELETE CASCADE,
  file_name         VARCHAR(255) NOT NULL,
  file_url          VARCHAR(500) NOT NULL,     -- S3/R2 URL
  file_size         INTEGER NOT NULL,
  mime_type         VARCHAR(100) NOT NULL,
  uploaded_by       INTEGER NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 26.4 Virtual Admin Agent Auto-Processing

เมื่อ feedback ticket ถูกสร้าง Virtual Admin Agent จะ:

```
New Ticket Created
  │
  ▼
1. AUTO-CLASSIFY (LLM)
  │  Input: title + description + context
  │  Output: auto_category, auto_priority, auto_summary
  │
  ▼
2. DUPLICATE CHECK
  │  Search existing tickets by:
  │  - Title similarity (>80% match)
  │  - Same error stack trace
  │  - Same page + same ticket_type within 24h
  │  If duplicate found → link and notify submitter
  │
  ▼
3. INCIDENT CORRELATION
  │  Check if ticket matches an existing incident:
  │  - Error in description matches active incident sensor
  │  - Same tenant + same timeframe
  │  If correlated → link ticket to incident
  │
  ▼
4. PRIORITY ASSESSMENT
  │  Auto-assign priority based on:
  │  - Number of users reporting same issue (count duplicates)
  │  - Severity of related incident (if any)
  │  - submitter_type: virtual_agent reports weighted higher
  │  - Category: security > data_loss > functionality > ui > cosmetic
  │
  ▼
5. ROUTE TO ADMIN
  │  Notify tenant admin(s) based on priority:
  │  - critical/high → immediate notification
  │  - normal → hourly digest
  │  - low → daily digest
  │
  ▼
6. AUTO-RESPOND (optional, if enabled)
     For known patterns, send initial response:
     - "We're aware of this issue and working on it" (if matches active incident)
     - "This has been reported before, tracking in ticket #X" (if duplicate)
     - "Thank you for the suggestion, we've added it to our backlog"
```

### 26.5 Agent-to-Guardian Feedback API

Virtual agents ส่ง feedback ผ่าน internal API:

```typescript
// POST /api/internal/virtual-admin/feedback
// Called by: orchestrator agents, team agents, any virtual user

interface AgentFeedbackPayload {
  // Required
  ticketType: "bug" | "feature_request" | "observation";
  title: string;
  description: string;

  // Agent context (auto-filled)
  agentSourceId: string;       // which agent submitted
  roomId?: string;             // team room context
  runId?: string;              // execution run context

  // Bug-specific
  errorStack?: string;
  failedTool?: string;
  failureCount?: number;

  // Feature-specific
  rationale?: string;          // why the agent thinks this is needed
  frequency?: number;          // how often the agent encounters this gap

  // Context
  relatedFiles?: string[];     // file paths relevant to the issue
  reproducibleSteps?: string[];
}

// Response
interface AgentFeedbackResponse {
  ticketId: number;
  status: "created" | "merged_with_existing";
  duplicateOfId?: number;
  estimatedResponseTime: string; // "within 1 hour" based on priority
}
```

**Use Case Examples:**

```
Agent: "Deck Builder" encounters builtin-auto-draft timeout 5 times in 1 hour
→ Submits: {
    ticketType: "bug",
    title: "builtin-auto-draft tool timeout recurring",
    description: "Auto-draft tool timed out 5 times in past hour...",
    failedTool: "builtin-auto-draft",
    failureCount: 5,
    agentSourceId: "platform-deck-builder-agent"
  }
→ Virtual Admin: auto-correlates with queue_health incident, assigns high priority

Agent: "Deep Research" notices users always ask for PDF export
→ Submits: {
    ticketType: "feature_request",
    title: "PDF export for research reports",
    rationale: "8 out of 10 recent research requests ask for PDF download...",
    frequency: 8,
    agentSourceId: "platform-deep-research-agent"
  }
→ Virtual Admin: classifies as feature_request, priority normal, adds to backlog
```

---

## 27. Admin Feedback Management Dashboard

### 27.1 New Admin Page: `AdminFeedbackHub.tsx`

```
┌─────────────────────────────────────────────────────────────────┐
│  Feedback Hub                                    [+ New Ticket] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┬──────────┬──────────┬──────────┬────────────────┐  │
│  │ All (47)│ Bugs (23)│ Features │ Agent    │ Resolved (102) │  │
│  │         │          │  (18)    │ Reports  │                │  │
│  │         │          │          │  (6)     │                │  │
│  └─────────┴──────────┴──────────┴──────────┴────────────────┘  │
│                                                                 │
│  ┌─── Filter Bar ───────────────────────────────────────────┐   │
│  │ Priority: [All▾]  Status: [All▾]  Source: [All▾]         │   │
│  │ Category: [All▾]  Assigned: [All▾]  Sort: [Newest▾]      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─── Ticket List ──────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  🔴 #142 [BUG] Auto-draft timeout on large topics       │   │
│  │     Priority: HIGH | Status: triaged | By: Deck Builder  │   │
│  │     Category: api | 3 duplicates | Linked: Incident #87  │   │
│  │     Created: 2h ago | Assigned: admin@company.com        │   │
│  │                                                          │   │
│  │  🟡 #141 [FEATURE] PDF export for research reports      │   │
│  │     Priority: NORMAL | Status: new | By: Deep Research   │   │
│  │     Category: feature | Freq: 8/10 sessions              │   │
│  │     Created: 3h ago | Unassigned                         │   │
│  │                                                          │   │
│  │  🟢 #140 [BUG] Image not loading on slide preview       │   │
│  │     Priority: LOW | Status: new | By: user@example.com   │   │
│  │     Category: ui | Screenshot attached                   │   │
│  │     Created: 5h ago | Unassigned                         │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 27.2 Ticket Detail View

```
┌─────────────────────────────────────────────────────────────────┐
│  ← Back to Feedback Hub                                         │
│                                                                 │
│  #142 — Auto-draft timeout on large topics                      │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━                       │
│                                                                 │
│  ┌─── Status Bar ───────────────────────────────────────────┐   │
│  │ Type: 🐛 Bug    Priority: [🔴 HIGH ▾]                   │   │
│  │ Status: [Triaged ▾]   Assigned: [admin@company ▾]        │   │
│  │ Category: [API ▾]     Severity: [Major ▾]                │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─── Submitted By ────────────────────────────────────────┐    │
│  │ 🤖 Deck Builder Agent (virtual)                         │    │
│  │ Room: #marketing-deck | Run: run_abc123                  │    │
│  │ Submitted: 2026-03-18 14:32 (2 hours ago)               │    │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─── Description ──────────────────────────────────────────┐   │
│  │ builtin-auto-draft tool timed out 5 times in the past   │   │
│  │ hour when processing topics longer than 500 characters.  │   │
│  │                                                          │   │
│  │ Error: "Agency run timed out. Please try again..."       │   │
│  │ Failed tool: builtin-auto-draft                          │   │
│  │ Failure count: 5                                         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─── AI Summary (by System Guardian) ──────────────────────┐   │
│  │ Recurring auto-draft timeout likely caused by queue      │   │
│  │ backlog (linked Incident #87). Celery media queue depth  │   │
│  │ was 847 at time of failures.                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─── Linked Items ─────────────────────────────────────────┐   │
│  │ 🔗 Incident #87 (queue_depth_high) — open                │   │
│  │ 🔗 3 duplicate tickets: #139, #137, #135                 │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─── Admin Actions ────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  [💬 Reply to User]  [📝 Internal Note]                 │   │
│  │                                                          │   │
│  │  [📋 Plan for Development]  [✅ Mark Resolved]           │   │
│  │                                                          │   │
│  │  [🔀 Merge with Ticket #___]  [❌ Won't Fix]            │   │
│  │                                                          │   │
│  │  Planning:                                               │   │
│  │  Planned Version: [v2.5 ▾]                               │   │
│  │  Planning Doc: [________________]                        │   │
│  │  Dev Branch: [________________]                          │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─── Activity Timeline ────────────────────────────────────┐   │
│  │                                                          │   │
│  │  14:32 🤖 Ticket created by Deck Builder Agent           │   │
│  │  14:32 🛡️ System Guardian: Auto-classified as bug/api    │   │
│  │  14:33 🛡️ System Guardian: Linked to Incident #87        │   │
│  │  14:33 🛡️ System Guardian: Priority auto-set to HIGH     │   │
│  │  14:35 🛡️ System Guardian: 2 duplicates found (#139,#137)│   │
│  │  15:10 👤 admin@company: Assigned to self                │   │
│  │  15:15 👤 admin@company: "Investigating queue backlog"   │   │
│  │         (internal note)                                   │   │
│  │                                                          │   │
│  │  [Type a comment...]                          [Send]     │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 27.3 Admin Workflow Actions

| Action | Button | Effect | Notification to Submitter |
|--------|--------|--------|--------------------------|
| **Reply to User** | 💬 Reply | Creates public comment visible to submitter | In-app + email notification |
| **Internal Note** | 📝 Note | Creates admin-only comment (not visible to user) | None |
| **Plan for Dev** | 📋 Plan | Sets `planned_version` + `planning_doc_url` | "Your suggestion is planned for version X" |
| **Mark Resolved** | ✅ Resolve | Sets status=resolved, requires `resolution_type` | "Your ticket has been resolved" + notes |
| **Won't Fix** | ❌ Won't Fix | Sets status=closed, resolution_type=wont_fix | "We've reviewed this and decided not to proceed" + reason |
| **Merge Duplicate** | 🔀 Merge | Links as duplicate, closes this ticket | "Merged with ticket #X" |
| **Change Priority** | ▾ dropdown | Updates priority | None (admin-internal) |
| **Assign** | ▾ dropdown | Assigns to admin user | None (admin-internal) |
| **Change Status** | ▾ dropdown | Transitions status | Depends on new status |

### 27.4 Status Workflow

```
                  ┌──────────┐
                  │   new    │ ← ticket created
                  └────┬─────┘
                       │ admin reviews
                  ┌────▼─────┐
            ┌─────│ triaged  │─────┐
            │     └────┬─────┘     │
            │          │           │
    ┌───────▼──┐  ┌────▼─────┐  ┌─▼──────────┐
    │ deferred │  │in_progress│  │ duplicate  │
    └───────┬──┘  └────┬─────┘  └────────────┘
            │          │
            │     ┌────▼─────┐
            └────►│ resolved │
                  └────┬─────┘
                       │ auto-close after 7 days
                  ┌────▼─────┐
                  │  closed  │
                  └──────────┘
```

### 27.5 User-Facing Feedback UI

Users submit feedback through:

**Option A: Floating "Feedback" button (always visible)**

```typescript
// apps/web/client/src/components/feedback/FeedbackButton.tsx
// Fixed position bottom-right, opens modal with:
// - Type: Bug / Feature Request / Question
// - Title (required)
// - Description (required)
// - Screenshot upload (optional, via paste or file picker)
// - Auto-captures: current page URL, browser info, user session
```

**Option B: Chat intent detection**

```
User types in chat: "there's a bug with the presentation editor"
→ System Guardian detects feedback intent
→ Creates ticket automatically
→ Responds: "I've logged this as bug ticket #143.
   Could you describe what happened in more detail?"
→ Follow-up messages appended to ticket description
```

**Option C: Agent auto-submit**

Virtual agents automatically submit when they detect:
- Same tool failure 3+ times in 1 hour
- User explicitly says "this doesn't work" / "ไม่ได้" / "ใช้ไม่ได้"
- Task completion rate drops below 50% for a skill

### 27.6 tRPC Endpoints for Feedback System

```typescript
// apps/web/server/routers/feedback.ts

export const feedbackRouter = router({
  // ── User-facing ──
  submit: protectedProcedure
    .input(z.object({
      ticketType: z.enum(["bug", "feature_request", "question"]),
      title: z.string().min(3).max(255),
      description: z.string().min(10).max(10000),
      category: z.string().max(64).optional(),
      stepsToReproduce: z.string().max(5000).optional(),
      expectedBehavior: z.string().max(2000).optional(),
      actualBehavior: z.string().max(2000).optional(),
      attachmentUrls: z.array(z.string().max(500)).max(5).optional(),
    }))
    .mutation(/* creates ticket + triggers auto-processing */),

  myTickets: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
    }))
    .query(/* returns user's own tickets with admin responses */),

  getTicket: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(/* returns ticket detail if user is submitter or admin */),

  addComment: protectedProcedure
    .input(z.object({
      ticketId: z.number(),
      content: z.string().min(1).max(5000),
    }))
    .mutation(/* adds public comment */),

  // ── Admin-facing ──
  adminList: adminProcedure
    .input(z.object({
      ticketType: z.string().optional(),
      status: z.string().optional(),
      priority: z.string().optional(),
      category: z.string().optional(),
      assignedTo: z.number().optional(),
      submittedByType: z.enum(["human", "virtual_agent", "system_guardian"]).optional(),
      search: z.string().max(200).optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(/* returns filtered tickets with counts */),

  adminUpdate: adminProcedure
    .input(z.object({
      ticketId: z.number(),
      status: z.string().optional(),
      priority: z.string().optional(),
      severity: z.string().optional(),
      category: z.string().optional(),
      assignedTo: z.number().nullable().optional(),
      resolutionType: z.string().optional(),
      resolutionNotes: z.string().max(5000).optional(),
      plannedVersion: z.string().max(32).optional(),
      planningDocUrl: z.string().max(500).optional(),
      devBranch: z.string().max(100).optional(),
    }))
    .mutation(/* updates ticket fields */),

  adminRespond: adminProcedure
    .input(z.object({
      ticketId: z.number(),
      content: z.string().min(1).max(5000),
      isInternal: z.boolean().default(false),
    }))
    .mutation(/* adds comment + sends notification if public */),

  adminMergeDuplicate: adminProcedure
    .input(z.object({
      ticketId: z.number(),
      duplicateOfId: z.number(),
    }))
    .mutation(/* marks as duplicate, notifies submitter */),

  adminGetStats: adminProcedure
    .query(/* returns dashboard stats: counts by type/status/priority, trends */),
});
```

### 27.7 Dashboard Stats Widget

```
┌─── Feedback Overview (last 30 days) ─────────────────────┐
│                                                           │
│  Open: 47    In Progress: 12    Resolved: 102    Avg: 4h │
│  ████████    ███                ██████████████            │
│                                                           │
│  By Type:          By Source:         By Priority:        │
│  🐛 Bugs: 23      👤 Users: 35      🔴 Critical: 3     │
│  💡 Features: 18  🤖 Agents: 8      🟠 High: 8         │
│  👁️ Observe: 6   🛡️ Guardian: 4    🟡 Normal: 28      │
│                                                           │
│  Top Categories:   Avg Response:     Resolution Rate:     │
│  1. API (12)       First: 23min      This week: 87%      │
│  2. UI (9)         Resolve: 4.2h     Last week: 79%      │
│  3. Media (7)                                             │
└───────────────────────────────────────────────────────────┘
```

### 27.8 Implementation Phase

เพิ่มใน Phase plan ที่มีอยู่:

| Phase | Addition |
|-------|----------|
| **Phase 1** | Add `feedback_tickets` + `feedback_ticket_comments` + `feedback_ticket_attachments` tables |
| **Phase 2** | Add `feedback.submit` + `feedback.myTickets` user endpoints + FeedbackButton component |
| **Phase 3** | Add admin dashboard (AdminFeedbackHub) + admin endpoints |
| **Phase 4** | Add LLM auto-classification + duplicate detection + agent-to-guardian feedback API |
| **Phase 5** | Add chat intent detection + agent auto-submit + cross-system correlation |

### 27.9 Data Retention for Feedback

| Data | Retention | Cleanup |
|------|-----------|---------|
| Open/in-progress tickets | Never deleted | Must be resolved/closed first |
| Closed tickets | 1 year | Archive to cold storage, keep summary |
| Comments | Same as parent ticket | Cascaded on delete |
| Attachments (S3) | 90 days after ticket closed | S3 lifecycle rule |
| Agent-submitted tickets | Same as human tickets | No special treatment |

---

## 28. Feedback System Security

### 28.1 Input Validation & XSS Prevention

| Field | Validation | Sanitization |
|-------|-----------|--------------|
| `title` | 3-255 chars, Zod `.min(3).max(255)` | Strip HTML tags via `sanitize-html` before DB insert |
| `description` | 10-10000 chars | Strip `<script>`, `<iframe>`, `on*=` attributes; allow safe markdown |
| `steps_to_reproduce` | max 5000 chars | Same as description |
| `admin_response` | max 5000 chars | Same as description |
| `comment.content` | 1-5000 chars | Same as description |
| `planning_doc_url` | max 500 chars | Validate URL format, allow only `https://` protocol |
| `dev_branch` | max 100 chars | Alphanumeric + `-/_` only, reject shell metacharacters |

**Rendering**: All user-generated content displayed via React text nodes (auto-escaped) or with `DOMPurify` if rendering HTML.

### 28.2 File Upload Security

| Check | Rule |
|-------|------|
| File type | Whitelist: `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `application/pdf`, `text/plain`, `text/csv` |
| File size | Max 10MB per file, max 5 files per ticket |
| File name | Sanitize: strip path traversal (`../`), special chars; generate UUID filename for S3 |
| Storage | Upload to S3/R2 with private ACL; signed URLs for viewing (expire 1h) |
| Virus scan | Optional: ClamAV scan before S3 upload (if available) |
| Content-Type | Validate MIME type matches file extension; reject mismatches |

### 28.3 Rate Limiting

| Endpoint | Limit | Window | Why |
|----------|-------|--------|-----|
| `feedback.submit` | 10 tickets/hour per user | Sliding window | Prevent spam |
| `feedback.addComment` | 30 comments/hour per user | Sliding window | Prevent abuse |
| File upload | 20 uploads/hour per user | Sliding window | Storage protection |
| Agent feedback API | 50 tickets/hour per agent | Sliding window | Prevent agent loops |
| Admin endpoints | 100 requests/min per admin | Sliding window | Standard admin protection |

### 28.4 Tenant Isolation

| Rule | Enforcement |
|------|-------------|
| Users can only see their own tickets | `WHERE submitted_by = ctx.user.id` in `myTickets` |
| Users cannot see other tenants' tickets | `WHERE tenant_id = ctx.tenantId` on all queries |
| Admin sees only their tenant's tickets | `WHERE tenant_id = ctx.tenantId` in `adminList` |
| Domain admin sees all tenants | `WHERE 1=1` only for role = `domain_admin` |
| Agent feedback scoped to tenant | `tenant_id` derived from agent's execution context |
| Attachment access | Signed S3 URL includes tenant check; no direct bucket access |

### 28.5 RBAC (Role-Based Access Control)

| Action | user | admin | domain_admin | system_agent |
|--------|------|-------|-------------|-------------|
| Submit feedback | ✅ | ✅ | ✅ | ✅ |
| View own tickets | ✅ | ✅ | ✅ | ✅ |
| View all tenant tickets | ❌ | ✅ | ✅ | ✅ |
| Respond to tickets | ❌ | ✅ | ✅ | ✅ (auto-response only) |
| Change priority/status | ❌ | ✅ | ✅ | ✅ (auto-triage only) |
| Assign tickets | ❌ | ✅ | ✅ | ❌ |
| Delete tickets | ❌ | ❌ | ✅ | ❌ |
| View all tenants' tickets | ❌ | ❌ | ✅ | ✅ (read-only) |
| Merge duplicates | ❌ | ✅ | ✅ | ✅ (auto-merge only) |
| Plan for development | ❌ | ✅ | ✅ | ❌ |

### 28.6 Anti-Abuse Measures

| Threat | Mitigation |
|--------|-----------|
| Spam tickets from compromised account | Rate limit + auto-detect: >5 tickets with similar content in 1h → flag + notify admin |
| Agent feedback loop | Agent cannot submit feedback about its own previous feedback ticket |
| LLM injection via feedback | Feedback content sent to LLM for classification is wrapped in safe prompt template; user content in `<user_input>` tags |
| PII in feedback | Auto-scan for email/phone patterns; warn admin, don't auto-share with LLM |
| Admin impersonation | All admin actions audit-logged with `userId`; admin JWT required for all admin endpoints |

---

## 29. Real-Time Updates (WebSocket/SSE)

### 29.1 Live Dashboard Updates

Admin dashboard (`AdminSystemGuardian.tsx`, `AdminFeedbackHub.tsx`) ต้อง live-update เมื่อ:

| Event | Channel | Payload |
|-------|---------|---------|
| New incident created | `guardian:incidents` | `{ id, severity, title, sensorId }` |
| Incident resolved | `guardian:incidents` | `{ id, status: "resolved" }` |
| New approval pending | `guardian:approvals` | `{ id, incidentId, actionType }` |
| Approval decided | `guardian:approvals` | `{ id, status, decidedBy }` |
| Sensor status changed | `guardian:sensors` | `{ sensorId, status, metrics }` |
| New feedback ticket | `feedback:tickets` | `{ id, ticketType, title, priority }` |
| Ticket status changed | `feedback:tickets` | `{ id, status, updatedBy }` |
| New comment on ticket | `feedback:comments` | `{ ticketId, authorType }` |

### 29.2 Implementation

ใช้ **Server-Sent Events (SSE)** ผ่าน Express endpoint (ไม่ต้อง WebSocket library เพิ่ม):

```typescript
// apps/web/server/routers/virtualAdminSSE.ts
// GET /api/virtual-admin/events (admin-only, SSE stream)

app.get("/api/virtual-admin/events", requireAdmin, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const listener = (event: GuardianEvent) => {
    res.write(`event: ${event.channel}\ndata: ${JSON.stringify(event.payload)}\n\n`);
  };

  guardianEventBus.on("event", listener);
  req.on("close", () => guardianEventBus.off("event", listener));
});
```

**Client side:**
```typescript
// useGuardianEvents() hook
const eventSource = new EventSource("/api/virtual-admin/events");
eventSource.addEventListener("guardian:incidents", (e) => {
  queryClient.invalidateQueries(["virtualAdmin", "incidents"]);
});
```

### 29.3 Global Critical Alert Banner

เมื่อมี CRITICAL incident → แสดง banner ทั่วทั้ง app:

```typescript
// SystemHealthBanner.tsx — mounted in App.tsx layout
// Listens to guardian:incidents SSE
// Shows: "⚠️ System issue detected: {title} — Admin is investigating"
// Auto-dismiss when incident resolved
// Only visible to: admin users (configurable per-tenant)
```

---

## 30. Structured Logging

### 30.1 Log Format

ทุก action ของ Virtual Admin Agent ใช้ structured JSON logging ผ่าน `auditLogger`:

```typescript
auditLogger.log({
  traceId: `guardian:${incidentId}:${Date.now()}`,
  eventType: "guardian_sensor_check" | "guardian_incident_created" | "guardian_action_executed"
            | "guardian_approval_requested" | "guardian_approval_decided"
            | "feedback_ticket_created" | "feedback_auto_classified" | "feedback_duplicate_detected",
  userId: -1,  // system user
  requestPayload: {
    sensorId, ruleId, severity, metrics,
  },
  responsePayload: {
    incidentId, actionTaken, actionResult, notificationsSent,
  },
  timing: {
    sensorDurationMs, ruleEvalMs, actionDurationMs,
  },
});
```

### 30.2 New Audit Event Types

เพิ่มใน `AuditEventType` union (`auditLogger.ts`):

```typescript
| "guardian_sensor_check"
| "guardian_incident_created"
| "guardian_incident_resolved"
| "guardian_action_executed"
| "guardian_action_failed"
| "guardian_approval_requested"
| "guardian_approval_decided"
| "guardian_llm_analysis"
| "feedback_ticket_created"
| "feedback_auto_classified"
| "feedback_duplicate_detected"
| "feedback_admin_responded"
```

### 30.3 Queryable via Admin Audit Logs

ใช้ existing `AdminAuditLogs.tsx` page ได้เลย — filter by `eventType` prefix `guardian_*` หรือ `feedback_*`

---

## 31. Self-Monitoring (Watchdog)

### 31.1 Guardian Health Check

Virtual Admin Agent ต้อง monitor ตัวเอง:

```typescript
// Watchdog: runs every 5 minutes
// Checks:
// 1. Last sensor run timestamp — if > 3x interval, sensor is stuck
// 2. Pending incidents count — if > 100, possible runaway
// 3. Memory usage of sensor loop — if > 200MB, possible leak
// 4. Event bus listener count — if > 1000, possible connection leak

interface WatchdogCheck {
  lastSensorRunAt: Date;
  pendingIncidents: number;
  memoryUsageMB: number;
  eventBusListeners: number;
  healthy: boolean;
}
```

### 31.2 Self-Recovery Actions

| Condition | Action |
|-----------|--------|
| Sensor stuck (no run in 3x interval) | Restart sensor loop, log warning |
| Pending incidents > 100 | Auto-expire oldest warnings, log error |
| Memory > 200MB | Restart guardian process (via systemd), log critical |
| Event bus leak (> 1000 listeners) | Force-close stale SSE connections, log warning |
| Guardian process crash | systemd `Restart=on-failure` auto-restarts |

### 31.3 External Health Endpoint

```typescript
// GET /api/virtual-admin/health (no auth — for uptime monitoring)
// Returns: { status: "healthy" | "degraded" | "down", lastCheck, uptime, sensors }
// Used by: external uptime monitoring (UptimeRobot, etc.)
```

---

## 32. Performance Considerations

### 32.1 Resource Budget

| Resource | Budget | Enforcement |
|----------|--------|-------------|
| CPU per sensor cycle | < 50ms total | Timeout per sensor: 10s |
| Memory (guardian process) | < 100MB steady state | Ring buffer for readings (max 100/sensor) |
| DB queries per cycle | < 30 queries total | Batch reads where possible |
| Network (internal API) | < 10 calls per cycle | Cache Python health responses for 30s |
| Redis operations per cycle | < 20 ops total | Pipeline Redis commands |
| JSONL log reads (error_spike sensor) | < 1MB per check | Tail last 1000 lines only |

### 32.2 Load Impact

| Scenario | Impact | Mitigation |
|----------|--------|-----------|
| 10 sensors × 1/min = 10 checks/min | Negligible | Stagger intervals (not all at once) |
| Error spike sensor reads JSONL | Disk I/O burst | Read only last 1000 lines; skip if file > 100MB |
| LLM analysis | 1 API call per 5min max | Rate limited; cheapest model; timeout 30s |
| SSE connections (admin dashboards) | 1 connection per admin tab | Max 50 concurrent; auto-close idle > 30min |
| Feedback auto-classify (LLM) | 1 call per ticket | Batch classify: queue 10 tickets, classify together |

### 32.3 Degraded Mode

If system is under heavy load, guardian enters degraded mode:

```
Normal Mode:   All sensors active, LLM analysis enabled, SSE streaming
Degraded Mode: Critical sensors only (queue, celery, error_spike), no LLM, SSE paused
Trigger:       API latency p95 > 10s OR memory > 80% OR CPU > 90%
Recovery:      Auto-resume normal when metrics below threshold for 5 minutes
```

---

## 33. Edge Cases & Concurrency

### 33.1 Timezone Handling

| Rule | Implementation |
|------|---------------|
| All timestamps stored as UTC | `TIMESTAMPTZ` in PostgreSQL, `new Date().toISOString()` in code |
| Display in admin's local timezone | Frontend `Intl.DateTimeFormat` with browser timezone |
| Scheduled checks (cert_expiry, cleanup) | Celery beat uses UTC cron; no timezone confusion |
| "Created 2h ago" relative display | `date-fns/formatDistanceToNow` in frontend |
| Email digest timing (hourly/daily) | Based on UTC hours; admin can configure preferred hour in settings |

### 33.2 Concurrent Approval

เมื่อ admin 2 คน approve/reject พร้อมกัน:

```typescript
// Optimistic locking via status check
async function decideApproval(id, decision, adminId) {
  const result = await db
    .update(virtualAdminApprovals)
    .set({ status: decision, decidedBy: adminId, decidedAt: new Date() })
    .where(and(
      eq(virtualAdminApprovals.id, id),
      eq(virtualAdminApprovals.status, "pending"),  // ← only if still pending
    ))
    .returning();

  if (result.length === 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "This approval has already been decided by another admin",
    });
  }
  // Execute action only once (first writer wins)
}
```

### 33.3 Duplicate Incident Prevention

```typescript
// Before creating a new incident, check for active duplicates
async function createIncidentIfNew(sensorId, ruleId, severity, title) {
  const existing = await db.select().from(virtualAdminIncidents)
    .where(and(
      eq(virtualAdminIncidents.sensorId, sensorId),
      eq(virtualAdminIncidents.ruleId, ruleId),
      eq(virtualAdminIncidents.status, "open"),
    ))
    .limit(1);

  if (existing.length > 0) {
    // Update existing incident's metrics instead of creating duplicate
    await db.update(virtualAdminIncidents)
      .set({ metricsJson: newMetrics, updatedAt: new Date() })
      .where(eq(virtualAdminIncidents.id, existing[0].id));
    return existing[0];
  }

  // Create new incident
  return db.insert(virtualAdminIncidents).values({ ... }).returning();
}
```

### 33.4 Server Restart / Crash Recovery

| State Before Crash | Recovery Action |
|--------------------|----------------|
| Sensor mid-check | No action needed; sensors restart on boot (S21) |
| Approval pending, action not started | Approval stays in DB as `pending`; admin can still decide |
| Approval approved, action executing | Mark as `execution_interrupted`; re-evaluate on restart |
| Notification queued but not sent | Re-queue unsent notifications (query `sent_at IS NULL`) |
| LLM analysis in progress | Discard; will re-trigger if error pattern persists |
| SSE connections open | All dropped on restart; clients auto-reconnect via `EventSource` |
| Feedback auto-classify pending | Re-queue tickets with `auto_category IS NULL` for classification |

### 33.5 Multi-Instance / Horizontal Scaling

SmartSpecPro รันบน single server (ไม่มี horizontal scaling) แต่ spec ออกแบบให้ safe:

| Concern | Handling |
|---------|---------|
| Multiple sensor loops running | **Not applicable** — single Node.js process; if multi-instance: use Redis lock (`SETNX guardian:lock`) |
| Duplicate incidents across instances | **Not applicable**; if needed: duplicate check uses DB unique constraint `(sensorId, ruleId, status='open')` |
| SSE fan-out | **Not applicable**; if needed: use Redis pub/sub for cross-instance event distribution |
| Approval race condition | Already handled via optimistic locking (S33.2) — works across instances |

### 33.6 Notification Delivery Failure

| Channel | Failure Mode | Handling |
|---------|-------------|----------|
| In-app notification | DB insert fails | Retry 3x; if still fails: log error, continue (best-effort) |
| Email (SMTP) | Connection timeout / auth fail | Retry 3x with backoff (1s, 5s, 30s); if all fail: log error, try next channel |
| Slack webhook | HTTP 429 (rate limit) | Respect `Retry-After` header; queue message for retry |
| Slack webhook | HTTP 5xx / timeout | Retry 3x; if all fail: fallback to email |
| Telegram | API error / rate limit | Retry 2x; if fail: fallback to email |
| All channels fail | — | Create incident `notification_delivery_failed` (severity: error); log to audit |

**Fallback chain:** Slack → Email → In-app (in-app always succeeds if DB is up)
