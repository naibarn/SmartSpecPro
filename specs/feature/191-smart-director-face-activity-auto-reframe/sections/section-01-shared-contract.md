# Section 01 — shared contract

Implement the additive shared contract in `packages/shared/src/video-editor`.
Preserve legacy camera modes and serialized plans. Add Face + Activity mode,
analysis mode, bounded tracks/activity intervals, provenance and fingerprints,
and validators for normalized coordinates, duration, keyframe limits, and
policy/capability compatibility. All public helpers are pure and deterministic.

Proof: unit tests cover legacy plans, new plans, malformed JSON-like values,
coordinate clamping, stable fingerprints, and bounded evidence references.

Status: IMPLEMENTED locally in `cameraMotion.ts`, `compositionScan.ts`, and
the Feature 191 Worker test.
