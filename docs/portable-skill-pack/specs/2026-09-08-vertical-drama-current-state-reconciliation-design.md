# Vertical Drama Current-State Prompt Reconciliation

## Goal

Make Start Frame prompt + image generation resilient when a shot synopsis,
composition, character look, or reference image changes after the prompt was
authored. The render path must use current owned data, repair stale generated
locks automatically where safe, preserve a real safety stop, and never leave a
credit reservation behind when admission fails.

## Design

The render mutation continues to use the durable start-frame plan as a snapshot,
but reloads the current shot facts immediately before admission. A small pure
reconciliation helper compares the stored prompt snapshot with current
canonical shot summary, required character/look assignments, and scene anchor
identity. When a mismatch is found, the route refreshes only the generated
grounding/identity blocks from current data and persists the repaired prompt
hash. Explicit user-authored scene text remains intact. If a repair cannot be
made deterministically, the route reports a targeted recoverable error instead
of sending a stale prompt to a provider.

Safety admission receives a bounded story-only object containing the current
shot summary, action/description, emotion, dialogue, and factual product
context. Character identity maps, age/wardrobe descriptors, continuity locks,
camera contracts, and negative prompts remain provider metadata and cannot be
combined with story markers to create a false high-risk finding. Genuine
high-risk events in the story-only context remain fail-closed.

All non-provider preconditions and safety admission run before credit reserve.
If a post-reserve submission step fails, the reservation is reversed exactly
once using its idempotency key. Admission failures therefore create no provider
task and no stranded credit deduction.

## Verification

Focused tests cover safe adult confrontation with minor-looking identity
metadata, real minor coercion, synopsis changes, character/look changes,
stale-prompt repair, no provider submission on admission failure, and credit
reserve/refund ordering. Existing unrelated worktree changes remain untouched.
