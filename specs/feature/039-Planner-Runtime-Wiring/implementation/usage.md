# Task Planner Runtime Wiring — Operator & Developer Usage Guide

> Spec 039 | Status: **Production-ready** (all 5 sections implemented, 19 call sites wired)
> Last updated: 2026-03-12

---

## What Is the Task Planner?

The **Task Planner** is a runtime middleware layer that intercepts every LLM request before it reaches a model provider. Its job is to:

1. **Classify the incoming task** — determine what kind of work is being requested (chat, skill execution, translation, agency orchestration, etc.)
2. **Select the optimal model** — choose from enabled models based on task requirements, budget class, and capability constraints
3. **Create an audit trail** — write a `task_run` + `task_step_attempts` record so every LLM call is traceable and cost-accountable
4. **Pass structured metadata to Agency** — when routing to an Agency, attach plan context so the orchestrator can make informed decisions

Without the planner enabled, SmartSpecPro falls back to the legacy `resolveEnabledLlmModelId()` path (picks the first enabled model with no task-awareness). The planner is an **opt-in, per-tenant upgrade** — enabling it does not affect other tenants.

---

## How to Enable

### In the Admin UI

1. Navigate to **Admin → Tenants** (`/admin/tenants`)
2. Click **Edit** (pencil icon) on the tenant you want to configure
3. Scroll down to the **Feature Flags** section
4. Find the **Planner** group — two toggles:
   - **Task Planner** — master switch
   - **Planner Agency Escalation** — agency-specific switch (requires Task Planner ON)
5. Toggle the desired flags ON — changes are saved immediately (optimistic update)

### Via SQL (emergency / bulk provisioning)

```sql
-- Enable Task Planner for a specific tenant
UPDATE tenants
SET "featureFlags" = jsonb_set(
  COALESCE("featureFlags", '{}'),
  '{taskPlannerEnabled}',
  'true'
)
WHERE id = 'your-tenant-id';

-- Enable Agency Escalation as well
UPDATE tenants
SET "featureFlags" = jsonb_set(
  COALESCE("featureFlags", '{}'),
  '{taskPlannerAgencyEscalation}',
  'true'
)
WHERE id = 'your-tenant-id';

-- Verify
SELECT id, "featureFlags"->>'taskPlannerEnabled', "featureFlags"->>'taskPlannerAgencyEscalation'
FROM tenants
WHERE id = 'your-tenant-id';
```

> **Note:** SQL changes take effect immediately. The flag is read from Redis (synced automatically when updated via admin UI or tRPC mutation). A direct SQL update bypasses the Redis sync — restart the web service or wait up to 60 s for Redis TTL to expire.

---

## Feature Flags: Full Reference

### `taskPlannerEnabled`

| Property | Value |
|---|---|
| **Default** | `false` (off) |
| **Redis key** | `feature-flag:taskPlannerEnabled:{tenantId}` |
| **Scope** | Per-tenant |

**What it does when ON:**

- Every LLM call for this tenant goes through `runPlanner()` before the model is contacted
- The planner classifies the task, selects the best available model, and writes a `task_run` record to the database
- If the planner selects a model, that model is used instead of the default enabled model
- If the planner fails for any reason (exception, timeout, DB error), it silently returns `null` and the legacy model-selection path takes over — **the user request is never blocked**
- `plannerLatencyMs` is returned in the planner result for caller-side logging (not persisted to DB in this release)

**What it does when OFF (default):**

- `runPlanner()` checks the flag, sees `false`, and returns `null` immediately — **zero DB queries, zero overhead**
- All LLM calls use `resolveEnabledLlmModelId()` exactly as before
- No `task_runs` or `task_step_attempts` records are created

**When to enable:**

- You want per-task model selection (route complex tasks to powerful models, simple tasks to fast/cheap models)
- You need a full audit trail of which model handled each request
- You are testing the planner on a specific tenant before rolling out to all tenants

---

### `taskPlannerAgencyEscalation`

| Property | Value |
|---|---|
| **Default** | `false` (off) |
| **Redis key** | `feature-flag:taskPlannerAgencyEscalation:{tenantId}` |
| **Scope** | Per-tenant |
| **Requires** | `taskPlannerEnabled = true` |

**What it does when ON:**

- For requests that route to an **Agency** (agency router, channel configured as agency type, webhook → agency, test trigger), the planner also runs and attaches structured `AgencyTaskMetadata` to the agency bridge call
- The Python agency service receives the plan context: `taskRunId`, `budgetClass`, `strategy`, `requirements`, `routeReason` — enabling cost-aware orchestration
- A `task_step_attempts` record is written after the agency run completes, so agency costs appear in the step audit trail

**What it does when OFF (default):**

- Agency runs proceed normally — they still work, just without planner tracking or metadata
- No `task_runs` created for agency calls even if `taskPlannerEnabled = true`
- The two flags are independent: you can track regular LLM calls without tracking agency runs

**When to enable:**

