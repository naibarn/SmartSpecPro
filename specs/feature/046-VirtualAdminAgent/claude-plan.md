# Spec 046 — Virtual Admin Agent: Implementation Plan

## 1. Overview

Build an autonomous **System Guardian** that monitors SmartSpecPro infrastructure 24/7, detects issues via sensor polling, resolves low-risk problems automatically, escalates high-risk actions through an approval gate, provides a dedicated admin chat interface, and operates a feedback intake system for bug reports and feature requests from both human users and virtual agents.

The Guardian runs as a reserved system user (`id: -1`) with its own JWT, zero credit cost, and full audit trail. It reuses existing infrastructure: `queueHealthMonitor`, `notificationService`, `emailService`, Redis pub/sub SSE, and the chat/conversation system.

**Key decisions from stakeholder interview:**
- Dedicated admin chat (not just dashboard)
- Per-tenant opt-in for auto-fix
- Soft limit (100 credits) + hard limit (-50) for budget enforcement
- Users see own tickets only
- 4h approval TTL for critical, 24h for others
- Internal watchdog + systemd safety net
- Ship everything in one phase (39h)

---

## 2. Directory Structure

```
apps/web/
├── server/
│   ├── services/virtualAdmin/
│   │   ├── types.ts                   # Sensor, Rule, Incident, Approval types
│   │   ├── systemUser.ts              # System user creation + JWT generation
│   │   ├── sensorRegistry.ts          # Sensor base class + registry
│   │   ├── ruleEngine.ts              # Rule evaluation + incident creation
│   │   ├── actuatorRegistry.ts        # Action execution + approval gate
│   │   ├── notifier.ts                # Multi-channel notification dispatcher
│   │   ├── scheduler.ts               # Sensor loop lifecycle (start/stop/watchdog)
│   │   ├── chatHandler.ts             # Dedicated admin chat command handler
│   │   ├── feedbackProcessor.ts       # Auto-classify, dedup, correlate, route
│   │   ├── sensors/
│   │   │   ├── queueHealth.ts
│   │   │   ├── celeryHealth.ts
│   │   │   ├── errorSpike.ts
│   │   │   ├── llmProvider.ts
│   │   │   ├── creditBalance.ts
│   │   │   ├── diskStorage.ts
│   │   │   ├── dbHealth.ts
│   │   │   ├── certExpiry.ts
│   │   │   ├── apiLatency.ts
│   │   │   ├── mediaPipeline.ts
│   │   │   └── teamEscalation.ts
│   │   └── actuators/
│   │       ├── notifyActions.ts       # notify_admin, notify_user, notify_slack
│   │       ├── autoFixActions.ts      # retry, cleanup, cache clear, failover
│   │       └── approvalActions.ts     # pause, restart, disable, kill, maintenance
│   ├── routers/
│   │   ├── virtualAdmin.ts            # Guardian tRPC router
│   │   └── feedback.ts                # Feedback tRPC router
│   ├── routes/
│   │   └── guardianSSE.ts             # SSE streaming endpoint
│   └── jobs/
│       └── guardianWatchdog.ts        # Self-monitoring job
├── client/src/
│   ├── pages/
│   │   ├── AdminSystemGuardian.tsx    # Main guardian dashboard
│   │   └── AdminFeedbackHub.tsx       # Feedback management
│   └── components/
│       ├── guardian/
│       │   ├── IncidentTimeline.tsx
│       │   ├── SensorStatusGrid.tsx
│       │   ├── ApprovalActionCard.tsx
│       │   ├── GuardianSettingsPanel.tsx
│       │   ├── GuardianChat.tsx        # Dedicated chat with Guardian
│       │   └── SystemHealthBanner.tsx
│       └── feedback/
│           ├── FeedbackButton.tsx      # Floating submit button
│           ├── FeedbackSubmitModal.tsx
│           ├── TicketDetailView.tsx
│           └── FeedbackStatsWidget.tsx
├── shared/
│   └── virtualAdmin/
│       └── types.ts                    # Shared types for client + server
└── drizzle/
    └── schema.ts                       # 6 new tables added
```

---

## 3. Database Schema

### 3.1 New Enums

