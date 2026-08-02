# Orchestra Progress

## Active task: layered loading resilience - 2026-08-01

Loop policy:
  orchestra_id: fable_style_coding_orchestra
  purpose: implement approved SmartAIHub auth/tenant/page, analytics, and SSE resilience layers
  iteration: 9/12
  tool_call_batches: unknown/30
  estimated_cost_usd: unknown <= 0.50
  dispatch_waves: 0/6
  active_subagents: 0/4
  parallel_writers: 0/2
  required_subagent_wait: 0/10 minutes
  background_subagent_wait: 0/15 minutes
  repair_rounds: 0/5
  stop_conditions: success_criteria_met, tests_passed, no_open_blockers
  stop_reason: success_with_rollout_deferred

[COMPLETE] preflight — read AGENTS.md and approved design spec; existing worktree is heavily dirty and unrelated changes are preserved
[COMPLETE] discovery — SocratiCode tools unavailable; targeted shell/source/runtime evidence already identified auth blank gate, analytics enum drift, and SSE eviction churn
[COMPLETE] implementation — bounded auth/tenant bootstrap, shared visible retry states, analytics enum correction, and SSE eviction-log limiter
[COMPLETE] focused verification — web 12 tests, Python analytics 24 tests, diff check, and local route/auth/tenant/backend probes pass
[COMPLETE] build — `apps/web` production web + widget build pass
[OPEN] repository typecheck — `npm run check` still reports unrelated existing errors in other app files; no errors reported in touched files
[OPEN] production rollout — intentionally not deployed or restarted; explicit approval still required

Verification evidence:
  web_tests: `npm exec -- vitest run client/src/lib/__tests__/authBootstrap.test.ts client/src/components/__tests__/RouteLoadingSkeleton.test.tsx client/src/hooks/__tests__/useTenantFeatureFlag.status.test.ts server/routes/__tests__/notificationStreamDiagnostics.test.ts` -> 4 files, 12 passed
  python_tests: `DEBUG=false uv run pytest --no-cov -q tests/unit/services/test_analytics_service.py` -> 24 passed, 4 deprecation warnings
  build: `npm run build` -> web and widget built successfully
  local_probes: route/auth.me/tenant/current/backend health -> HTTP 200; route 4.7ms, auth 4.0ms, tenant 2.8ms, backend 5.5ms
  diff_check: targeted `git diff --check` -> clean

Gap closure:
  must_do_now: none; all approved code paths have focused coverage or build evidence
  should_offer_next:
    - authenticated browser smoke of the timeout/retry route state after deployment
  safely_deferred:
    - production deploy/restart and live analytics/SSE observation | external service side effect requires explicit approval
    - full repository TypeScript/Ruff cleanup | unrelated pre-existing errors; residual risk is repository-wide gate noise
  no_action_needed:
    - Vertical Drama detail page-specific error/retry state | already present and verified by existing page tests/build

Loop policy final:
  iterations_used: 9/12
  tool_call_batches_used: unknown/30; conservative proxy low
  estimated_cost_usd: unknown/0.50; conservative proxy low
  dispatch_waves_used: 0/6
  timed_out_subagents: none
  repair_rounds_used: 0/5
  stop_conditions_met: [success_criteria_met, focused_tests_passed, no_in_scope_blockers]
  stop_reason: success_with_rollout_deferred

Loop policy:
  orchestra_id: fable_style_coding_orchestra
  purpose: implement Kie GPT Image 2 automatic mode routing
  iteration: 7/12
  tool_call_batches: 28/30
  estimated_cost_usd: unknown <= 0.50
  dispatch_waves: 0/6
  active_subagents: 0/4
  parallel_writers: 0/2
  required_subagent_wait: 0/10 minutes
  background_subagent_wait: 0/15 minutes
  repair_rounds: 0/5
  stop_conditions: success_criteria_met, tests_passed, no_open_blockers
  stop_reason: success

