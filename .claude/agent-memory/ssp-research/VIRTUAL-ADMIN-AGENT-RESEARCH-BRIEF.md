---
name: Virtual Admin Agent Research Brief
description: Executive summary of monitoring/alerting/audit systems for Virtual Admin Agent design
type: project
---

# Virtual Admin Agent — Research Brief

## Findings

### 1. Monitoring Infrastructure Exists but Is Not Integrated

SmartSpecPro has **mature, separate monitoring systems** that collect data but do **not trigger automated actions**:

| System | What It Monitors | How Often | Where Data Goes | Can It Act? |
|--------|------------------|-----------|-----------------|-----------|
| **QueueHealthMonitor** | Celery queue lengths, backlog, spikes, dead workers | Every 60s | JSONL audit log + in-memory state | No |
| **ServicesRouter** | Docker/systemd/host process status, CPU, memory, health | On-demand (admin API) | HTTP response only | Yes (Docker/systemd only) |
| **QueuesRouter** | Rate limiter concurrency, queue history, failed jobs | On-demand (admin API) | HTTP response only | Partial (reset limiter) |
| **AuditLogger** | All LLM requests, media requests, skills, errors | Real-time | JSONL daily files + DB tables | No |
| **Scheduler** | Time-based user alerts (reminders, skills) | User-configured | Notifications + email | Yes (user jobs only) |

**Key insight**: Monitoring is **read-only except for scheduler**. No system watches metrics and **automatically escalates** (e.g., "queue > 100 for 3 minutes → restart worker").

---

### 2. Audit Trail Is Rich but Passive

**Three linked sources** capture operational events:

1. **JSONL Audit Logs** (`apps/web/logs/audit/audit-YYYY-MM-DD.jsonl`)
   - Event types: `llm_request`, `llm_response`, `media_request`, `queue_health_alert`, `skill_execute`, `error`, etc. (50+ types)
   - Includes: traceId, userId, timing (queueWaitMs, networkMs), tokens, costs, errorMessage, statusCode
   - **File-based** (no DB query interface for real-time analysis)

2. **Database Tables** (structured, queryable)
   - `providerUsageLog`: Per-request tracking (model, cost, error reason, timestamp)
   - `apiAuditEvents`: Media/skill/LLM structured events with eventType and metadata
   - `creditTransactions`: All credit movements (source, amount, description)
   - `workflowAuditEvents`: Workflow execution audit trail
   - **All linked via traceId** for end-to-end cost/error correlation

3. **In-Memory State**
   - `QueueHealthMonitor` tracks: queue lengths, consecutiveGrowth counter, activeAlerts array
   - Data lost on server restart
   - Available via tRPC `queues.getQueueHealth()` endpoint

**Key insight**: Excellent for **post-mortem analysis** but requires **manual queries or dashboards** to detect patterns. No built-in pattern detection.

---

### 3. Notification System Is Flexible but Disconnected

**4 channels available**, none currently receiving system alerts:

| Channel | Transport | Config | Status | Integration |
|---------|-----------|--------|--------|-------------|
| **In-App Notifications** | Database + UI | None (always ready) | ✓ Core | `createNotification()` |
| **Email (SMTP)** | Nodemailer | `systemSettings.category=email` | ✓ Optional | Scheduler only |
| **Telegram** | Webhook | User must link account | ✓ Optional | Scheduler + manual `enqueueTelegramNotification()` |
| **Slack** | Web API + webhook | Manual setup | ✓ Available | Channel adapters exist; not wired to alerts |

**Key insight**: Slack is available but **not integrated into admin alerts**. Currently only used for user messages via channel gateway.

---

### 4. Agency System Can Execute Complex Remediation

The **existing agency infrastructure** (used for multi-agent workflows) can be repurposed for admin automation:

**AgencyBridge** (`apps/web/server/services/agencyBridge.ts`):
- Calls Python `/api/v1/agencies/run` endpoint
- Supports: multi-agent workflows, skill execution, tool calling, structured results
- Timeout: 2 minutes
- **Cost**: Credits charged for LLM calls within agency

**Available Agency Tools** (reusable for admin):
- `skill_call` node: Can execute any skill (e.g., diagnostic skill)
- Slack message tool: Send approvals/alerts to Slack
- Python sandbox: Execute custom code (restart worker, query DB, etc.)
- Knowledge base node: Query system state (logs, metrics, config)

