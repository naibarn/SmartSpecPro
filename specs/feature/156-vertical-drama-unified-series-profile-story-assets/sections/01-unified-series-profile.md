# Section 01 — Unified Series Profile

The creator chooses one `seriesProfileId`. It is the canonical projection of
content format, visual look, evidence policy, source-slot preset, pre-draft gate,
and B-roll policy.

The existing fiction look catalog and Feature 154 documentary/review formats are
combined into one card picker. The old separate format selector becomes a
derived read-only value or is removed from the creator-facing surface.

Required profile fields:

- `profileId`, `version`, `label`, `description`;
- `contentKind` and `episodeEngine`;
- `visualGenreKey` and strict grounding contract;
- `factPolicy`, disclosure policy, and source-gate policy;
- default slot preset and allowed asset/usage kinds.

`seriesFormat` is a compatibility projection of `seriesProfileId`, not a
second editable control. `visualBible` and other look notes remain supplemental
editorial input; the selected profile's grounding contract wins on conflict.
The resolver must map every existing fiction look and all Feature 154 format
kinds to exactly one profile, show a migration warning for conflicts, and avoid
writing during reads.

The new `profile.visualGenreKey` is separate from the legacy fiction-only
`lookLock.genreKey`. Non-fiction/review profile keys are never written into the
legacy enum; their visual contract travels in the canonical profile snapshot.

Every profile must have a strict, profile-specific visual grounding contract
with observable cues and forbidden drift. Review profiles cannot silently share
the generic documentary fallback; a missing contract is a server error. Profile
selection must enable the story-facing grounding path, while legacy look-lock
and `visualNarrativeEnabled` remain compatibility projections. The registry must
also record the minimum cue set for location, restaurant, product, software,
documentary, and hybrid review coverage; reusing a contract requires an explicit
semantic-compatibility test.

Legacy resolution is deterministic: new profile, then format, then legacy look,
then drama default. Conflicts produce a visible migration notice.

On explicit profile change, preserve all media and custom slots, create a new
profile version, invalidate affected descriptions/usages, and require a fresh
source-pack readiness evaluation. Use optimistic concurrency so a stale wizard
cannot overwrite a newer profile or source-pack edit. Editing supplemental
visual notes also increments the visual version and invalidates dependent prompt,
digest, and QC inputs.

Fiction-to-non-fiction changes require the source gate; non-fiction-to-fiction
changes remove that block but retain the pack for optional references. Legacy
`lookLockMode` values are migrated into profile-owned visual customization or
read-only compatibility details, never silently dropped or exposed as a second
content/evidence selector.