[COMPLETE] discovery — traced catalog, UI request, gateway, and Kie payload boundaries
[COMPLETE] option-analysis — compared canonical-row, frontend-switch, and scoped provider resolver approaches
[COMPLETE] design-gate — user approved the scoped provider-routing design
[COMPLETE] implementation — unified catalog row, compatibility alias, migration, and opt-in provider resolver
[COMPLETE] verification — focused web and Python tests pass; lint and diff checks pass

Sub-agent lifecycle:
  none; standard light mode and no user authorization for delegation

Loop policy final:
  iterations_used: 7/12
  tool_call_batches_used: 28/30
  estimated_cost_usd: unknown/0.50; conservative proxy low
  dispatch_waves_used: 0/6
  timed_out_subagents: none
  repair_rounds_used: 2/5
  stop_conditions_met: [success_criteria_met, focused_tests_passed, no_open_blockers]
  stop_reason: success

Gap closure:
  must_do_now: none
  should_offer_next:
    - apply migration 0212 through the normal deployment workflow
  safely_deferred:
    - repository-wide TypeScript cleanup; current failures are unrelated existing errors
    - live Kie paid generation smoke and database migration apply; external side effects
  no_action_needed:
    - unrelated media models; design uses explicit per-model opt-in metadata

## Migration deployment - 2026-07-20

[COMPLETE] preflight — confirmed localhost:5432/smartspec and live latest migration state
[COMPLETE] backup — captured and verified media_models plus Drizzle ledger archive
[COMPLETE] dry-run — migration SQL updated two rows inside a rolled-back transaction
[COMPLETE] apply — corrected journal ordering and applied migration 0212
[COMPLETE] verify — live hash, row state, idempotence, focused tests, and diff checks pass

## GPT Image 2 production routing incident - 2026-07-20

[COMPLETE] evidence — task dffa05d34f1737c7df813c00b640e87f had three references but Kie received text-to-image
[COMPLETE] runtime repair — drained and restarted only smartspec-celery-media
[COMPLETE] history repair — async image API now persists and queues the opt-in effective model ID
[COMPLETE] rollout — restarted smartspec-backend with health-gated verification
[COMPLETE] proof — 31 focused tests pass; worker queue and backend health are ready

Evidence ledger:
  source: database row plus Celery provider log
  identifier: media task ab0213ca-ccd6-46d2-9eae-28748f6e727a / Kie task dffa05d34f1737c7df813c00b640e87f
  observed failure: kie_ai_create_task model=gpt-image-2-text-to-image with input_urls
  data state: completed with three reference_image_urls
  confidence: high
  next evidence needed: optional next user generation log for paid live-provider proof

Gap closure:
  must_do_now:
    - stale journal timestamp | fixed and migration reapplied
  should_offer_next:
    - none
  safely_deferred:
    - paid live Kie generation smoke; external provider cost
  no_action_needed:
    - legacy row deletion; retained disabled for rollback and compatibility

## Vertical Drama rapid prompt plus image timeout - 2026-07-21

[COMPLETE] evidence - production logs and rows prove eight duplicate full-plan runs for episode 114
[COMPLETE] TDD - regression checks failed on the old whole-plan per-shot path
[COMPLETE] implementation - per-shot prompt mutation now materializes and row-lock-merges missing frames
[COMPLETE] verification - 19 focused tests and diff check pass; touched ranges have no TypeScript errors
[PENDING] rollout - web restart is intentionally deferred because the shared production worktree contains extensive unrelated uncommitted changes

Evidence ledger:
  source: screenshot, server-log, db-row, test-output
  identifier: episode 114; run ids 363-370
  observed failure: concurrent full start-frame planning exceeded the proxy timeout while duplicate server work completed
  data state: duplicate runs succeeded; media queue drained to zero
  confidence: high
  next evidence needed: browser smoke after a safe scoped rollout

Gap closure:
  must_do_now: none in the source fix
  should_offer_next:
    - deploy through a clean/scoped rollout and verify rapid clicks in the browser
  safely_deferred:
    - production restart; current dirty worktree would activate unrelated changes
  no_action_needed:
    - Cloudflare timeout increase; the duplicate long-running request path was removed from the per-shot action

