---
name: Virtual Admin Agent Infrastructure Research
description: Comprehensive analysis of existing monitoring, alerting, audit, and agency infrastructure to inform Virtual Admin Agent design
type: project
---

# Virtual Admin Agent: Infrastructure Research Brief

## Findings

### What Exists Today

SmartSpecPro has **mature, partially-integrated monitoring and audit infrastructure** that can be leveraged for a Virtual Admin Agent, but **no existing automation** triggers admin-level actions automatically. Key systems:

1. **Queue Health Monitor** (real-time)
   - Runs every 60 seconds across 7 Celery queues (celery, media, video, presentation_export, presentation_import, sandbox, vision)
   - Detects: queue backlog, sudden spikes, consecutive growth, dead workers
   - Thresholds: CRITICAL at >1000 items, WARNING at queue.maxExpected
   - **Output**: In-memory state + JSONL audit logs (eventType: `queue_health_alert`)
   - **Limitation**: Only monitors queues; doesn't trigger actions

2. **Service Status Dashboard** (on-demand)
   - Monitors 11 services (PostgreSQL, Redis, web app, Python backend, Celery workers, Flower, Nginx, Docker, Cloudflare)
   - Supports 3 service types: Docker, host process, systemd
   - Reports: status, uptime, CPU/memory, health checks, restarts
   - Can START/STOP/RESTART Docker and systemd services (but not host processes)
   - **Limitation**: Read-only for host processes; no scheduled checks or notifications

3. **Audit Logging System** (comprehensive)
   - JSONL daily audit logs: `apps/web/logs/audit/audit-YYYY-MM-DD.jsonl`
   - Structured events: llm_request/response, media_request/response, skill_detect, skill_execute, queue_health_alert, agency_* events, error
   - Fields: traceId, userId, timing, tokens, costs, errorMessage, statusCode
   - Database tables: `providerUsageLog`, `apiAuditEvents`, `creditTransactions`, `workflowAuditEvents`
   - **Limitation**: Passive logging; no active thresholds or alerting

4. **Rate Limiter Dashboard** (real-time)
   - Per-provider concurrency tracking (e.g., kie.ai: 50 concurrent max, 20 per 10s)
   - In-memory stats + Redis-backed Bottleneck instances
   - Tracks: running, queued, done, failed, avgWaitTime
   - **Limitation**: No alerts on queue depth or provider slowdowns

5. **Scheduler Service** (background jobs)
   - Cloud Tasks-based scheduler with fallback sweep (deliverScheduledMessage)
   - Supports: simple reminders, custom skills, auto-draft presentations, LLM alerts
   - Can execute skills, send notifications, deduct credits
   - Email notifications via Nodemailer (SMTP-configured)
   - **Limitation**: Only user-initiated schedules; no system-level automation

### Current Notification Channels

1. **Email** (configured, working)
   - SMTP settings stored in `systemSettings` table (category: "email")
   - Uses Nodemailer; supports TLS/SSL
   - Used by: scheduler for alert emails, user notifications
   - **Status**: Optional (skipped if SMTP not configured)

2. **In-App Notifications** (database-backed)
   - Table: `userNotifications` (userId, type, title, content, priority, isRead)
   - Types: scheduled_message, follow_request, alert, system, direct_message, urgent_message
   - Used by: scheduler, Telegram service
   - **Status**: Core infrastructure, always available

3. **Telegram** (available)
   - Channel adapter with webhook validation (HMAC-SHA256 + replay protection)
   - Slack adapter also exists (Block Kit formatting, rate-limited 1 req/sec)
   - Optional delivery via `enqueueTelegramNotification`
   - **Status**: Optional; requires user Telegram account linking

4. **Slack** (available but basic)
   - Slack adapter in `channelAdapters/slack.ts`
   - Can send messages via Slack Web API (chat.postMessage)
   - Block Kit formatting with 3000-char block limit
   - **Status**: Available but not integrated into admin notifications

### Agency System Reusability

The **Agency system can be used to execute complex admin operations**:

1. **AgencyBridge** (Node.js to Python communication)
   - Executes agencies in Python backend via `/api/v1/agencies/run`
   - Returns: status, response, creditsUsed, durationMs, structuredResult, previewArtifacts
   - Supports multi-agent workflows, file uploads, per-run instruction overrides
   - Timeout: 2 minutes for multi-agent runs
   - **Use case**: Could run "diagnostic agent" to gather system metrics