```typescript
incidentSeverityEnum: pgEnum("incident_severity", ["info", "warning", "error", "critical"])
incidentStatusEnum: pgEnum("incident_status", ["open", "acknowledged", "resolved", "expired"])
approvalStatusEnum: pgEnum("approval_status", ["pending", "approved", "rejected", "expired", "execution_failed"])
ticketTypeEnum: pgEnum("ticket_type", ["bug", "feature_request", "observation", "question"])
ticketStatusEnum: pgEnum("ticket_status", ["new", "triaged", "in_progress", "deferred", "resolved", "duplicate", "closed"])
ticketResolutionEnum: pgEnum("ticket_resolution", ["fixed", "wont_fix", "duplicate", "cannot_reproduce", "planned", "by_design"])
```

### 3.2 Tables

**`virtual_admin_incidents`** — All detected issues
- `id` serial PK
- `tenantId` varchar(36) FK → tenants
- `sensorId` varchar(64), `ruleId` varchar(64)
- `severity` incidentSeverityEnum, `status` incidentStatusEnum
- `title` varchar(255), `message` text
- `metricsJson` json, `actionTaken` varchar(64), `actionResult` text
- `resolvedBy` integer FK → users, `resolvedAt` timestamptz
- `createdAt`, `updatedAt` timestamptz
- Indexes: tenant, status, severity, sensor

**`virtual_admin_approvals`** — Actions requiring admin decision
- `id` serial PK
- `incidentId` integer FK → incidents
- `actionType` varchar(64), `actionParamsJson` json
- `status` approvalStatusEnum
- `requestedAt`, `decidedAt`, `expiresAt` timestamptz
- `decidedBy` integer FK → users, `decisionComment` text

**`virtual_admin_sensor_config`** — Per-tenant thresholds
- `id` varchar(64) PK (compound: `{tenantId}:{sensorId}`)
- `tenantId` varchar(36) FK, `sensorId` varchar(64)
- `enabled` boolean, `intervalMs` integer
- `thresholdsJson` json
- `updatedAt` timestamptz

**`feedback_tickets`** — Bug reports, feature requests, observations
- `id` serial PK
- `tenantId` varchar(36) FK, `submittedBy` integer FK → users
- `submittedByType` varchar(16) — human | virtual_agent | system_guardian
- `ticketType` ticketTypeEnum, `priority` reminderPriorityEnum
- `severity` varchar(16), `category` varchar(64)
- `title` varchar(255), `description` text
- `stepsToReproduce` text, `expectedBehavior` text, `actualBehavior` text
- `contextJson` json — page URL, browser, error stack
- `autoCategory` varchar(64), `autoPriority` varchar(16), `autoSummary` text
- `duplicateOf` integer self-FK, `relatedIncidentId` integer FK → incidents
- `status` ticketStatusEnum, `assignedTo` integer FK → users
- `adminResponse` text, `resolutionNotes` text, `resolutionType` ticketResolutionEnum
- `plannedVersion` varchar(32), `planningDocUrl` varchar(500), `devBranch` varchar(100)
- `createdAt`, `triagedAt`, `respondedAt`, `resolvedAt`, `closedAt`, `updatedAt`

**`feedback_ticket_comments`** — Activity on tickets
- `id` serial PK, `ticketId` integer FK → tickets (cascade)
- `authorId` integer FK → users, `authorType` varchar(16)
- `content` text, `isInternal` boolean (admin-only vs public)
- `createdAt` timestamptz

**`feedback_ticket_attachments`** — Screenshots, logs
- `id` serial PK, `ticketId` integer FK → tickets (cascade)
- `fileName` varchar(255), `fileUrl` varchar(500)
- `fileSize` integer, `mimeType` varchar(100)
- `uploadedBy` integer FK → users, `createdAt` timestamptz

---

## 4. System User

### 4.1 Registration

On server startup, check if system user exists. If not, insert:

```typescript
// systemUser.ts
interface SystemUser {
  id: -1;
  email: "system-agent@internal";
  username: "System Guardian";
  role: "system_agent";
  isSystemUser: true;
}
```

Add `isSystemUser` boolean column to `users` table (default false). Add `system_agent` to `roleEnum`.

**Migration note:** This requires a schema migration via `pnpm db:push`. The `isSystemUser` column is nullable boolean with default false — safe additive migration, no data loss. The `system_agent` role enum value must be added via raw SQL (`ALTER TYPE role ADD VALUE 'system_agent'`) since Drizzle cannot alter enums. Follow Database Safety Protocol (backup users table before migration).

