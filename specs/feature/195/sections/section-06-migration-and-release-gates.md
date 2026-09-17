# Section 06 — Compatibility, Migration and Release Gates

## Source coverage

Feature 195 sections 223–239, 273–294 and all staged rollout, migration, SLO, disaster recovery, retention, supply-chain and final acceptance requirements.

## Deliverable

Create mixed-version contract tests, replay/restore evidence, retention/residency checks, operational gates and runbooks. Preserve legacy adapters only where the source spec explicitly requires compatibility; do not perform unrelated removal.

## Files

- Create/modify: `docs/operations/feature-195/*`
- Test: focused release/migration/contract tests

## TDD steps

1. Add tests for mixed envelopes, replay, restore, redaction, degraded mode and cross-spec compatibility.
2. Run them against the current implementation and record environment-only failures separately.
3. Add gates/runbooks and only the safe implementation fixes required by the tests.
4. Run focused suites and `git diff --check`.

## Completion gate

Feature 195 is usable as the stable execution foundation for Feature 196 and later features, with no claim of production activation without deployment proof.

## UI/UX Contract

### Target User / JTBD
Operators need release/readiness evidence; this section provides gates, not a new UI.

### Existing Pattern Reference
N/A — operational evidence uses existing runbook/release-gate conventions.

### Surface Inventory
N/A — no browser surface is added.

### Component Map
N/A — release gates and docs only.

### State Matrix
N/A — gate states are validated by release tests.

### Responsive Matrix
N/A — no browser surface.

### Accessibility Acceptance
N/A — no DOM output.

### Copy Contract
N/A — runbook text only.

### Browser Evidence Required
N/A — browser evidence is covered by section-05 when UI changes exist.
