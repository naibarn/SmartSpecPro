# Plan Spec Alignment Review Round 1

Date: 2026-06-22

## Result

Pass after targeted plan updates.

## Review Scope

- Compared `spec.md` acceptance criteria, rollout gates, security/privacy sections, roadmap, and implementation section plan against:
  - `claude-plan.md`
  - `claude-plan-tdd.md`
  - `sections/index.md`
  - `sections/section-01-*` through `sections/section-08-*`

## Findings Fixed

1. Schema change-control was under-specified in the implementation plan.
   - Added changelog, compatibility window, deprecation, fixture update, and rollback expectations.

2. Fixture privacy/retention behavior was lighter than the spec.
   - Added production-derived fixture metadata, owner/redaction/removal requirements, and stricter lint expectations.

3. Debug trace/checkpoint alignment was present only as architecture prose.
   - Added section-level requirements to avoid a parallel durable debug ledger and to document retention/delete behavior if debug projections are cached.

4. Runtype bridge dependency evidence missed some spec details.
   - Added Shadow DOM/DOM ownership, mobile layout parity, and accessibility parity evidence.

5. Rollout gates were missing detailed beta-readiness evidence.
   - Added performance baseline, alert/triage matrix, surface adoption criteria, threat model coverage, compatibility coverage, waiver shape, non-waivable safety gates, doc-sync expansion, and evidence-linked reviewer signoff.

6. TDD plan did not fully reflect the rollout/security/privacy gates.
   - Added tests/checklists for changelog, fixture retention, debug ledger alignment, Runtype evidence, waiver validation, doc-sync, threat model, performance baseline, alert/triage ownership, compatibility, and signoff.

## Remaining Notes

- Sections 01-03 remain the recommended first implementation target.
- Browser screenshots and performance baselines are intentionally required only when preview/live UI work begins.
- Customer widget and page-action phases remain deferred and require separate later specs before implementation.