### 4.2 JWT Generation

Generate a long-lived JWT (365 days) at startup using the existing `jose` library. Store in memory only (never persisted). Include `userId: -1`, `role: "system_agent"`, `tenantId: null` (cross-tenant access).

### 4.3 Auth Middleware

Add check in `adminProcedure` middleware: if `user.role === "system_agent"`, grant read access to all tenants. Write access limited to guardian-specific tables.

---

## 5. Sensor Framework

### 5.1 Base Interface

```typescript
interface Sensor {
  id: string;
  name: string;
  defaultIntervalMs: number;
  collect(tenantId?: string): Promise<SensorReading>;
}

interface SensorReading {
  sensorId: string;
  timestamp: Date;
  status: "healthy" | "degraded" | "critical" | "unknown";
  metrics: Record<string, number | string>;
  message: string;
  tenantId?: string;
}
```

### 5.2 Sensor Registry

Array of sensor instances. The scheduler iterates and calls `collect()` per sensor at its configured interval. Results fed to rule engine.

### 5.3 Sensor Categories

| Category | Sensors | Scope |
|----------|---------|-------|
| System-wide | queue_health, celery_health, db_health, cert_expiry, api_latency | All tenants |
| Per-tenant | credit_balance, media_pipeline | Iterates per active tenant |
| Cross-system | error_spike, llm_provider, team_escalation | All tenants |

### 5.4 Key Sensor Implementations

**queue_health**: Wrap existing `getQueueHealthStatus()` → evaluate `activeAlerts`, map to SensorReading. Reuse all thresholds from `queueHealthMonitor.ts`.

**celery_health**: HTTP call to Python internal endpoint `GET /api/internal/virtual-admin/celery-health`. Parse response for worker count, active tasks, queue lengths.

**error_spike**: Tail last 1000 lines of today's audit JSONL. Count `eventType: "error"` in last 5 minutes. Compare to rolling 1-hour baseline. Flag if > 3x baseline.

**credit_balance**: Query `SELECT SUM(amount) FROM credit_transactions WHERE tenant_id = ? AND type IN ('credit', 'debit')`. Compare to soft limit (100) and hard limit (-50).

---

## 6. Rule Engine

### 6.1 Rule Structure

```typescript
interface IncidentRule {
  id: string;
  sensorId: string;
  condition: (reading: SensorReading) => boolean;
  severity: "info" | "warning" | "error" | "critical";
  actionPlan: ActionPlan;
  cooldownMs: number;
}

interface ActionPlan {
  autoFix?: { type: string; params: Record<string, unknown> };
  notify: { channels: ("in_app" | "email" | "slack" | "telegram")[] };
  requiresApproval?: boolean;
}
```

### 6.2 Evaluation Flow

```
For each SensorReading:
  1. Find matching rules (sensorId match)
  2. Evaluate condition
  3. Check cooldown (last incident with same ruleId still in cooldown?)
  4. Check for active duplicate incident (same sensor + rule + status=open)
  5. If new: create incident in DB
  6. Execute action plan:
     - If autoFix && tenant has auto-fix enabled → execute
     - If requiresApproval → create approval record
     - Always → send notifications per channel list
```

### 6.3 Duplicate Prevention

Before creating incident, query: `WHERE sensorId = ? AND ruleId = ? AND status = 'open'`. If exists, update `metricsJson` and `updatedAt` instead of creating duplicate.

---

## 7. Actuators

### 7.1 Auto-Fix Actions (no approval)

- **retry_failed_job**: Call existing BullMQ `job.retry()` or Celery `AsyncResult.retry()`
- **cleanup_temp_files**: Delete files in `media_storage/` older than retention period
- **clear_stale_cache**: Redis `SCAN` + `DEL` for keys matching pattern with expired TTL
- **failover_provider**: Update provider registry to skip failed provider, switch traffic to backup

### 7.2 Approval-Required Actions

- **pause_queue**: BullMQ `queue.pause()` — reversible, stops processing
- **restart_celery_worker**: HTTP call to Python `POST /api/internal/virtual-admin/restart-worker`
- **disable_provider**: Set provider status to disabled in DB
- **kill_stuck_task**: Celery `AsyncResult.revoke(terminate=True)`
- **emergency_maintenance**: Set system_settings `maintenance_mode = true`

