<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-shared-infra
section-02-auto-draft-tool
section-03-model-suggest-tool
section-04-file-parse-tool
section-05-schedule-draft-tool
section-06-python-registration
section-07-agent-template
section-08-skill-discovery-stub
section-09-ui-changes
section-10-l3-schema
section-11-integration-tests
END_MANIFEST -->

# Implementation Sections Index — Spec 035: Auto Draft & Content Automation Engine

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---------|------------|--------|----------------|
| section-01-shared-infra | - | 02, 03, 04, 05, 08, 09 | Yes (first) |
| section-02-auto-draft-tool | 01 | 06, 07, 09, 11 | Yes (with 03, 04, 05, 08, 10) |
| section-03-model-suggest-tool | 01 | 06, 11 | Yes (with 02, 04, 05, 08, 10) |
| section-04-file-parse-tool | 01 | 06, 11 | Yes (with 02, 03, 05, 08, 10) |
| section-05-schedule-draft-tool | 01 | 06, 11 | Yes (with 02, 03, 04, 08, 10) |
| section-06-python-registration | 02, 03, 04, 05 | 07 | No |
| section-07-agent-template | 06, 08 | 09 | No |
| section-08-skill-discovery-stub | 01 | 07, 11 | Yes (with 02, 03, 04, 05, 10) |
| section-09-ui-changes | 02, 07 | 11 | No |
| section-10-l3-schema | - | 11 | Yes (independent) |
| section-11-integration-tests | all above | - | No (last) |

## Execution Order

1. **Batch 1** (no dependencies): `section-01-shared-infra`, `section-10-l3-schema`
2. **Batch 2** (after 01): `section-02-auto-draft-tool`, `section-03-model-suggest-tool`, `section-04-file-parse-tool`, `section-05-schedule-draft-tool`, `section-08-skill-discovery-stub`
3. **Batch 3** (after 02-05): `section-06-python-registration`
4. **Batch 4** (after 06+08): `section-07-agent-template`
5. **Batch 5** (after 02+07): `section-09-ui-changes`
6. **Batch 6** (after all): `section-11-integration-tests`

## Section Summaries

### section-01-shared-infra
Feature flag middleware (`ENABLE_CONTENT_AUTOMATION`), shared Zod schemas for all request/response types, canvas preset mapping, Redis-based rate limiting setup, tRPC feature flag exposure.

**Files created:** `apps/web/shared/contentAutomation/types.ts`, `apps/web/server/middleware/contentAutomationGate.ts`
**Files modified:** `apps/web/server/routers/presentation.ts`
**Tests:** `contentAutomationGate.test.ts`, `types.test.ts`, `contentAutomationRateLimit.test.ts`
**Runtime:** TypeScript (Node.js)

### section-02-auto-draft-tool
Node.js HTTP handler at `POST /api/internal/tools/auto-draft` wrapping `generateAIDraft()`. Scoped JWT minting via `signBearerToken`, skill slug resolution, user verification, post-completion data gathering from Redis/DB, audit logging.

**Files created:** `apps/web/server/routers/autoDraftTool.ts`
**Tests:** `autoDraftTool.test.ts`
**Runtime:** TypeScript (Node.js)

### section-03-model-suggest-tool
Read-only handler at `POST /api/internal/tools/model-suggest`. Queries model registry, filters by purpose (image/video/audio/text), returns categorical cost_tier (not raw pricing), top recommendation + alternatives.

**Files created:** `apps/web/server/routers/modelSuggestTool.ts`
**Tests:** `modelSuggestTool.test.ts`
**Runtime:** TypeScript (Node.js)

### section-04-file-parse-tool
Secure file parsing at `POST /api/internal/tools/file-parse`. Papa Parse for CSV, SheetJS for XLSX, line splitting for TXT. Magic byte detection, formula injection sanitization, SSRF URL validation, ZIP bomb guard, 5MB/100-row limits.

**Files created:** `apps/web/server/routers/fileParseTool.ts`
**Tests:** `fileParseTool.test.ts`
**Runtime:** TypeScript (Node.js)

### section-05-schedule-draft-tool
Schedule creation handler at `POST /api/internal/tools/schedule-draft`. Drizzle `auto_draft_schedules` table, cron validation (1-hour minimum), topic template placeholders, SSRF webhook validation, HMAC secret generation. Scheduler integration following existing Cloud Tasks/BullMQ pattern.

**Files created:** `apps/web/server/routers/scheduleDraftTool.ts`
**Files modified:** `apps/web/drizzle/schema.ts`, `apps/web/server/services/scheduler.ts`
**Tests:** `scheduleDraftTool.test.ts`, `scheduler.test.ts` (extend)
**Runtime:** TypeScript (Node.js)

### section-06-python-registration
Register 4 new builtin tools in `_BUILTIN_ENDPOINTS` and `_BUILTIN_RISK_LEVELS` dicts. Create Pydantic request/response models for Python callers.

**Files modified:** `python-backend/app/services/agency_tools.py`
**Files created:** `python-backend/app/schemas/content_automation.py`
**Tests:** `test_agency_tools_registration.py` (extend), `test_content_automation_schemas.py`
**Runtime:** Python (pytest)

### section-07-agent-template
Auto Draft Agent seed data with idempotent upsert keyed on slug. 7-step decision process instructions, domain-to-skill mapping tables, 5 tool assignments. Visibility "template", tenantId "__system__".

**Files created:** `python-backend/app/seeds/auto_draft_agent.py`
**Tests:** `test_auto_draft_agent_template.py`
**Runtime:** Python (pytest)

### section-08-skill-discovery-stub
Simplified `builtin-skill-discovery` stub at `POST /api/internal/tools/skill-discovery`. Category filtering, keyword overlap scoring, top 5 results with confidence. API shape compatible with Spec 034 planned interface.

**Files created:** `apps/web/server/routers/skillDiscoveryTool.ts`
**Tests:** `skillDiscoveryTool.test.ts`
**Runtime:** TypeScript (Node.js)

### section-09-ui-changes
Auto mode toggle in `AIDraftModal.tsx`. When enabled: hides option fields except topic + file upload, shows "Auto Generate" button, calls `agency.sendMessage()` instead of `generateDraft.mutate()`, shows agency run progress. Feature flag gating via tRPC query.

**Files modified:** `apps/web/client/src/components/presentation/AIDraftModal.tsx`
**Tests:** `AIDraftModal.test.tsx`
**Runtime:** TypeScript (React/Vitest)

### section-10-l3-schema
Database schema for Level 3 Content Automation Engine: `content_specs` and `content_automation_runs` tables. Composite indexes, tenant isolation, credit tracking columns. Tables created but not actively used until Phase 2.

**Files modified:** `apps/web/drizzle/schema.ts`
**Tests:** `contentAutomationSchema.test.ts`
**Runtime:** TypeScript (Drizzle ORM migration)

### section-11-integration-tests
End-to-end integration tests and security validation. Auto-draft flow with mocked LLM/media APIs, formula injection vectors, SSRF vectors, file size limits, cron validation, webhook SSRF, placeholder injection.

**Files created:** `autoDraftTool.integration.test.ts`, `fileParseTool.security.test.ts`, `scheduleDraftTool.security.test.ts`
**Runtime:** TypeScript (Vitest)

## Dual-Runtime Note

This spec spans TypeScript (Node.js) and Python. Sections 1-5, 8-11 are TypeScript (Vitest). Sections 6-7 are Python (pytest). The `test_command: pnpm test` in PROJECT_CONFIG covers the majority; Python sections use `cd python-backend && pytest` internally.
