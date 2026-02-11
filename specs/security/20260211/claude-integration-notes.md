# Claude Integration Notes - Iteration 1

Source review file: `reviews/iteration-1-self-review.md`

## Accepted Suggestions
1. Add explicit URL policy contract and context matrix.
- Rationale: avoids inconsistent validation between create/update/upload/media-to-library paths.

2. Define concrete active-content response behavior.
- Rationale: removes ambiguity and reduces residual XSS execution risk.

3. Split tenant-ops hardening into phased plan.
- Rationale: callback tables currently lack tenant attribution; phased delivery avoids blocking immediate protections.

4. Strengthen verification and release gate.
- Rationale: security hardening must ship with deterministic regression checks and rollback criteria.

## Rejected / Deferred Suggestions
1. Immediate isolated upload domain migration as mandatory step.
- Decision: Deferred (not rejected permanently).
- Rationale: high operational cost and infrastructure coupling for this iteration. Plan keeps attachment-based active-content mitigation first, with isolation-domain as phase-2 enhancement option.

## Plan Updates Applied
- Refined `claude-plan.md` with:
  - URL policy matrix and shared validator contract.
  - Explicit active-content handling outcomes.
  - Tenant-ops phase split (immediate guardrails + schema evolution).
  - Test ownership mapping and deploy/rollback gates.

## User Review Directives Applied (Post-Review)
1. SVG preview must remain inline.
- Plan updated to require SVG sanitization/validation for inline preview, with safe fallback on sanitization failure.

2. Tenant attribution Phase 2 must be implemented now.
- Plan updated to mark Phase 2 as required in this cycle and included in release gate.

3. Legacy URL data migration must be executed.
- Plan updated with dedicated migration workstream for existing `library_items` URL fields (audit, normalization, enforcement, verification).
