# Vertical Drama Verified Cast Position Lock

## Problem

The shot-video-prompt path currently asks one vision response to identify who is
where and then validates the generated prompt against that same response. A
confidently wrong identity assignment therefore validates itself. Canonical
deep-draft dialogue can also carry a display name where downstream code expects
a stable `characterKey`, preventing the correct portrait from being attached.

## Decision

For a physical multi-character shot, use a user-confirmed,
asset-bound left-to-right cast lock as the authority. Store only stable character
keys in that lock. Resolve names to keys before prompt generation, derive the five
viewer-relative position labels deterministically, and compare both
`frame_analysis` and the written prompt against the confirmed lock.

The lock is valid only for the exact image asset and exact physical cast set. A
new approved/video-safe image or changed character list invalidates it. Prompt
generation and paid video rendering fail closed when the lock is missing, stale,
ambiguous, or contradicted. The UI provides an ordered slot editor beside the
start frame, warns that unclear/occluded images should be replaced, and keeps the
credit-spending actions disabled until the lock is valid.

## Data contract

`startFramePlan.frames[].castPositionLock`:

- `assetId`: the exact start/video-safe frame inspected by the user
- `orderedCharacterRefs`: stable keys from viewer-left to viewer-right
- `confirmedAt`: ISO timestamp

`motionPromptPack.clips[].castPositionLock` snapshots the same fields so the paid
render boundary can prove the prompt was authored for the current image and
ordering.

No migration is required because both artifacts are existing JSONB contracts.

## Runtime flow

1. The shot card shows every physical character as ordered left-to-right slots.
2. The user corrects each slot and confirms. Duplicate/missing characters cannot
   be saved.
3. The server validates ownership, exact roster membership, exact cast-set
   equality, and the active image asset before persisting the lock.
4. Dialogue labels, when present, are resolved case/space-insensitively against
   both stable keys and unique roster names. Unknown or ambiguous speakers fail
   before an LLM call.
5. The generator receives an authoritative name/key/position map. Its prompt and
   correction retry use that map; its final validator rejects any discrepancy.
6. The paid render rechecks the current frame lock and the clip snapshot before
   reserving credits or contacting a provider.

## UX states

- Single physical character: no new lock gate.
- Multi-character shot, no lock: amber warning, prompt/video actions blocked
  (including silent clips, so legacy clips cannot bypass the paid-render gate).
- Editing with duplicate or incomplete slots: save disabled and inline guidance.
- Valid current lock: green confirmation with an edit action.
- Changed image/cast: lock removed, stale prompt removed by existing invalidation,
  and the warning returns.
- Unclear image: explicit copy directs the user to Change image, image repair, or
  Video-Safe frame before confirming.

## Safety and compatibility

The new fields are optional for old JSON. The fail-closed rule applies only to
physical multi-character shots, limiting disruption to the high-risk identity
mapping case. Existing tenant/user ownership checks remain mandatory. No
provider-specific guarantees are claimed: this prevents known ambiguous/wrong
inputs from spending credits, while post-render identity QC remains the final
quality signal for model drift.
