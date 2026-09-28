# TDD Plan — 031-SocialAdsManagement

Mirrors `claude-plan.md` section structure. Conventions (from claude-research.md): Vitest; module-boundary `vi.mock` (idiom: `server/services/__tests__/socialDraftService.test.ts` — `vi.hoisted` mock bag incl. `vi.mock("../../_core/llm")`); chainable drizzle mock (idiom: `creditService.test.ts:3-45`); routers via `router.createCaller({user, tenantId, userToken})` (idiom: `__tests__/socialInbox.test.ts:56-70`); no test DB, no network; `global.fetch = vi.fn()` with recorded fixtures for Graph contract tests. Write each section's tests BEFORE its implementation; a section is done only when its tests + the full suite pass.

## Section 01 — Schema + flag + i18n
- Test: schema exports compile and `$inferSelect` types include the expected columns for each of the 11 tables (type-level smoke via `expectTypeOf` or plain assignment).
- Test: `SOCIAL_ADS_ENABLED` present in `ALLOWED_FEATURE_FLAGS` and `FEATURE_FLAG_DEFAULTS === false`.
- Test: th/en `social.json` and `dashboard.json` contain every new key referenced by a static key-list constant (guards against missing-translation runtime fallbacks).

## Section 02 — Money, account time, error map, sanitizer
- Test: Money — formats THB minor units; `pctOfMinor` bounds at min/max; integer rounding half-up; `assertSameCurrency` throws on mismatch; never produces floats.
- Test: accountTime — `today`/`yesterday`/`last_3d` (exclusive) / `last_7d` ranges computed in `Asia/Bangkok` vs `America/Los_Angeles` differ correctly around midnight boundaries; DST-transition date in a DST zone.
- Test: error map — 190 → non-retryable/reconnect message (Thai present); throttle subcode 80004 → retryable + throttle severity; unknown code → generic entry + logged; `error_user_msg` preferred when present.
- Test: sanitizer extension — token in URL string value (`...?access_token=EAA...`), bare `EAA...` string in nested error object, arrays of strings — all `[REDACTED]`; existing key-based redaction still works; `sanitizeForActionLog` truncates >8KB payload.

## Section 03 — socialJobsWorker + scheduled posts + automation wiring
- Test: sweep processor claims only `scheduled` rows with `scheduledAt <= now` (mock drizzle transaction asserting the claim UPDATE shape) and calls `publishPublishingPostNow` once per claimed id.
- Test: claim idempotency — a row already `publishing` is not re-claimed; a `publishing` row older than 10 min goes to `failed` with "unknown outcome" message, never re-published blindly.
- Test: publish failure → post `failed` + `createNotification` called with `groupKey` `social-post-failed:{id}`.
- Test: job payloads for every enqueue helper contain only ids — serialize and assert no `EAA`/`access_token` substrings (payload-hygiene canary).
- Test: `registerConnectionSchedulers`/`removeConnectionSchedulers` call `upsertJobScheduler`/`removeJobScheduler` with the exact scheduler-id convention; reconciliation repairs a missing scheduler and removes an orphan.
- Test: inbound-event hook enqueues `social:automation-rules` and the processor invokes `matchAutomationRules` (mocked) with the persisted entity.

## Section 04 — socialAdsConnectionService
- Test: saveToken happy path — validates via mocked Graph (`/me`, `debug_token`, `/me/adaccounts`), same-app secret → exchange called, long-lived token+expiry stored encrypted, `token_hint` = last 4, schedulers registered.
- Test: cross-app token (debug_token.app_id ≠ stored app_id) → NO exchange, NO appsecret_proof, short expiry stored, warning in DTO.
- Test: token missing `ads_read` → rejected with Thai error; missing `read_insights` → saved with `missingScopes` warning.
- Test: disconnect — encrypted columns NULLed in same transaction, schedulers removed, enabled rules disabled, action-log rows untouched.
- Test: markExpired — status flip, schedulers removed, exactly one notification per threshold (`groupKey` dedup asserted via mock).
- Test: getDecryptedAccessToken never appears in any tRPC-exposed DTO (type-level: DTO type has no token field).