## Hermes reference download and Media History incident - 2026-07-20

Loop policy:
  orchestra_id: fable_style_coding_orchestra
  purpose: fix Hermes reference downloads and include Hermes in Media History
  iteration: 1/12
  tool_call_batches: 8/30
  estimated_cost_usd: unknown <= 0.50; conservative proxy low
  dispatch_waves: 0/6
  active_subagents: 0/4
  parallel_writers: 0/2
  required_subagent_wait: 0/10 minutes
  background_subagent_wait: 0/15 minutes
  repair_rounds: 0/5
  stop_conditions: success_criteria_met, tests_passed, no_open_blockers
  stop_reason: active

[COMPLETE] evidence — latest Hermes job failed with HTTP 404 while downloading three references
[COMPLETE] design — canonical storage key plus read-only worker_jobs history projection
[IN_PROGRESS] TDD — add focused regression tests before implementation

Evidence ledger:
  source: database row plus worker job events
  identifier: worker job 08e15bee-8ca7-47d5-9c33-6ca87d34bc6a
  observed failure: HERMES_REFERENCE_DOWNLOAD_FAILED with HTTP 404
  data state: failed at downloading_references with three frozen references
  confidence: high
  next evidence needed: fresh signed URL HTTP status after fix

[COMPLETE] TDD — regression tests reproduced proxy-key presign failure and missing history projection
[COMPLETE] implementation — canonicalized managed storage URLs and merged Hermes projections into media.listTasks
[COMPLETE] data proof — all three production reference assets returned HTTP 200; 17 Hermes jobs projected for user 1
[COMPLETE] verification — 64 focused tests, TypeScript check, and diff check pass
[COMPLETE] rollout — restarted only smartspec-web; local and public healthz return ok
[COMPLETE] review convergence — one clean targeted conductor review after the last fix

Loop policy final:
  iterations_used: 5/12
  tool_call_batches_used: 14/30
  estimated_cost_usd: unknown/0.50; conservative proxy low
  dispatch_waves_used: 0/6
  timed_out_subagents: none
  repair_rounds_used: 1/5
  stop_conditions_met: [success_criteria_met, tests_passed, no_open_blockers]
  stop_reason: success

Gap closure:
  must_do_now:
    - unstable timestamp fixture | fixed with deterministic createdAt and reran stale gates
  should_offer_next: none
  safely_deferred:
    - paid live Grok image retry | external provider credit spend; user can retry from the same shot
  no_action_needed:
    - duplicate media_tasks persistence | avoided by projecting authoritative worker_jobs

## Media polling and rate-limit incident - 2026-07-20

[COMPLETE] containment — backed up and failed the only abandoned MCP task
[COMPLETE] routing — MCP fetch-result remains in Node; direct tasks remain in Python
[COMPLETE] polling — stable single-flight scheduler prevents rerender feedback loops
[COMPLETE] rate-limit — verified JWT identities receive isolated buckets
[COMPLETE] reconciliation — image/audio hard timeout reduced to 2 hours
[COMPLETE] verification — 76 focused tests, TypeScript, Ruff, health, and live log observation pass

Evidence ledger:
  source: production logs, database row, deterministic tests, post-deploy observation
  identifier: mcp_815c37bf01582291e6bb200d7b9960a1
  observed failure: 354 wrong-backend fetch-result calls in about 100 seconds exhausted ip:127.0.0.1
  data state: incident task failed; pending MCP task count zero
  confidence: high
  next evidence needed: none for recurrence prevention

Loop policy final:
  iterations_used: 3 sections
  tool_call_batches_used: exact telemetry unavailable
  estimated_cost_usd: unknown
  dispatch_waves_used: 0
  timed_out_subagents: none
  repair_rounds_used: 2 (test fixture and ignored test-path repair)
  stop_conditions_met: [incident_contained, focused_tests_passed, production_observation_clean]
  stop_reason: success

