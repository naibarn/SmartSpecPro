# SSP Reviewer Agent Memory

## Project Conventions (confirmed)

- tRPC routers: `apps/web/server/routers/library.ts` — library feature router
- Library service: `apps/web/server/services/libraryService.ts`
- Zod schemas inline in router `.input()` — no separate schema file for library
- `fileBase64` is used for file uploads/replace — **no server-side size cap on `replaceFile`** (only `saveMarkdown` has a 5MB cap)
- Auth pattern: `protectedProcedure` enforces JWT; tenant isolation via `resolveLibraryTenantId`

## Recurring Patterns to Flag

- **No file size cap in `replaceFile` input schema** — `fileBase64: z.string().min(1)` with no `.max()`. Flag as HIGH in every review that touches file upload mutations.
- **AlertDialogAction onClick with `e.preventDefault()`** — Radix `AlertDialog` closes on action click by default; `e.preventDefault()` is the correct pattern to keep it open on error, but it also means the cancel/close path must clean state manually.
- **`getVersionSnapshotUrl` enabled guard** — query is gated on `!!selectedVersionId && isFileSnapshot`. If `selectedVersion` hasn't loaded yet, `isFileSnapshot` is false and the query won't fire even if needed. This causes a window where the Download button is hidden but no loading indicator is shown for it.
- **`MarkdownVersionHistory` is a 2-line re-export** — the real component is `DocumentVersionHistory`. No other files import `MarkdownVersionHistory`; re-export exists only for backward compat.
- **`fileToBase64` uses FileReader data URL** — result includes the `data:<mime>;base64,` prefix. Confirm server strips the prefix before decoding.

## Key File Paths

- `apps/web/client/src/components/library/DocumentPreviewPanel.tsx`
- `apps/web/client/src/pages/DocumentManagement.tsx`
- `apps/web/client/src/components/library/DocumentVersionHistory.tsx`
- `apps/web/client/src/components/library/MarkdownVersionHistory.tsx` (re-export only)
- `apps/web/server/routers/library.ts`
- `apps/web/server/services/libraryService.ts`

## Spec 035 — Auto Draft & Content Automation (Round 12, 2026-03-11)

### Patterns confirmed in this spec
- **Raw JSON dict vs Python attribute access**: When spec models store structured data in a `JSON` column (`spec_data`), all inner objects deserialized from that column are plain Python dicts — never Pydantic objects. Code that uses attribute syntax (`.output_type`, `.topic_source`) on those dicts will raise `AttributeError` at runtime. The correct pattern is `.get("output_type")`.
- **Column placement of `count`**: When a YAML list item has a field like `count`, its Python dict representation is `schedule_item["count"]` — NOT `schedule_item["topic_source"]["count"]`. Flag any code reading `source.count` when the YAML field is at the parent level.
- **`assert` vs `raise` in security-critical paths**: All tenant isolation guards in Python Celery tasks MUST use `raise ValueError(...)`, never `assert` (which is stripped by `python -O`). Cross-check every security comment section that advises `raise` — a contradicting `assert` elsewhere in the same spec is a HIGH bug.
- **Example spec vs validator contradiction**: If a spec contains an illustrative YAML/JSON example that uses a field the validator explicitly rejects (`payload_template`), that's a MEDIUM consistency bug that will confuse implementors.
- **`try/finally` for run_record status**: Celery batch tasks that create a run_record and then do multi-phase processing MUST mandate `try/finally` to set `run_record.status = "failed"` on any unhandled exception — an advisory "NOTE" is not sufficient for a spec that will be implemented directly.
- **try/except double-write on consecutive_failures**: When Phase 6 of a batch task updates `consecutive_failures` BEFORE calling `notify_completion()`, and `notify_completion()` raises, the `except` block will double-increment `consecutive_failures`. Fix: move `consecutive_failures` update to after `notify_completion()`, or set a flag to skip the except-block increment if Phase 6 already ran it.
- **Credit budget not rolled back on non-CreditInsufficientError mid-loop**: If `auto_draft_pipeline()` raises a non-credit error partway through the topic loop, the reserved budget for the remaining UNPROCESSED items is never rolled back. Only `CreditInsufficientError` triggers `atomic_budget_rollback(remaining_items)` — other exceptions exit the loop into the outer except, skipping the rollback.
- **`items_completed`/`items_failed` counts are Phase-2-only**: The except block uses `len(results)` (Phase 2 output) for `items_completed`. If Phase 3 export fails after all drafts succeed, `items_completed = N, items_failed = 0` is reported even though 0 exports completed. Spec should clarify that these counts track draft completion, not export completion.
- **`atomic_budget_reserve` `rowcount` vs `RETURNING`**: SQL uses `RETURNING id` but code checks `result.rowcount > 0`. With SQLAlchemy async, `rowcount` may be 0 even when a row is returned via RETURNING. Should check `result.fetchone() is not None`.
- **`CreditInsufficientError` rollback off-by-one**: `remaining_items = len(topics) - len(results) - 1` — the `-1` skips rollback for the current failing item. But the spec budget reservation was done PER BATCH upfront. The current item never deducted (CreditInsufficientError means pre-deduction check failed). The current item's reservation in `credits_used_today/month` is not rolled back.
- **`export_failed` condition too broad**: `phase2_completed and not download_urls` is True for Phase 4 (caption) failures too, not just Phase 5 (upload). A caption generation failure is incorrectly treated as an infra failure, suppressing `consecutive_failures` increment.
- **`update_run_record` partial vs full update ambiguity**: Called at line 1260 with `output_artifacts` only, then at line 1340 without it. If full-replace semantics, second call wipes `output_artifacts`. Must be documented as partial (PATCH) update.
- **`content_automation_reexport_task` never defined**: Referenced in `reExport` tRPC procedure but no pseudocode, signature, or Celery registration is provided in the spec.
- **`getSpecStats` division-by-zero**: `success_rate = completed / (completed + failed)` — no guard for both == 0.
- **`auto_draft_pipeline()` Python contract undefined**: Batch task calls this Python function directly but it's never defined — unclear if it calls the Node.js tool endpoint internally or is a separate Python implementation.

