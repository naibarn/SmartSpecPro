# Deep-plan synthesized specification

The authoritative requirements are in `spec.md`. This synthesis maps them to
implementation boundaries: shared versioned evidence and composition-plan
types; a pure planner with feasible crop-window, smoothing, confidence,
occlusion, activity, and Mark precedence rules; Worker App Quick and Full Scan
state; Rust validation/remapping/render parity; Feature 186 lifecycle for
Full Scan jobs and artifact promotion; and focused verification/rollout.

The implementation must be additive and backward-compatible. Existing Mark
points remain user-owned composition overrides. Quick mode may render from
bounded samples and expose provisional state. Full Scan persists checkpoints,
resumes idempotently, and promotes only when source fingerprint, Mark revision,
plan fingerprint, policy fingerprint, and capability profile still match.
Unknown models, malformed evidence, stale results, invalid coordinates,
cross-tenant job data, and ambiguous provider state fail closed with a visible
fallback or operator-review signal.