Gap closure:
  must_do_now: none
  should_offer_next:
    - optional paid Kie generation smoke for upstream evidence
  safely_deferred:
    - paid provider smoke; external cost and not required to prove internal 429 repair
  no_action_needed:
    - global rate-limit increase; root request loop and identity collision were fixed

## Hermes Vertical Drama reference forwarding - 2026-07-20

[COMPLETE] evidence — production job 3487f6bb had prompt Image 1-3 but references=[]
[COMPLETE] root cause — legacy media_assets rows store the full storage proxy path
[COMPLETE] TDD — prefixed-path resolution and required-reference fail-closed coverage
[COMPLETE] integration — Vertical Drama Hermes image surfaces require all supplied references
[COMPLETE] production — web service restarted healthy; assets 200, 219, 233 resolve and hash

Evidence ledger:
  source: production database row, media asset rows, test output, server log
  identifier: worker job 3487f6bb-b7c2-444b-9574-4e3cc7502f72
  observed failure: operation=image.generate and reference_count=0 despite Image 1-3 prompt
  data state: expected assets 200, 219, 233 exist under the same tenant/user
  confidence: high
  next evidence needed: none for the forwarding defect

Verification:
  focused_tests: 87 passed
  episode_hermes_subset: 2 passed
  production_asset_resolution: [200, 219, 233]
  production_reference_contract: 3 references with 64-character sha256 values
  health: local and public healthz passed
  typecheck: blocked by 140 pre-existing repository-wide errors; no error in hermesMediaReferences

Gap closure:
  must_do_now: none
  safely_deferred:
    - paid live Grok image regeneration; external account cost and user-visible asset replacement
  no_action_needed:
    - Worker release; 0.1.144 already forwards downloaded reference paths

## Marketplace Auto Review legacy-vs-staged surface - 2026-07-26

Loop policy:
  orchestra_id: fable_style_coding_orchestra
  purpose: prevent legacy aggregate timelines from masquerading as the staged 9-shot workbench
  iteration: 1/4
  tool_call_batches: 8/12
  dispatch_waves: 0/2
  active_subagents: 0/1
  repair_rounds: 1/2
  stop_conditions: focused_tests_passed, build_passed, no_open_in-scope-blockers
  stop_reason: success

[COMPLETE] evidence — screenshot and source routing prove the selected run is Legacy, not staged
[COMPLETE] TDD — regression test requires legacy timeline to be hidden until explicitly opened
[COMPLETE] implementation — added explicit legacy-history disclosure while preserving outputs and migration CTA
[COMPLETE] verification — 19 focused tests, build, and diff check pass; full typecheck remains red only on unrelated existing files

Gap closure:
  must_do_now: none
  should_offer_next:
    - create/select a new staged job for browser smoke of the 9-shot board
  safely_deferred:
    - converting historical Legacy rows into staged checkpoints; requires a data migration and cannot be inferred safely
  no_action_needed:
    - paid image/video generation; this patch does not submit provider work

## Feature 137 P3 + facing-aware consumer - 2026-08-01

Loop policy:
  orchestra_id: feature_137_p3_identity_qc
  purpose: close code-side P3 gaps without claiming live provider evidence
  iteration: 1/2
  active_subagents: 0
  repair_rounds: 1/2
  stop_conditions: focused_tests_passed, diff_clean, no_changed_surface_type_errors
  stop_reason: success; live rollout evidence remains intentionally deferred

[COMPLETE] sampling — media-queue ffmpeg sampler, R2 rehost, bounded wait/poll endpoint
[COMPLETE] QC — one-call vision skill, fail-open persistence, manual-only repair
[COMPLETE] consumer — explicit-facing angle selection with primary fallback
[COMPLETE] UX — clip badge, issue notes, manual re-check; generated/imported trigger parity
[COMPLETE] verification — shared 2 tests; Python endpoint 2 tests; diff check clean
[DEFERRED] external evidence — authorized provider/browser smoke and labeled calibration
