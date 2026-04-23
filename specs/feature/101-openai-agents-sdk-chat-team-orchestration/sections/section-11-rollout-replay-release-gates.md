# Section 11: Rollout, Replay, And Release Gates

## Purpose

Make activation and future SDK upgrades safe. This section adds replay fixtures, compatibility gates, rollout documentation, performance checks, and rollback validation.

## Depends On

- `section-01-shared-contracts-flags`
- `section-02-persistence-migrations`
- `section-03-python-openai-agents-adapter`
- `section-04-node-runtime-client`
- `section-05-skill-capability-manifests`
- `section-06-chat-runtime-integration`
- `section-07-team-runtime-integration`
- `section-08-responses-runtime-integration`
- `section-09-shared-skill-runtime-integration`
- `section-10-ledger-ui-debug`

## Blocks

- No later implementation section. This is the release-readiness section.

## Files Owned By This Section

- `specs/feature/101-openai-agents-sdk-chat-team-orchestration/rollout.md`
- replay fixture files under the repo's existing fixture/test data conventions
- release gate test files as needed
- CI/local scripts or documentation updates for SDK upgrade validation
- Python/TypeScript tests that compare fixture output and trace shape

## Rollout Phases

Feature 101 rollout covers Chat, Team, Responses, and shared skill runtime, with separate shadow/active control per surface. Media Studio prompt/custom-skill calls are validated as part of the shared skill surface, not as a separate media-generation rollout surface.

Phase 0: Adapter introduced

- flags disabled
- no user-visible runtime changes
- adapter tests pass

Phase 1: Chat shadow

- Chat SDK runtime runs in shadow
- legacy remains visible source of truth
- no side effects
- comparison traces recorded

Phase 2: Team shadow

- Team SDK runtime evaluates plan/step/review behavior in shadow where safe
- no duplicate external media or connector writes
- comparison traces recorded

Phase 3: Responses and shared skill shadow

- Responses SDK runtime evaluates structured-output/schema behavior in shadow where safe
- shared skill runtime evaluates internal skill selection and typed output behavior in shadow
- Media Studio `enhancePrompt` and `executeCustomSkill` calls are included here through the shared skill surface
- no duplicate external side effects
- comparison traces recorded

Phase 4: Controlled active cohort

- enable Chat, Team, Responses, or shared skill active for small cohort per surface
- monitor trace drift, errors, latency, completion, review quality, and schema-validity drift
- rollback available for new work

Phase 5: Broader adoption

- expand only after gates pass

## Replay Fixtures

Create fixtures for:

- simple Chat skill selection
- Chat approval-required interruption
- Chat malformed/blocked permission envelope
- Team successful plan with all steps passing
- Team review failure then repair pass
- Team blocked approval checkpoint
- Team incomplete budget/cap terminal reason
- Responses schema-valid success
- Responses schema-invalid failure
- Responses approval-required checkpoint
- shared skill successful typed output
- shared skill schema-invalid failure
- shared skill recursive ceiling stop
- Media Studio `enhancePrompt` prompt-package success
- Media Studio `executeCustomSkill` typed prompt/custom-skill success
- Team legacy run without runtime metadata
- duplicate stream event delivery

Fixture comparison should report:

- selected skill drift
- selected model/provider drift
- review verdict drift
- trace shape drift
- terminal reason drift
- completion drift

## SDK Upgrade Gate

Every SDK update requires:

1. exact dependency pin update
2. adapter contract tests
3. gateway model tests
4. import guard tests
5. trace redaction tests
6. stream/resume/cancel tests
7. Chat replay fixtures
8. Team replay fixtures
9. Responses replay fixtures
10. shared skill replay fixtures
11. shadow canary
12. rollback validation
13. mixed-deploy `current/current-1` compatibility validation

`rollout.md` must document:

- dependency file to edit
- lock/constraints regeneration command if applicable
- focused Python test command
- focused TypeScript test command
- replay comparison command
- rollback procedure
- promotion checklist
- operator recovery playbook with scenario matrix
- implementation and manifest ownership matrix

## Performance Gates

Track and gate:

