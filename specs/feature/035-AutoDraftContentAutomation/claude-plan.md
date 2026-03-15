# Implementation Plan: Auto Draft & Content Automation Engine (Spec 035)

## 1. Context and Goals

SmartSpecPro's "Draft with AI" feature requires users to manually select 13+ options before generating a presentation. This plan converts it into a single-brief automatic system using AgencySwarm agents.

**What we're building (Phase 1: Levels 1+2):**
1. **Auto Draft Agent** — An AgencySwarm agent that receives a user's brief, automatically selects the optimal skill, model, style, and parameters, then calls the existing `generateAIDraft()` pipeline
2. **Multi-Source Input** — Support for file uploads (CSV/Excel/Text), natural language chat commands with scheduling, and batch processing of multiple items
3. **Schema design for Level 3** — Database models for Content Automation Engine (implementation deferred to Phase 2)

**What we're NOT building yet:**
- Content Automation Engine scheduler (Level 3)
- Content Automation Dashboard page
- Social media auto-posting
- Modifications to the existing `generateAIDraft()` pipeline

**Key constraint:** All new functionality gated by `ENABLE_CONTENT_AUTOMATION` feature flag.

**Dependency:** Spec 034's AgencyResultEnvelope and ResultRouter are implemented. `builtin-skill-discovery` is NOT yet implemented — we need a simplified version for the agent to query available skills.

## 2. Architecture Overview

```
User Brief / File / Chat Command
         │
    ┌────┴────┐
    │  Agent  │  (AgencySwarm: Auto Draft Agent)
    │ Python  │  Tools: skill-discovery, model-suggest, auto-draft, file-parse, schedule-draft
    └────┬────┘
         │ HTTP POST (X-Service-Token)
         ▼
    ┌─────────────────────┐
    │  Node.js Handlers   │  /api/internal/tools/*
    │  auto-draft         │  → generateAIDraft() (existing, unchanged)
    │  model-suggest      │  → query model registry
    │  file-parse         │  → Papa Parse + SheetJS
    │  schedule-draft     │  → auto_draft_schedules table + BullMQ
    └─────────────────────┘
```

All new internal endpoints follow the existing pattern: Express routes at `/api/internal/tools/{slug}`, authenticated via X-Service-Token, JSON request/response.

## 3. Implementation Sections

### Section 1: Feature Flag and Shared Infrastructure

**Goal:** Set up the feature flag, shared types, and request validation that all subsequent sections depend on.

**Feature flag:** `ENABLE_CONTENT_AUTOMATION` environment variable. Check at application startup and inject into a middleware that returns 503 for all `/api/internal/tools/auto-draft`, `/api/internal/tools/model-suggest`, `/api/internal/tools/file-parse`, `/api/internal/tools/schedule-draft` routes when disabled.

**Feature flag client exposure:** Create a tRPC procedure (e.g., `featureFlags.getContentAutomation`) or use the existing `getFeatureFlag` pattern (seen in `agencyStreamProxy.ts`) to expose the flag to the React frontend. The UI toggle in AIDraftModal depends on this.

**Shared Zod schemas** (in a new file under `apps/web/shared/`):
- `AutoDraftRequestSchema` — topic, skill slugs, generation options, canvas preset, tracing
- `AutoDraftResponseSchema` — success, deck_id, slide_count, credits_used, warnings
- `ModelSuggestRequestSchema` / `ModelSuggestResponseSchema`
- `FileParseRequestSchema` / `FileParseResponseSchema`
- `ScheduleDraftRequestSchema` / `ScheduleDraftResponseSchema`
- `InputItemSchema` — topic, custom_article_text, params, attachments

**Canvas preset mapping** (reuse from AIDraftModal.tsx):
```
"16:9"  → canvasWidth=1920, canvasHeight=1080
"4:3"   → canvasWidth=1440, canvasHeight=1080
"1:1"   → canvasWidth=1080, canvasHeight=1080
"9:16"  → canvasWidth=1080, canvasHeight=1920
```

**Rate limiting setup:** Redis keys and Lua scripts for:
- Per-user auto-draft rate: `rate:auto_draft:{userId}` (INCR+EXPIRE, TTL 3600s)
- Per-user concurrent semaphore: `rate:concurrent_draft:{userId}` (max 3)
- Per-user daily batch counter: `daily:batch:{userId}` (midnight reset)

