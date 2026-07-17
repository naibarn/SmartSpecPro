# VD: Auto-register story-introduced characters (dialogue speakers) into the roster

Status: APPROVED (approach: auto-create + junk-guard) — 2026-07-16
Owner: (naibarndotcom)

## Problem
A character who is introduced organically by story generation (a `dialogue_lines[].speaker`,
or a `shotDrafts[].characters[]` name) but was NOT in the wizard's initial `charactersDraft`
never gets a `vertical_drama_characters` roster row → no DNA/portrait → no per-shot reference
slot → dropped from `requiredCharacterRefs` everywhere downstream. User had to add "มินตรา"
(a dialogue speaker in series 16 / ep 67 shots 1&2) manually.

## Root cause (investigated, read-only)
ROSTER-EXTRACTION gap. Roster is written ONLY by: wizard `seedCharactersFromDraft`
(verticalDramaSeries.ts:2460-2539), manual UI creation (verticalDramaCharacters.ts), and
variant/twin inserts. `reconcileCharactersFromStoryBible` (verticalDramaSeries.ts:2547-2599)
is UPDATE-only (`byName.get(...); if (!match) continue` — never INSERTs). Deep-draft
`characters[]` and `dialogue_lines[]` are independent/unlinked (verticalDramaStoryBible.ts:324-351;
no speaker⊆characters enforcement). Downstream (storyboard `speakerLookup` reconcile
verticalDramaStoryboardGeneration.ts:892-904 — match-only, `continue` on unknown; start-frame
`requiredCharacterRefs` derivation) correctly filters everything through the roster, so an
unregistered speaker is dropped at every step.

## Approach (user-approved): AUTO-CREATE + JUNK-GUARD
Add a step that INSERTs a `vertical_drama_characters` row for every story-introduced named
character not already in the roster, guarded so AI junk labels don't create garbage rows.

### Qualifies to auto-create when (ALL of):
- Normalized name is non-empty, length ≥ 2, not a junk/non-name token (skip "unknown",
  "voice", "narrator", "เสียง", "ทุกคน", silence/sound labels; reuse existing silence/sound
  markers where available), and not already in the roster (normalized-name dedup).
- AND (appears in some shot's `characters[]`  OR  is the speaker of ≥ 2 dialogue lines across
  the story/episode). (One-off lone speaker label → skipped as likely junk.)

### Insert shape (mirror seedCharactersFromDraft / createCharacter):
`{ tenantId, userId, seriesId, characterKey: generateUniqueCharacterKey(slugifyCharacterName(name), usedKeys), name, narrativeRole: null, roleTier: null, roleProvenance: "ai_assigned", roleReviewStatus: "needs_role_review" }`
(DNA/portrait NOT generated here — the row + slot is the deliverable; the existing character-DNA
/portrait flow fills it afterward. Optionally set a provenance value marking it auto-created
from the story.)

### Hook point
Extend/augment the story-bible reconcile path (verticalDramaSeries.ts, near
`reconcileCharactersFromStoryBible`) with an INSERT-capable
`ensureRosterCharactersFromStory(tenantId, userId, seriesId, { refinedCharacters, deepDraftShots })`
that gathers candidates from refinedCharacters + deep-draft `characters[]` names + dialogue
speakers, applies the guard, and inserts the missing ones. Call it wherever reconcile runs so
it is automatic. Once the roster row exists, the existing downstream picks the character up
(name-mention match + dialogue-speaker reconcile) into `requiredCharacterRefs` on next storyboard
generation.

## DB safety
INSERT-only (adding rows; no update/delete of existing data) → low risk, but still: run inside a
transaction, dedup by normalized name to avoid duplicates + respect the unique
`(seriesId, characterKey)` index, and log inserted names. Back up `vertical_drama_characters`
before first run per protocol.

## Verification
- A deep-draft with a NEW speaker (≥2 lines or in characters[]) → a roster row is inserted;
  the character then appears in that shot's reference slot / `requiredCharacterRefs` after
  storyboard regen.
- A junk one-off speaker label → NO row inserted.
- An existing roster name (any case/spacing) → NOT duplicated.
- Existing episodes unaffected until regenerated.

## Out of scope (follow-up)
- Auto-generating the DNA/portrait for the new row (separate existing flow).
- The earlier `characterRefsCustomized` preservation flag (separate plan).