## Spec 043 — Implementation Review (thirteenth pass / FINAL, 2026-03-15)

### Verdict: REQUEST_CHANGES

### Confirmed PASS items (all passes through 13)
- All 8 `/v1/*` route groups + MCP registered in `_core/index.ts:440–455`.
- Middleware chain: CORS → headers → apiKeyAuth → featureGuard → rateLimiter → quotaMiddleware → idempotencyMiddleware → auditMiddleware (confirmed index.ts:429–439).
- `/v1/mcp` at line 455 correctly inherits the `/v1` middleware chain — Express path-prefix `app.use("/v1", ...)` at line 429 applies to all subsequent routes matching `/v1/*` in registration order.
- `agencyBridge.ts` `RunResult` interface HAS `startedAt?` + `completedAt?` fields. `publicAgencyApi.ts:431–432` maps them correctly. PREVIOUS FINDING WAS WRONG.
- `mcp:read` and `mcp:write` ARE present in `ALLOWED_API_SCOPES` (confirmed in `shared/publicApiTypes.ts`). PREVIOUS FINDING WAS WRONG.
- `featureFlags.ts` — `publicApi` confirmed in interface (line 26), ALLOWED_FEATURE_FLAGS Set (line 54), and FEATURE_FLAG_DEFAULTS map (line 81).
- `createInternalTokenFromAuth(auth: { userId: number }, scopes?)` — takes minimal `{ userId }` object, not full AuthContext.
- `cancelJob()` uses `drizzle.transaction()` — but swallows transaction failure via `.catch()`, returning fake success. HIGH bug.