**Files to create:**
- `apps/web/shared/contentAutomation/types.ts` — All Zod schemas and TypeScript types
- `apps/web/server/middleware/contentAutomationGate.ts` — Feature flag middleware

**Files to modify:**
- `apps/web/server/routers/presentation.ts` — Register new internal routes (just the router setup, handlers in dedicated files)

### Section 2: builtin-auto-draft Tool (Node.js Handler)

**Goal:** Create the HTTP endpoint that wraps `generateAIDraft()` for programmatic use by the Auto Draft Agent.

**Endpoint:** `POST /api/internal/tools/auto-draft`

**Handler logic:**
1. Validate request body against `AutoDraftRequestSchema`
2. Extract `userId` and `tenantId` from X-Service-Token payload
3. **Verify user is active:** Query `users` table for the userId. If user is deactivated or not found, return 403. This prevents zombie scheduled drafts from executing for deleted users.
4. Resolve `article_skill_slug` → database skill ID via `skillRegistry.getByIdOrType(slug)`. If not found, fall back to `general-article-writer` and add warning
5. Resolve `media_skill_slug` similarly
6. Resolve `image_model_id` via existing model registry functions
7. Map `canvas_preset` string → pixel dimensions (default: `"16:9"`)
8. **Mint a scoped internal JWT** — Use `signBearerToken` from `_core/tokens.ts` with explicit scope `["auto-draft:execute"]` and add `origin: "auto-draft-agent"` claim to the JWT payload. This follows the same pattern as `agencyStreamProxy.ts:117-118` which mints scoped tokens with `scopes: ["agency:run"]`. Short-lived (15 min). The origin claim allows credit deduction and audit logs to distinguish agent-initiated actions from real user sessions.
9. Construct `PresentationActor` from the user's DB record (query `users` table for full record including tenant context)
10. Create a new task record + deck + library item
11. **Acquire auto-draft lock:** Check the existing `ai_draft_lock:{userId}` Redis lock. Note: the existing lock enforces single-concurrent-draft-per-user. For auto-draft, use a different lock key pattern: `ai_draft_lock:auto:{userId}` so auto-draft and manual-draft don't block each other. The rate limiter semaphore (max 3 concurrent) applies across both.
12. Call `generateAIDraft(input, actor, jwt, taskId)` directly (blocking await)
13. **Post-completion data gathering** (since `generateAIDraft()` returns `void`):
    - Read Redis progress key `ai_draft_progress:{taskId}` for completion status and result data
    - Query the deck record from database to get `deck_id`, `slide_count`
    - Query `providerUsageLog` or `creditTransactions` filtered by `traceId` to sum `credits_used`
    - Read `result.warnings` from the progress JSON
14. Build and return `AutoDraftResponse`

**Important:** The handler MUST override `source` in the response regardless of what the agent sends — derive it from X-Service-Token context: `"agency_auto_draft:{agency_run_id}"` for agent calls.

**Observability:** Emit audit log events at key points: `auto_draft.started` (with userId, tenantId, topic), `auto_draft.completed` (with deck_id, credits_used, duration_ms), `auto_draft.failed` (with error_type, sanitized error). Use the existing `auditLogger` pattern.

**Timeout consideration:** This is a blocking call (30-180s for large decks). The internal HTTP client timeout must be generous (300s). The agent tool framework already handles this via medium-risk tool timeout. On timeout, the deck may be partially created; the existing `ai_draft_cancel:{taskId}` mechanism and Redis lock TTL (120s auto-expire) handle cleanup.

**File to create:** `apps/web/server/routers/autoDraftTool.ts`

### Section 3: builtin-model-suggest Tool (Node.js Handler)

**Goal:** Read-only endpoint for the agent to query available models and get recommendations.

**Endpoint:** `POST /api/internal/tools/model-suggest`

**Handler logic:**
1. Validate request against `ModelSuggestRequestSchema`
2. Query models via existing `getModelsByTypeAsync()` from `aiPresentationService.ts` — this already handles tenant-level model visibility and `isEnabled` flags
3. Filter by `purpose` (image/video/audio/text)
4. Rank by `quality` preference + cost tier
5. Return top recommendation + up to 3 alternatives
6. Expose `cost_tier` as categorical string ("low"/"medium"/"high"), NOT raw pricing