- Chat shadow p95 time-to-first-visible-status no more than 15% regression against legacy
- Team shadow p95 time from run start to persisted plan artifact no more than 20% regression
- adapter-to-durable-trace persistence lag <= 2s at p95
- trace persistence overhead <= 10% wall-clock overhead at p95
- skill-selection drift <= 5% against approved replay baseline
- Team review-verdict mismatch <= 2% against approved replay baseline
- mandatory Team step first-attempt coverage before any cap-based stop = 100%
- schema-invalid outputs accepted as success = 0
- duplicate step advancement incidents = 0
- persisted step-link coverage for durable records >= 99%
- contract-validation failures in promoted cohorts = 0

Promotion soak requirements:

- minimum 72 hours in canary for each surface before broader promotion
- at least 200 Chat turns
- at least 50 Team runs
- at least 100 Responses calls
- at least 100 shared-skill calls, including Media Studio prompt/custom-skill calls

If exact telemetry infrastructure is not available yet, this section should add structured log markers and testable measurement hooks so operations can compute these metrics.

## Rollback Validation

Tests and docs must prove:

- force rollback routes new Chat work to legacy
- force rollback routes new Team work to legacy
- existing SDK traces remain readable after rollback
- no database rollback required
- frozen SDK run does not silently become legacy mid-run
- frozen legacy run does not silently become SDK mid-run

## Operator Recovery Playbook

`rollout.md` must include a recovery playbook covering at least:

- adapter unavailable or timed out
- unsupported contract version during mixed deploy
- plan persisted but step links missing
- Team plan review failure requiring planner repair
- repeated schema-invalid output in Responses or shared skill runtime
- stuck Team step in `in_progress` or `in_review`
- duplicate or missing stream events
- missing or invalid manifest
- Media Studio prompt/custom-skill failure on shared runtime path

Each playbook entry must include:

- visible symptoms
- logs/queries/traces to inspect
- safe immediate action
- permitted recovery actions
- escalation owner

## Implementation And Manifest Ownership Matrix

Release documentation must name at least:

- runtime contract owner
- Python adapter owner
- persistence/projection owner
- Team UI/ledger owner
- skill manifest schema/registry owner
- Media Studio prompt-skill manifest owner
- rollout/replay/runbook owner

## TDD Tests To Write First

Replay tests:

- Test Chat fixture comparison detects skill drift.
- Test Chat fixture comparison detects trace-shape drift.
- Test Team fixture comparison detects missing step attempt.
- Test Team repair fixture confirms repair loop sequence.
- Test Responses fixture comparison detects schema-validity drift.
- Test shared skill fixture comparison detects typed-output drift.
- Test Media Studio prompt/custom-skill fixtures compare selected skill, schema validity, and prompt-package parity.
- Test duplicate stream fixture confirms idempotency.

Upgrade tests:

- Test SDK dependency is exactly pinned.
- Test adapter reports SDK version.
- Test replay command fails on verdict drift.
- Test direct provider URL fixture fails.
- Test `current/current-1` mixed-deploy contract compatibility.

Performance tests/hooks:

- Test trace events include enough timing metadata to compute p95 lag.
- Test plan persisted timestamp exists before first execution timestamp.
- Test trace persistence timing hook exists.

Rollback tests:

- Test rollback flag wins for new Chat.
- Test rollback flag wins for new Team.
- Test rollback flag wins for new Responses work.
- Test rollback flag wins for new shared skill work.
- Test old SDK traces still render.
- Test no schema rollback needed.

Documentation tests:

- Test `rollout.md` exists.
- Test `rollout.md` names dependency file, test commands, replay commands, rollback steps, promotion checklist, recovery playbook, and ownership matrix.

## Implementation Notes

- Do not promote active mode automatically.
- Keep rollout docs operational and concrete.
- Prefer deterministic fixtures over flaky live calls.
- Use mocked adapter responses for most replay tests; use adapter contract tests for SDK-specific behavior.

## Acceptance Criteria

- Rollout documentation exists.
- Replay fixtures cover Chat, Team, Responses, and shared skill success/failure/repair/checkpoint/legacy paths.
- SDK upgrade validation path is documented and tested.
- Rollback path is documented and tested.
- Performance measurement hooks exist.
- Release gates can catch skill, verdict, trace, completion, and gateway drift.
- Release gates also catch mixed-deploy incompatibility, missing step-link coverage, and missing ownership/runbook documentation.