### Open issues after thirteenth pass (FINAL) — requires fix before merge
- **HIGH** — `jobAutomationService.ts:490–494` — `cancelJob()` `.catch()` swallows DB transaction failure and returns `{ ...job, status: "cancelled" }` regardless. Caller receives HTTP 200 success even when status update + credit refund both failed.
- **HIGH (fragile)** — `mcpPublicServer.ts:769` — `/v1/mcp` registered via bare `app.post()` after the `app.use("/v1", middleware...)` block. Correct now due to registration order, but no integration test guards this. If file is reordered, auth is silently bypassed (requireScopes passes when req.auth is undefined).
- **MEDIUM** — `schema.ts:5486` — `publicApiAuditLog.apiKeyId` is nullable; spec says NOT NULL.
- **MEDIUM** — `quotaMiddleware.ts:41` — `"quota_exceeded"` absent from spec section 04 canonical error code table.
- **MEDIUM** — `apiKeyRateLimiter.ts:163` — `"daily_credit_limit_exceeded"` in impl vs. `"daily_credit_limit"` in spec canonical table.
- **MEDIUM** — `apiKeyService.ts:127` — `{ _suspended: true } as unknown as AuthContext` type-unsafe sentinel.
- **MEDIUM** — `publicSkillsApi.ts:253–262` — credits deducted before execution, no refund on failure (intentional but undocumented deviation from expected contract).
- **LOW** — `publicApiAuditLog` table name vs. spec's `api_audit_events` — add comment in schema.ts.
- **LOW** — MCP sessions no absolute expiry cap; sliding TTL allows indefinitely active sessions.
- **LOW** — Agency credit overrun gap: if `creditsUsed > reservedCredits`, no additional deduction occurs.
- **LOW** — `webhookDeliveryService.ts` — `"quota.warning"` event type undocumented in spec's event catalog.

## Spec 043 — Public API & External Agent Gateway (v1.1.0 post-review, 2026-03-14)

### Key codebase facts confirmed during review
- **`AuthResult` union is closed** — only `"bearer"` and `"session"` modes exist. v1.1.0 correctly widens to include `"api_key"` and adds `sub: String(apiKey.userId)` numeric fix.
- **`creditSourceTypeEnum` is a PostgreSQL enum** — v1.1.0 adds explicit raw SQL migration file `drizzle/0071_api_credit_source_types.sql` and notes it must run outside a transaction block via psql, not drizzle-kit.
- **`featureFlags.ts` has 18 flags; `publicApi` not yet present** — v1.1.0 explicitly lists all 3 required locations (interface, ALLOWED_FEATURE_FLAGS Set, FEATURE_FLAG_DEFAULTS map).
- **`llmProviders` table uses `serial()` PK (integer)** — sentinel "API Gateway" row seed in spec uses `gen_random_uuid()` for id, but the actual `llmProviders.id` is a serial INTEGER, not uuid. The seed SQL in v1.1.0 is wrong.
- **`agencyBridge.ts` `RunParams` requires `userToken`** — v1.1.0 addresses this with `AuthContext` refactor but does not show updated `RunParams` interface signature or list all callers of `executeRun()`.
- **`CreditSourceType` union in `creditService.ts` must stay in sync with enum** — v1.1.0 addresses in Section 11 (L-06 fix).
- **BullMQ workers are registered in `_core/index.ts` startup** — existing pattern: `initDeliveryQueue()`, `initWebhookDispatchQueue()`. The new `automation-jobs` worker must follow this same pattern; v1.1.0 spec does not specify where/how the worker is registered at startup.
- **Bottleneck rate limiter** (`llmRateLimiter.ts`) is provider-scoped (per LLM provider slug). It is SEPARATE from the new `apiKeyRateLimiter.ts` (per API key Redis sliding window). No interaction or coordination between the two is needed — they serve different dimensions. v1.1.0 correctly introduces a new file without modifying Bottleneck.
- **MCP session state `mcpSessions` Map is in-process memory** — will be lost on server restart and not shared between Node.js workers. No Redis-backed session storage specified.
- **Sentinel provider slug `api-gateway` not defined in seed.ts** — must be added there or in a migration; not currently present.

### Remaining gaps found in v1.1.0 (post-review)
- **`llmProviders.id` is serial integer, not uuid** — sentinel INSERT uses `gen_random_uuid()` which is wrong type.
- **`agencyBridge.ts` caller list incomplete** — C-07 fix lists 4 callers but misses any direct `agencyBridge.executeRun()` calls in tRPC routers.
- **`automation-jobs` BullMQ worker startup registration not specified** — spec says worker is in `jobAutomationService.ts` but doesn't say where `initJobAutomationWorker()` is called at startup.
- **`mcpSessions` Map is in-process** — multi-instance deployments will break MCP session continuity. No Redis-backed alternative offered.
- **SSE `publicApi` flag disable mid-session** — spec does not define what happens to active SSE connections when tenant admin disables `publicApi` flag (open connections should be drained, not broken).
- **Credit source type count mismatch** — Section 10 matrix has 9 rows using source types `api_chat`, `api_responses`, `api_skill`, `api_agency`, `api_job_skill`, `api_job_media`, `api_job_browser`, `api_job_pipeline`, `api_mcp` — but Section 10 "New enum values (6)" only defines 6 values (`api_chat`, `api_skill`, `api_agency`, `api_job`, `api_mcp`, `api_media`). The matrix uses `api_responses`, `api_job_skill`, `api_job_media`, `api_job_browser`, `api_job_pipeline` which are NOT in the enum list. Inconsistency.
- **`conversations.source` new value `"api"` not in enum** — `getOrCreateApiConversation()` sets `source: "api"` but whether `conversations.source` is an enum column needs verification against schema.