2. **Agency Execution Modes**
   - Node agent (router, aggregator, knowledge_base, skill_call, human_approval)
   - Python agent (LLM orchestration via LangGraph)
   - Tool execution (Slack message, browser script, API call, Python code sandbox)
   - **Use case**: Chain tools to auto-fix issues (e.g., restart worker → check queue → notify)

3. **Agency Skill Integration**
   - Skills can be called from agency via `skill_call` node
   - Skill execution creates: notification, conversation message, cost tracking
   - Supports parameters, error handling, credit deduction
   - **Use case**: Admin could trigger skill-based diagnostic or remediation

### What's Missing (Gaps)

| Gap | Impact | Severity |
|-----|--------|----------|
| No threshold-triggered actions | Health alerts logged but no automatic remediation | HIGH |
| No centralized alerting policy | Admin must manually check each dashboard | HIGH |
| No built-in escalation logic | If queue backs up, no automatic worker restart | MEDIUM |
| No cross-team notifications | Alerts only go to in-app notifications, not Slack/email | MEDIUM |
| No proactive monitoring of Python tasks | Celery beat tasks scheduled but no health check | MEDIUM |
| No automated credit management | Budget alerts exist (alert_threshold_pct in creditBudget table) but no auto-pause | MEDIUM |
| No audit-driven decision making | Audit logs exist but not analyzed for patterns | LOW |

---

## Current Architecture

### System Health Monitoring

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  QueueHealthMonitor (every 60s)                             │
│  ├─ Reads: Redis queue lengths (7 queues)                  │
│  ├─ Detects: backlog, spikes, dead consumers                │
│  └─ Logs: audit JSONL + console                             │
│                                                              │
│  ServicesRouter (on-demand, admin API)                      │
│  ├─ Reads: Docker, systemd, host processes                 │
│  ├─ Reports: status, uptime, CPU/memory/health             │
│  └─ Actions: start/stop/restart (Docker + systemd only)   │
│                                                              │
│  QueuesRouter (on-demand, admin API)                        │
│  ├─ Reads: Limiter stats, queue history, Cloud Tasks      │
│  ├─ Reports: concurrency, model usage, failed jobs         │
│  └─ Actions: reset limiters, clear waiting jobs            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
              ↓
        ┌─────────────┐
        │ JSONL Logs  │
        │ (audit/)    │
        └─────────────┘
              ↓
      ┌──────────────────┐
      │ Admin Dashboard  │
      │ (read-only view) │
      └──────────────────┘
```

### Notification Delivery

```
┌─────────────────────────────────────────┐
│         Notification Sources            │
├─────────────────────────────────────────┤
│ • Scheduler (time-triggered)            │
│ • System alert (threshold-triggered)    │
│ • Audit event (logged manually)         │
└──────────────────┬──────────────────────┘
                   ↓
      ┌────────────────────────┐
      │ createNotification()    │
      │ (notificationService)  │
      └────────┬───────────────┘
               ↓
    ┌──────────────────────────┐
    │ userNotifications table  │
    │ (in-app storage)         │
    └────┬──────────┬──────────┘
         ↓          ↓
    ┌────────┐  ┌──────────────┐
    │ Telegram│  │ Email (if    │
    │ (opt)   │  │ configured)  │
    └────────┘  └──────────────┘
         ↑              ↑
      Optional        Optional
     via Enqueue    via Scheduler
```

### Agency System Architecture

```
┌──────────────────────────────────────┐
│    Admin Request                     │
│    (e.g., "fix queue backlog")       │
└─────────────┬────────────────────────┘
              ↓
     ┌────────────────────────┐
     │  AgencyBridge          │
     │  (Node.js client)      │
     └────────┬───────────────┘
              ↓
     ┌────────────────────────────────────┐
     │  Python Agency Service             │
     │  /api/v1/agencies/run              │
     │                                    │
     │  ├─ Entry agent (router, skill)    │
     │  ├─ Multi-agent workflow (LLM)     │
     │  └─ Tool execution (service calls) │
     └────────┬──────────────────────────┘
              ↓
    ┌─────────────────────────────────┐
    │ Skill Execution                 │
    │ • Script execution              │
    │ • API calls (Slack, etc)        │
    │ • Database queries              │
    │ • Service restart (systemd)     │
    └─────────────────────────────────┘
