# Completeness Review Round 17

Date: 2026-05-31
Scope: codebase-aware review for stage transition correctness, false-complete prevention, and downstream advancement gates.

## Result

The plan had strong artifact lineage, QA, credit, policy, media acceptance, and recovery requirements. The remaining implementation risk was that a stage handler, background worker, manual advance action, or recovery tool could still mark a stage complete from status alone, provider success, or text output without proving the route-required evidence existed.

## Findings Fixed

1. Stage completion needed a first-class transition guard.
   - Added `MarketplaceAutoReviewStageCompletionEvidence`.
   - Every complete, warning-complete, skip, block, fail, or cancel transition must record required evidence kinds, present refs, missing refs, reason codes, evaluator, and idempotency key.
   - Added explicit repair-required and retriable-failure transitions so auto-repair/retry states are not confused with success or terminal failure.

2. Provider success and agent text are no longer enough.
   - Media stages require accepted media, QA, credit, storage/re-host, and lineage refs before completion.
   - Agents-backed planning stages require validated artifacts, policy, QA, credit, and lineage refs before completion.
   - Stage completion evidence can reference privacy, rights, distribution, disclosure, CTA, input-change, provider-event, budget, quota, retry/DLQ, campaign, brand, human-review, and post-publish governance envelopes when those are required by the stage.

3. Resume, manual advance, and recovery must obey the same gate.
   - Background advancement and operator recovery cannot start downstream stages from status-only success.
   - Timeline must show completion-evidence blockers when required refs are missing.

## Remaining Risk

Implementation must define the exact required evidence matrix per stage and output mode. The spec now makes that matrix testable instead of relying on handler-specific assumptions.

## Validation

- `check-sections.py`: passed, 12/12 sections complete.
- `check-ui-contracts.py`: passed, 12 UI-affecting sections checked.
- Placeholder marker scan: clean.
- Stale `node_configuring` scan: clean.
- Trailing whitespace scan: clean.
- `git diff --check`: clean.
