# Section 06 - Learning Benchmarks and Promotion

## Overview

This section defines the post-run learning loop for workpacks. Its job is to turn completed runs, simulation results, replay diffs, exception history, and ROI metrics into improvement proposals, benchmark packs, and promotion decisions without creating a parallel learning engine.

The implementation must reuse the existing skill-improvement substrate, preserve the trust boundary around tainted outputs, and keep promotion reversible at every step. Feature 079 remains the reusable workpack layer; persistent role ownership still belongs to Feature 080.

**Dependencies**
- `section-01-shared-contracts-and-persistence`
- `section-03-workpack-compiler-and-routing`
- `section-04-simulation-replay-and-exceptions`

**Blocks**
- `section-07-control-plane-ui-surfaces`
- `section-08-telemetry-rollout-and-gating`

---

## Scope

This section owns the logic that answers three questions after a workpack has run:

1. What should we learn from the run?
2. Is the result stable enough to publish as a benchmark or reuse as a safer default?
3. Can the promotion happen without violating trust, provenance, or rollback guarantees?

The section should cover:

- converting run outcomes into improvement proposals
- grouping proposals by workpack, connector, runtime, and failure pattern
- publishing benchmark packs with fixtures, evaluation rules, and version lineage
- enforcing trust-taint rules so unverified or locally constrained outputs do not escape their boundary
- supporting reversible promotion and rollback when later evidence regresses
- feeding low-risk improvements back into existing skill improvement flows

The section should not:

- introduce a second autonomous learning engine
- bypass `skillStudioService.ts` or `skillUpgradeApplier.ts`
- promote any workpack version that lacks replay-grade evidence
- conflate workpack promotion with persistent role-agent ownership

---

## Files to Create or Modify

