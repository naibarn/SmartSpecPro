# Synthesized Specification: Auto Draft & Content Automation Engine (Spec 035)

## 1. Overview

Transform "Draft with AI" from a 13+ option manual selection process into a fully automatic system. Users provide a single brief, and the system selects skill, model, style, and generates a complete presentation automatically. Extend this into a Content Automation Engine for batch production on schedule.

**Implementation Scope (Phase 1)**: Levels 1 + 2 only. Level 3 (Content Automation Engine) deferred to Phase 2 after adoption validation.

## 2. Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Phasing | L1+L2 first | Validate adoption before building L3 scheduler |
| Feature flag | Single `ENABLE_CONTENT_AUTOMATION` | Gates all levels uniformly |
| Cross-service | Python → HTTP → Node.js | Spec-recommended; keeps pipeline logic centralized in Node.js |
| File parsing | Papa Parse + SheetJS (server-side) | Specified libraries; both have npm server support |
| Chat intent detection | LLM-based (agent instructions) | Natural language, supports Thai + English |
| Scale target | 1-10 concurrent, <50 specs | Small scale, single server |
| Dashboard | New standalone page /content-automation | Phase 2, decoupled from existing views |

## 3. Dependencies on Spec 034

| Component | Status | Action for 035 |
|-----------|--------|---------------|
| AgencyResultEnvelope | ✅ Done | Use as-is for agent output wrapping |
| ResultRouter | ✅ Done | Extend with `auto_draft` routing rule |
| builtin-skill-discovery | ❌ Pending | Must implement or stub — critical for agent skill selection |
| builtin-presentation-create | ❌ Pending | NOT needed by 035 (uses generateAIDraft instead) |
| X-Service-Token auth | ✅ Done | Reuse for all new internal endpoints |

**Key Risk**: `builtin-skill-discovery` must exist for the Auto Draft Agent to select skills. If not implemented by the time 035 starts, need a simplified version that queries skillRegistry.

## 4. Level 1: Auto Draft Agent

### 4.1 New Builtin Tools

**`builtin-auto-draft`** (risk: `medium`):
- POST `/api/internal/tools/auto-draft`
- Wraps `generateAIDraft()` pipeline
- Constructs synthetic `PresentationActor` from X-Service-Token payload
- **Critical**: Must mint a short-lived internal JWT for credit deduction to work with the pipeline's existing credit flow (the pipeline calls `deductCreditsForModel` which requires a valid user JWT)
- Response includes `deck_id`, `slide_count`, `credits_used`, `editor_url`

**`builtin-model-suggest`** (risk: `low`):
- POST `/api/internal/tools/model-suggest`
- Read-only: queries available models, returns recommendation + alternatives
- Exposes `cost_tier` (categorical), NOT raw pricing

### 4.2 Credit Tracking Design

**Problem identified in interview**: The `generateAIDraft()` pipeline expects a real user session (via `PresentationActor` + `userToken`). When called programmatically from the agent, there's no browser session.

**Solution**: The auto-draft handler must:
1. Extract `userId` and `tenantId` from X-Service-Token payload
2. Mint a short-lived (15 min) internal JWT using `JWT_SECRET` (same pattern as `presentation.ts`)
3. Construct a `PresentationActor` with the user's actual DB record (verify credit balance)
4. Pass this actor + JWT to `generateAIDraft()`

This ensures the pipeline's credit deduction path works identically to manual mode.

### 4.3 Auto Draft Agent Template

- Registered in `agencies` table with `visibility: "template"`, `tenantId: "__system__"`
- Assigned tools: `builtin-skill-discovery`, `builtin-model-suggest`, `builtin-auto-draft`, `builtin-rag-knowledge`, `builtin-file-parse`
- Agent instructions define 7-step decision process (analyze brief → select skill → select media → select style → fill params → generate → envelope output)

### 4.4 UI Integration

**AIDraftModal.tsx** changes:
- Add `autoMode` toggle at top of modal
- When auto mode: hide all options except topic textarea + file upload + attachments
- Button changes to "Auto Generate"
- On click: calls agency chat with Auto Draft Agent instead of `generateDraft.mutate()`
- Progress shown from agency run polling

## 5. Level 2: Multi-Source Input

### 5.1 File Upload (builtin-file-parse)

**`builtin-file-parse`** (risk: `medium`):
- POST `/api/internal/tools/file-parse`
- Supports CSV (Papa Parse), XLSX (SheetJS), TXT
- Parse modes: `single`, `per_row`, `per_line`
- Returns `InputItem[]` array

**Security constraints**:
- 5 MB file size limit (HEAD check + streaming byte counter)
- 100 rows max (SheetJS `sheetRows: 101`)
- Magic byte validation: ZIP for XLSX (`PK\x03\x04`), UTF-8 for CSV
- Formula injection: strip leading `=`, `+`, `-`, `@`
- Cell values max 5000 chars, strip HTML/script tags
- ZIP bomb guard: abort if decompressed XML > 50 MB
- Column validation: `topic_column` must match actual header

