# Deep-plan self-review — Feature 169

## Scope checked

Compared `claude-spec.md`, `claude-research.md`, `claude-interview.md`, `claude-plan.md`, `claude-plan-tdd.md`, all section files and `spec.md` against the current Worker/runtime seams.

## Findings and fixes

1. **[AUTO-FIX]** `sections/index.md` lacked `SECTION_MANIFEST`; added the manifest and dependency order.
2. **[AUTO-FIX]** HyperFrames command needed an exact bundled launcher; pinned runtime manifest, platform Node path and checksum/doctor gate.
3. **[AUTO-FIX]** Render executor was ambiguous; fixed `footage_broll_render` to `remotion_render_video`/`GenericTemplate` and fail closed otherwise.
4. **[AUTO-FIX]** Media safety needed speech-overlap rejection, bidirectional time map and preview/final separation; added all three to plan/TDD.
5. **[AUTO-FIX]** Durable event delivery needed idempotent ordering/outbox/replay; added existing control-plane endpoint and lease/auth requirements.

## Scorecard

| Category | Result |
|---|---|
| Structural integrity | PASS |
| Completeness vs spec | PASS after fixes |
| Implementability | PASS |
| Internal consistency | PASS |
| Edge cases | PASS |

No unresolved high-confidence planning issue remains. Runtime doctor, media fixtures and authenticated end-to-end execution remain implementation/release gates.
