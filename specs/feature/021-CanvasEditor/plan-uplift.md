# Plan Uplift Checkpoint

## Recommended Uplifts

### U1. Explicit Unsupported-Legacy Deck Handling
- severity: `high`
- impact: `high-impact`
- rationale: Plan states hard switch v2, but needs an explicit runtime behavior when unexpected v1/legacy payload appears to avoid silent corruption.
- concrete plan delta to apply: Add a guarded compatibility branch that blocks edit for non-v2 payloads, shows deterministic recovery guidance, logs a structured error event, and provides an operator runbook hook.

### U2. Deterministic Degradation Contract Definition
- severity: `high`
- impact: `high-impact`
- rationale: "degrade_and_export_with_warning" is selected, but degradation precedence/order is not fully specified; this can cause inconsistent render output across environments.
- concrete plan delta to apply: Define deterministic degradation precedence table (per object/effect class), include stable warning codes, and enforce in tests for render output/warning consistency.

### U3. Autosave Conflict Burst Protection
- severity: `medium`
- impact: `low-impact`
- rationale: Debounced autosave may still generate repeated conflict loops under parallel edits or stale versions.
- concrete plan delta to apply: Add a short conflict cooldown and stale-version guard in autosave controller to suppress repeated retries until user action or refresh.

### U4. Mobile Mode Safety Telemetry
- severity: `medium`
- impact: `low-impact`
- rationale: Mobile safe-core depends on pan/edit mode quality; without dedicated telemetry, accidental-edit issues may be hard to detect.
- concrete plan delta to apply: Add explicit metrics/events for mode-switch frequency, accidental-transform cancels, and gesture error states.

### U5. Render Performance Budget Gates
- severity: `high`
- impact: `high-impact`
- rationale: Plan describes performance targets but not enforcement gates by object count/device tier.
- concrete plan delta to apply: Add explicit performance acceptance gates for <=100 objects (target) and 200-object stress path with fallback behavior if thresholds fail.

### U6. Template Asset Trust Boundary
- severity: `medium`
- impact: `high-impact`
- rationale: Internal template ingestion can introduce untrusted media metadata unless policy constraints are explicit.
- concrete plan delta to apply: Require template asset validation pipeline parity with upload policy (type, source URL policy, tenant scoping, SVG sanitization path) before template publish/use.

### U7. Release Cutover Checklist for Feature Flag
- severity: `medium`
- impact: `low-impact`
- rationale: Feature-flag rollout is defined but cutover/rollback operational steps are not sequenced enough for on-call reliability.
- concrete plan delta to apply: Add explicit cutover checklist with owner, verify signals, abort thresholds, and rollback commands for each rollout stage.

### U8. Post-Export Warning UX Contract
- severity: `low`
- impact: `low-impact`
- rationale: Plan references warnings, but user-facing placement and persistence are underspecified.
- concrete plan delta to apply: Define warning UI contract: when shown, where shown, dismissibility rules, and per-slide warning summary persistence.
