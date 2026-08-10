# Progress

## Active loop — Vertical Drama temporal scene props

- [COMPLETE] evidence — persisted shot 2 prompt proved a future `fromShot: 8` handcuff prop was emitted into the prompt.
- [COMPLETE] implementation — temporal filtering in shared scene locks and all prompt consumers, with focused regressions.
- [COMPLETE] verification — 4 focused Vitest files / 175 tests passed; repository TypeScript remains nonzero only in unrelated dirty-worktree diagnostics; scoped diff check passed.

## Active loop — Vertical Drama Production Episode Remotion render

Loop policy:
  orchestra_id: fable_style_coding_orchestra
  purpose: coding webapp with an agent loop
  iteration: 1/12
  tool_call_batches: 1/30
  estimated_cost_usd: negligible <= 0.50
  dispatch_waves: 0/6
  active_subagents: 0/4
  parallel_writers: 0/2
  required_subagent_wait: 0/10 minutes
  background_subagent_wait: 0/15 minutes
  repair_rounds: 0/5
  stop_conditions: success_criteria_met, tests_passed, no_open_blockers
  stop_reason: active

- [COMPLETE] brainstorming — approved segmented `remotion_render_video` direction and product decisions.
- [COMPLETE] design-plan — design and standard quick-plan artifacts written; SocratiCode unavailable, shell fallback recorded.
- [COMPLETE] implementation — shared/Remotion contract, server orchestration, UI, tests.

## Verification — Vertical Drama Production Episode Remotion render

- Focused feature suites passed: 4 files / 95 tests.
- `git diff --check` passed.
- `npm run check --workspace apps/web` remains nonzero from pre-existing unrelated
  diagnostics; the final output contained no diagnostics in the changed feature
  files.
- Full web Vitest was attempted and reached unrelated baseline failures before
  Node ran out of heap; it is not a feature-scope pass/fail signal.
- Browser evidence is recorded as skipped because no authenticated browser/dev
  server session was available in this turn.

## Loop policy

- iteration: 2
- sub-agents: 0 (standard light mode; no independent ownership boundary required yet)
- verification: focused tests passed; repo-wide typecheck baseline remains nonzero
- stop reason: implementation and focused verification complete

## Waves

- [IN-PROGRESS] wave-12-dual-view-frame-scope — persisted evidence proves frame analysis uses a global position map; adding per-view contracts, correction/rejection, and focused regressions.
- [COMPLETE] wave-12-dual-view-frame-scope — added per-image `view_role`, explicit image/view labels, view-aware correction and fail-closed validation, judge grounding, persisted contract support, and regression coverage.

## Loop policy final - Dual View frame-scoped anchors

- iterations_used: 4/12
- tool_call_batches_used: exact host telemetry unavailable; conservative local-command proxy used
- estimated_cost_usd: negligible local-only / 0.50
- dispatch_waves_used: 0/6
- timed_out_subagents: none
- repair_rounds_used: 1/5
- stop_conditions_met: success_criteria_met, focused_tests_passed, no_open_in_scope_blockers
- stop_reason: success

## Loop policy final - Vertical Drama R2 media durability

- iterations_used: 1/12
- tool_call_batches_used: 25/30
- dispatch_waves_used: 0/6
- timed_out_subagents: none
- repair_rounds_used: 2/5
- evidence: R2 active in storage_settings; dry-run inventory covered 8 series and 146 episodes; apply migrated 493 existing external assets plus embedded URLs and marked 298 unrecoverable provider links expired across users 24 and 1
- focused_tests: mediaAssetService 38/38; adBanner router 24/24; generateShotReferenceFrameImage 8/8
- known_baseline: full apps/web typecheck remains nonzero in unrelated dashboard/chat/marketplace/production-BGM/worker files; no errors remained in the new R2 durability service or backfill service after the second typecheck
- stop_conditions_met: success_criteria_met, focused_tests_passed, live_backfill_completed, baseline_failures_separated
- stop_reason: success

## Evidence and verification - Dual View frame-scoped anchors

- Persisted episode 135 clip 4 proved Krit was recorded as `not_visible`, `tiny`, `viewer-right` in a global frame analysis with no view identity.
- Audit trace `mV92jX6OonlncZuuMihvN` confirmed the production prompt-generation event.
- Red regression failed before implementation because the unscoped response was accepted.
- Focused final suites passed: 226/226, followed by 105/105 and 71/71 after the final skill/type-contract repairs.
- Skill case twins compare byte-identical; scoped `git diff --check` passed.
- Repository-wide TypeScript remains nonzero from unrelated dirty-worktree baseline errors; the prior Dual View helper error at router line 19769 was fixed, and the final output contains no errors in the changed prompt service/shared contract/current helper path.

