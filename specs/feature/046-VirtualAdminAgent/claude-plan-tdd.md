# Spec 046 — Virtual Admin Agent: TDD Plan

## Testing Framework
- **TypeScript/Node.js**: Vitest with mock tRPC context (pattern from `auth.logout.test.ts`)
- **Python**: pytest (for Celery health endpoint)
- **Coverage target**: 80% per CLAUDE.md requirements

## Test Structure

```
apps/web/
├── server/services/virtualAdmin/__tests__/
│   ├── ruleEngine.test.ts
│   ├── sensorRegistry.test.ts
│   ├── notifier.test.ts
│   ├── actuatorRegistry.test.ts
│   ├── scheduler.test.ts
│   ├── chatHandler.test.ts
│   ├── feedbackProcessor.test.ts
│   └── systemUser.test.ts
├── server/routers/__tests__/
│   ├── virtualAdmin.test.ts
│   └── feedback.test.ts
└── client/src/components/guardian/__tests__/
    ├── SensorStatusGrid.test.tsx
    ├── IncidentTimeline.test.tsx
    └── ApprovalActionCard.test.tsx

python-backend/tests/unit/
└── test_virtual_admin_celery_health.py
```

---

## Section 1: Database Schema & System User

### Tests to write BEFORE implementation:

```typescript
// systemUser.test.ts
describe("SystemUser", () => {
  it("creates system user with id -1 if not exists");
  it("does not duplicate system user on second call");
  it("generates valid JWT with system_agent role");
  it("JWT includes userId -1 and no tenantId");
  it("system user cannot login via auth.login procedure");
});
```

---

## Section 2: Sensor Framework

### Tests to write BEFORE implementation:

```typescript
// sensorRegistry.test.ts
describe("SensorRegistry", () => {
  it("registers sensor with id and interval");
  it("returns SensorReading with required fields");
  it("handles sensor timeout (>10s) gracefully");
  it("handles sensor exception without crashing loop");
  it("marks sensor as unknown when source unreachable");
  it("loads config overrides from DB per tenant");
  it("uses default config when no DB override exists");
});
```

### Per-sensor tests (one test file per sensor, representative examples):

```typescript
// sensors/queueHealth.test.ts
describe("QueueHealthSensor", () => {
  it("returns healthy when all queues below threshold");
  it("returns degraded when queue depth > warning threshold");
  it("returns critical when queue depth > critical threshold");
  it("includes queue name and depth in metrics");
});

// sensors/creditBalance.test.ts
describe("CreditBalanceSensor", () => {
  it("returns healthy when balance > soft limit");
  it("returns degraded when balance < soft limit but > hard limit");
  it("returns critical when balance <= hard limit");
  it("runs per-tenant and includes tenantId in reading");
});

// sensors/errorSpike.test.ts
describe("ErrorSpikeSensor", () => {
  it("returns healthy when error rate < baseline");
  it("returns degraded when error rate > 3x baseline");
  it("handles missing audit log file gracefully");
  it("counts only last 5 minutes of errors");
});
```

---

## Section 3: Rule Engine

### Tests to write BEFORE implementation:

```typescript
// ruleEngine.test.ts
describe("RuleEngine", () => {
  // Core evaluation
  it("creates incident when rule condition matches");
  it("does not create incident when condition does not match");
  it("respects cooldown period (no duplicate within cooldown)");
  it("updates existing open incident instead of creating duplicate");

  // Severity mapping
  it("maps queue_depth_high to warning severity");
  it("maps celery_worker_down to critical severity");
  it("maps credit_low to warning with correct tenant scope");

  // Action plan execution
  it("triggers auto-fix when tenant has auto-fix enabled");
  it("skips auto-fix when tenant has auto-fix disabled");
  it("creates approval record for medium/high risk actions");
  it("sends notification via configured channels");

  // Edge cases
  it("handles multiple rules matching same sensor reading");
  it("handles sensor reading with status 'unknown' (skips rule eval)");
  it("logs incident creation to audit logger");
});
```

---

## Section 4: Actuators & Approval Flow

### Tests to write BEFORE implementation:

```typescript
// actuatorRegistry.test.ts
describe("ActuatorRegistry", () => {
  // Auto-fix actions
  it("retry_failed_job calls job.retry()");
  it("cleanup_temp_files deletes expired files only");
  it("failover_provider switches to backup provider");
  it("auto-fix logs result to incident");

  // Approval gate
  it("creates approval with correct expiresAt based on severity");
  it("approval status transitions: pending → approved → executed");
  it("approval status transitions: pending → rejected → logged");
  it("concurrent approval: second admin gets CONFLICT error");
  it("expired approval: re-alerts for critical, archives for warning");
  it("approved action execution failure marks status execution_failed");
});
```

---

## Section 5: Notification System

### Tests to write BEFORE implementation:

