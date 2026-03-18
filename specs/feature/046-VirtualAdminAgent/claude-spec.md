# Spec 046 — Virtual Admin Agent (System Guardian): Synthesized Specification

## Overview

Build a **Virtual Admin Agent (System Guardian)** — an autonomous background system user that monitors SmartSpecPro 24/7, detects issues, auto-fixes low-risk problems, escalates high-risk issues to admins via approval gates, and provides a feedback intake system for all users (human and virtual).

## Key Decisions (from interview)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Admin interface | **Dedicated chat** | Admin chats directly with Guardian for status, commands, history |
| Auto-fix scope | **Per-tenant opt-in** | Safe rollout, each tenant enables when ready |
| Credit enforcement | **Soft limit (100) + hard limit (-50)** | Warning early, block at hard limit, buffer for in-flight |
| Ticket visibility | **Own tickets only** | Users see their own + admin responses |
| Approval TTL | **4h critical, 24h others** | CRITICAL re-alerts every 2h, others expire at 24h |
| Watchdog | **Internal timer + systemd** | Self-monitoring every 5min + OS-level safety net |
| MVP scope | **All in one phase (39h)** | Ship complete: Guardian + Feedback + Admin Chat |

## System Components

### 1. System User
- Reserved user `id: -1`, role: `system_agent`
- Cannot login via UI, JWT generated at server startup
- Zero credit cost for system operations
- All actions audit-logged as "System Guardian"

### 2. Sensors (11 types)
Polling-based health probes running on intervals (30s–86400s):
- `queue_health` — BullMQ + Redis queue depth, failed/stalled jobs
- `celery_health` — Worker alive, active tasks, queue lengths
- `api_latency` — P95 latency per endpoint, error rate
- `llm_provider` — Circuit breaker state per provider
- `credit_balance` — Per-tenant balance vs soft/hard limits
- `disk_storage` — S3 + local storage usage
- `db_health` — Connection pool, slow queries
- `cert_expiry` — SSL certificate days remaining
- `error_spike` — Anomaly detection from audit JSONL logs
- `media_pipeline` — Stuck Celery tasks, external API health
- `team_escalation` — Inter-agent escalation messages (Orchestrator integration)

### 3. Rule Engine (18 rules)
Deterministic threshold-based evaluation with cooldown:
- Each rule maps: sensor → condition → severity → action
- Cooldown prevents alert spam (default 15min)
- Severity levels: info, warning, error, critical
- Actions: notify, auto-fix (if tenant opted in), escalate (approval required)

### 4. Actuators (12 action types)
- **No approval needed (low risk):** notify_admin, notify_user, notify_slack, retry_failed_job, cleanup_temp_files, clear_stale_cache, failover_provider
- **Approval required (medium/high):** pause_queue, restart_celery_worker, disable_provider, kill_stuck_task, emergency_maintenance

### 5. Approval Gate
- Admin notification → review context → approve/reject
- Optimistic locking for concurrent approvals (first writer wins)
- TTL: 4h critical, 24h others; CRITICAL re-alerts every 2h

### 6. Dedicated Admin Chat
- System Guardian participates as a chat user in a dedicated conversation
- Admin can ask questions: "what's the current queue status?", "retry all failed jobs"
- Guardian responds with structured data + can execute actions via chat
- Uses existing chat infrastructure (conversations table + tRPC chat router)

### 7. Feedback Intake System
- **Sources:** Human users (UI button + chat intent), Virtual agents (API), System Guardian (auto-generated)
- **Auto-processing:** LLM classify → deduplicate → correlate with incidents → assign priority → route to admin
- **Tables:** feedback_tickets, feedback_ticket_comments, feedback_ticket_attachments
- **Workflow:** new → triaged → in_progress → resolved → closed

### 8. Admin Feedback Dashboard
- Tabbed view: All / Bugs / Features / Agent Reports / Resolved
- Ticket detail: status, priority, AI summary, linked incidents, admin actions
- Actions: reply, internal note, plan for dev, resolve, merge duplicate, won't fix
- Planning fields: planned_version, planning_doc_url, dev_branch

### 9. Notification Channels
- In-app (all severities), Email (warning+), Slack (error+), Telegram (critical)
- Fallback chain: Slack → Email → In-app
- Email digest: hourly for warnings, immediate for error+

### 10. Real-time Updates
- SSE via Redis pub/sub → Express endpoint
- Events: incidents, approvals, sensor status, feedback tickets
- Global critical alert banner in app header
- 30s heartbeat, 60min max connection

### 11. Self-Monitoring (Watchdog)
- Internal health check every 5min
- Detects: stuck sensors, runaway incidents, memory leaks, SSE connection leaks
- Self-recovery: restart loop, expire old incidents, force-close stale connections
- External `/health` endpoint for uptime monitoring
- systemd `Restart=on-failure` as safety net

## Database Tables (6 new)
1. `virtual_admin_incidents` — incident log with severity, status, metrics, action
2. `virtual_admin_approvals` — approval queue with status, TTL, decision
3. `virtual_admin_sensor_config` — per-tenant configurable thresholds
4. `feedback_tickets` — unified bug/feature/observation tickets
5. `feedback_ticket_comments` — comments with internal/public flag
6. `feedback_ticket_attachments` — file uploads (S3/R2)

## tRPC Endpoints (23+)
- **Guardian:** listIncidents, getIncident, acknowledgeIncident, resolveIncident, listPendingApprovals, decideApproval, getSensorStatus, updateSensorConfig, getDashboardStats, toggleGuardian
- **Feedback (user):** submit, myTickets, getTicket, addComment
- **Feedback (admin):** adminList, adminUpdate, adminRespond, adminMergeDuplicate, adminGetStats
- **Chat:** Use existing chat router with system user as participant

## Security
- System user: read-all, write only to own tables
- Actuators: whitelisted functions only, no shell execution
- Feedback: XSS prevention (sanitize-html), file upload validation, rate limiting, tenant isolation, RBAC
- LLM: sanitize all data, no secrets in prompts
- Approval: optimistic locking, signed tokens

## Performance
- Resource budget: CPU <50ms/cycle, Memory <100MB, DB <30 queries/cycle
- Degraded mode: if system overloaded → critical sensors only, no LLM
- Sensor stagger: not all at once, distributed across interval

## Effort: 39 hours total
Single phase, ship everything together.
