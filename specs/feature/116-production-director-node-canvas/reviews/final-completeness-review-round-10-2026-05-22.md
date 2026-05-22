# Final Completeness Review Round 10 - 2026-05-22

## Verdict

Feature 116 planning blockers from the multi-agent completeness audit have been addressed in the planning package.

The plan is now ready to hand to deep-implement, with the expectation that implementation follows the newly tightened gates before enabling live planner, live handoff, or provider-credit-spending execution.

## Blockers Closed

### 1. Execution scheduler integration

Added explicit scheduler integration requirements to Section 10 and the implementation plan:

- `scheduleProductionExecution` coordinates existing `mediaGenerationService`, media task status/cancellation, credit deduction/refund/reconciliation, and provider polling/status paths.
- Production execution stores Production metadata on generated media tasks.
- Planning, verifier, fixture preview, handoff preview, layout edits, shot edits, and `Save to Node` never deduct credits.
- Tests now cover readiness, confirmation, submission-failure refund, terminal failed/cancelled reconciliation, cancellation, retry, task polling/status, and output attachment.

### 2. Storyboard Review / Video Edit handoff architecture

Added a server-safe shared handoff builder requirement:

- create a pure shared mapper such as `apps/web/shared/productionHandoffBuilders.ts`;
- server services use the shared builder before creating Storyboard Review tasks or Video Editor projects;
- client UI may use the same builder for preview only;
- React/client-only code must not be imported into server routers/services;
- Video Edit handoff must use server-safe `VideoEditorProject` payloads and never treat provider task IDs as clip URLs.

### 3. Feature flags and kill switches

Section 14 now includes a Feature 116 flag truth table covering:

- Production Space UI,
- React Flow preview,
- Video Shot tab,
- node config mode,
- live planner/verifier,
- Storyboard Review handoff,
- Video Edit handoff,
- run-one-node,
- run-one-shot,
- batch execution,
- emergency kill switch.

Flag precedence is explicit: emergency kill switch wins, handoff does not imply execution, and run-one-node does not imply run-one-shot or batch.

### 4. Mutating router authorization and tenant isolation tests

The TDD plan and implementation plan now require unauthenticated, missing tenant, cross-tenant, cross-user, forbidden/permission-denied, disabled-flag, and stale-version tests for new mutating procedures before implementation is complete.

### 5. MVP/full-matrix boundary

The canonical MVP boundary is now explicit across spec, implementation plan, TDD plan, Section 06, Section 12, and Section 16:

- MVP node config adapters are Image, Video, and basic TTS.
- Music, SFX, voice changer, STT, captions, delivery variants, and full matrix adapters remain deferred unless a later gate promotes them.

### 6. Migration and backward compatibility tests

Section 09 and the TDD plan now require:

- backfill/no-data-loss tests,
- rollback/read-safe tests,
- schema-version upgrade tests,
- unknown future schema handling,
- deterministic adapter reads,
- preservation of legacy run, goal, plan, verification, approval, asset plan, and projection records.

### 7. Planner failure UX

Section 01 and the TDD plan now include explicit UX states for:

- planner failed,
- planner partial output,
- planner schema invalid.

These states cannot expose provider generate controls or save malformed output as approved/executable.

## Remaining Watchpoints For Implementation

- Keep Kie Gemini Omni `audio_ids` fail-safe at one ID until provider docs or admin metadata safely prove a higher limit.
- Confirm exact flag names during code implementation if reusing existing F84-F90 fields versus adding narrower Feature 116 controls.
- Keep batch execution behind its own later flag even after run-one-node and run-one-shot ship.

## Recommended First Deep-Implement Milestone

1. Apply shared contracts and tests.
2. Add persistence/router tests with tenant isolation and migration fixtures.
3. Add flag truth-table helpers.
4. Add fixture-rendered Production UI and Video Shot UI.
5. Add Image/Video/basic TTS node config only.
6. Add safe handoff builders and snapshots before live handoff.
7. Add scheduler tests before any provider-credit-spending execution.
