# TDD plan

1. Shared planner tests: normalize/clamp coordinates, crop feasibility for
   9:16/16:9/source, deterministic fingerprints, Mark precedence, confidence
   weighting, smoothing, occlusion hold, and 512-keyframe bounds.
2. Player tests: Quick starts immediately, Full Scan shows scanning and only
   applies approved results, stale results are ignored, Mark edits invalidate
   plans, and the existing Mark UI/persistence still works.
3. Vision tests: capability matrix is truthful, malformed/oversized evidence
   is rejected, checkpoint resume is idempotent, and missing object models
   produce degraded evidence rather than fabricated tracks.
4. Rust tests: new mode/version validates, malformed plans fail closed,
   segment remapping preserves time and provenance, manual focus is unchanged,
   and camera expressions remain bounded.
5. Integration tests: same approved plan is used by preview and render within
   the documented tolerance; source/Mark/policy mismatch blocks promotion;
   duplicate Full Scan delivery does not create duplicate side effects.
6. Static checks: no direct provider/queue calls in the player, no secrets or
   raw frames in durable evidence, no second jobs table, and no unbounded loops.

No full TypeScript typecheck is run because the user explicitly limited RAM.