### 7.3 Approval Flow

1. Create `virtual_admin_approvals` record with `status: "pending"`, `expiresAt` based on severity
2. Notify all tenant admins (in-app + email)
3. SSE push `guardian:approvals` event
4. Admin calls `decideApproval` tRPC mutation
5. If approved: execute action, update incident, log result
6. If rejected: log reason, keep monitoring
7. If expired (no response by TTL): CRITICAL → re-alert; others → archive

Concurrent approval protection: `UPDATE ... WHERE id = ? AND status = 'pending'` — if 0 rows affected, another admin already decided.

---

## 8. Dedicated Admin Chat

### 8.1 Architecture

Reuse existing chat infrastructure:
- Create a conversation with `type: "system_guardian"` (new conversation type)
- System user (id: -1) is auto-added as participant
- Admin opens chat → sends messages → Guardian responds

### 8.2 Chat Command Handler

`chatHandler.ts` receives admin messages and interprets them:

**Recognized intents (keyword-based + simple NLP):**
- "status" / "health" → return sensor status grid as structured message
- "incidents" / "problems" → return open incidents summary
- "retry [job_id]" → execute retry_failed_job actuator
- "approve [approval_id]" → process approval
- "queue" / "queue status" → return queue health details
- "credit [tenant_name]" → return credit balance

**Fallback:** If intent is unclear → respond with help menu listing available commands. Never silently ignore admin messages.

**Response format:** Structured message with markdown + action buttons (approve/reject inline).

### 8.3 Chat History

All interactions stored in existing `messages` table with `conversationId`. Admin can review history anytime.

---

## 9. Feedback System

### 9.1 Submission Channels

**FeedbackButton (UI):** Floating button bottom-right. Opens modal with: type selector (bug/feature/question), title, description, optional screenshot upload. Auto-captures: current URL, browser info.

**Chat intent detection:** When user types "bug", "ไม่ได้", "ใช้ไม่ได้", "there's a problem" in any chat → Guardian detects intent → creates ticket → asks for more details in follow-up messages.

**Agent API (internal):** `POST /api/internal/virtual-admin/feedback` — virtual agents submit when they encounter repeated failures or observe improvement opportunities.

### 9.2 Auto-Processing Pipeline

`feedbackProcessor.ts` runs on every new ticket:

1. **Classify**: LLM call (cheapest model) with title + description → auto_category, auto_priority. If LLM fails: fallback to keyword-based classification (e.g., "error"/"crash"/"fail" → bug/high, "could you add"/"suggestion" → feature_request/normal)
2. **Deduplicate**: Text similarity search against open tickets (same tenant, last 7 days). If >80% match → link as duplicate
3. **Correlate**: Match error keywords against active incidents. If match → link `relatedIncidentId`
4. **Prioritize**: Score based on: duplicate count × 2, incident correlation × 3, virtual_agent source × 1.5, severity keyword bonus
5. **Route**: Notify tenant admin(s) based on priority (critical=immediate, normal=hourly digest, low=daily)
6. **Auto-respond** (optional): If matches active incident → "We're aware and working on it"; if duplicate → "Tracked in ticket #X"

### 9.3 Admin Workflow

`AdminFeedbackHub.tsx` provides:
- List view with filters (type, status, priority, category, assigned, source)
- Ticket detail with: AI summary, linked items, activity timeline
- Actions: reply (public), internal note, plan for dev, resolve, merge, won't fix
- Planning fields: planned_version, planning_doc_url, dev_branch
- Stats widget: counts by type/status, avg response time, resolution rate

---

## 10. Notification & SSE

### 10.1 Multi-Channel Notification

`notifier.ts` dispatches to channels based on severity:

| Severity | In-app | Email | Slack | Telegram |
|----------|--------|-------|-------|----------|
| info | ✅ | — | — | — |
| warning | ✅ | digest | — | — |
| error | ✅ | immediate | ✅ | — |
| critical | ✅ | immediate | ✅ | ✅ |

Uses existing `createNotification()`, `emailService`, `builtin-slack-message` tool.

### 10.2 SSE Streaming