**File to create:** `apps/web/server/routers/modelSuggestTool.ts`

### Section 4: builtin-file-parse Tool (Node.js Handler)

**Goal:** Secure file parsing endpoint that converts CSV/Excel/Text files into `InputItem[]`.

**Endpoint:** `POST /api/internal/tools/file-parse`

**Handler logic:**
1. Validate request against `FileParseRequestSchema`
2. **MIME validation:** Fetch file from R2/S3 URL. Issue HEAD first for Content-Length check (reject > 5MB). Stream body with byte counter as second guard
3. **Magic byte detection:** ZIP (`PK\x03\x04`) → XLSX path, UTF-8 text → CSV path. Do NOT trust extension or Content-Type header
4. **CSV path (Papa Parse):**
   - `Papa.parse(data, { header: true, skipEmptyLines: true })`
   - Apply row limit (max 100)
   - Validate `topic_column` exists in headers
   - Sanitize each cell: strip control chars, strip leading `=+@-` formula markers, max 5000 chars
5. **XLSX path (SheetJS):**
   - `xlsx.read(buffer, { sheetRows: 101 })` to limit rows at library level
   - Post-read: check decompressed size < 50 MB (worker thread with memory limit)
   - Same cell sanitization as CSV
6. **TXT path:**
   - `per_line` mode: split by `\n`, each line → InputItem
   - `single` mode: entire file → one InputItem
7. Map parsed data to `InputItem[]` based on `parse_mode` and column mappings
8. Return `FileParseResponse`

**Security checklist:**
- URL validation: only allow project's R2/S3 host prefix and `/uploads/` paths
- Block `file://`, `gopher://`, `dict://`, `ftp://` schemes
- Formula injection defense on all cell values
- ZIP bomb guard (decompressed ratio check)
- Column name validation (no silent fallback)
- All file-derived content goes to `user` role when sent to LLM

**Batch processing semantics** (when file input has multiple rows):
- Process items sequentially (not parallel) to control cost and provide clear ordering
- Track per-item results: `{ topic, status: "success"|"failed", deck_id?, error? }`
- On individual item failure: log error, continue to next item (do not abort entire batch)
- Return `BatchResult` with `total`, `success_count`, `failed_count`, `items[]`, `credits_used_total`
- Credits already consumed by successful items are NOT refundable
- Batch limited to 50 items per request, 100 per day per user

**File to create:** `apps/web/server/routers/fileParseTool.ts`

### Section 5: builtin-schedule-draft Tool (Node.js Handler + DB)

**Goal:** Endpoint for creating one-time or recurring auto-draft schedules.

**Endpoint:** `POST /api/internal/tools/schedule-draft`

**Database:** `auto_draft_schedules` table (Drizzle schema in `drizzle/schema.ts`):

```typescript
// Fields: id, tenantId, userId, topicTemplate, scheduleType, cronExpression,
// runAt, timezone, draftParams (JSON), notifyEmail, notifyWebhookUrl,
// webhookSecretEncrypted (for HMAC signing of outgoing webhooks),
// status, nextRun, lastRun, createdAt
```