**Example workflow**:
```
Trigger: Queue backlog detected by monitor
  1. Spawn "system-diagnostics" agency
  2. Diagnostic agent: fetch queue metrics, recent errors, worker health
  3. Router: decide action (restart worker? reset limiter? escalate to human?)
  4. Slack message: "Queue backlog detected. Should I restart 1 worker? [Approve] [Decline]"
  5. Human approval via Slack reaction
  6. Execute: restart worker, log decision, notify user
```

**Key insight**: Agency infrastructure is **overkill for simple threshold checks** but excellent for **decisions requiring judgment** or **approval workflows**.

---

### 5. Gaps in Automation

| Gap | Current Behavior | Impact | Workaround |
|-----|------------------|--------|-----------|
| **No threshold-triggered actions** | Queue backlog logged; admin manually views dashboard | 30-60 min response time | Virtual admin agent |
| **No escalation logic** | Service down → only affects new requests | Users see "service unavailable" | Pre-emptive restart monitoring |
| **No cross-team notifications** | Alerts in-app only; Slack/email require manual setup | Engineering team misses issues | Configure notification policy |
| **No budget enforcement** | Budget alerts logged; spend continues | User account can go negative | Auto-pause workflows at threshold |
| **No worker health check** | Worker failure detected only when task fails | Cascading failures | Periodic worker ping |
| **No pattern detection** | Audit logs exist; no anomaly detection | Can't predict issues | Rule-based escalation first |

---

## Current Architecture

### Data Flow

```
Real-Time Monitoring:
┌────────────────────┐
│ Celery Queues      │
│ Services (Docker)  │
└─────────┬──────────┘
          │ Every 60s / On-demand
          ↓
    ┌─────────────────────────┐
    │ QueueHealthMonitor      │
    │ ServicesRouter (REST)   │
    │ QueuesRouter (tRPC)     │
    └─────────┬───────────────┘
              ├─ JSONL audit log
              ├─ In-memory state
              └─ HTTP response (admin API)
                        │
                        ↓
                ┌───────────────────┐
                │ Admin Dashboard   │
                │ (read-only view)  │
                └───────────────────┘
```

### Notification Delivery

```
Event Source:
  ├─ Scheduler (time-based)
  ├─ System threshold (queue > threshold)
  └─ User action (manual trigger)
          │
          ↓
    ┌──────────────────┐
    │ createNotification()  │
    └─────────┬────────────┘
              │
    ┌─────────┴────────────────────┐
    │                              │
    ↓                              ↓
User Notifications Table      Telegram Service
    │                              │
    └──────────┬────────────────────┘
               │
          [User sees notification]
          [Telegram message sent (optional)]
          [Email sent if SMTP configured]
```

### Audit Trail

```
All Requests/Responses:
  │
  ├─ traceId (unique identifier)
  │
  ├─ JSONL Log Entry
  │   ├─ eventType (llm_request, media_response, error, etc.)
  │   ├─ timing (queueWaitMs, networkMs, totalMs)
  │   ├─ costs (costUsd, creditsCharged)
  │   └─ error details (if failed)
  │
  └─ Database Records (linked via traceId)
      ├─ providerUsageLog (model used, cost calculation method, error message)
      ├─ apiAuditEvents (structured event with metadata)
      ├─ creditTransactions (debit/refund, source type)
      └─ workflowAuditEvents (who did what, when)
```

---

## Risks

### Risk 1: No Approval Gate for Destructive Actions
**Impact**: Agent restarts all workers → brief service outage → users affected

**Mitigation**:
- Require Slack approval for actions affecting users (restart workers, clear queues)
- Auto-execute safe actions (reset rate limiter, purge old logs)
- Dry-run mode: show what would happen without executing

---

### Risk 2: Cascading Failures
**Impact**: Agent detects queue backlog, restarts worker, worker OOMs → more backlog

**Mitigation**:
- Gradual rollout: restart 1 worker, wait 30s, check queue depth, then restart more
- Monitor for repeated failures (if same worker fails 3x, escalate to human)
- Rollback capability: can restore previous state from backup

---

### Risk 3: Cost Spiral During Diagnosis
**Impact**: Agent uses expensive LLM to diagnose issue; billing grows while fixing