- You want full cost visibility across both direct LLM calls and agency-orchestrated runs
- The agency service should receive model budget hints from the planner (e.g. premium vs standard tier)
- You are doing cost analysis that requires agency runs in the `task_step_attempts` table

**Flag dependency table:**

| `taskPlannerEnabled` | `taskPlannerAgencyEscalation` | Result |
|:---:|:---:|---|
| OFF | OFF | Legacy model selection everywhere. No planner records. |
| ON | OFF | Planner runs for chat/skill/translation/scheduled/responses/channel-chat. Agency runs bypass planner. |
| ON | ON | Planner runs everywhere, including agency routes. Full audit trail. |
| OFF | ON | Same as both OFF — `taskPlannerEnabled` is always checked first. |

---

## What Gets Tracked (Database)

When the planner is enabled and a request is processed:

**`task_runs` table** — one row per planner invocation:

| Column | Value |
|---|---|
| `id` | Auto-increment PK |
| `userId` | ID of the user who made the request |
| `tenantId` | Tenant the request belongs to |
| `sourceType` | Where the request came from (`chat`, `skill`, `translation`, `channel`, `responses`, `agency`, `webhook`, `scheduled`, `structured`, `presentation`) |
| `skillSlug` | Skill ID if a skill was used (nullable) |
| `traceId` | Correlation ID linking to audit log entries |
| `createdAt` | Timestamp |

**`task_step_attempts` table** — one row per completed LLM call (written after the response):

| Column | Value |
|---|---|
| `taskRunId` | FK to `task_runs` |
| `modelId` | The model that was actually used |
| `providerModelId` | Provider-specific model ID |
| `providerName` | Provider name (openai, anthropic, etc.) |
| `inputTokens` | Tokens in the prompt |
| `outputTokens` | Tokens in the completion |
| `creditsUsed` | Credits charged to the user |
| `costUsd` | Cost in USD |
| `durationMs` | Time from request to first token |
| `status` | `completed` or `failed` |

**Useful queries:**

```sql
-- All task runs for a tenant in the last 24 hours
SELECT tr.id, tr."sourceType", tr."skillSlug", tr."createdAt",
       sa."modelId", sa."creditsUsed", sa."costUsd", sa."durationMs"
FROM task_runs tr
LEFT JOIN task_step_attempts sa ON sa."taskRunId" = tr.id
WHERE tr."tenantId" = 'your-tenant-id'
  AND tr."createdAt" > NOW() - INTERVAL '24 hours'
ORDER BY tr."createdAt" DESC;

-- Cost breakdown by source type
SELECT tr."sourceType",
       COUNT(*) AS requests,
       SUM(sa."creditsUsed") AS total_credits,
       SUM(sa."costUsd"::numeric) AS total_cost_usd
FROM task_runs tr
JOIN task_step_attempts sa ON sa."taskRunId" = tr.id
WHERE tr."tenantId" = 'your-tenant-id'
GROUP BY tr."sourceType"
ORDER BY total_cost_usd DESC;

-- Model usage distribution
SELECT sa."modelId", COUNT(*) AS uses,
       AVG(sa."durationMs") AS avg_latency_ms
FROM task_step_attempts sa
JOIN task_runs tr ON tr.id = sa."taskRunId"
WHERE tr."tenantId" = 'your-tenant-id'
  AND tr."createdAt" > NOW() - INTERVAL '7 days'
GROUP BY sa."modelId"
ORDER BY uses DESC;

-- Skill vs media cost split
-- Note: skill text calls use sourceType='skill', media generation uses sourceType='media'
SELECT
  CASE
    WHEN tr."sourceType" = 'skill' THEN 'skill (text/structured)'
    WHEN tr."sourceType" = 'media' THEN 'media (image/video/audio)'
    ELSE tr."sourceType"
  END AS source_label,
  COUNT(*) AS requests,
  SUM(sa."creditsUsed") AS total_credits,
  SUM(sa."costUsd"::numeric) AS total_cost_usd
FROM task_runs tr
JOIN task_step_attempts sa ON sa."taskRunId" = tr.id
WHERE tr."tenantId" = 'your-tenant-id'
  AND tr."sourceType" IN ('skill', 'media')
  AND tr."createdAt" > NOW() - INTERVAL '7 days'
GROUP BY source_label
ORDER BY total_cost_usd DESC;
```

---

## Entry Points Covered

The planner is wired into **19 call sites** across all LLM execution paths:

