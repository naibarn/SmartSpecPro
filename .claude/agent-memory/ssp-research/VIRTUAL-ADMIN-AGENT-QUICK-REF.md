---
name: Virtual Admin Agent Quick Reference
description: Fast lookup tables, code locations, and decision checklist for Virtual Admin Agent implementation
type: project
---

# Virtual Admin Agent — Quick Reference

## Code Locations (Read These First)

### Monitoring & Health Checks
| Module | Path | Lines | Purpose |
|--------|------|-------|---------|
| QueueHealthMonitor | `apps/web/server/services/queueHealthMonitor.ts` | 298 | Detects queue backlog, spikes, dead workers (60s poll) |
| ServicesRouter | `apps/web/server/routers/services.ts` | 981 | Docker/systemd/host process status checks |
| QueuesRouter | `apps/web/server/routers/queues.ts` | 479 | Rate limiter + Cloud Tasks metrics |

### Audit & Logging
| Module | Path | Lines | Purpose |
|--------|------|-------|---------|
| AuditLogger | `apps/web/server/services/auditLogger.ts` | ~500 | JSONL logging + sanitization |
| providerUsageLog table | `apps/web/drizzle/schema.ts` | Line ~727 | DB records: cost, error, timing |
| apiAuditEvents table | `apps/web/drizzle/schema.ts` | Line ~771 | Structured events with metadata |

### Notifications
| Module | Path | Lines | Purpose |
|--------|------|-------|---------|
| EmailService | `apps/web/server/services/emailService.ts` | ~300 | SMTP-based email sending |
| NotificationService | `apps/web/server/services/notificationService.ts` | ~111 | In-app + Telegram dispatch |
| Slack Adapter | `apps/web/server/services/channelAdapters/slack.ts` | ~400 | Webhook validation + API calls |

### Scheduler & Agents
| Module | Path | Lines | Purpose |
|--------|------|-------|---------|
| Scheduler | `apps/web/server/services/scheduler.ts` | ~881 | Cloud Tasks + fallback sweep |
| AgencyBridge | `apps/web/server/services/agencyBridge.ts` | ~300 | HTTP client for Python agency service |
| systemSettings table | `apps/web/drizzle/schema.ts` | Line ~2750 | Config storage (SMTP, Slack webhook, etc.) |

---

## Database Schema Quick Reference

### Tables Used by Virtual Admin Agent

```sql
-- Queue monitoring state (in-memory, not persisted)
-- Read via: getQueueHealthStatus()
-- Fields: queue.name, queue.length, queue.status, activeAlerts[]

-- Cost tracking and error logging
SELECT id, traceId, modelUsed, costUsd, errorMessage, createdAt
FROM provider_usage_log
WHERE createdAt > now() - interval '10 minutes'
ORDER BY createdAt DESC;

-- Structured events (media, skill, LLM, errors)
SELECT id, traceId, eventType, metadata, createdAt
FROM api_audit_events
WHERE eventType IN ('error', 'llm_response', 'media_response')
AND createdAt > now() - interval '10 minutes'
ORDER BY createdAt DESC;

-- Admin agent decisions (new table to create)
CREATE TABLE admin_agent_decisions (
  id SERIAL PRIMARY KEY,
  traceId VARCHAR(32) UNIQUE NOT NULL,
  decision VARCHAR(64) NOT NULL, -- 'queue_backlog', 'service_down', etc.
  status VARCHAR(32) NOT NULL, -- 'proposed', 'approved', 'executed', 'declined'
  metrics JSONB, -- {queue_length: 150, service: 'celery-media', ...}
  approverUserId INTEGER REFERENCES users(id),
  executedAt TIMESTAMP,
  result TEXT, -- 'success', 'failed', error description
  createdAt TIMESTAMP DEFAULT now(),
  INDEX (createdAt), INDEX (status)
);

-- Budget alerts (already exists)
SELECT id, userId, creditsUsedThisMonth, alertThresholdPct, alertSent
FROM credit_budget
WHERE alertThresholdReached = true
ORDER BY createdAt DESC;
```

---

## Decision Tree: When to Alert/Escalate

```
┌─────────────────────────────────────────┐
│  Condition Detected                     │
├─────────────────────────────────────────┤
│ 1. Check thresholds (queue, error rate) │
│ 2. If threshold met, check hysteresis   │
│ 3. If no recent alert for this condition│
│    → Escalate                           │
└─────────────────────────────────────────┘
         │
    ┌────┴─────────────────────────────────┐
    │                                       │
    ↓                                       ↓
Low/Medium Risk                       High Risk
    │                                       │
    ├─ Reset rate limiter           ├─ Service down
    ├─ Purge old logs               ├─ Queue > 500
    │                                │  & growing
    ↓                                │
Auto-execute                         ├─ >5% error rate
Log decision                         │  in 10 min
In-app notification                 │
                                     ↓
                            Create escalation:
                            1. Log decision
                            2. Post to Slack
                            3. Show approval buttons
                            4. Wait for human OK
                            5. Execute approved action
                            6. Log result + traceId
```

