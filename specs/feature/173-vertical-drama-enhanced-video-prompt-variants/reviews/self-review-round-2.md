# Feature 173 Spec Review — Round 2

**Reviewer:** Main Codex conductor
**Date:** 2026-09-01
**Focus:** adversarial consistency review after the first draft

## Checks

| Check | Result |
|---|---|
| Feature 170 integration | PASS — the new feature consumes its canonical media bundle, terminal equality, authorization, and stale-revision rules; it does not duplicate them. |
| Same-field UI semantics | PASS — the displayed variant may change, but active render state changes only through explicit Apply. |
| Legacy behavior | PASS — old packs are read as Legacy and `clip.prompt` remains the compatibility projection. |
| Full-bundle integrity | PASS — Apply moves positive/negative prompt, dialogue, audio, model target, analysis, motion profile, warnings, and quality metadata together. |
| Split-shot behavior | PASS — generation remains shot-level and result mapping is clip-specific. |
| Media-model separation | PASS — image, authoring, and video target models have independent IDs and capabilities; same-provider reuse is only an optimization. |
| Model changes | PASS — exact target/profile and media-bundle changes stale Enhanced results; image-model-only changes do not stale an unchanged approved asset. |
| Runtime blockers | PASS — SDK/manifest/capability readiness is an explicit gate with no silent Legacy fallback. |
| Cost/concurrency | PASS — separate job identity, credit confirmation, idempotency, one active generation per shot by default, and late-result guards are specified. |
| Future migration | PASS — v1 is additive JSONB with a versioned contract; a future normalized table is explicitly prohibited from becoming a second source of truth. |

## Corrections made

1. Clarified that Feature 170's terminal-prompt equality applies per variant,
   not to an unselected preview as a provider request.
2. Clarified that pseudocode `unknown` fields must reuse existing typed clip
   contracts and cannot become arbitrary unvalidated JSON.
3. Added independent UI/job/Apply rollout keys so a failed Enhanced surface can
   be disabled without disabling Legacy.
4. Fixed v1 persistence scope as an additive motion-pack contract with a future
   normalized projection allowed only as a non-authoritative index.

## Result

No remaining MUST_FIX design findings. The spec is ready for user review. No
product code, database migration, runtime dependency, or global skill routing
was changed.