| Category | Entry Point | `sourceType` | `isAgencyEscalation` |
|---|---|---|:---:|
| **Frontend Chat** | `/api/llm/stream` (legacy gateway) | `"chat"` | — |
| | `/api/llm/v2/stream` (v2 gateway, non-streaming) | `"chat"` | — |
| | `/api/llm/v2/stream` (v2 gateway, streaming) | `"stream"` | — |
| **tRPC** | `chat.sendMessage` (direct chat) | `"chat"` | — |
| | `chat.sendMessage` (skill execution) | `"skill"` | — |
| | `translation.*` | `"translation"` | — |
| | `scheduledMessages.*` | `"scheduled"` | — |
| **Services** | `callLLMStructured()` (JSON-mode LLM) | `"skill"` | — |
| | `scheduler` (background jobs) | `"scheduled"` | — |
| | `skillExecutor` — image skill | `"media"` | — |
| | `skillExecutor` — video skill | `"media"` | — |
| | `skillExecutor` — audio skill | `"media"` | — |
| | `aiPresentationService` | `"presentation"` | — |
| **Responses API** | `/api/responses` (OpenAI-compatible) | `"responses"` | — |
| **Channel Gateway** | Telegram/LINE/Slack chat pipeline | `"channel"` | — |
| | Channel router → agency override | `"channel"` | ✅ |
| | Channel agency pipeline | `"channel"` | ✅ |
| **Agency** | `agency.sendMessage` (direct request) | `"agency"` | ✅ |
| **Webhooks** | `webhookDispatchQueue` → agency target | `"webhook"` | ✅ |
| | `webhookTriggers` test trigger → agency | `"webhook"` | ✅ |

> **Note on media skills:** `skillExecutor` uses `sourceType: "media"` (not `"skill"`) for image, video, and audio generation tasks. When querying cost breakdowns, include both `"skill"` and `"media"` to capture all skill-related runs. `callLLMStructured()` (JSON-mode structured output) uses `"skill"`.

Rows marked ✅ require `taskPlannerAgencyEscalation = true` to activate planner tracking.

---

## Fallback Guarantee

The planner is designed so that **no user request can ever be blocked by a planner failure**:

```
runPlanner() throws an exception
  → caught internally → logs warning → returns null
  → caller uses legacy resolveEnabledLlmModelId()
  → user request proceeds normally

runPlanner() flag check returns false
  → returns null immediately (no DB queries, no overhead)
  → caller uses legacy path

runPlanner() succeeds but resolvedModel is null
  → caller uses legacy resolveEnabledLlmModelId() as fallback

planner DB write fails (task_runs insert error)
  → caught internally → returns null
  → caller uses legacy path
```

In server logs, a planner fallback looks like:

```
[taskPlannerMiddleware] planner failed, falling back to legacy <Error: ...>
```

This is **not an alert-worthy error** — it is expected behavior during DB outages, misconfiguration, or feature flag transitions.

---

## Kill Switch (Emergency Disable)

If you need to immediately disable the planner for a tenant without touching the admin UI:

```bash
# Via Redis CLI (instant, no restart needed)
redis-cli SET "feature-flag:taskPlannerEnabled:your-tenant-id" "false" EX 86400

# Via psql (takes effect after Redis TTL expires ~60s, or restart web service)
psql "$DATABASE_URL" -c "
  UPDATE tenants
  SET \"featureFlags\" = jsonb_set(\"featureFlags\", '{taskPlannerEnabled}', 'false')
  WHERE id = 'your-tenant-id';
"
```

---

## Developer: Adding a New Entry Point

When building a new feature that calls an LLM, wire the planner using this pattern:

```typescript
import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";

// Step 1 — Run planner before the LLM call
const plannerResult = await runPlanner({
  sourceType: "my-feature",         // Identifies where this call comes from
  userId,                           // Required for task_runs record
  tenantId,                         // Required for feature flag check
  conversationModel: requestedModel, // Hint: model the user/caller requested
  skillSlug: skill?.slug,           // Optional: if a skill is involved
  hasTools: toolCount > 0,          // Optional: affects strategy selection
  // isAgencyEscalation: true       // Set this only for agency-bound paths
}).catch(() => null);               // Never let planner errors propagate

// Step 2 — Use planner model or fall back to legacy
const modelToUse = plannerResult?.resolvedModel ?? legacyResolvedModel;

// Step 3 — Call the LLM with modelToUse ...
const response = await callLLM({ model: modelToUse, ... });

// Step 4 — Record step attempt after LLM responds (fire-and-forget)
if (plannerResult) {
  recordStepAttempt({
    taskRunId:    plannerResult.taskRunId,
    plan:         plannerResult.plan,
    snapshot:     plannerResult.snapshot,
    model:        modelToUse,
    provider:     providerName,
    inputTokens:  usage.inputTokens,
    outputTokens: usage.outputTokens,
    costUsd:      costString,
    durationMs:   elapsed,
    creditsUsed:  creditsDeducted,
  }).catch(() => {}); // fire-and-forget — never block on this
}
```

---

## Commit History

| Commit | Description |
|---|---|
| `7434f2f4` | S01 — Feature flag + shared infrastructure |
| `f5c76949` | S03 — Artifact routing + presentation wiring |
| `8e665cc0` | S04 — Agency escalation + telemetry |
| `d6df8066` | S05 — Active mode cutover, shadow mode removed |
| `04d1b32e` | Completeness: flag system alignment + legacy chat path wired |
| `eb144525` | Completeness: `taskPlannerAgencyEscalation` flag fully wired |
