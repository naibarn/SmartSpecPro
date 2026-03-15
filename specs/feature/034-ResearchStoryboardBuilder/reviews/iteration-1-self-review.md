# Iteration 1 Self Review

Generated: 2026-03-11
Mode: self_review

## Findings

### 1. Saved research and storyboard artifact storage target is still underspecified

Severity: high
Impact: high-impact

The plan correctly separates preview from commit, but it leaves the final storage target for committed research reports and storyboards too open-ended. If Phase 1 only marks them as committed in `agency_run_artifacts`, those outputs may remain second-class data that is hard to reuse in Library flows, ACL-controlled sharing, export, and future downstream tooling.

Recommended action:

Choose a concrete Phase 1 commit target. The strongest option is to store saved research and storyboard outputs as library-backed artifacts, while `agency_run_artifacts` remains the run-scoped index and provenance table.

### 2. Deck preview payload shape needs an explicit architectural choice

Severity: high
Impact: high-impact

The plan says deck previews should be compatible with existing presentation schemas, but it does not commit to whether the preview payload is based on `AIPresentationSlide[]`, fully materialized `PresentationSlideContent`, or an entirely new deck schema. That choice affects validation, reuse of the layout engine, and how much translation code must be owned by the router.

Recommended action:

Adopt a single preview payload contract. The recommended choice is `AIPresentationSlide[]` plus deck-level metadata, with commit-time translation through existing layout and presentation services.

### 3. Preview lifecycle and idempotent commit behavior needed to be more explicit

Severity: medium
Impact: low-impact

The original plan described preview-first behavior but did not fully specify lifecycle states or stable commit tokens.

Recommended action:

Add explicit preview lifecycle states and require commit tokens or idempotency keys.

Status:

Auto-applied to the plan.

### 4. Contract normalization between Python and Node needed stronger testing language

Severity: medium
Impact: low-impact

The original plan called out the `output` versus `response` mismatch but did not explicitly require a normalized API contract and shape-level tests.

Recommended action:

Define a canonical run response contract and require contract tests for envelope-present and text-only cases.

Status:

Auto-applied to the plan.

## Overall assessment

The plan direction is sound and aligned with both the codebase and external guidance. The remaining substantive choices are about where committed research and storyboard artifacts live in Phase 1 and what exact payload shape drives deck preview and commit. Resolving those two items will materially improve implementation clarity and reduce rework risk.
