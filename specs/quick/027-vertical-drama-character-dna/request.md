# Request

## Original request

Implement the approved complete Character DNA design for the Vertical Drama Characters
tab. Integrate the supplied face/Character DNA guide into the runtime character visual
bible skill so character design is story-grounded, cast-aware, cross-series-aware, scored,
selected deliberately, and persisted after confirmation instead of being random.

Approved design source:
`docs/portable-skill-pack/specs/2026-07-13-vertical-drama-character-dna-design.md`

## Task summary

Extend the existing `vertical-drama-character-visual-bible` runtime with a bounded
Character Design Context containing the current series, current cast, and lead designs
from the owner's five most recent prior series. Require structured Character DNA in the
LLM result, use it consistently in all prompt fields, persist it atomically after a
confirmed generation, and carry the portrait-preview snapshot through the existing UI.

## Constraints

- Preserve every existing child-safety marker and negative term.
- Preserve own-reference, twin/variant face-source, solo-person, prompt-length, sheet,
  and custom-instruction behavior.
- Use lowercase `skill.md`, which is the file loaded by the Characters-tab runtime.
- No database migration or new dependency.
- Scope historical reads by both tenant and owner user.
- Do not send asset URLs, user IDs, tenant IDs, or unrelated JSONB to the LLM.
- Do not claim historical comparison when real history is absent or unavailable.
- Persist only after confirmation and successful media-task submission.
- Do not persist a preview DNA snapshot when the user edits the previewed prompt.
- Preserve all pre-existing dirty-tree edits; do not broad-stage, commit, or push.
- Do not modify the active Feature 133 `orchestra/` session.

## Assumptions

- The existing `verticalDramaCharacters.data.visualBible` JSONB shape is the canonical
  storage location and may be extended additively.
- The Character Sheet flow remains direct generation; only portrait generation uses the
  preview/edit/confirm flow.
- Legacy callers that omit design context or an approved snapshot remain functional.
- A bounded current-cast query is required; prior-series enrichment may degrade to an
  explicit unavailable/empty state.

## Non-goals

- Vision-based similarity scoring of rendered images.
- A new Character Archive UI.
- Tenant-wide visibility across other owners' series.
- A redesign-identity action for already approved DNA.
- Any changes to the surrounding Character tab layout or visual design.