## ClawFeature (feat/029-claw-feature) — Final Completeness Pass (2026-03-02)

### RESOLVED since previous reviews
- **S10-H6**: Widget WebSocket TWO-WAY is now implemented — `channelGateway.processMessageServerSide()` called and response sent back via `widgetConnections` map.
- **S10-H1**: Widget CRUD router (`routers/widget.ts`) uses `domainAdminProcedure` correctly.
- **S11-H6**: Credits ARE now deducted in `webhookTrigger.ts` (line 240-246) after dispatch.
- **S11-H3**: Dedup key now uses `serverTimestamp` for `token` auth type (only uses caller timestamp for validated HMAC). Fixed.
- **S12-H4**: `testRule` no longer calls `invalidateCache()` — uses `evaluateRules()` directly (cache re-populates naturally). Acceptable.
- **S12-H2**: `totalMatches` now uses SQL atomic increment `sql\`"totalMatches" + 1\`` — fixed.
- **S14-H1**: `requireFeatureFlag.ts` now uses `middleware` from `_core/trpc` — no second tRPC instance.
- **S14-H2**: `/api/tenant/current` now returns `featureFlags` field (confirmed in `tenant.ts:39`).
- **S06-H1**: Voice feature flag IS checked at `/api/voice/session` (voiceGateway.ts:105).
- **S06-H2**: Voice credits ARE now deducted via `deductCredits()` in `dispatchSTT()` (voiceGateway.ts:383).
- **S15-H1/H2/H3**: `redisSemaphore.ts` uses atomic Lua INCR+EXPIRE script — INCR race fixed. Remaining: `EXISTS+DECR` in release() is still non-atomic (S15-H2 partially remains).

### REMAINING Open Issues (final pass confirmed)
- **S15-H2 (partial)**: `release()` checks `EXISTS` then `DECR` in two round-trips — still a TOCTOU race if key expires between EXISTS and DECR (creates key at -1). Not critical in practice since TTL is 300s and decr on missing key just creates -1.
- **S11-STUB**: `webhookTrigger.ts:229-237` — actual target dispatch is still a stub (logs `webhook_dispatch_stub`). Credits deducted, log recorded, but no actual chat/agency/workflow routing happens.
- **Nginx S15**: No Nginx location for `/api/webhooks/trigger/` — handled by fallback `/api/` block which routes to Python backend, but webhooks/trigger is a Node.js route. However, CSRF exemption is in place and the route IS mounted in index.ts. Need to verify routing works correctly through Nginx.

## Spec 034 — ResearchStoryboardBuilder Preview/Commit Loop (2026-03-14)

### Key confirmed facts
- **All 4 preview types wired**: research, storyboard, deck, comparison all dispatch correctly in `AgencyPreviewCard.tsx` and `buildAgencyPreview()`.
- **`onPreviewReady` fetches via `utils.agency.getRunPreview.fetch()`** (not the sendMessage return value) — correctly stores full `AgencyPreviewProps & { runId }`.
- **No `comparisonPreview` or `ComparisonPreviewCard` remnants** — comparison is inlined as `ComparisonContent` inside `AgencyPreviewCard.tsx`.
- **Feature flags checked in `commitPreview` only, not in `getRunPreview`** — previews are readable even when commit is disabled (correct design). Flags: `AGENCY_DECK_COMMIT_ENABLED` and `AGENCY_LIBRARY_COMMIT_ENABLED` are NOT in `TenantFeatureFlags` interface or `featureFlags.ts` — they are purely server-side strings passed to `getTenantFeatureFlag()`.
- **`agencyRunArtifacts` schema has all required columns**: `commitToken`, `commitStatus`, `targetType`, `targetId`, `committedAt`, `state`.
- **Deck redirect parses JSON targetId** — `PreviewCommitButton.tsx:62` does `JSON.parse(result.targetId)` to get `deckId`, then navigates to `/presentations/${deckId}`. This is correct given `serializeDeckTargetId` serializes `{ deckId, libraryItemId }`.
- **`AGENCY_LIBRARY_COMMIT_ENABLED` / `AGENCY_DECK_COMMIT_ENABLED` / `AGENCY_TEMPLATE_EXPERIENCES_ENABLED` are NOT in `featureFlags.ts`** — they are backend-only flags managed via `getTenantFeatureFlag`/`setTenantFeatureFlag`, not the client-visible `TenantFeatureFlags` interface.

