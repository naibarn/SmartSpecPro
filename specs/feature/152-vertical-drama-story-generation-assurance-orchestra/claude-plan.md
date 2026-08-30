# Feature 152 Implementation Plan

## Execution rules

- Use TDD for each section: write the smallest failing focused test, implement
  the contract, then run the section test and typecheck the touched package.
- Use `apply_patch` for source changes and preserve unrelated worktree edits.
- Do not reformat whole files or change generated/build artifacts.
- Use existing Drizzle, tRPC, BullMQ, Redis, Feature 132, and Feature 151
  primitives before adding dependencies.
- Every section must update the relevant focused test and record unresolved
  issues in the section notes rather than silently skipping them.

## Section 01 — contracts and canonical evidence

Create the TypeScript domain types and pure helpers for run contracts,
canonicalization, stable beat IDs, source snapshots, rule-pack results, status
transitions, fingerprints, and API summaries. Add tests for deterministic
hashes, legacy derived IDs, strict source/feature-flag snapshots, status
transition rejection, and transport-vs-logical completion. No database or LLM
calls belong in this section.

## Section 02 — durable schema and credit safety

Add the additive `vertical_drama_story_generation_runs` persistence model and
migration, plus the minimal episode-run linkage required by the contract. Add
durable run/attempt/artifact/approval repository functions. Harden credit
reservations with idempotency and recovery semantics while preserving existing
public credit behavior. Test migration shape, tenant scoping, uniqueness, retry
idempotency, reservation ceiling, refund/commit behavior, and Redis-loss
fallback boundaries.

## Section 03 — state machine, leases, events, and finalization

Implement the repository-backed state machine: admission, checkpoint writes,
lease renewal, fencing, queue dedupe, resume, cancel, approval, reconciliation,
and candidate-to-active finalization. Reuse runtime trace/checkpoint tables for
append-only events where appropriate. Test stale workers, duplicate delivery,
replayed event cursors, cancellation with unknown provider outcome, finalization
retries, and no-success-before-final-gate.

## Section 04 — context, validation, alignment, and repair

Build the bounded context pack and connect existing Feature 132 quality
criteria, scene contracts, continuity ledgers, dramaturgy critic, and targeted
revision. Add deterministic rule packs and alignment ledger checks. Implement a
repair planner that selects only impacted episodes/scenes and requires approval
for cross-episode/structural findings. Test draft-vs-plan mismatch, continuity
breaks, repair impact closure, criteria-version drift, and repair-budget
exhaustion.

## Section 05 — story jobs, router, API, and rollout compatibility

Adapt the existing Redis/BullMQ story jobs to durable parent runs without
removing old callers. Make deep generation, extension, and improvement enter
the same admission/checkpoint/final-gate path. Add tRPC operations for get,
resume, repair, approval, rejection, cancel, and validation. Map pending and
resumable states to 202-compatible logical outcomes. Ensure legacy quality-loop
writes cannot bypass candidate/approval/finalization.

## Section 06 — UI truthfulness and recovery actions

Update the series detail flow to show planning, validation, repairing,
reconciliation, partial, needs-repair, approval, rejected, and failed states.
Expose checkpoint progress, blocking findings, impacted scope, estimated cost,
and the correct resume/repair/approve/reject/cancel action. Keep optimistic UI
from treating a queued HTTP response as completion. Add component tests for all
state/action combinations and accessibility labels; browser proof remains a
separate validation boundary.

## Section 07 — Feature 151 adapter and optional Agents SDK

Implement the registry adapter that derives an `AgentTaskContract`, maps the
run contract to runtime budgets/evidence/output/side-effect policy, and verifies
Node-computed hashes. Add skills for context packing, plan alignment, continuity
review, and repair planning. If the package is already installed, add an
adapter behind a flag using structured output, tool guardrails, redacted
tracing, bounded turns/concurrency, and Node approval. If not installed, keep a
typed no-op adapter and do not add a dependency just to satisfy the optional
path. Test contract parity and flag-off behavior.

## Section 08 — observability, security, rollout, and runbook

Add redacted metrics/events, tenant-safe logging, retention cleanup hooks,
operator diagnostics, and a rollout/runbook document. Add migration preflight
and rollback checks; explicitly distinguish local evidence from production
evidence. Test authorization, tenant isolation, sensitive-data redaction,
retention boundaries, and feature-flag compatibility.

## Section 09 — end-to-end proof and gap closure

Add deterministic golden fixtures and replay tests for complete, partial,
stale-worker, provider-unknown, credit-failure, approval, repair, and resume
flows. Run focused tests, package typecheck, migration checker, and static
spec/section checks. Review the implementation against all 32 acceptance
criteria and loop over any unmet criterion until it has code and proof or is
explicitly blocked by an external boundary.

## Verification commands

- `npm --workspace apps/web test -- <focused test files>`
- `npm --workspace apps/web run check`
- `uv run /home/dev/.codex/skills/deep-plan/scripts/checks/check-sections.py --planning-dir specs/feature/152-vertical-drama-story-generation-assurance-orchestra`
- `uv run /home/dev/.codex/skills/deep-implement/scripts/checks/check-implementation.py --sections-dir specs/feature/152-vertical-drama-story-generation-assurance-orchestra/sections`
- `git diff --check -- <owned paths>`

Production migration, browser, provider, and deployment checks must be reported
as not run unless separately executed.