### 5.2 Chat Commands (LLM-based)

Agent instructions handle natural language parsing:
- Immediate: "สร้าง slide เรื่อง X" → direct auto-draft
- Scheduled: "พรุ่งนี้ 8 โมง สร้าง slide เรื่อง X" → `builtin-schedule-draft`
- Recurring: "ทุกวัน สร้าง slide รีวิว" → `builtin-schedule-draft` with cron

**Disambiguation with chat-alert skill**: Auto Draft Agent handles only content-creation keywords. `chat-alert` handles reminders/alerts.

### 5.3 Schedule Draft (builtin-schedule-draft)

**`builtin-schedule-draft`** (risk: `high`):
- POST `/api/internal/tools/schedule-draft`
- Creates `auto_draft_schedules` record
- Supports `once` and `recurring` types
- Cron validation: 1-hour minimum interval
- Topic template placeholders: `{{date}}`, `{{day_of_week}}` only
- SSRF validation on webhook URLs

**Execution**: Node.js `scheduler.ts` reads `auto_draft_schedules` on 1-minute interval, dispatches BullMQ job for due items.

### 5.4 Batch Execution (File Input)

When file input has multiple rows:
- Celery task group processes items
- Max 3 concurrent auto-drafts per user
- Max 50 items per request, 100 per day per user
- Returns `BatchResult` with per-item success/failure

## 6. Level 3: Content Automation Engine (Phase 2 — Design Only)

Level 3 is **deferred to Phase 2** but the database schema and API contracts should be designed now for forward compatibility.

Key components (design only, not implemented in Phase 1):
- `content_specs` table with scheduling state, credit counters, failure tracking
- `content_automation_runs` table for execution history
- `ContentAutomationScheduler` (Celery beat, 1-min tick)
- `ContentSpecValidator` for YAML/JSON spec validation
- `InputResolver` for topic source resolution (rotating_list, ai_generated, file)
- Notification system (email, webhook with HMAC)
- Content Automation Dashboard page

## 7. Security Requirements

### 7.1 Rate Limits
| Control | Limit |
|---------|-------|
| Auto Draft per user | 10/hour (interactive), 50/hour (batch) |
| Batch items per request | Max 50 |
| Batch items per day | Max 100 per user |
| Concurrent auto-drafts | Max 3 per user (Redis semaphore) |
| Content Spec schedules | Max 10 active per user |
| File upload | 5 MB, 100 rows |
| Cron minimum | 1 hour |

### 7.2 Authentication
- All new internal endpoints guarded by X-Service-Token
- Feature flag: `ENABLE_CONTENT_AUTOMATION` must be `true`
- Tenant isolation enforced in all queries

### 7.3 Prompt Injection Prevention
- All user-supplied content (topics, file data) placed in `HumanMessage`/`user` role
- Never interpolated into system prompts
- Constraint values validated against allowlists before LLM use

## 8. Key Files to Create/Modify

### New Files (Node.js)
- `apps/web/server/routers/autoDraftTool.ts` — `/api/internal/tools/auto-draft` handler
- `apps/web/server/routers/modelSuggestTool.ts` — `/api/internal/tools/model-suggest` handler
- `apps/web/server/routers/fileParseTool.ts` — `/api/internal/tools/file-parse` handler
- `apps/web/server/routers/scheduleDraftTool.ts` — `/api/internal/tools/schedule-draft` handler

### New Files (Python)
- `python-backend/app/models/content_automation.py` — SQLAlchemy models (design for Phase 2)
- `python-backend/app/tasks/content_automation_tasks.py` — Celery tasks (Phase 2)

### Modified Files
- `python-backend/app/services/agency_tools.py` — Register 4 new builtin tools
- `apps/web/client/src/components/presentation/AIDraftModal.tsx` — Add auto mode toggle
- `apps/web/server/services/skillRegistry.ts` — Add `getBySlug()` if not present
- `apps/web/server/routers/presentation.ts` — Register new internal routes
- `python-backend/app/core/celery_app.py` — Add content_automation queue + beat entries (Phase 2)

### Existing Files (Reference Only)
- `apps/web/server/services/aiPresentationService.ts` — `generateAIDraft()` (NO changes)
- `apps/web/shared/presentation/aiTypes.ts` — Types (NO changes)
- `apps/web/server/services/emailService.ts` — Email (extend with new templates)

## 9. Testing Strategy

- **Extend existing tests**: `agency_tools` tests for new tool registration
- **New Vitest tests**: auto-draft handler, model-suggest handler, file-parse handler
- **New pytest tests**: agent template validation, schedule-draft Celery task
- **Integration tests**: end-to-end auto-draft flow (mock LLM + media APIs)
- **Security tests**: SSRF validation, formula injection, file size limits
- **Coverage target**: 80% minimum (both JS and Python)