**Mitigation**:
- Use fast, cheap models for diagnostics (GPT-4o-mini ~$0.15/MTok input)
- Cache diagnostic results (if same issue detected <5 min ago, reuse diagnosis)
- Set per-agent credit limits (max $5/day for internal operations)

---

### Risk 4: Alert Fatigue
**Impact**: Same alert fires every 60s → admin ignores it → real issue missed

**Mitigation**:
- Deduplicate: if alert fired <15 min ago, don't fire again (unless severity increased)
- Escalate only once per window (queue backlog alert fires at 100 items, then not again until queue clears and rises again)
- Use priority levels: "low" → in-app only, "critical" → Slack + email + page oncall

---

### Risk 5: Audit Trail Loss
**Impact**: Agent makes change but reason/context unclear in logs

**Mitigation**:
- Every action logged with: agent version, decision rules used, metrics that triggered decision, traceId, approverUserId
- Use structured logging (not free-form strings)
- Link all related events via traceId

---

## Options

### Option A: Reactive Polling Agent (Recommended ✓)

**Concept**: Agent polls health every 60s, evaluates predefined rules, takes action on escalations.

**Architecture**:
```
Every 60 seconds:
  1. Read QueueHealthStatus
  2. Read ServiceStatus
  3. Check budget (creditBudget.creditsUsedThisMonth)
  4. Evaluate decision rules:
     IF queue.length > 100 AND consecutiveGrowth ≥ 3
       → log alert, spawn agency workflow (requires approval)
     IF service.status == 'stopped' AND not in maintenance window
       → create urgent notification (high priority)
     IF errorRate > 5% in last 10 minutes
       → escalate to human review
  5. Create notification or spawn agency
```

**Pros**:
- Low latency (no LLM calls for every check)
- Simple decision logic (if/then rules)
- Reuses existing scheduler + tRPC infrastructure
- Easy to understand and debug
- Low cost (no credits consumed)