---

## Threshold Tuning Checklist

Before deploying virtual admin agent, verify these thresholds make sense **for your deployment**:

| Metric | Threshold | How to Tune |
|--------|-----------|-----------|
| Queue length | > 100 items | Run load test; see natural peak; set alert at 1.5x peak |
| Consecutive growth | ≥ 3 checks | Test with 1 worker down; should trigger in ~3 min |
| Error rate | > 5% in 10 min | Check baseline from last month; set at 2x baseline |
| Service down | status == "stopped" | Exclude maintenance windows |
| Budget alert | > alertThresholdPct | Check with product; recommend 80% |
| Dedup window | 15 minutes | Prevent alert fatigue; long enough to execute fix |

---

## Implementation Checklist

### Phase 1: Core Agent Service (6 hours)

- [ ] Create `adminAgentService.ts` with:
  - [ ] `startAdminAgent()` — register scheduler job
  - [ ] `tickAdminAgent()` — main 60s poll logic
  - [ ] Escalation functions: `escalateQueueBacklog()`, `escalateServiceDown()`, `escalateBudgetAlert()`
  - [ ] Approval workflow spawn logic

- [ ] Update `scheduler.ts`:
  - [ ] Register `check-system-health` Celery beat task
  - [ ] Task runs `tickAdminAgent()` every 60s

- [ ] Create `adminAgentDecisions` database table
  - [ ] Run migration: `pnpm db:push`
  - [ ] Verify table created: `psql $DATABASE_URL -c "SELECT * FROM admin_agent_decisions LIMIT 1;"`

- [ ] Create `adminAgent.ts` tRPC router:
  - [ ] `admin.getAdminAgentStatus()` → current decision + alerts
  - [ ] `admin.getAdminAgentHistory(limit)` → last N decisions
  - [ ] `admin.approveAdminAction(decisionId)` → human approval

### Phase 2: Frontend UI (4 hours)

- [ ] Create `AdminAgentDashboard.tsx`:
  - [ ] Display current alerts (queue backlog, service down, budget)
  - [ ] Show decision history (last 20 with reason)
  - [ ] Add to left sidebar menu under Admin

- [ ] Create alert notification component:
  - [ ] Show with priority: low (info), normal (warning), critical (error)
  - [ ] 1-click approval buttons (for Slack + in-app)

- [ ] Create Slack webhook handler:
  - [ ] Receive Slack reaction (thumbs up = approve, thumbs down = decline)
  - [ ] Call `admin.approveAdminAction()` with reaction
  - [ ] Update decision status in DB

### Phase 3: Agency & Approval Workflow (3 hours)

- [ ] Create agency template: `skills/system-diagnostics/agency.yaml`
  - [ ] Diagnostician agent (analyze metrics)
  - [ ] Decision router (risk-based)
  - [ ] Slack approval node (for high-risk)
  - [ ] Auto-execute node (for low-risk)

- [ ] Create Slack approval message formatter:
  - [ ] Title: "Queue Backlog Alert"
  - [ ] Metrics: queue length, consecutive growth, timestamp
  - [ ] Action buttons: [Approve Restart] [Decline]
  - [ ] Add suggested action from agency

- [ ] Implement remediation skills:
  - [ ] `reset-rate-limiter` (call queuesRouter)
  - [ ] `restart-worker` (call servicesRouter)
  - [ ] `notify-user` (send notification)

### Phase 4: Testing & Tuning (2 hours)