```

### Database Tables (Key for Admin Agent)

| Table | Purpose | Relevant Fields |
|-------|---------|-----------------|
| `queueHealthMonitor` | State | (in-memory, not persisted) |
| `providerUsageLog` | Cost tracking | traceId, modelUsed, costUsd, creditsCharged, errorMessage |
| `apiAuditEvents` | Structured events | traceId, eventType, userId, metadata |
| `creditTransactions` | Billing | userId, amount, sourceType, description, metadata |
| `systemSettings` | Config | category, key, value, isSensitive |
| `userNotifications` | Alerts | userId, type, title, content, priority, isRead |
| `cloudTasksMetrics` | Task tracking | queueName, taskCount, failedCount, status |
| `creditBudget` | Budget tracking | userId, creditsUsedThisMonth, alertThresholdPct, alertSent, hardCapReached |
| `scheduledMessages` | Automation | userId, prompt, modelId, skillId, status, cronExpression |

---

## Risks for Virtual Admin Agent

### 1. **No Human Approval Gate**
- **Risk**: Agent could auto-restart critical services without manual review
- **Mitigation**: Implement approval workflows before destructive actions; use `human_approval` agency node
- **Example**: "Restart worker" → approve in Slack → execute

### 2. **Cascading Failures**
- **Risk**: Agent detects issue, attempts fix, but fix cascades failure to other services
- **Mitigation**: Rollback capability; dry-run mode; gradual rollout (restart 1 worker, check, then restart others)
- **Example**: Restart all workers at once → brief service interruption

### 3. **Cost Spiral**
- **Risk**: Agent diagnoses issue via expensive LLM calls; billing grows while debugging
- **Mitigation**: Use fast, cheap models for diagnosis; set credit limits on agent tasks
- **Example**: Use GPT-4o-mini for diagnostics, Claude-3.5-sonnet only for complex decisions

### 4. **Audit Trail Loss**
- **Risk**: Agent makes changes but logs are unclear about root cause or decision rationale
- **Mitigation**: Every action logged with full context; use traceId linking
- **Example**: "Worker restarted by admin-agent v2, reason: queue backlog >500" (structured log)

### 5. **False Positives**
- **Risk**: Threshold detector triggers alert when system is actually fine
- **Mitigation**: Multi-signal confirmation; hysteresis on thresholds
- **Example**: "Queue >100 for 3 consecutive checks AND producer unchanged" → alert

---

## Options for Virtual Admin Agent Design

### Option A: Reactive Agent (Passive Polling)
**Concept**: Agent polls health every 60s, analyzes audit logs, takes action on predefined rules.

**Pros**:
- Simple integration with existing scheduler
- Reuses existing monitoring data
- Low latency for diagnostics (all data in-process)

**Cons**:
- Polling overhead
- Reactive only (doesn't predict issues)
- Threshold tuning per environment

**Implementation**:
```
Every 60s:
  1. Read queueHealthStatus() + serviceStatus()
  2. Query audit logs (last 10 minutes)
  3. Run decision rules (IF queue > threshold AND latency > threshold, THEN escalate)
  4. Create notification or spawn agency workflow
```

---

### Option B: Event-Driven Agent (Audit Log Watcher)
**Concept**: Agent subscribes to audit events, reacts immediately when error/warning pattern detected.

**Pros**:
- Real-time response (no polling delay)
- Natural integration with audit system
- Event deduplication built-in

**Cons**:
- Requires event stream (currently JSONL files)
- More complex logic (need state tracking for multi-event patterns)
- May trigger on false alarms more easily

**Implementation**:
```
On new audit event:
  1. Check event type (error, queue_health_alert, llm_response timeout)
  2. Correlate with recent events (sliding window)
  3. IF pattern matches known issue, escalate
  4. Else buffer for 30s (deduplicate burst alerts)
```

---

### Option C: Agency-Based Agent (Multi-Tool Orchestration)
**Concept**: Virtual Admin Agent is an agency with router → diagnostic skills → remediation tools.

**Pros**:
- Reuses agency infrastructure (approval nodes, skill integration, structured results)
- Can compose multiple tools (check logs → diagnose → remediate → notify)
- Native support for LLM-driven decisions

**Cons**:
- Higher latency (LLM calls per decision)
- Costs credits (even for internal operations)
- Overkill for simple threshold checks

**Implementation**:
```
┌──────────────────┐
│ Router Agent     │
│ (entry point)    │
└────────┬─────────┘
         ↓
    ┌──────────────────────────────┐
    │ Diagnostic Skill             │
    │ - Get queue lengths          │
    │ - Get service status         │
    │ - Check recent errors        │
    └────────┬─────────────────────┘
             ↓
    ┌──────────────────────────────┐
    │ LLM Decision Node            │
    │ "Should we restart workers?"  │
    └────────┬──────┬──────────────┘
             ↓      ↓
        [Yes]     [No]
             ↓      ↓
    ┌──────────────────┐    ┌─────────────┐
    │ Remediation      │    │ Log only    │
    │ (restart worker) │    │ (no action) │
    └────────┬─────────┘    └─────────────┘
             ↓
    ┌──────────────────────────────┐
    │ Notification Tool            │
    │ (Slack, Email, In-app)       │
    └──────────────────────────────┘