**Cons**:
- Polling overhead
- Requires manual threshold tuning
- Cannot adapt to new issue types (requires code change)
- Reactive only (doesn't predict)

**Cost**: $0

**Effort**: ~6 hours (service + router + rules)

---

### Option B: Event-Driven Agent (Complex)

**Concept**: Agent subscribes to audit event stream, patterns trigger escalation.

**Architecture**:
```
On audit event received:
  1. Check event type (error, latency_spike, queue_backlog)
  2. Correlate with recent events (last 5 minutes):
     IF 3+ errors from same provider in 30s
       → provider is degraded, escalate
     IF queue-backlog-alert event repeats within 60s
       → queue not recovering, escalate
  3. Deduplicate (if already escalated, buffer next alert for 15 min)
  4. Spawn agency or create notification
```

**Pros**:
- Real-time reaction (no 60s delay)
- Natural integration with audit system
- Can detect bursts immediately

**Cons**:
- Requires event streaming (currently JSONL files, not a stream)
- State tracking complexity (need in-memory dedup window)
- Higher false positive rate
- More moving parts to debug

**Cost**: $0

**Effort**: ~8 hours (event stream plumbing + pattern matching)

---

### Option C: Agency-Based Agent (Overkill for Simple Checks)

**Concept**: Multi-agent workflow with LLM-driven decisions and approval gates.

**Architecture**:
```
┌──────────────────┐
│ Router Agent     │ ← Entry point
└────────┬─────────┘
         ↓
  ┌────────────────────────┐
  │ Diagnostic Agent       │
  │ (LLM-powered)          │ ← Analyzes system state
  │ - Run diagnostic skill  │
  │ - Query audit logs     │
  │ - Fetch metrics        │
  └────────┬───────────────┘
           ↓
  ┌────────────────────────┐
  │ Decision Node          │
  │ (LLM:                  │ ← Asks "what should we do?"
  │  "Based on metrics,    │
  │   should we restart    │
  │   workers?")           │
  └────────┬───────────────┘
           ├─→ Yes → Remediation Agent
           └─→ No  → Just log alert
```

**Pros**:
- Reuses agency infrastructure
- Can handle novel situations (LLM adapts)
- Built-in approval workflow (Slack integration)
- Structured, traceable decisions

**Cons**:
- High latency (~5-30 seconds per decision)
- Costs credits (even internal operations)
- Overkill for simple threshold checks
- Dependency on LLM availability
- Hallucination risk ("restart all systems immediately!")

**Cost**: ~$0.01 per complex decision (GPT-4o-mini)

**Effort**: ~4 hours (template + agency setup)

---

## Recommendation

### **Hybrid Approach: Option A (Core) + Option C (For Approvals)**

**Why hybrid?**
- Option A handles 80% of common issues (queue backlog, service restart)
- Option C handles 20% of complex decisions (should we clear waiting jobs? adjust rate limits?)
- Together they provide: fast response + intelligent escalation + human approval

### **Implementation**

#### **Core (Option A): Reactive Polling Agent**

**New service**: `apps/web/server/services/adminAgentService.ts`

```typescript
// Runs every 60 seconds
async function tickAdminAgent() {
  const queueHealth = getQueueHealthStatus();
  const services = await getAllServiceStatus();
  const budget = await getBudgetStatus();

  // Rule 1: Queue backlog
  if (queueHealth.activeAlerts.some(a => a.type === 'backlog' && a.severity === 'critical')) {
    await escalateQueueBacklog(queueHealth);
  }

  // Rule 2: Service down
  if (services.some(s => s.status === 'stopped' && !isMaintenanceWindow(s.id))) {
    await escalateServiceDown(services);
  }

  // Rule 3: Budget threshold
  if (budget.alertThresholdReached) {
    await escalateBudgetAlert(budget);
  }
}

// Escalation options:
async function escalateQueueBacklog(health) {
  // Option A: Auto-execute safe fix (reset limiter)
  if (health.queues[0].name === 'media' && limiterCanBeReset()) {
    await resetLimiter('kie.ai');
    await createNotification('Limiter reset due to queue backlog');
  }

  // Option B: Require approval for risky fix (restart worker)
  if (health.queues[0].length > 500) {
    await spawnApprovalWorkflow({
      action: 'restart-worker',
      queue: health.queues[0].name,
      reason: 'Critical queue backlog (500+ items, 3 consecutive increases)',
    });
  }
}
```

**Threshold rules** (configurable per environment):
- Queue backlog: `length > 100 AND consecutiveGrowth ≥ 3` → escalate
- Queue critical: `length > 1000` → auto-restart worker (1 at a time)
- Service down: `status === 'stopped' AND !maintenance_window` → escalate
- Error rate: `errors > 5% in last 10 min` → escalate to human review
- Budget: `creditsUsed > alertThresholdPct` → warn user, don't auto-pause

**New tRPC endpoints**:
- `admin.getAdminAgentStatus()` → latest decision + active alerts
- `admin.getAdminAgentHistory(limit)` → last N decisions with reasoning
- `admin.approveAdminAction(decisionId)` → human approval for escalation

**New database table**: `adminAgentDecisions`
```sql
id, traceId, decision (enum: queue_backlog, service_down, budget_alert, etc.),
status (proposed, approved, executed, declined),
metrics (queue_length, service_name, error_rate, etc.),
approverUserId, executedAt, result (success, failed, error)
```

---

#### **Complex Decisions (Option C): Agency for Approvals**

**New agency template**: `/apps/web/skills/system-diagnostics/agency.yaml`

```yaml
version: "1.0"
name: "system-diagnostics"
description: "Diagnose system issues and recommend actions"

agents:
  - id: "diagnostician"
    type: "agent"
    role: "Analyze system metrics and recommend actions"
    instructions: |
      You are the SmartSpecPro system diagnostician.

      Based on the provided metrics:
      1. Identify the primary issue
      2. List 2-3 remediation options (ranked by risk)
      3. Recommend the safest option that addresses the issue
      4. Explain why in brief terms

      Always consider:
      - Service availability (never recommend actions affecting users unless critical)
      - Cost implications (prefer cheap fixes like limiter reset over restarts)
      - User impact (restarts cause brief delays; warn about this)

      Format response as:
      Issue: [title]
      Options: [list with risk levels]
      Recommendation: [safest option]
      Reasoning: [why this is best]
      Risk Level: [low/medium/high]

    tools:
      - type: "skill_call"
        skill: "get-system-metrics"
        description: "Fetch current queue lengths, service status, error rates"

routers:
  - id: "approval_router"
    type: "router"
    description: "Route high-risk decisions to human approval"
    routes:
      - condition: "risk_level == 'high'"
        target: "slack_approval"
      - condition: "risk_level == 'low' OR 'medium'"
        target: "auto_execute"

nodes:
  slack_approval:
    type: "human_approval"
    description: "Send recommendation to Slack for approval"
    channels: ["slack"]
    timeout_minutes: 5

  auto_execute:
    type: "skill_call"
    skill: "execute-remediation"
    inputs: ["recommendation"]
```

**Flow**:
1. Alert detected by polling agent → spawn system-diagnostics agency
2. Diagnostician agent fetches metrics, analyzes, recommends action
3. Router checks risk level:
   - Low (reset limiter): auto-execute
   - High (restart workers): send Slack approval message
4. Human approves/declines in Slack
5. If approved, execute remediation skill (restart worker, etc.)
6. Log decision with full context (traceId linking to audit logs)

---

#### **Notification Integration**

Update existing channels:

**For urgent alerts** (service down, budget exceeded):
- In-app: Create notification with priority=`critical`
- Slack: Post to #smartspec-alerts channel (new)
- Email: Send to admins (if SMTP configured)

**For routine alerts** (queue backlog, high latency):
- In-app: Create notification with priority=`normal`
- Slack: Post to thread in #smartspec-alerts (deduplicate within 15 min)
- Email: Skip (too noisy)

---

## Success Criteria

- ✓ Detect queue backlog within 90 seconds (up to 3 polling cycles)
- ✓ Alert admin in-app + Slack within 2 minutes
- ✓ Offer action with 1-click approval in Slack
- ✓ Execute approved action within 5 seconds
- ✓ All decisions logged with: reason, metrics, approverUserId, result, traceId
- ✓ No false positives: hysteresis on thresholds (must be true for 2+ consecutive checks)
- ✓ No cost overhead: polling uses no credits; agency diagnostics <$0.01 each
- ✓ Human in the loop: destructive actions require approval

---

## Open Questions Requiring Product Input

1. **Approval Scope**: Which actions should auto-execute vs. require approval?
   - Proposed: Auto-execute: reset rate limiter, purge old logs, scale down workers (preserve user safety). Require approval: restart all workers, clear all queues.

2. **Escalation Targets**: Who receives alerts and via what channel?
   - Proposed: In-app + Slack for engineering team; email for on-call rotation; SMS for critical (service down).

3. **Budget Enforcement**: Should agent auto-pause workflows when budget threshold reached?
   - Proposed: No (would break user experience). Instead: (1) warn user, (2) notify admin, (3) set hard cap at 110% (refuse new jobs).

4. **Maintenance Windows**: Should agent skip automated actions during deployments?
   - Proposed: Yes. Add `systemSettings` entry: "maintenance_window_start" and "duration_hours". Agent skips actions during window.

5. **Alert Deduplication**: If same alert fires every 60s, when do we notify again?
   - Proposed: First alert = immediate notification. Repeat alert <15 min = silence. Repeat alert >15 min = new notification (issue may have worsened).

---

## Implementation Plan

| Phase | Task | Effort | Owner | Start |
|-------|------|--------|-------|-------|
| **1: Core** | adminAgentService.ts (polling + rules) | 4h | Backend | Week 1 |
| **1: Core** | tRPC router + DB table | 2h | Backend | Week 1 |
| **1: Core** | Integrate with scheduler (every 60s) | 1h | Backend | Week 1 |
| **2: UI** | Admin dashboard for alerts/history | 4h | Frontend | Week 2 |
| **2: UI** | Slack channel + approval workflow | 2h | DevOps | Week 2 |
| **3: Agency** | system-diagnostics template | 3h | Backend | Week 3 |
| **3: Agency** | Approval workflow integration | 2h | Backend | Week 3 |
| **4: Testing** | Unit tests + threshold tuning | 2h | QA | Week 4 |
| **4: Testing** | Load test (simulate queue backlog) | 1h | QA | Week 4 |
| **5: Docs** | Runbook + decision rules reference | 1h | Tech Writer | Week 4 |
| **Total** | | **22 hours** | | |

---

## See Also

- [Full Research Notes](VIRTUAL-ADMIN-AGENT-RESEARCH.md) — detailed architecture, risks, file-by-file changes
- [Existing Monitoring Code] — queueHealthMonitor.ts, services.ts, queues.ts (reference implementations)
- [Agency Infrastructure] — agencyBridge.ts, agency template examples