**Handler logic:**
1. Validate request against `ScheduleDraftRequestSchema`
2. Validate `topic_template` placeholders: only `{{date}}` and `{{day_of_week}}` allowed
3. Validate `cron_expression`: port of `validateCronExpression` from `scheduledMessages.ts` with 1-hour minimum interval (stricter than chat-alert's 15-min)
4. SSRF validation on `notify_webhook_url` if provided
5. Check per-user schedule limit (max 10 active)
6. Insert into `auto_draft_schedules`
7. Compute `next_run` using croniter logic
8. Return `ScheduleDraftResponse` with `schedule_id`, `next_run`, `status`

**Scheduler integration:** The existing `scheduler.ts` uses Cloud Tasks (via `enqueueTask` from `./cloudTasks`) when `USE_CLOUD_TASKS` is configured. The schedule-draft integration MUST follow the same pattern:
- If `USE_CLOUD_TASKS` is true: create Cloud Tasks for due schedules
- If `USE_CLOUD_TASKS` is false: use BullMQ job dispatch (same as `scheduledMessages` fallback path)
- Either way: extend the existing 1-minute polling loop in `scheduler.ts` to also query `auto_draft_schedules WHERE status = 'active' AND next_run <= NOW()`
- For each due row: re-validate `draft_params` through Zod schema, substitute placeholders in `topic_template`, dispatch via the appropriate mechanism. Override `draft_params.source` to `"schedule:{schedule_id}"`.

**Database Safety:** Follow the Database Safety Protocol when adding the `auto_draft_schedules` table. Back up affected tables before running Drizzle migration.

**Critical:** `reference_image_urls` in `draft_params` must store stable R2/S3 object keys, NOT pre-signed URLs.

**Files to create:** `apps/web/server/routers/scheduleDraftTool.ts`
**Files to modify:** `apps/web/drizzle/schema.ts` (add `auto_draft_schedules` table), `apps/web/server/services/scheduler.ts` (extend to poll schedules)

### Section 6: Python Agent Registration and Tool Bridge

**Goal:** Register the 4 new builtin tools in the Python agency system so agents can discover and call them.

**Modifications to `agency_tools.py`:**
1. Add to `_BUILTIN_ENDPOINTS`:
   ```
   "builtin-auto-draft" → "/api/internal/tools/auto-draft"
   "builtin-model-suggest" → "/api/internal/tools/model-suggest"
   "builtin-file-parse" → "/api/internal/tools/file-parse"
   "builtin-schedule-draft" → "/api/internal/tools/schedule-draft"
   "builtin-skill-discovery" → "/api/internal/tools/skill-discovery"  (if not already registered by Spec 034)
   ```
2. Add to `_BUILTIN_RISK_LEVELS`:
   ```
   "builtin-auto-draft" → "medium"
   "builtin-model-suggest" → "low"
   "builtin-file-parse" → "medium"
   "builtin-schedule-draft" → "high"
   "builtin-skill-discovery" → "low"  (if not already registered)
   ```
3. Create Pydantic request/response models for Python callers:
   - `AutoDraftRequest`, `AutoDraftResponse`
   - `ModelSuggestRequest`, `ModelSuggestResponse`
   - `FileParseRequest`, `FileParseResponse`
   - `ScheduleDraftRequest`, `ScheduleDraftResponse`

**File to modify:** `python-backend/app/services/agency_tools.py`
**File to create:** `python-backend/app/schemas/content_automation.py` (Pydantic models)

### Section 7: Auto Draft Agent Template (Seed Data)

**Goal:** Create the Auto Draft Agent template that users can instantiate.

**Agent seed data** (to be inserted during migration or startup sync):
- `name`: "Auto Draft Agent"
- `description`: "สร้าง presentation อัตโนมัติจาก brief เดียว"
- `visibility`: "template"
- `tenantId`: "__system__"
- `status`: "active"
- `instructions`: The 7-step decision process from spec §7.3 (analyze brief → select skill → select media → select style → fill params → generate → envelope output)

**Agent tools assignment:** `builtin-skill-discovery`, `builtin-model-suggest`, `builtin-auto-draft`, `builtin-rag-knowledge`, `builtin-file-parse`

**Decision tables** embedded in agent instructions:
- Domain → preferred article skill mapping (business, marketing, education, tech, creative, health, lifestyle, product review)
- Domain → default style preset mapping (corporate-blue, warm-sunset, light-minimalist, etc.)
- Topic complexity → slide count inference (5-15 range)
- Product review routing: fashion/beauty/household → appropriate reviewer skill

**Important:** The agent must NEVER ask the user follow-up questions if it can make a reasonable default decision. Use defaults aggressively.

**Idempotent upsert:** Use an upsert keyed on a stable slug identifier (`slug: "auto-draft-agent"`), not a plain insert. This allows updating agent instructions (e.g., adding new decision tables) without creating duplicate records. If the agent template already exists, update its instructions but preserve user-customized settings.

**Files to create:** `python-backend/app/seeds/auto_draft_agent.py` (seed script with upsert logic)
**Alternative:** Add agent template definition to existing seed/migration system

### Section 8: builtin-skill-discovery Stub

**Goal:** Since Spec 034's `builtin-skill-discovery` is not yet implemented, create a simplified version that the Auto Draft Agent can use.

**Endpoint:** `POST /api/internal/tools/skill-discovery` (if not already registered in agency_tools.py)

**Simplified implementation:**
1. Accept query with `category` filter and `description` text
2. Query `skillRegistry.getSkillsByType(type)` for matching skills
3. Score skills by keyword overlap between query description and skill name/description/tags
4. Return top 5 matches with confidence scores

This is a simplified version — the full implementation defined in Spec 034 may add vector search, embedding similarity, etc. Our stub should be backward-compatible with that API shape.

**File to create:** `apps/web/server/routers/skillDiscoveryTool.ts` (if not already exists from Spec 034 partial implementation)

### Section 9: AIDraftModal UI Changes

**Goal:** Add "Auto" mode toggle to the existing AIDraftModal for one-click automatic presentation generation.

**Changes to `AIDraftModal.tsx`:**
1. Add `autoMode` state toggle at the top of the modal
2. When `autoMode === true`:
   - Hide all option fields except: topic textarea, file upload area, image attachments
   - Change submit button text to "Auto Generate"
   - Add subtitle: "AI จะเลือก skill, model, style ให้อัตโนมัติ"
3. On submit in auto mode:
   - Instead of calling `generateDraft.mutate()`, call `agency.sendMessage()` targeting the Auto Draft Agent
   - Show progress from agency run (poll `agencyRun` status via existing TanStack Query hook)
   - On complete: extract `deck_id` from AgencyResultEnvelope → open in editor (same as manual mode)
4. Auto mode also accepts file uploads — when a file is attached, the agent calls `builtin-file-parse` to extract topics

**Graceful fallback:** If `ENABLE_CONTENT_AUTOMATION` is not set (checked via a tRPC query or config endpoint), hide the auto mode toggle entirely.

**File to modify:** `apps/web/client/src/components/presentation/AIDraftModal.tsx`

### Section 10: Database Schema for Level 3 (Design Only)

**Goal:** Define the database models for Content Automation Engine. These tables are created but NOT actively used until Phase 2.

**Tables to add (Drizzle ORM in `drizzle/schema.ts`):**

1. `content_specs` — Content Spec definitions with scheduling state, credit counters, failure tracking
2. `content_automation_runs` — Execution history for each scheduled run

**Key columns for `content_specs`:**
- `id`, `tenantId`, `userId`, `name`, `description`
- `specData` (JSON) — full YAML/JSON spec
- `status` — active/paused/archived
- `version`, `nextRun`, `lastRun`, `totalRuns`, `totalItemsCreated`
- `consecutiveFailures` — auto-pause after 3
- `webhookSecretEncrypted` — HMAC secret for webhook signing
- `dailyCreditLimit`, `monthlyCreditLimit`, `creditsUsedToday`, `creditsUsedMonth`

**Key columns for `content_automation_runs`:**
- `id`, `specId` (FK → content_specs), `tenantId`, `scheduleItemIndex`
- `status` — pending/running/completed/failed/export_failed
- `topicsResolved` (JSON), `itemsRequested`, `itemsCompleted`, `itemsFailed`
- `outputArtifacts` (JSON), `exportUrls` (JSON), `itemErrors` (JSON)
- `creditsUsed`, `startedAt`, `completedAt`, `errorMessage`

**Indexes:** Composite index on `(status, next_run)` for scheduler hot path, tenant index for isolation, created_at index for cleanup.

**Important:** Run Drizzle migration to create these tables, but no application code references them yet. This ensures the schema is ready for Phase 2 without risking production issues.

**Database Safety:** Follow the Database Safety Protocol. Back up all affected tables before running Drizzle migration. Verify row counts after migration. These are new tables (ADD TABLE) so risk is low, but verify the migration does not alter any existing tables.

**Multi-tenancy:** All queries against these tables MUST filter by `tenantId`. This is a hard constraint for data isolation.

**File to modify:** `apps/web/drizzle/schema.ts`

### Section 11: Integration Tests and Security Validation

**Goal:** Comprehensive test coverage for all new endpoints and the agent flow.

**Vitest tests (Node.js):**
1. `autoDraftTool.test.ts` — Request validation, skill slug resolution, canvas preset mapping, synthetic JWT minting, feature flag gate, rate limiting
2. `modelSuggestTool.test.ts` — Purpose filtering, cost tier categorization, empty model list handling
3. `fileParseTool.test.ts` — CSV parsing with Papa Parse, XLSX with SheetJS, formula injection stripping, file size limits, magic byte detection, column validation, SSRF URL validation
4. `scheduleDraftTool.test.ts` — Cron validation (1-hour minimum), placeholder validation, per-user schedule limit, SSRF webhook validation
5. `skillDiscoveryTool.test.ts` — Keyword matching, category filtering, confidence scoring

**pytest tests (Python):**
1. `test_agency_tools_registration.py` — Verify 4 new tools registered correctly with endpoints and risk levels
2. `test_content_automation_schemas.py` — Pydantic model validation for all request/response types
3. `test_auto_draft_agent_template.py` — Agent seed data validation, tool assignment

**Security-specific tests:**
- Formula injection: verify `=CMD()`, `+cmd`, `-cmd`, `@cmd` are stripped from parsed cells
- SSRF: verify private IP/localhost rejection for webhook URLs
- File size: verify 5MB limit enforcement
- Row limit: verify 100 row max
- Placeholder injection: verify only `{{date}}` and `{{day_of_week}}` accepted
- Feature flag: verify 503 when disabled

**Coverage target:** 80% minimum for new code in both JS and Python.

## 4. Dependency Graph

```
Section 1 (shared types + feature flag)
    │
    ├── Section 2 (auto-draft handler)
    │       │
    ├── Section 3 (model-suggest handler)
    │       │
    ├── Section 4 (file-parse handler)
    │       │
    ├── Section 5 (schedule-draft handler + DB)
    │       │
    │   Section 6 (Python tool registration) ← depends on §1-5 being defined
    │       │
    │   Section 7 (agent template) ← depends on §6 + §8
    │       │
    ├── Section 8 (skill-discovery stub) ← can be parallel with §2-5
    │       │
    │   Section 9 (UI changes) ← depends on §2 + §7
    │
    Section 10 (L3 schema design) ← independent, parallel
    │
    Section 11 (tests) ← depends on all above
```

**Parallelizable:** Sections 2, 3, 4, 5, 8, 10 can be implemented in parallel (different files, no dependencies on each other). Section 6 needs the endpoint contracts from §2-5. Section 7 needs §6 and §8. Section 9 needs §2 and §7. Section 11 is last.

## 5. Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Synthetic PresentationActor fails credit deduction | High — pipeline silently skips credits or throws | Test JWT minting end-to-end; verify `deductCreditsForModel` works with synthetic actor |
| `builtin-skill-discovery` dependency gap | Medium — agent can't auto-select skills | Section 8 provides a stub; ensure API contract matches Spec 034's planned interface |
| `generateAIDraft()` timeout for large decks | Medium — agent hangs | 300s timeout on HTTP client; agent tool framework already handles medium-risk tool timeout |
| File parsing ZIP bomb | High — server OOM | SheetJS `sheetRows` limit, worker thread with memory cap, decompressed size check |
| Formula injection in parsed files | Medium — potential XSS if re-exported | Strip `=+@-` prefixes; all parsed content placed in user role for LLM |
| BullMQ scheduler for `auto_draft_schedules` | Low — proven pattern from `scheduledMessages` | Follow existing implementation pattern exactly |

## 6. Conventions to Follow

Based on codebase research:
- **Node.js**: Express routes, Zod validation, path aliases (`@/`, `@shared/`), 80-char Prettier
- **Python**: Pydantic v2 models, `_run_async()` helper for Celery tasks, pytest with markers
- **Testing**: Vitest for JS, pytest for Python, 80% coverage minimum
- **Auth**: X-Service-Token for internal endpoints, JWT for user context
- **Caching**: Redis with TTL, structured key patterns
- **Logging**: Structured logger with JSON extra, sanitize all error messages
- **DB**: Drizzle ORM with `pgTable`, camelCase columns, always run migrations immediately