`guardianSSE.ts` — Express endpoint `GET /api/virtual-admin/events`:
- Redis pub/sub channel: `guardian:events`
- Event types: incidents, approvals, sensors, feedback
- Heartbeat: 30s
- Max connection: 60min
- Cleanup on disconnect

Frontend hook: `useGuardianEvents()` → invalidates TanStack Query caches on events.

### 10.3 SystemHealthBanner

Global component in app layout. Shows red banner when CRITICAL incident is active. Auto-dismisses when resolved. Visible to admin users only (configurable per-tenant).

---

## 11. Scheduler & Lifecycle

### 11.1 Startup

```
Server starts → check VIRTUAL_ADMIN_ENABLED
  → Load sensor configs from DB (or defaults)
  → Ensure system user exists, generate JWT
  → Register sensor intervals (staggered, not all at once)
  → Start watchdog timer (5min interval)
  → Log "System Guardian started" to audit
```

### 11.2 Shutdown

```
SIGTERM → clear all sensor intervals
  → flush pending notifications
  → mark in-progress actions as "interrupted"
  → log "System Guardian stopped"
  → exit
```

### 11.3 Watchdog

Every 5 minutes check:
- Last sensor run timestamp (if > 3× interval → restart sensor)
- Open incidents count (if > 100 → auto-expire oldest warnings)
- Memory usage (if > 200MB → log critical)
- SSE listener count (if > 1000 → force-close stale)

---

## 12. Security

- **System user**: read-all, write only to own tables; cannot login via UI
- **Actuators**: whitelisted functions only, no shell execution
- **Feedback XSS**: sanitize-html on all user content before DB insert
- **File uploads**: whitelist MIME types, max 10MB, UUID filenames, signed S3 URLs
- **Rate limiting**: 10 tickets/h per user, 50/h per agent, 100 req/min admin
- **Tenant isolation**: all queries scoped by tenantId from JWT context
- **RBAC**: users see own tickets; admin sees tenant; domain_admin sees all
- **Approval locking**: `UPDATE WHERE status='pending'` — first writer wins
- **LLM**: no secrets in prompts, content wrapped in safe template

---

## 13. Testing Strategy

- **Unit tests**: Rule engine (all 18 rules), sensor mocks, notifier channel routing, approval flow (approve/reject/expire/concurrent), feedback processor (classify/dedup/correlate)
- **Integration tests**: End-to-end alert (fake sensor → incident → notification), approval lifecycle, feedback submit → auto-process → admin response, tenant isolation
- **Pattern**: Vitest, mock tRPC context, direct caller invocation (following existing `auth.logout.test.ts` pattern)

---

## 14. Audit Events

New `AuditEventType` values:
- `guardian_sensor_check`, `guardian_incident_created`, `guardian_incident_resolved`
- `guardian_action_executed`, `guardian_action_failed`
- `guardian_approval_requested`, `guardian_approval_decided`
- `guardian_llm_analysis`
- `feedback_ticket_created`, `feedback_auto_classified`, `feedback_duplicate_detected`, `feedback_admin_responded`

---

## 15. Configuration

**Environment variables:**
- `VIRTUAL_ADMIN_ENABLED` (boolean, default true)
- `VIRTUAL_ADMIN_SLACK_WEBHOOK` (optional URL)

**Per-tenant feature flags (system_settings):**
- `VIRTUAL_ADMIN_NOTIFICATIONS` (default true)
- `VIRTUAL_ADMIN_AUTO_FIX` (default false — opt-in)
- `VIRTUAL_ADMIN_LLM_ANALYSIS` (default false)
- `VIRTUAL_ADMIN_CREDIT_SOFT_LIMIT` (default 100)
- `VIRTUAL_ADMIN_CREDIT_HARD_LIMIT` (default -50)

---

## 16. Edge Cases

- **Concurrent approval**: Optimistic locking, first writer wins, second gets CONFLICT error
- **Duplicate incidents**: Check before create, update existing if match
- **Server restart**: Resume from DB state, re-evaluate interrupted actions
- **Notification failure**: Retry 3× with backoff, fallback chain (Slack → Email → In-app)
- **LLM timeout**: Fallback to rule-based response only
- **Timezone**: All timestamps UTC, frontend converts to local
- **Multi-instance**: Single server currently; if needed: Redis distributed lock
