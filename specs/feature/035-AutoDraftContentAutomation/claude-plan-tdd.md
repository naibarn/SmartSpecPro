# TDD Plan: Auto Draft & Content Automation Engine (Spec 035)

This document mirrors `claude-plan.md` and defines what tests to write BEFORE implementing each section.

**Testing frameworks:**
- Node.js: Vitest (`import { describe, it, expect, vi } from "vitest"`)
- Python: pytest with `@pytest.mark.asyncio`, `@pytest.mark.unit`
- Coverage: 80% minimum for both

---

## Section 1: Feature Flag and Shared Infrastructure

**File:** `apps/web/server/middleware/contentAutomationGate.test.ts`

```
# Test: middleware returns 503 when ENABLE_CONTENT_AUTOMATION is unset
# Test: middleware returns 503 when ENABLE_CONTENT_AUTOMATION is "false"
# Test: middleware calls next() when ENABLE_CONTENT_AUTOMATION is "true"
# Test: middleware is applied to all 4 internal tool routes
```

**File:** `apps/web/shared/contentAutomation/types.test.ts`

```
# Test: AutoDraftRequestSchema validates valid request
# Test: AutoDraftRequestSchema rejects missing topic
# Test: AutoDraftRequestSchema rejects topic shorter than 3 chars
# Test: AutoDraftRequestSchema rejects topic longer than 1000 chars
# Test: AutoDraftRequestSchema rejects invalid canvas_preset values
# Test: AutoDraftRequestSchema accepts all valid canvas_preset values ("16:9", "4:3", "1:1", "9:16")
# Test: AutoDraftRequestSchema rejects num_slides < 1 or > 30
# Test: AutoDraftRequestSchema rejects invalid language values
# Test: ModelSuggestRequestSchema validates purpose enum
# Test: FileParseRequestSchema validates file_type enum
# Test: ScheduleDraftRequestSchema validates cron_expression format
# Test: InputItemSchema validates topic is non-empty string
```

**File:** `apps/web/server/services/contentAutomationRateLimit.test.ts`

```
# Test: rate limiter allows first request within limit
# Test: rate limiter blocks request exceeding 10/hour for interactive
# Test: rate limiter blocks request exceeding 50/hour for batch
# Test: concurrent semaphore allows up to 3 simultaneous drafts
# Test: concurrent semaphore blocks 4th concurrent draft
# Test: daily batch counter resets at midnight
# Test: daily batch counter blocks after 100 items
```

---

## Section 2: builtin-auto-draft Tool

**File:** `apps/web/server/routers/autoDraftTool.test.ts`

```
# Test: returns 503 when feature flag is disabled
# Test: returns 401 when X-Service-Token is missing
# Test: returns 400 when request body is invalid (missing topic)
# Test: resolves article_skill_slug to database skill ID
# Test: falls back to general-article-writer when slug not found, adds warning
# Test: resolves media_skill_slug to database skill ID
# Test: maps canvas_preset "16:9" to canvasWidth=1920, canvasHeight=1080
# Test: maps canvas_preset "9:16" to canvasWidth=1080, canvasHeight=1920
# Test: rejects unknown canvas_preset with 400
# Test: mints scoped JWT with origin claim "auto-draft-agent"
# Test: minted JWT has scope ["auto-draft:execute"]
# Test: minted JWT expires in 15 minutes
# Test: returns 403 when user is deactivated
# Test: returns 403 when user not found
# Test: overrides source field regardless of request input
# Test: post-completion reads Redis progress key for result data
# Test: post-completion queries deck record for deck_id and slide_count
# Test: returns AutoDraftResponse with correct deck_id, slide_count, credits_used
# Test: emits audit log event auto_draft.started
# Test: emits audit log event auto_draft.completed on success
# Test: emits audit log event auto_draft.failed on error
# Test: rate limit enforced (returns 429 when exceeded)
```

---

## Section 3: builtin-model-suggest Tool

**File:** `apps/web/server/routers/modelSuggestTool.test.ts`

