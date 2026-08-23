# Deep-Plan Adversarial Self-Review — Round 2

## Attack questions and findings

### Could prompt expansion silently overwrite the user's text?

No. The plan requires preview-only execution, original prompt hash, compare-and-swap apply, stale conflict handling, and cancel preservation. The client contract explicitly verifies these states.

### Could web research turn a creative topic into fabricated fact?

No. Research is requested for identifiable entities/current events, but broad topics are marked illustrative. Claim/evidence state is independent from media origin, and missing search degrades to a warning rather than invented sources.

### Could the same media be interpreted inconsistently by draft, deep story, start frame, and assembly?

The immutable snapshot/fingerprint is persisted in the parent run and required at each stage. Resume rejects changed packs. Coverage and stale gates run at each transition. This closes the cross-stage canon gap.

### Could video footage be accidentally treated as an image reference or full scene?

No. The plan explicitly keeps `vertical_drama_shot_references` image/reference-only, introduces semantic roles, and requires a separate B-roll binding with exact segment bounds and audio policy. Scene-anchor promotion is explicit.

### Could news claims be “verified” because an AI image looks plausible?

No. Evidence status is separate from origin and AI media cannot upgrade claim status. Current claims require source/as-of/freshness and correction lineage; archive/file footage is disclosed.

### Could a correction leave stale text or media in the final export?

The news section requires a stale cascade through claims, narration, subtitles, overlays, story outputs, bindings, and assembly projection. Final integration requires a traceability matrix and final readiness gate.

### Could tenant or provider URL leakage occur?

The plan repeats fail-closed tenant/user scope, canonical managed media, no raw provider/signed URLs in persisted contracts or telemetry, and owner-scoped resolution. Section 7 tests the negative paths.

### Could schema/migration work damage current users?

No destructive backfill or conversion is planned. Existing source and reference rows remain readable; new tables are additive; canonical media is never cascade-deleted. Migration numbering/journal constraints are explicitly checked before coding.

### Could UI implementation leave inaccessible or unusable dense states?

All three UI surfaces include existing-pattern reuse, state matrices, canonical viewport matrices, accessibility rules, copy, and browser evidence. The plan explicitly requires sticky primary actions on mobile and no horizontal overflow.

## Cross-reference regression

- `visualSourceFingerprint` is used consistently in snapshot, story-run, B-roll, and final gate sections.
- `news_report` is used consistently for profile, router/service, UI, flags, and tests.
- `b_roll_still` and `b_roll_footage` remain distinct from `reference` and `scene_anchor`.
- Every section has both implementation and TDD obligations; section 8 requires traceability and five final gap passes.
- Existing source-pack, managed media, shot-reference, story-run, and assembly boundaries are named as reuse points, not silently replaced.

## Result

**PASS.** No unresolved product, architecture, security, or UX gap was found at planning level. The remaining implementation checks are deliberate codebase discovery gates and must be resolved in the traceability matrix during implementation.
