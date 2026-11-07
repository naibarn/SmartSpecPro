# Section 02 — Bounded Optimization and Learning

## Requirement IDs

LEARN-01, NB-03, NB-06, NB-07

## Objective

Use verified, version-bound outcome evidence for optional recommendations while preserving current routing and explicit authorization for every paid change.

## Owned paths

Existing Feature 149 learning/QC ledger, current provider/model routing and recommendation interfaces, series/episode result lineage and focused tests.

## Tasks

1. Reconcile Feature 149's canonical requirements and source. Do not infer that a dormant or unresolved handoff is complete from a feature spec's implementation claim.
2. Bind cost and quality observations to tenant, episode/asset revision, provider/model and operation; reject stale or cross-tenant evidence from recommendations.
3. Keep learning and optimizer execution optional, bounded and advisory. Failure, stale evidence or low confidence must fall through to current configured compatible routing.
4. Require the existing explicit user/tenant authorization and budget reservation before any paid model change or repair; do not auto-increase budgets or retry unknown outcomes.
5. Enforce current provider allowlist, capability, safety, cancellation and asset ownership checks after a recommendation is selected.
6. Prove recommendations do not mutate accepted user content, prompts, current assets or normal image/video eligibility without the existing authorized action.

## Completion predicate

With optimizer off, unavailable, stale, malformed or recommending an incompatible/disallowed model, the existing configured image/video path remains usable. A paid change occurs only after existing authorization and budget admission.

## Prerequisites and fallback

Requires settled cost events from section 01 and versioned evidence from P2/P3. When learning evidence is missing, disable only the suggestion and continue baseline production.

## Focused tests and evidence

Test optimizer off/missing/timeout/malformed output, stale or cross-tenant evidence, replaced asset, low confidence, disallowed/incompatible model, higher cost, user decline and cancellation. Assert no hidden substitution, budget increase, prompt mutation or paid retry and identical baseline image/video eligibility when existing hard controls pass.

## Unresolved assumptions

Confirm whether Feature 149 requires any automatic action or only reporting/learning. This plan authorizes no autonomous paid model change; if the canonical requirement assumes one, reconcile it with the explicit budget/authorization policy before implementation.