- [COMPLETE] wave-1-evidence — traced the approved-frame/portrait input, placement analysis, prompt assembly, persistence, quality judge, and focused tests.
- [COMPLETE] wave-2-report — root cause was a contract-enforcement gap: prompt position was not compared against image-derived `frame_analysis`.
- [COMPLETE] wave-3-fix — added exact position consistency checks, authoritative corrective-retry locks, hard rejection before persistence for remaining mismatches, portrait-aware quality judging, and speaker-switch regression coverage.
- [COMPLETE] wave-4-vd-bulk-image-repair — replaced stale refetch gating with the prompt mutation response, awaited image admission, and bounded bulk submission to three workers; focused flow test passed 4/4.
- [COMPLETE] wave-5-shot-summary-sync — added inline summary edit/save and refreshed both episode detail and series Overview from the canonical draft mutation.
- [COMPLETE] wave-6-exact-cast-image-guard — stripped scene-wide cast staging/wardrobe facts from per-shot continuity context and added a deterministic exact physical-cast lock.
- [COMPLETE] wave-7-proof — focused UI/router/prompt suites passed 122/122; target files produced no TypeScript errors, while the known repo-wide baseline remains nonzero elsewhere.
- [COMPLETE] wave-8-unselected-cast-redaction — added roster-minus-selected prompt exclusions and a centralized positive-prompt fail-closed guard for all start-frame prompt modes.
- [COMPLETE] wave-9-unselected-cast-proof — focused prompt/router regressions passed 99/99, workspace TypeScript passed, and scoped diff validation passed.
- [COMPLETE] wave-10-dual-view-video-prompt-evidence — verified episode 135 shot 4 assets, ownership, ready state, roster keys, and canonical display-name dialogue directly from Postgres.
- [COMPLETE] wave-11-dual-view-video-prompt-fix — resolved display names to configured view keys, attached both view casts and images, preserved real precondition errors, and passed focused verification.
- [COMPLETE] wave-13-dual-view-image-label-standard — replaced prompt-facing View 1/View 2 labels with Image 1/Image 2 across vision input, generator, validator, judge, paired skills, and regressions; focused suites passed 226/226 and convergence rerun 122/122.

## Loop policy final - Dual View video-prompt readiness

- iterations_used: 4/12
- tool_call_batches_used: 19/30
- estimated_cost_usd: negligible local-only / 0.50
- dispatch_waves_used: 0/6
- timed_out_subagents: none
- repair_rounds_used: 1/5
- stop_conditions_met: success_criteria_met, tests_passed, no_open_blockers
- stop_reason: success

## Loop policy final - Unified Vertical Drama task polling

- iterations_used: 1/12
- dispatch_waves_used: 0/6
- implementation: shared MCP/deferred/provider polling plus R2 durability now backs `media.getTask`, portrait settlement, episode-cover status, and ad-banner status
- focused_tests: 87/87 existing R2/Vertical Drama tests plus 3/3 unified-polling service tests
- known_baseline: full apps/web typecheck remains nonzero only in unrelated existing diagnostics
- stop_conditions_met: success_criteria_met, focused_tests_passed, no_open_in_scope_blockers
- stop_reason: success

## Loop policy final - Marketplace Auto Review R2 media durability

- iterations_used: 1/12
- implementation: direct and staged Auto Review image/video completion paths now use unified MCP/deferred/provider polling plus R2 finalization; legacy UI slots show an unavailable-media placeholder
- backfill: resumable dry-run/apply script added for run metadata, result JSON, stage output, and provider event URLs; live execution was not possible in this shell because DATABASE_URL and R2 environment/configuration are unavailable
- focused_tests: 295/295 across Auto Review durability, unified polling, direct/staged service, and UI suites
- known_baseline: full apps/web typecheck remains nonzero in existing dashboard/chat/Vertical Drama/overlay diagnostics; no server-side errors remain in the Auto Review durability/polling files
- stop_conditions_met: implementation_complete, focused_tests_passed, external_backfill_prerequisites_missing
- stop_reason: code complete; production backfill requires an environment with the application database and active R2 configuration

## Loop policy final - Vertical Drama start-frame async task status

- iterations_used: 2/12
- tool_call_batches_used: exact host telemetry unavailable; local-command proxy used
- dispatch_waves_used: 0/6
- timed_out_subagents: none
- repair_rounds_used: 1/5 (moved new hooks below the episode detail query after focused typecheck)
- implementation: durable `imageTask` marker, atomic task persistence with stale-task protection, reload resume, and persistent submitted/waiting UI state
- focused_tests: 35/35 across start-frame flow, resume guard, server wiring, and existing prompt-job router coverage
- diff_check: passed
- typecheck: repository-wide nonzero from pre-existing unrelated dashboard/chat/marketplace/overlay/Vertical Drama/production-BGM/worker diagnostics; no errors remain in the new async task contract, mutation, or resume flow
- known_unrelated_dirty_work: existing application changes and generated/spec artifacts were preserved
- stop_conditions_met: success_criteria_met, focused_tests_passed, no_open_in_scope_blockers
- stop_reason: success with repository-wide baseline diagnostics separated