### Open gaps found
1. **No dismiss/close button on `AgencyPreviewCard`** — preview persists until next run; users cannot manually close it. LOW severity for usability.
2. **No loading state while `getRunPreview.fetch()` is in flight** — `onPreviewReady` fires, fetch begins, but card shows nothing until fetch resolves. No spinner or skeleton is shown.
3. **No error display if `getRunPreview.fetch()` fails** — only `console.error`, no user-visible feedback.
4. **No Library UI route for committed items** — after committing research/storyboard/comparison to Library, there is no "View in Library" link rendered in the committed state button. Only deck type gets a redirect.
5. **`AgencyPreviewCard` not passed `onCommitted` from `AgencyChat.tsx`** — the `onCommitted` prop exists on the interface but `AgencyChat.tsx:698-702` does not pass it. After commit, preview card state is not updated in the parent.
6. **Test gap: `commitPreview` deck path** — `agency.test.ts` tests research commit and deck commit-flag-block, but no test exercises a successful deck commit through `commitPresentationPreview`.

## Feature 045 — Celery JWT Refactor (2026-03-16)

See `project_045_celery_jwt_refactor.md`. Two review passes recorded.

**Post-implementation verdict: APPROVE_WITH_FIXES**. All plan blockers fixed. Remaining:
- HIGH: In-flight old Celery messages (user_jwt arg) will TypeError on new worker — needs drain procedure before deploy
- MEDIUM: Fragile string-slice assertions in `test_agency_creator_security.py` lines 63-68, 81-83 (ValueError if function order changes)
- MEDIUM: `_implement_agency()` silently marks agency_id=None and proceeds if both tokens are empty string
- LOW: No Node.js tRPC layer test verifying user_jwt absent from POST body to Python

## Spec Virtual AI Office Orchestrator — Final Verification Review (2026-03-18, Round 4)

### Verdict: READY FOR IMPLEMENTATION (with 3 residual findings)

### Check results (20/20 evaluated)
- PASS (17): checks 1-partial, 2, 3, 4, 5, 7-partial, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20
- CONDITIONAL PASS (1): check 6 — roomLanguage in team_rooms is in section-17 (additive), not inline in section-02 schema table
- FAIL (1): check 1 partial — notifyOrchestrator still has `db: DrizzleDB` param and `tenantId: number` (should be string). recordEvent correctly has no db param.
- FAIL (1): check 7 partial — assistant_profiles.preferredLanguage is in spec.md §3821 but NOT in section-01 implementation table. Section-17 only adds roomLanguage to team_rooms; no corresponding column on assistant_profiles.

### New issues found in final pass
- HIGH: notifyOrchestrator interface in S07 has `tenantId: number` but all other tenant isolation uses `string` (varchar UUID). Type mismatch will cause TypeScript error at call site.
- HIGH: `computeRunSummaries` and `detectStuckAgent` in S07 still take `db: DrizzleDB` parameter even though `recordEvent` and `captureSnapshot` use module-level db. Inconsistent — implementer must pick one pattern.
- MEDIUM: `assistant_profiles.preferredLanguage` mentioned in spec §22.3 and claude-plan.md §10 but not in section-01 implementation table. Field will be missing from the schema unless implementer reads the spec separately.
- LOW: `notifyOrchestrator` test stub in S07 calls it as `notifyOrchestrator(userId, { ... })` (2 args) but the interface shows a single params object. Stub is inconsistent with implementation spec.