- [ ] Unit tests:
  - [ ] `adminAgentService.test.ts` — rule evaluation
  - [ ] Threshold tests (queue > 100, error rate > 5%, etc.)
  - [ ] Dedup logic (don't fire same alert twice in 15 min)

- [ ] Load test (manual):
  - [ ] Simulate queue backlog:
    ```bash
    # In Python backend, pause worker for 5 min
    # Watch agent alert within 3 minutes
    ```
  - [ ] Simulate service down:
    ```bash
    # Kill a worker
    # Watch agent escalate within 2 minutes
    ```

- [ ] Threshold tuning:
  - [ ] Check production queue depths over 1 week
  - [ ] Adjust thresholds based on actual behavior
  - [ ] Document justification in code comments

---

## Decision Rules (Pseudocode)

```typescript
// Every 60 seconds:
async function tickAdminAgent() {
  const queueHealth = getQueueHealthStatus();
  const services = await getAllServiceStatus();
  const budget = await getBudgetStatus();

  // RULE 1: Queue backlog
  if (queueHealth.activeAlerts.some(a => a.severity === 'critical')) {
    // Critical: >1000 items
    // Action: Restart worker (requires approval)
    await createEscalation({
      decision: 'queue_backlog_critical',
      metrics: { queue_length: queueHealth.queues[0].length },
      risk: 'high',
      recommended_action: 'Restart celery-media worker',
    });
  } else if (queueHealth.activeAlerts.some(a => a.severity === 'warning')) {
    // Warning: >100 items AND consecutive growth ≥3
    // Action: Try safe fix first (reset rate limiter)
    if (await canResetLimiter('kie.ai')) {
      await resetLimiter('kie.ai');
      await logDecision({
        decision: 'rate_limiter_reset',
        metrics: { queue_length: queueHealth.queues[0].length },
        auto_executed: true,
      });
    }
  }

  // RULE 2: Service down
  for (const service of services) {
    if (service.status === 'stopped' && !isMaintenanceWindow()) {
      await createEscalation({
        decision: 'service_down',
        metrics: { service_name: service.displayName },
        risk: service.critical ? 'critical' : 'high',
        recommended_action: `Start ${service.displayName}`,
      });
    }
  }

  // RULE 3: Budget alert
  if (budget.alertThresholdReached && !budget.alertSent) {
    await createNotification({
      userId: budget.userId,
      type: 'alert',
      title: `Budget alert: ${budget.creditsUsedThisMonth} credits used`,
      content: `You've reached ${budget.alertThresholdPct}% of your monthly budget.`,
      priority: 'high',
    });
    await markAlertSent(budget.id);
  }

  // RULE 4: Error rate spike
  const recentErrors = await getErrorCount('last_10_minutes');
  const recentTotal = await getRequestCount('last_10_minutes');
  const errorRate = recentTotal > 0 ? (recentErrors / recentTotal) * 100 : 0;
  if (errorRate > 5) {
    await createEscalation({
      decision: 'error_rate_spike',
      metrics: { error_rate: errorRate, errors: recentErrors, total: recentTotal },
      risk: 'medium',
      recommended_action: 'Review recent errors; check provider status',
    });
  }
}
```

---

## Escalation Flow (Slack Approval)

```
┌─────────────────────────────────────┐
│ Agent detects queue backlog         │
│ Creates escalation record           │
└──────────────┬──────────────────────┘
               ↓
        ┌──────────────────┐
        │ Post to Slack:   │
        │                  │
        │ "Queue Backlog"  │
        │ celery: 250 items│
        │ growing for 3    │
        │ checks           │
        │                  │
        │ [Approve] [Skip] │
        └──────────┬───────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ↓                     ↓
    Approve               Skip
        │                     │
        ↓                     ↓
   Restart            Log only
   worker 1              Update
   (gradual)             status
        │
        ├─ Wait 30s
        ├─ Check queue
        ├─ If still >100:
        │   Restart worker 2
        ├─ Check queue
        ├─ If recovering:
        │   Success ✓
        │
        └─ Log result
          + notify admin
```

---

## Cost Estimate

| Component | Unit Cost | Frequency | Monthly Cost |
|-----------|-----------|-----------|--------------|
| Polling (scheduler) | $0 | Every 60s | $0 |
| Rule evaluation | $0 | Every 60s | $0 |
| Simple escalation (notify) | $0 | ~1/day | $0 |
| Complex diagnostic (GPT-4o-mini) | ~$0.01 | ~1/day | ~$0.30 |
| Agency execution | ~$0.05 | ~2/day | ~$3.00 |
| **Total** | | | **~$3.30/month** |

---

## Troubleshooting

| Issue | Debug Steps |
|-------|-----------|
| Agent not running | Check: `SELECT * FROM scheduled_messages WHERE skillId = 'check-system-health';` Is it there? Is `isRecurring = true`? |
| Alerts firing too often | Check: dedup logic in DB. Recent alert <15 min old? Update `dedup_window` constant. |
| Approval not working | Check: Slack webhook URL in `systemSettings`. Verify: Slack app has `chat:write` scope. |
| Decision not executing | Check: approverUserId is set? Status changed to 'approved'? Check logs for remediation skill errors. |
| Rules never trigger | Check: thresholds are reachable. Run load test. If queue never hits 100, raise threshold. |

---

## See Also

- **Full research**: [VIRTUAL-ADMIN-AGENT-RESEARCH.md](VIRTUAL-ADMIN-AGENT-RESEARCH.md)
- **Brief**: [VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md](VIRTUAL-ADMIN-AGENT-RESEARCH-BRIEF.md)
- **Reference code**: queueHealthMonitor.ts, services.ts (existing implementations)