```

---

## Recommendation

**Hybrid Approach: Option A + Option C (Reactive + Agency)**

1. **Core**: Implement Option A (reactive polling every 60s)
   - Low cost, simple to understand
   - Covers 80% of common issues (queue backlog, worker restart, rate limiter reset)
   - Reuses existing scheduler infrastructure
   - **Threshold rules** (in code):
     - Queue backlog: IF queue > 100 items AND consecutiveGrowth ≥ 3, escalate
     - Service down: IF service.status == 'stopped' AND not in maintenance window, escalate
     - High error rate: IF errorRate > 5% in last 10 min, escalate
     - Budget: IF creditsUsed > alertThresholdPct, escalate

2. **Complex Decisions**: Use Agency for approval + remediation
   - Only spawn agency for decisions requiring judgment (e.g., "should we clear waiting jobs?")
   - Agency nodes: Slack approval → execute → notify
   - Estimated cost: $0.01 per diagnostic decision (GPT-4o-mini)

3. **Deliverables**:
   - New service: `adminAgentService.ts` (polling + rule engine)
   - New tRPC admin procedure: `admin.getAgentStatus()` (see latest decisions)
   - New agency template: "system-diagnostics" (for complex escalations)
   - New scheduler job: `check-system-health` (every 60s)
   - Documentation: decision rules + threshold justification

4. **Success Criteria**:
   - ✓ Detect and log queue backlog within 90 seconds (up to 3 consecutive polls)
   - ✓ Offer action (restart worker, reset limiter) with 1-click approval in Slack
   - ✓ Execute approved action within 5 seconds
   - ✓ Track all decisions in audit log with traceId + reasoning
   - ✓ No cost overhead (use scheduler, skip LLM for simple rules)

---

## Open Questions

1. **Approval Workflow**: Should all actions require manual approval, or only destructive ones (restarts, clears)?
   - **Suggestion**: Auto-execute: limiter reset, restart single worker; Require approval: restart all workers, clear all queues

2. **Escalation Scope**: Which issues warrant admin agent response vs. user notification?
   - **Suggestion**: Queue backlog (admin), high cost per request (user), service down (admin + user)

3. **Access Control**: Can admin agent execute systemd/Docker actions, or only query?
   - **Suggestion**: Can restart workers (media/video/sandbox), cannot touch infrastructure (postgres, redis, nginx)

4. **Tenant Isolation**: Should admin agent monitor system-wide or per-tenant?
   - **Suggestion**: System-wide queues, but credit alerts per-tenant

5. **Notification Frequency**: How to avoid alert fatigue?
   - **Suggestion**: Deduplicate repeated alerts (same issue within 15 min = 1 notification only)

---

## Files to Create / Modify

### New Files (Core Implementation)
- `/apps/web/server/services/adminAgentService.ts` — Polling, rule engine, escalation
- `/apps/web/server/routers/adminAgent.ts` — tRPC endpoints (getStatus, getDashboard, approveAction)
- `/apps/web/client/src/pages/AdminAgentDashboard.tsx` — UI for decisions, approvals, history
- `/python-backend/app/templates/system-diagnostics.yaml` — Agency template for diagnostics

### Existing Files to Extend
- `/apps/web/server/services/scheduler.ts` — Add `check-system-health` beat task
- `/apps/web/drizzle/schema.ts` — Add `adminAgentDecisions` table (traceId, decision, result, approverUserId)
- `/apps/web/server/routers/queues.ts` — Expose `queueHealthStatus` via tRPC for agent use
- `/apps/web/server/routers/services.ts` — Reuse for service status checks

### Optional Enhancement Files
- `/apps/web/server/services/alertingPolicyService.ts` — YAML-based rule configuration
- `/apps/web/client/src/components/admin/AdminAgentDecisionList.tsx` — Reusable decision history UI

---

## Implementation Estimate

| Phase | Task | Effort | Priority |
|-------|------|--------|----------|
| 1 | Create adminAgentService (polling + rules) | 4h | P0 |
| 2 | Add tRPC router + database table | 2h | P0 |
| 3 | Build admin dashboard UI | 4h | P1 |
| 4 | Agency template + approval workflow | 3h | P1 |
| 5 | Testing + threshold tuning | 2h | P2 |
| **Total** | | **15h** | |