```
# Test: returns 503 when feature flag is disabled
# Test: returns 400 when purpose is not one of image/video/audio/text
# Test: filters models by purpose
# Test: returns recommended model with cost_tier as categorical string
# Test: returns up to 3 alternatives
# Test: returns empty alternatives when only 1 model available
# Test: does NOT expose raw pricing (no cost_per_unit field in response)
# Test: respects tenant-level model visibility
# Test: handles empty model list gracefully
```

---

## Section 4: builtin-file-parse Tool

**File:** `apps/web/server/routers/fileParseTool.test.ts`

```
# Test: returns 503 when feature flag is disabled
# Test: rejects file URL with file:// scheme
# Test: rejects file URL with gopher:// scheme
# Test: rejects file URL pointing to private IP
# Test: rejects file URL pointing to localhost
# Test: allows file URL from R2/S3 host prefix
# Test: allows file URL from /uploads/ path
# Test: rejects file larger than 5MB (via HEAD Content-Length)
# Test: rejects file larger than 5MB (via streaming byte counter when no Content-Length)
# Test: detects XLSX by ZIP magic bytes (PK\x03\x04)
# Test: detects CSV by UTF-8 text content
# Test: rejects binary file with neither ZIP nor UTF-8 signature

# CSV parsing tests:
# Test: parses CSV with topic_column and returns InputItem[]
# Test: rejects CSV when topic_column does not match any header
# Test: limits CSV to 100 data rows
# Test: strips formula prefix = from cell values
# Test: strips formula prefix + from cell values
# Test: strips formula prefix - from cell values
# Test: strips formula prefix @ from cell values
# Test: strips control characters from cell values
# Test: truncates cell values exceeding 5000 chars
# Test: skips empty rows

# XLSX parsing tests:
# Test: parses XLSX first sheet with topic_column
# Test: limits XLSX to 100 data rows (sheetRows: 101)
# Test: applies same cell sanitization as CSV
# Test: rejects XLSX with decompressed size > 50MB (zip bomb guard)

# TXT parsing tests:
# Test: per_line mode splits file by newline, each line → InputItem
# Test: single mode uses entire file as one InputItem topic
# Test: strips empty lines in per_line mode

# Batch result tests:
# Test: returns FileParseResponse with correct total_rows and parsed_rows
# Test: includes warnings for skipped rows
# Test: params_columns maps additional columns correctly
```

---

## Section 5: builtin-schedule-draft Tool

**File:** `apps/web/server/routers/scheduleDraftTool.test.ts`

```
# Test: returns 503 when feature flag is disabled
# Test: validates cron_expression rejects intervals < 1 hour
# Test: validates cron_expression accepts hourly patterns
# Test: validates cron_expression rejects every-minute pattern
# Test: validates topic_template rejects unsupported placeholders
# Test: validates topic_template accepts {{date}} placeholder
# Test: validates topic_template accepts {{day_of_week}} placeholder
# Test: rejects webhook URL with private IP (SSRF validation)
# Test: rejects webhook URL with localhost
# Test: blocks creation when user already has 10 active schedules
# Test: creates auto_draft_schedules record with correct fields
# Test: computes next_run correctly for recurring schedules
# Test: sets status to "completed" after one-time schedule runs
# Test: generates webhookSecretEncrypted when webhook URL provided
# Test: returns ScheduleDraftResponse with schedule_id and next_run
```

**File:** `apps/web/server/services/scheduler.test.ts` (extend existing)

```
# Test: scheduler polls auto_draft_schedules for due records
# Test: scheduler re-validates draft_params through Zod before dispatch
# Test: scheduler substitutes {{date}} in topic_template
# Test: scheduler substitutes {{day_of_week}} in topic_template
# Test: scheduler overrides draft_params.source to "schedule:{id}"
# Test: scheduler advances next_run after dispatch
# Test: scheduler uses reference_image_urls as R2 object keys, not pre-signed URLs
```

---

## Section 6: Python Agent Registration

**File:** `python-backend/tests/unit/test_agency_tools_registration.py` (extend existing)