## Section 05 — Connection router + Settings panel
- Test (router, createCaller): every procedure rejects when tenant flag off (FORBIDDEN) and when no connection where required (PRECONDITION_FAILED with Settings hint).
- Test: saveToken rate-limit middleware wired (mock middleware, assert namespace/limit).
- Test: updateSettings raising max budget without confirmation string → error; with `"ยืนยันเพิ่มงบ"` → ok; lowering needs none. Default budget asserts ฿500 (50,000 minor).
- Test: responses never contain ciphertext/plaintext secrets (walk response object for `EAA`/long-hex shapes).
- Test (panel, jsdom): renders configured state with hint badge; paste field has `type=password` + `autoComplete=off`; local state cleared after successful submit (mock mutation).

## Section 06 — adsGraphClient + provider + governor
- Contract tests on fixtures: 3-page campaign pagination follows cursors to exhaustion; truncation at bound logs; 190 → markExpired called + non-retryable throw; GET retried on 5xx/timeout ≤3 with backoff, POST never retried (assert single fetch call on failure); throttle headers parsed → governor.report values; batch partial failure isolates per-sub-request errors; async insights lifecycle (start → poll running → completed → results).
- Test: every outgoing request uses `Authorization: Bearer` header and URL contains no `access_token=` (assert on mock fetch args).
- Test: appsecret_proof present iff same-app secret available; value = HMAC-SHA256 hex of token.
- Test: governor — >80% serves cached reads/defers non-critical; >95% throws ThrottleDeferred for jobs; critical user reads still pass; state keyed per ad account in mocked Redis.
- Test: read cache hit within TTL skips fetch; `invalidateEntity` clears matching keys → next read fetches.

## Section 07 — socialAds read router + menu/route/shell
- Test (createCaller): ownership — requesting an `act_` id not in the caller's connection cache → FORBIDDEN; entity lineage checks (adset under foreign campaign) → FORBIDDEN.
- Test: read rate limit namespace/limit wired (120/min).
- Test: getOverview computes spend windows via accountTime helper with the account's timezone (spy asserts tz passed).
- Test: getInsights maps provisional flag onto conversion metrics younger than 28d.
- Test (jsdom): Campaigns tab renders configured vs effective_status chips differently for the ACTIVE-campaign/WITH_ISSUES-ad fixture; empty/loading/error states render.

## Section 08 — Mutations + guardrails + wizard
- Test: executeAdsAction — inserts pending intent row before provider call; finalizes ok/error; timeout → `unknown` + NO credit deducted; duplicate `(actor, action, targetId)` with open intent → rejected; kill switches (tenant, user) block system actors; lock contention → typed error for user actor, skip-log for system actor; credit deducted with `idempotencyKey='social-ads-action:'+id` only after ok.
- Test: mutation validation — campaign without `special_ad_categories` → error (empty array passes); non-ODAX objective → error; status forced PAUSED on create regardless of input; budget below currency minimum (from mocked account minimum_budgets) → error with Thai message; effective cap = min(user ฿500 default, org cap) enforced; exceed → requires confirmation text; optimistic concurrency — stale `expectedUpdatedTime` → CONFLICT unless override flag.
- Test: special-ad-category declared → forbidden targeting fields stripped/rejected server-side.
- Test: wizard chain partial failure — adset create fails after campaign created → draft's `createdObjectIds.campaignId` recorded; resume submit skips campaign creation (provider.createCampaign not called again).
- Test: creative asset cache — second upload of same media_asset_ref for same account reuses cached image_hash (no upload call).
- Test (jsdom): review step shows payload summary; preview rendered inside sandboxed iframe (assert `sandbox` attr, no `dangerouslySetInnerHTML`).

## Section 09 — Monitor + guards
- Test: first run seeds entity_state without snapshots/notifications; subsequent run with status change writes ONE snapshot + updates state.
- Test: DISAPPROVED transition with `auto_pause_disapproved` ON → executeAdsAction called with actor `system:guard`; OFF → notification only.
- Test: overspend detection uses account-tz "today" and Money comparison; cap exceeded → pause campaign once; guard cooldown prevents re-fire within window (ledger mocked).
- Test: auto-paused entity is NOT auto-resumed; `resumeEntity` procedure requires owner/admin.
- Test: `approve_first` rule → socialHumanApprovals row with `metadata.kind='social_ads'`, no immediate action.
- Test: ads-kind approval by non-owner non-admin tenant member → FORBIDDEN (the authority fix); chat-kind approvals unchanged (regression).
- Test: 190 mid-batch → markExpired, remaining batch aborted, one notification.
- Test: notification dedup — same entity+status within window → single createNotification (groupKey asserted).

