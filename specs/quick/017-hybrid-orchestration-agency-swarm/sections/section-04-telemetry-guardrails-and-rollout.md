# Section 04 - Telemetry, Guardrails, and Rollout

## Ownership
- routing telemetry
- agency audit/logging
- feature flags
- rollout toggles

## Outcome
Make the hybrid system measurable, safe to ship gradually, and easy to debug.

## What this section does
- Log when hybrid plans are selected.
- Record stage handoffs and approvals.
- Measure budget usage and fallback frequency.
- Ship behind a feature flag before general release.

## Implementation notes
- Keep audit trails stable and readable.
- Add guardrails that prevent accidental auto-commit from swarm outputs.
- Retain legacy agency escalation as fallback until the new path is proven.

## Tests
- Telemetry shape tests.
- Fallback path regression tests.
- Feature-flag gating tests.

