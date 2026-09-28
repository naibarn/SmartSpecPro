# Section 01 — Shared Visual Contracts

## Objective

Create the canonical TypeScript/Zod vocabulary for Feature 160. This section is pure/shared infrastructure and must not depend on database rows, router context, provider URLs, or UI state.

## Ownership

- Add apps/web/shared/verticalDramaSeries/visualSource.ts.
- Add apps/web/shared/verticalDramaSeries/newsReport.ts.
- Extend apps/web/shared/verticalDramaSeries/sourcePack.ts only additively if legacy payload parsing requires it.
- Add apps/web/server/services/verticalDramaVisualSourceCore.ts.
- Add focused tests under apps/web/server/services/__tests__/.

## Required contracts

Define Zod schemas and inferred types for:

- VisualMediaType: image | video.
- VisualMediaOrigin: ai_generated | user_upload | web_import | existing_managed.
- VisualSemanticRole: scene_anchor | reference | b_roll_still | b_roll_footage | graphic | text_overlay.
- VisualEvidenceStatus: not_applicable | illustrative | needs_verification | partially_verified | verified | stale | contradictory | blocked.
- VisualUsageRef, SourceMediaSegment, VisualSourceSlot, VisualCoverageRequirement, VisualCoverageFinding, VisualSourceSnapshot, NewsClaim, NewsEvidenceRevision, and ShotBrollBinding.

All schemas must bound strings, arrays, IDs, URLs, source counts, durations, and JSON payload sizes. Video inSeconds/outSeconds must be finite, non-negative, and outSeconds > inSeconds; still usage may use a null time range but must carry an explicit display duration when bound to B-roll.

VisualSourceSnapshot must include snapshot ID/revision/fingerprint, pack/profile identity, accepted slots, source media/segment revisions, rights/disclosure/evidence states, coverage obligations, and captured time. Fingerprint input must be canonical and must exclude signed/provider URLs and volatile timestamps.

NewsClaim must include claim scope, geography, validity/as-of, source/evidence references, attribution, visual refs, status, freshness, and correction lineage. AI media origin must never upgrade claim evidence.

## Pure service behavior

verticalDramaVisualSourceCore.ts owns only deterministic operations:

- normalize and validate source/segment/slot input;
- canonicalize snapshot fingerprint input;
- compute snapshot fingerprint;
- validate coverage and return stable finding codes/severity;
- validate semantic role conflicts;
- validate B-roll timeline order/duration/audio/fit/label/stale state;
- calculate stale reasons when revisions differ.

Do not perform DB queries or mutate state in this section. Later sections call these functions after resolving owner-scoped rows.

## Tests-first requirements

Write tests before implementation for:

1. enum and legacy payload compatibility;
2. invalid modality/role/evidence combinations;
3. non-finite, reversed, negative, and overlong segment bounds;
4. stable fingerprint ordering and changed fingerprint inputs;
5. required versus optional coverage findings;
6. scene-anchor/reference/B-roll conflict matrix;
7. exact video segment and still-duration validation;
8. news freshness, contradiction, archive disclosure, and AI-illustration rules.

## Acceptance

- No raw provider URL or signed URL participates in fingerprinting.
- Types compile for server and client consumers.
- Pure tests pass without a database or network.
- Legacy Feature 156 source-pack inputs remain readable.

## Implementation record

- Added visualSource.ts, newsReport.ts, and the verticalDramaVisualSourceCore.ts deterministic validator.
- Added 5 focused core tests; the focused source-pack regression suite also passes.
- Typecheck passed with the existing apps/web typecheck command.
- No existing source-pack or shot-reference shape was removed.

## Cross-section interface

Exports are consumed by sections 02–08. Keep names stable: VisualSourceSnapshot, visualSourceFingerprint, VisualCoverageRequirement, SourceMediaSegment, ShotBrollBinding, NewsClaim.

## UI/UX Contract

### Target User / JTBD
N/A — shared pure contracts have no direct browser surface.

### Existing Pattern Reference
N/A — no new interaction is introduced in this section.

### Surface Inventory
N/A — consumed by later server/client sections.

### Component Map
N/A — this section exports types and pure validators only.

### State Matrix
N/A — runtime UI states are owned by sections 03, 05, 06, and 07.

### Responsive Matrix
N/A — no layout is changed here.

### Accessibility Acceptance
N/A — no user-facing control is added here; downstream UI contracts remain mandatory.

### Copy Contract
N/A — no user-facing copy is added here.

### Browser Evidence Required
N/A — pure/unit tests are the applicable proof for this section.