## Section 10 — Optimizer + governance
- Test: rule Zod unions — budget action without min/max bounds rejected at write; stored blob failing `.strict()` re-validation at execute → rule disabled + notify, no action.
- Test: streak — threshold met but `consecutive_hits=3` with streak 1 → no fire, Redis counter incremented; met third consecutive evaluation → fires; missed evaluation resets.
- Test: cooldown ledger blocks re-fire after delete+recreate of identical rule (ledger keyed without rule_id).
- Test: transactional re-read — rule edited (bounds lowered) between evaluation and execution → new bounds win (mock returns updated row in FOR UPDATE read).
- Test: budget_increase_pct bounded by min(params.max, user cap, org cap); reallocate_to_best shifts within campaign only and respects bounds; conversion-metric rule with 1-day window → skipped (provisional rule).
- Test: guard-then-optimizer precedence — entity with guard ledger entry inside cooldown → optimizer skips + logs.
- Test: dry_run → action-log row `action='dry_run:pause'`, provider mutation NOT called.
- Test: forceDisableAdsConnection (admin only) — connection disabled, rules disabled, separately audited; non-admin → FORBIDDEN.

## Section 11 — Integration + page insights
- Test: page-insights processor requests ONLY post-purge metric names (assert exact list on mock); unknown-metric error for one metric → null stored + WARN, job succeeds; upsert on same `(page_id, date)` idempotent.
- Test: backfill loops bounded windows and stops at API-supported horizon (mocked 90d).
- Test: pageFactsBuilder — zero-post window → nulls not zeros; no paid/organic reach fields present; growth deltas correct on synthetic series; output serialization contains no token-shaped strings (hygiene canary).
- Test: health endpoint — internal token missing → hard error status (fail closed), python unreachable → degraded status listing which modules are affected.
- Test (jsdom): page card renders sparkline from snapshots fixture; missing `read_insights` scope → reconnect prompt instead of charts.

## Section 12 — Advisors
- Test: runReport pipeline — facts built → skill content loaded via registry (mock) → invokeLLM called with skill content as system message + outputSchema; parse success → report persisted with facts_snapshot; `deductCreditsForModel` called with actual usage; audit event emitted with traceId `social-ads-advisor:{id}`.
- Test: malformed LLM JSON → ≤2 retries → still bad → stored with `parseFailed:true` + raw text, no throw.
- Test: facts JSON passed to invokeLLM contains no token-shaped strings (hygiene canary at the LLM boundary).
- Test: suggestedAction type outside `pause|budget_adjust|none` → normalized to `none` (never executable).
- Test: "นำไปใช้" apply path routes through executeAdsAction (spy) — the advisor service itself never calls provider mutations.
- Test: weekly schedule tick — advisorSchedules entry due → one `social:advisor-reports` job enqueued per subject, deduped per day.
- Test: skill files — frontmatter parses (category chat_assistant, auto_trigger false); lowercase `skill.md` exists and uppercase twin does NOT (loader-precedence regression guard); input.schema.json validates a sample facts payload.

## Section 13 — Observability, retention, OAuth (P6)
- Test: retention processor — deletes monitor snapshots >90d, drafts >30d, page snapshots >13mo; action_log rows >2y archived-then-deleted (mock file storage); rows younger untouched; connection disconnect does NOT cascade-delete action_log (FK/behavior assertion).
- Test: unknown-intent alert — `pending|unknown` row older than 15 min → admin notification (deduped).
- Test: version check — pinned version within 6 months of sunset table → WARN logged at startup.
- Test: OAuth getAuthUrl — state nonce stored in Redis with TTL, scope list = minimized constant; completeOAuth — invalid/expired state → rejected; valid code → token exchange server-side (mock) → same saveToken pipeline invoked; app-not-reviewed mode → UI capability flag returns paste-token mode.

## Cross-cutting suite gates (every phase)
- `pnpm check` clean on new files; `pnpm test` full suite green; Redis payload-hygiene canary green; no test performs real network I/O (fixture-only enforcement via vitest setup that fails on unmocked fetch).