```typescript
// notifier.test.ts
describe("GuardianNotifier", () => {
  // Channel routing
  it("info severity → in-app only");
  it("warning severity → in-app + email digest");
  it("error severity → in-app + email immediate + slack");
  it("critical severity → all channels including telegram");

  // Delivery
  it("calls createNotification for in-app");
  it("calls emailService for email");
  it("handles email delivery failure with retry");
  it("falls back to email when slack fails");
  it("falls back to in-app when all channels fail");

  // Rate limiting
  it("respects per-rule cooldown");
  it("respects max 20 emails/hour per tenant");
});
```

---

## Section 6: Dedicated Admin Chat

### Tests to write BEFORE implementation:

```typescript
// chatHandler.test.ts
describe("GuardianChatHandler", () => {
  it("responds to 'status' with sensor health summary");
  it("responds to 'incidents' with open incident list");
  it("responds to 'retry <id>' by executing retry actuator");
  it("responds to 'approve <id>' by processing approval");
  it("responds to unknown command with help menu");
  it("creates conversation with type system_guardian on first use");
  it("reuses existing guardian conversation for same admin");
  it("stores all messages in conversations table");
});
```

---

## Section 7: Feedback System

### Tests to write BEFORE implementation:

```typescript
// feedbackProcessor.test.ts
describe("FeedbackProcessor", () => {
  // Classification
  it("LLM classifies bug report correctly");
  it("falls back to keyword classification when LLM fails");
  it("keyword: 'error' → bug, high priority");
  it("keyword: 'suggestion' → feature_request, normal priority");

  // Deduplication
  it("detects duplicate by title similarity >80%");
  it("links duplicate ticket to original");
  it("does not flag as duplicate when similarity <80%");

  // Correlation
  it("links ticket to active incident when error matches");
  it("does not link when no matching incident");

  // Priority scoring
  it("increases priority for virtual_agent submissions");
  it("increases priority when multiple duplicates exist");
  it("increases priority when linked to active incident");

  // Auto-response
  it("responds 'we are aware' when linked to incident");
  it("responds 'tracked in #X' when duplicate found");
});
```

### tRPC endpoint tests:

```typescript
// feedback.test.ts
describe("FeedbackRouter", () => {
  // User endpoints
  it("submit creates ticket with correct fields");
  it("submit rate limited to 10/hour");
  it("myTickets returns only user's own tickets");
  it("getTicket returns 404 for other user's ticket");

  // Admin endpoints
  it("adminList returns all tenant tickets for admin");
  it("adminList filters by type/status/priority");
  it("adminUpdate changes priority and status");
  it("adminRespond creates public comment and notifies user");
  it("adminMergeDuplicate links and closes ticket");

  // Tenant isolation
  it("admin cannot see tickets from other tenant");
  it("domain_admin can see tickets from all tenants");
});
```

---

## Section 8: SSE & Real-time

### Tests to write BEFORE implementation:

```typescript
// guardianSSE integration test
describe("GuardianSSE", () => {
  it("returns correct SSE headers");
  it("sends heartbeat every 30s");
  it("broadcasts incident created event");
  it("broadcasts approval decided event");
  it("cleans up on client disconnect");
  it("requires admin authentication");
});
```

---

## Section 9: Scheduler & Watchdog

### Tests to write BEFORE implementation:

```typescript
// scheduler.test.ts
describe("GuardianScheduler", () => {
  it("starts all sensor intervals on startGuardian()");
  it("clears all intervals on stopGuardian()");
  it("staggers sensor starts (not all at once)");
  it("respects VIRTUAL_ADMIN_ENABLED=false");
});

// watchdog
describe("GuardianWatchdog", () => {
  it("detects stuck sensor (no run in 3x interval)");
  it("detects too many open incidents (>100)");
  it("reports healthy when all checks pass");
  it("external /health endpoint returns status");
});
```

---

## Section 10: Frontend Components

### Tests to write BEFORE implementation:

```typescript
// SensorStatusGrid.test.tsx
describe("SensorStatusGrid", () => {
  it("renders all sensors with health indicators");
  it("shows green for healthy, yellow for degraded, red for critical");
  it("updates on SSE event");
});

// ApprovalActionCard.test.tsx
describe("ApprovalActionCard", () => {
  it("renders pending approval with context");
  it("approve button calls decideApproval mutation");
  it("reject button opens comment dialog");
  it("disabled when already decided");
});
```

---

## Test Execution Commands

```bash
# TypeScript tests
cd apps/web && pnpm test -- --run server/services/virtualAdmin/
cd apps/web && pnpm test -- --run server/routers/__tests__/virtualAdmin.test.ts
cd apps/web && pnpm test -- --run server/routers/__tests__/feedback.test.ts

# Python tests
cd python-backend && source .venv/bin/activate && pytest tests/unit/test_virtual_admin_celery_health.py

# All guardian tests
cd apps/web && pnpm test -- --run --grep "Guardian\|Feedback\|Sensor\|Rule\|Actuator\|Watchdog"
```