| File | Action | Purpose |
|---|---|---|
| `/home/dev/projects/SmartSpecPro/apps/web/shared/workpackPromotion.ts` | Create or modify | Shared enums and schemas for promotion state, benchmark-pack metadata, trust-taint markers, and rollback lineage |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/workpackLearningService.ts` | Create | Aggregate run evidence and derive improvement proposals |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/workpackPromotionService.ts` | Create | Validate promotion eligibility, publish benchmark packs, and record reversible promotion state |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillStudioService.ts` | Modify | Accept workpack-derived improvement proposals and route them through the existing skill improvement flow |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillUpgradeApplier.ts` | Modify | Apply only low-risk, policy-cleared workpack improvements and preserve compatibility checks |
| `/home/dev/projects/SmartSpecPro/apps/web/server/routers/workpack.ts` | Create or modify | Add proposal, benchmark, promotion, rollback, and readiness endpoints |
| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` or the feature's persistence module | Modify | Persist benchmark-pack state, promotion records, and rollback lineage if the shared persistence layer requires dedicated tables |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/workpackLearningService.test.ts` | Create | Service tests for proposal generation and grouping logic |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/workpackPromotionService.test.ts` | Create | Service tests for eligibility, rollback, and trust-taint enforcement |
| `/home/dev/projects/SmartSpecPro/apps/web/shared/__tests__/workpackPromotion.test.ts` | Create | Shared schema and enum validation tests |

---

## Implementation Guidance

### 1. Define promotion vocabulary first

Add a compact shared contract layer for learning and promotion concepts before wiring any server logic. The shared model should include:

- `promotion_state` values such as `draft`, `candidate`, `pending_review`, `approved`, `active`, `rolled_back`, and `blocked`
- `benchmark_pack` metadata for source workpack, source version, cloned-from lineage, fixtures, evaluation rules, and trust class
- `improvement_proposal` metadata for the originating run, failure pattern, suggested target, and risk score
- trust-taint markers that describe whether a proposal or benchmark was produced from verified, local-only, manually overridden, or otherwise constrained inputs
- rollback references so a promotion can be reversed without losing the evidence trail

Keep the schema narrow and explicit. If a field cannot be validated from replay, simulation, or run evidence, it should remain nullable or be absent rather than being guessed.

### 2. Build an evidence aggregator for runs

Implement a server-side learning service that consumes the replay-grade records from Section 04 and the execution outputs from Section 03. The service should read:

- `workpack_run` records
- `simulation_run` records
- `workpack_exception` records
- `metric_snapshot` records
- connector or runtime-specific evidence already attached to the run ledger

The service should normalize these signals into a single evidence bundle per workpack version, then derive improvement proposals from patterns such as:

- repeated exception reasons
- recurring replay drift
- brittle connector mappings
- manual intervention hotspots
- low-risk prompt, fixture, or workflow adjustments
- stable successful runs that are good benchmark candidates

Proposals should be grouped by likely action type so downstream services can route them cleanly:

- skill improvement
- fixture update
- workflow refinement
- connector map adjustment
- policy threshold review
- benchmark publication

### 3. Reuse the existing skill-improvement substrate

The new learning flow should not invent its own content-upgrade pipeline. Instead:

- `skillStudioService.ts` should remain the place where improvement artifacts are prepared or launched
- `skillUpgradeApplier.ts` should remain the place where compatibility and auto-apply decisions are enforced
- the new learning service should only produce workpack-derived proposals, classify their risk, and hand them off to the existing improvement path

Use explicit routing rules:

- low-risk proposals with stable evidence may be forwarded for auto-applicable review
- medium-risk proposals should be surfaced as reviewable recommendations
- high-risk proposals should remain blocked or require manual approval

Do not allow workpack learning to become a shortcut around existing skill safety checks.

### 4. Publish benchmark packs with lineage and fixtures

Benchmark publication should happen only when the source workpack version is stable and the evidence bundle is clean enough to trust.

The benchmark publisher should require:

- an immutable source workpack version
- a stable evaluation fixture set
- replay or simulation evidence showing expected behavior
- explicit trust classification for the source artifacts
- a publication-scope decision that defaults to tenant-local until broader sharing is cleared
- cloneable metadata so later teams can fork the benchmark without mutating the original

Published benchmark packs should record:

- source workpack and version
- evaluation inputs and expected outputs
- accepted connector and runtime envelope
- risk tier and default autonomy mode
- publication timestamp and publisher identity
- any trust limitations inherited from the source
- publication scope and de-identification status for fixtures and outputs

Benchmarks must be versioned and cloneable. Publishing a new benchmark should never rewrite the historical source record in place.

Cross-tenant or globally shared benchmark publication should require:

- de-identified fixtures and outputs
- no restricted lineage that still points at raw tenant-confidential artifacts
- explicit trust clearance for any artifact that was previously local-only or manually overridden

When these conditions are not met, the benchmark may still exist as a tenant-local asset, but it must not be published into a broader library.

### 5. Enforce trust-taint and fail-closed promotion rules

The promotion service must treat trust as a first-class gate, not as a note.

Promotion should be blocked when any of the following are true:

- the run or replay evidence is incomplete
- the source version has changed since the evidence was gathered
- the workpack touched constrained, local-only, or manually overridden artifacts that have not been cleared for sharing
- the resulting benchmark would escape its trust boundary without explicit clearance
- the promotion candidate cannot be reproduced from the stored fixture set

Trust-tainted outputs may still generate proposals, but they must not silently enter shared benchmark surfaces or autonomous defaults.

Publishing should inherit the most restrictive trust and sensitivity labels from the underlying evidence until an explicit clearance step records otherwise.

If the promotion eligibility cannot be determined, the service must fail closed and return a structured blocked state with a reason code and remediation pointer.

### 6. Make promotion reversible

Every promotion should be reversible by design. The service should store enough lineage to answer:

- which version was promoted
- what evidence supported the promotion
- which benchmark pack or autonomous default was changed
- what changed it
- how to roll back to the previous safe state

Use a promotion record that keeps the previous active state intact until the new state is confirmed. If later evidence shows regression, the rollback path should:

- revert the active benchmark or promotion pointer
- preserve the rejected promotion record
- keep the evidence bundle attached for debugging and audit
- update the readiness state so the UI and rollout gates can see the regression

Rollback is not an exceptional case; it is part of the promotion contract.

### 7. Expose readiness outputs for downstream surfaces

This section should produce a readiness summary that later UI and telemetry layers can consume without recalculating promotion logic. The summary should include:

- promotion state
- evidence completeness
- recent intervention rate
- exception cluster severity
- trust-taint status
- benchmark availability
- rollback eligibility

Use this summary as the single source of truth for whether a workpack is ready for supervised reuse, candidate benchmark publication, or autonomous rollout.

---

## TDD Expectations

Write tests before implementation for the following behaviors:

### Shared contract tests

- valid promotion states, trust-taint markers, and benchmark-pack metadata round-trip through schema validation
- invalid or incomplete promotion payloads are rejected
- benchmark lineage and rollback references remain serializable and parseable
- publication scope and de-identification state remain explicit in benchmark metadata

### Learning service tests

- repeated run outcomes produce grouped improvement proposals
- stable successful runs produce benchmark-candidate output
- low-risk and high-risk proposals are separated correctly
- proposals do not mutate source workpack state directly

### Promotion service tests

- promotion is blocked when evidence is incomplete or stale
- promotion is blocked when trust-taint has not been cleared
- promotion produces a reversible record when eligibility passes
- rollback restores the previous active state and preserves audit history
- promotion eligibility fails closed when the service cannot determine trust or stability
- benchmark publishing defaults to tenant-local scope and blocks broader sharing when de-identification or trust clearance is missing

### Skill substrate integration tests

- low-risk proposals are forwarded into the existing skill improvement flow
- compatibility checks still gate auto-application
- the new learning flow does not bypass `skillUpgradeApplier.ts`

### Router tests

- workpack learning, benchmark, promotion, and rollback endpoints return stable shapes
- blocked promotion responses include structured reason codes and remediation hints
- router handlers remain thin and delegate logic to services

### Regression expectations

- existing skill improvement behavior remains intact
- existing monitoring and run telemetry behavior remains intact
- no new persistent role-agent concept is introduced in this section

Recommended test locations:

- `/home/dev/projects/SmartSpecPro/apps/web/shared/__tests__/workpackPromotion.test.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/workpackLearningService.test.ts`
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/workpackPromotionService.test.ts`
- extend existing tests in `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/skillUpgradeApplier.test.ts` if the workpack handoff changes

---

## Acceptance Criteria

- Run outcomes can be converted into grouped improvement proposals without mutating the source pack.
- Stable workpacks can be published as benchmark packs with fixtures, evaluation rules, and version lineage.
- Promotion is blocked whenever evidence, provenance, or trust-taint is unresolved.
- Promotion can be rolled back cleanly without losing the evidence trail.
- Low-risk workpack improvements flow through the existing skill improvement substrate.
- Shared benchmark or autonomous surfaces never receive tainted output without explicit clearance.
- Benchmark sharing defaults to tenant-local scope until fixtures and outputs are de-identified and explicitly cleared for broader reuse.
- Readiness outputs are produced in a stable enough form for Section 08 to consume without reinterpreting promotion logic.