```
# Test: builtin-auto-draft registered in _BUILTIN_ENDPOINTS with correct path
# Test: builtin-model-suggest registered in _BUILTIN_ENDPOINTS with correct path
# Test: builtin-file-parse registered in _BUILTIN_ENDPOINTS with correct path
# Test: builtin-schedule-draft registered in _BUILTIN_ENDPOINTS with correct path
# Test: builtin-auto-draft risk level is "medium"
# Test: builtin-model-suggest risk level is "low"
# Test: builtin-file-parse risk level is "medium"
# Test: builtin-schedule-draft risk level is "high"
```

**File:** `python-backend/tests/unit/test_content_automation_schemas.py`

```
# Test: AutoDraftRequest validates topic min_length=3
# Test: AutoDraftRequest validates topic max_length=1000
# Test: AutoDraftRequest validates num_slides range 1-30
# Test: AutoDraftRequest validates reference_image_urls max_length=5
# Test: ModelSuggestRequest validates purpose enum
# Test: FileParseRequest validates file_type enum
# Test: FileParseRequest validates max_rows default and range
# Test: ScheduleDraftRequest validates cron minimum 1-hour interval
# Test: ScheduleDraftRequest validates topic_template placeholders
# Test: ScheduleDraftRequest rejects unsupported placeholders
```

---

## Section 7: Auto Draft Agent Template

**File:** `python-backend/tests/unit/test_auto_draft_agent_template.py`

```
# Test: agent seed data has correct name "Auto Draft Agent"
# Test: agent seed data has visibility "template"
# Test: agent seed data has tenantId "__system__"
# Test: agent seed data assigns all 5 required tools
# Test: agent instructions contain 7-step decision process keywords
# Test: upsert is idempotent (running twice produces same result)
# Test: upsert updates instructions without creating duplicate records
```

---

## Section 8: builtin-skill-discovery Stub

**File:** `apps/web/server/routers/skillDiscoveryTool.test.ts`

```
# Test: returns matching skills for category filter
# Test: returns skills ranked by keyword overlap with description
# Test: returns max 5 results
# Test: returns confidence scores for each match
# Test: handles empty query gracefully
# Test: handles no matching skills gracefully
# Test: filters by tenant visibility
# Test: API shape matches expected Spec 034 contract
```

---

## Section 9: AIDraftModal UI Changes

**File:** `apps/web/client/src/components/presentation/AIDraftModal.test.tsx`

```
# Test: auto mode toggle renders when feature flag is enabled
# Test: auto mode toggle hidden when feature flag is disabled
# Test: toggling auto mode hides option fields except topic + file upload
# Test: toggling auto mode shows "Auto Generate" button
# Test: submit in auto mode calls agency.sendMessage (not generateDraft.mutate)
# Test: progress display shows during agency run
# Test: completion opens editor with correct deck_id
# Test: file attachment in auto mode is supported
```

---

## Section 10: Database Schema for Level 3

**File:** `apps/web/server/routers/contentAutomationSchema.test.ts`

```
# Test: content_specs table created with all required columns
# Test: content_automation_runs table created with FK to content_specs
# Test: content_specs has composite index on (status, next_run)
# Test: content_automation_runs has index on created_at
# Test: migration does not alter existing tables
# Test: new tables support tenant isolation (tenantId column + index)
```

---

## Section 11: Integration Tests and Security

**File:** `apps/web/server/routers/autoDraftTool.integration.test.ts`

```
# Test: end-to-end auto-draft flow with mocked LLM and media APIs
# Test: credit deduction works with scoped JWT
# Test: audit trail includes origin "auto-draft-agent"
```

**File:** `apps/web/server/routers/fileParseTool.security.test.ts`

```
# Test: formula injection vectors are neutralized (=CMD, +CMD, -CMD, @CMD)
# Test: SSRF vectors are blocked (private IPs, localhost, non-HTTP schemes)
# Test: file size limit enforced for both small and large files
# Test: row limit enforced for both CSV and XLSX
# Test: ZIP bomb detection works (high compression ratio)
```

**File:** `apps/web/server/routers/scheduleDraftTool.security.test.ts`

```
# Test: webhook SSRF validation blocks private endpoints
# Test: cron expression validation blocks sub-hourly intervals
# Test: per-user schedule limit enforced
# Test: placeholder injection blocked (only date/day_of_week allowed)
```
