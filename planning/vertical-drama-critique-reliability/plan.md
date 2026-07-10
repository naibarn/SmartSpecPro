# Vertical Drama — Critique/Apply Reliability, Dialogue Quality, Auto Failure Detection

Date: 2026-07-09
Status: APPROVED DIRECTION (user, 2026-07-09) — IN PROGRESS

## User decision (2026-07-09)
- Apply-critique redesign: full-season-input approach. Resolve a model with context
  ≥ 1,000,000 (like deep-generate). INPUT of every revise call = ALL episodes' FULL current
  drafts + the full selected critique + story-bible essentials. If the input would exceed
  the model's context budget, COMPACT non-target episodes first (structured digest), never
  drop the critique. OUTPUT is chunked exactly like the first-draft deep-generate round
  (5 eps/call, sequential, later chunks see earlier chunks' REVISED text) because the 16k
  output ceiling is the real constraint, not input context.
- Auto quality loop: apply → auto re-critique → repeat until overallScore ≥ 8/10, with
  hard stop conditions (max rounds, no-improvement, failure, credit cap).
- Provider failover DB change (E): NOT executed without explicit approval; code-level
  retry/resilience implemented instead. Recommendation stands.

## Problem Statement (user report, 2026-07-09)

1. Long-running jobs fail often mid-run: "อัปเดตเนื้อเรื่องละเอียดทุกตอน", "วิจารณ์ใหม่",
   "ปรับตามคำวิจารณ์". Screenshot: episodes 6–10 all show "การเรียก AI เพื่อแก้ไขล้มเหลว".
2. "ปรับตามคำวิจารณ์" never raises the overall score (stuck at 6.4/10). User suspects
   per-episode revision instead of whole-season + full critique in one pass, breaking
   cross-episode continuity.
3. Character dialogue comes out unnatural / wrong-word Thai. Should be fixed at generation
   and checked by the critique pass.
4. Feedback system never detects/reports these mid-run failures even though they are
   system-level problems.

## Root Causes (evidence-backed, from audit-2026-07-09.jsonl + provider_usage_log + code)

### RC-1: kie_ai provider outage with zero failover (episodes 6–10 failure)
- Season-critique/apply model resolves to `gpt-5.4` → only enabled route is provider
  `kie_ai` (providerId 10). The alternative `opencode-zen` mapping exists but `isEnabled=f`
  in `model_provider_map`. `executeWithFallback` therefore has maxAttempts=1.
- 2026-07-09 02:29:52Z–02:42:35Z: 7 consecutive calls to kie_ai `gpt-5-4` hit the app's
  hardcoded 120s AbortController (`llmRouter.ts:898`) — `errorType:"network_error"`,
  `errorMessage:"This operation was aborted"`, totalMs≈120000 every time. Meanwhile
  `openai/gpt-5.4` via openrouter succeeded in ~1s throughout → isolated kie_ai outage.
- Apply-critique splits N episodes into ≤2 chunks (`VD_SEASON_CRITIQUE_APPLY_MAX_CHUNKS=2`,
  verticalDramaStoryBible.ts:5604). Chunk 2 (eps 6–10) = ONE LLM call that landed in the
  outage window; the bare `catch {}` at :5882 rejected all 5 episodes with one generic
  message.
- `executeJsonPlanningCallWithRetry` (:685) retries ONLY `VdSchemaValidationError` (once).
  Network/timeout/provider errors are never retried.

### RC-2: Score frozen by design
- `applySeasonCritique` never re-runs the critique or judge; it only bumps the scorecard
  round marker (:5949-5951). `overallScore` comes solely from `critiqueSeasonDrafts` and
  stays 6.4 until the user manually clicks "วิจารณ์ใหม่".
- Each apply chunk sees full drafts of ITS episodes only; other episodes appear as terse
  recap (title/logline/cliffhanger). Cross-episode fixes cannot be coordinated.

### RC-3: `silence_intent` schema bug (deep-draft mid-run failures, separate from outage)
- `silence_intent: z.enum(...).optional()` (verticalDramaStoryBible.ts:211) rejects
  explicit JSON `null`, but the model reliably emits `"silence_intent": null` for
  dialogue shots. Both the first attempt and the strict retry fail schema validation →
  chunk throws → partial/failed deep-generate runs.

### RC-4: Dialogue prompts have no Thai-language-quality rules
- Only language guidance in `buildDeepDraftPrompts` (:1834-1837) is one line: "natural,
  speakable Thai". SPEAKABILITY RULES are format-only (no symbols/stage directions).
- No register/word-choice/particle/per-character-voice rules, no few-shot examples.
- Naturalness lens exists only as 1-of-3 rotating premium lenses (:2591).
- No critique dimension checks Thai language naturalness: season critique scopes itself
  to story craft (only `on_the_nose_dialogue` = abstract-word-density proxy); premium
  judge has `dialogue_naturalness` label but no rubric.

### RC-5: Failures invisible to feedback/guardian
- Bare `catch {}` swallows error at :5882 (same pattern at :3730, :4048) — no log, no
  audit error event, no traceId preserved.
- Apply audit event hardcodes `statusCode: 200`, non-"error" eventType
  (verticalDramaSeries.ts:1447-1461) → guardian `error_spike` sensor filter never matches.
- Feedback tickets are 100% human-submitted (`submittedByType:"human"` hardcoded,
  feedback.ts:67). Guardian incidents go to `virtualAdminIncidents`, a separate table the
  Admin Feedback Hub never reads. No automatic error→ticket bridge exists.
- Client systemErrorMonitor fires only on rejected tRPC calls; a 200 with `rejected[]`
  is "success".

## Proposed Changes

### A. Reliability hardening (no design decision needed)
Files: `apps/web/server/services/verticalDramaStoryBible.ts`
1. Replace bare `catch {}` at :5882 (and :3730, :4048) with `catch (err)` — `debugError`
   + preserve real error message/model/traceId into a new `systemFailures[]` field on the
   result (distinct from quality rejections).
2. Fix RC-3: `silence_intent: z.enum(...).nullable().optional()` + normalize null→undefined
   before persistence.
3. Add bounded retry for transient network/timeout errors in
   `executeJsonPlanningCallWithRetry` (e.g. 2 retries, exponential backoff 5s/15s), retry
   budget shared per job so a dead provider fails fast overall.
4. Per-chunk salvage: on chunk failure, retry that chunk once (fresh call) before rejecting.

### B. Apply-critique redesign (DECIDED — full-season input, chunked output)
0. FINAL model policy (user, 2026-07-09 second directive):
   - DB DONE: openai/gpt-5.5 flags fixed (thinking=t, structured=t), priority 7 locked —
     auto-default for ≥1M quality flows only (nano p0/mini p5 still win generic
     cheapest-first flows, so no global cost change). openai/gpt-5.5-pro flags fixed,
     priority 40 locked (manual pick only, $30/$180 per M). Backups in .db-backups/.
   - Resolver for season critique + apply + quality loop: require supportsThinking +
     supportsStructuredOutputs + contextLength ≥ 1,000,000 (verified sim pick:
     openai/gpt-5.5). Do NOT require supportsResponses here (would exclude everything
     but gpt-5.4).
   - USER MODEL OVERRIDE (UI): a model picker on the vertical-drama drafts panel listing
     ONLY enabled models with thinking + structured + contextLength ≥ 1M (currently:
     openai/gpt-5.5 p7, google/gemini-3.1-flash-lite-preview p8,
     google/gemini-3.1-pro-preview p20, openai/gpt-5.5-pro p40, openai/gpt-5.4 p60).
     Default option = "อัตโนมัติ" (resolver). Selection persisted in localStorage
     (per-user client preference; key e.g. vd-quality-model). The chosen modelId is sent
     with critique/apply/loop mutations; the SERVER re-validates it (enabled + thinking +
     structured + ctx ≥ 1M) and falls back to the resolver if invalid. Respect the
     selection exactly — never silently escalate/switch (see
     feedback_respect_user_model_selection).
1. Model resolution: per policy above (override → validated; else ≥1M-context resolver).
2. Full-season input builder: for EVERY revise call include (a) ALL episodes' full current
   shot drafts — using the already-revised text for episodes revised earlier in this run,
   (b) the FULL set of selected critique findings (not just per-episode slices), marked
   with which episodes each finding targets + explicit instruction to coordinate
   cross-episode setups/payoffs, (c) story bible essentials (characters/world rules/arc).
3. Context compaction: estimate tokens (chars/4 heuristic); budget =
   model.contextLength − maxTokens − safety margin. If over budget, compact episodes NOT
   being rewritten in this call into structured digests (beats, key dialogue moments,
   cliffhanger, open threads). Critique text is never compacted away.
   USER RULE (2026-07-09): when output must be split across calls, every subsequent call
   MUST always carry prior-episode context (full text within budget, compacted digest
   otherwise) so the model always knows the story's origin — never a bare chunk.
4. Output: as many episodes per call as safely fit the output ceiling — adaptive chunk
   size (default 5 eps/call like deep-generate; fewer if shots/dialogue volume is high),
   sequential. All affected episodes are rewritten (minimum = all drafted episodes when
   findings span the season). Keep regression guard + append-only versioning.
5. Checkpointing: persist per-chunk success in the job record; a failed chunk is retried
   once in-run; on re-run, already-revised episodes of the same critique round are skipped.

### C. Auto quality loop (DECIDED — target ≥ 8/10)
New job kind `quality_loop` (or apply option `loopUntilScore`):
  round = { applySeasonCritique(all findings) → critiqueSeasonDrafts (fresh score+findings) }
Stop conditions (ALL enforced):
  - overallScore ≥ target (default 8.0) → success
  - maxRounds reached (default 3) → stop, report best score
  - no-improvement: score delta < 0.3 vs previous round → stop (avoid burning credits on
    judge noise)
  - any round with systemFailures → stop and surface (feeds F)
Progress: job progress payload exposes round number, score history, findings applied, so
the UI can render "รอบ 2/3 — คะแนน 6.4 → 7.1". Honest caveat: the score is model-judged
and noisy; ≥8/10 is a target with bounded attempts, not a guarantee.

### D. Dialogue quality
1. New shared const `VD_NATURAL_DIALOGUE_RULES` (colloquial spoken register, correct
   everyday word choice, Thai sentence-final particles, per-character pronouns/voice,
   good-vs-bad examples). Inject into `buildDeepDraftPrompts` (after langInstruction,
   ~:1866) and `buildPremiumRevisePrompts` (~:3240).
2. Add rubric for `dialogue_naturalness` to premium judge prompts (:3105, :3171).
3. New season-critique finding kind `unnatural_dialogue_language` in
   `VD_SEASON_CRITIQUE_FINDING_KINDS` (:4819) + skill
   `apps/web/skills/vertical-drama-season-dramaturgy-critic/skill.md` (kept in sync) +
   ui.schema.json description; extend critic charter + fallback system prompt (:5353).
4. NOTE: byte-identity/snapshot tests for buildDeepDraftPrompts must be updated
   (deepStoryDrafts, premiumDeepDraft, speechBudget tests).

### E. Provider failover for gpt-5.4 (USER DECISION — routing/DB change)
Enable the `opencode-zen` mapping (or another non-kie_ai provider) for `gpt-5.4` in
`model_provider_map` so a single provider hang doesn't hard-fail runs. Read-back check +
respects "never silently switch user-selected models" — this is same-model failover, not
a model swap.

### F. Auto failure detection → Feedback Hub
1. When `systemFailures.length > 0` (or rejected/requested ≥ 0.3): write a REAL error
   audit event (`eventType: "vertical_drama_season_critique_apply_error"`, statusCode 500,
   error field) so the existing guardian `error_spike` sensor sees it.
2. Insert a feedback ticket with `submittedByType:"system"`, stable dedupe title prefix
   (feedbackProcessor title-prefix dedupe collapses repeats), contextJson with
   seriesId/traceId/failedEpisodes/model/counts → appears in AdminFeedbackHub.
3. Same for deep-generate partial failures and terminal job failures (job worker already
   files feedback on full-job failure via submitFailedStoryJobFeedback — verify + extend
   to partial results).

## Risk Assessment
- Prompt edits (D) change snapshot/agreement tests — must update tests in same change.
- Retry additions (A3) lengthen worst-case job duration; cap total retries per job.
- Auto-ticket (F) noise → mitigated by threshold + title-prefix dedupe.
- B Option 2 adds 1 planning call cost per apply run.

## Verification
- Unit: schema accepts silence_intent null; retry logic (mock transient failure);
  systemFailures propagation; feedback ticket insert on threshold.
- Existing suites: verticalDramaStoryBible.*.test.ts updated + green; pnpm check.
- Manual: run apply on series 4, verify chunk failure produces logged error + system
  ticket in AdminFeedbackHub; verify score refreshes after apply (if C approved).

## Execution order (same-file contention: verticalDramaStoryBible.ts is serialized)
- Wave 1 (parallel, no file overlap):
  - Agent A → Phase A (verticalDramaStoryBible.ts + its tests only)
  - Agent F → Phase F (verticalDramaStoryJobs.ts, routers/verticalDramaSeries.ts,
    feedback service; must NOT touch verticalDramaStoryBible.ts)
  - Contract between them: `ApplySeasonCritiqueResult.systemFailures?: Array<{
    episodeNumbers: number[]; message: string; stage: string }>` (A produces, F consumes;
    F guards with optional chaining so it works even before A lands)
- Wave 2: Agent B/C → apply redesign + quality loop (verticalDramaStoryBible.ts,
  verticalDramaStoryJobs.ts, router)
- Wave 3 (parallel): Agent D → dialogue prompts + tests (verticalDramaStoryBible.ts);
  Agent UI → loop button + round/score progress (VerticalDramaDeepStoryDraftsPanel.tsx,
  verticalDramaCopy.ts)
- Verify: pnpm check + targeted vitest suites after each wave; conductor verifies before
  closing; NO service restart while agents are editing server files.

## Progress
- [x] A1 bare-catch + systemFailures (2026-07-09, 234 targeted tests + tsc pass)
- [x] A2 silence_intent nullish→undefined
- [x] A3 transient retry (classifyVerticalDramaLlmError, 5s/15s backoff, 4-call cap)
- [x] A4 chunk salvage (1 fresh retry for transient/schema, never fatal)
      (follow-up DONE: 3 sibling test files' outdated "never retry" assertions updated
      to fatal-error fixtures — 93 tests + tsc pass)
- [x] B full-season-input apply + compaction + checkpoint (2026-07-09):
      resolver raised to `VD_SEASON_QUALITY_MIN_CONTEXT_LENGTH` = 1,000,000
      (renamed from `VD_SEASON_CRITIQUE_MIN_CONTEXT_LENGTH`); new
      `resolveSeasonQualityModel(overrideModelId?)` (user override validated
      server-side, falls back to auto, never silently substitutes) +
      `listSeasonQualityModels()` + `verticalDramaSeries.listQualityModels`
      query; `qualityModelId` threaded through `critiqueSeasonDrafts`/
      `applySeasonCritique` tRPC input → job payload → service, model+source
      recorded in results/audit metadata; `applySeasonCritique` rewritten for
      full-season input (every revise call carries ALL other drafted
      episodes as context — full text or farthest-first-compacted digest —
      + the FULL findings list + story-bible essentials), adaptive OUTPUT
      chunking (`computeSeasonCritiqueApplyOutputChunks`, default 5/call,
      min 2, shrinks on estimated-output-token pressure) replacing the old
      fixed <=2-chunk split (`chunkSeasonCritiqueEpisodeNumbers`/
      `VD_SEASON_CRITIQUE_APPLY_MAX_CHUNKS` kept exported, unused
      internally); checkpoint (`critiqueRound` = persisted critique's
      `critiquedAt`, stamped as `lastAppliedCritiqueRound`) skips
      already-fixed episodes on a re-run (`result.skipped`, distinct from
      `rejected`); Phase F parity fix landed for
      `runExtendStoryDraftHorizonJob` (same error-audit + system-feedback
      bridge as `runGenerateStoryBibleDeepJob`, distinct dedupe title).
      37 + 36 + 57 targeted tests and `pnpm check` pass.
- [x] C quality loop job + stop conditions (2026-07-09): new job kind
      `quality_loop` (`services/verticalDramaStoryJobs.ts`); tRPC mutation
      `verticalDramaSeries.startQualityLoop` (`{seriesId, targetScore
      (5-10, default 8), maxRounds (1-5, default 3), qualityModelId?,
      idempotencyKey?}` -> `{jobId, deduped}`); executor `runQualityLoopJob`
      (`routers/verticalDramaSeries.ts`) — REUSES `runCritiqueSeasonDraftsJob`/
      `runApplySeasonCritiqueJob` themselves for every inner call (zero new
      persistence logic: same version-append, critique stamping, audit
      events, Phase F feedback-ticket bridge fire exactly as they already do).
      Baseline reuses a persisted `lastCritique` unless stale (every drafted
      episode already stamped `lastAppliedCritiqueRound` for that round) or
      absent. Stop conditions evaluated in order after each round:
      `scoreAfter >= targetScore` -> `target_reached`; apply had ANY system
      failures -> `system_failure` (closing re-critique still runs if some
      episodes were updated, skipped otherwise); `round === maxRounds` ->
      `max_rounds`; `scoreAfter - scoreBefore < VD_QUALITY_LOOP_MIN_SCORE_DELTA`
      (0.3) -> `no_improvement`. `runApplySeasonCritiqueJob`'s result gained
      an additive `systemFailureCount` field. Progress payload gained optional
      `round`/`maxRounds`/`lastScore`/`scoreHistory` fields
      (`VerticalDramaStoryJobProgress`), threaded through every inner
      phase-transition event. `notifyStoryJobTerminal` summarizes
      finalScore/stopReason in Thai for `quality_loop`'s terminal
      notification (multi-round loops can outlast the client's 10-min poll
      cap). 82 new/extended targeted tests (57 + 31, overlapping with
      existing suite counts) + `pnpm check` pass. Frontend agent's
      `VerticalDramaDeepStoryDraftsPanel.tsx` was already wired against this
      exact contract (incl. `idempotencyKey`, added to match).
- [ ] D1-D4 dialogue rules + rubric + finding kind + tests
- [x] E RESOLVED differently (user 2026-07-09): OpenRouter is the primary LLM route;
      avoid failover to other routes. DB change applied: kie_ai gpt-5.4 mapping disabled;
      openrouter openai/gpt-5.4 aliased ["gpt-5.4","gpt-5-4"], priority 60, locked.
      Backup: .db-backups/model_provider_map_20260709_*.sql. Transient-failure handling =
      retry OpenRouter (A3), not provider switching.
- [x] F1-F3 error events + system feedback tickets (2026-07-09 — new audit eventTypes
      vertical_drama_season_critique_apply_error / vertical_drama_deep_generate_error
      hit both DB + JSONL so the guardian error_spike sensor sees them; shared
      submitVerticalDramaSystemFeedback helper, submittedByType "system" visible in
      AdminFeedbackHub, no schema change needed; extend-horizon parity fix landed
      2026-07-09 as part of B (see below) — `runExtendStoryDraftHorizonJob` now gets
      the same error audit + feedback ticket bridge, distinct dedupe title)
- [ ] UI: loop trigger + progress display
- [ ] UI: quality-model picker (≥1M ctx models only, localStorage persistence,
      "อัตโนมัติ" default) + server-side override validation
- [x] DB: openai/gpt-5.5 + 5.5-pro capability flags fixed, priorities 7/40 locked
      (2026-07-09, backups in .db-backups/)
- [ ] Final: pnpm check, full vitest for touched suites, build:deploy + web restart