## Spec Virtual AI Office Orchestrator — Schema & API Completeness Review (2026-03-18)

### Coverage summary
- **20/20 tables** from spec §16.4.2 present across sections 01, 02, 03, 09, 16
- **67/72 tRPC procedures** from spec §17 present in section-10; 5 missing (`approval.list/get/approve/reject/requestChanges` from §17.12)
- **3/3 SSE endpoints** present in section-11
- **All 3 internal REST endpoints** (`/api/internal/orchestrator/*`) present in section-09
- **4/5 external REST endpoints** present in section-16 (2 are comment-stub-only, not fully described)

### Key gaps
- **`approval.*` (5 tRPC procedures)** — spec §17.12 Human Review APIs have no owning section
- **`handoff_completed` event** — in spec §18.3 core types but missing from section-16's event table
- **9 core event types** have no section explicitly claiming ownership (room_created, participant_joined, run_queued, tool_call_started/completed, artifact_created/updated, memory_written, summary_updated)
- **`monitoring.getActivityTimeline` missing `assistantId?` + `eventCategory?` filters** — spec §17.8 shows these but section-10 Zod schema omits them
- **`teamRun.start` missing `autonomyLevel` + `summaryMode`** — top-level inputs in spec §17.5 not in section-10 schema
- **Extra fields in `assistant_teams`** not in spec: `defaultModelId`, `modelBudgetPolicy`
- **Section-16 `POST /v1/rooms/:roomId/tasks` and `POST /v1/external-tasks/:sourceId`** are comment stubs without full handler description

## Feedback Attachment Upload Security Review (2026-03-18)

See `project_feedback_upload_review.md`. Verdict: REQUEST_CHANGES.
- CRITICAL: Auth runs after multer writes temp files — unauthenticated requests write files to disk with no cleanup.
- CRITICAL: `tenantReq.tenant?.role` is always `undefined` — `Tenant` schema has no `role` field. All isAdmin checks in the Express upload route evaluate to false; no admin can upload to another user's ticket.
- HIGH: MIME+ext fileFilter uses OR logic — `.js` file with `Content-Type: image/jpeg` is accepted.
- HIGH: Multer `LIMIT_FILE_SIZE`/`LIMIT_FILE_COUNT` errors bypass the route handler try/catch — they propagate as unhandled Express errors.
- HIGH: No tenant isolation on the upload route — cross-tenant upload possible if ticketId is known.
- MEDIUM: COUNT(*) + INSERT not atomic — concurrent uploads can exceed the 5-attachment cap.
- MEDIUM: `storagePut` success followed by DB insert failure leaves orphaned storage objects.
- MEDIUM: `parseInt(auth.sub)` is NaN for static-token bearer (`auth.sub = "static"`) — ownership check is silently bypassed.

## Feature 044 — Generate Layout with AI (2026-03-15)

See `project_044_layout_from_note.md`. Key confirmed bugs:
- **CRITICAL**: Redis key mismatch — service writes `ai_draft:progress:{taskId}`, getDraftProgress reads `ai_draft_progress:{taskId}`. Deck-note progress invisible.
- **HIGH**: Lock key mismatch — service uses `ai_draft:lock:deck:{deckId}`, getDraftProgress checks `ai_draft_lock:{userId}`. Stall detection broken for deck-note tasks.
- **HIGH**: No credit pre-check before LLM call in single-slide path.
- **HIGH**: Poll interval not cleared on component unmount — memory/network leak.
- **MEDIUM**: Router input schema duplicates `GenerateLayoutFromNoteInputSchema` from aiTypes.ts — drift risk.
- **LOW**: `aiDesign.source` hardcoded to `"draft-with-ai"` in new functions — makes log queries ambiguous.

### Registration Status (all confirmed)
- `channelRouterRouter` — registered at `routers.ts:1369`
- `webhookTriggersRouter` — registered at `routers.ts:1366`
- `AdminChannelRouter` page — registered in `App.tsx:164` at `/admin/channel-router`
- menu entry `admin-channel-router` — in `menu.ts:66` with `requiresFeature: 'channelRouter'`
- Voice WS upgrade — wired in `_core/index.ts:983`
- Widget WS upgrade — wired in `_core/index.ts:985`
- Voice session router — mounted at `/api/voice`
- Widget init router — mounted at `/api/widget`
