# Vertical Drama Cross-Episode Wardrobe Continuity

## Goal

When a normal episode continues the parent series, the first appearance of a
character must inherit that character's last authored outfit from the nearest
previous normal episode. A wardrobe change is allowed only when the episode
text contains an explicit change or time-jump cue.

## Design

- Derive a structured handoff from the previous episode's last chronological
  storyboard shot. The handoff contains the source episode/shot and one look
  key per visible character family.
- Resolve the handoff using the tenant/user/series-scoped character roster;
  special tie-in episodes are isolated and do not inherit parent-series looks.
- Inject the handoff into script, storyboard, and start-frame planning prompts
  as facts. Do not use free-text memory as the wardrobe source of truth.
- Validate the generated storyboard deterministically before persistence. From
  episode start until an explicit change cue, a visible character may not use a
  different outfit variant. On mismatch, return a repairable
  `VD_CROSS_EPISODE_WARDROBE_MISMATCH` result and do not persist the candidate.
- Persist the handoff snapshot in the storyboard and start-frame plan so later
  regeneration uses the same boundary contract even if older memory data is
  incomplete.

## Compatibility and failure handling

Legacy episodes without a previous episode, a usable final shot, or a resolvable
character variant remain generation-compatible and receive no false-positive
block. The handoff is additive JSON; no database migration is required. A
malformed handoff is ignored by prompt rendering but never used to authorize a
wardrobe change.

## Verification

Add pure tests for handoff extraction, explicit-change detection, and mismatch
validation. Add pipeline/prompt wiring tests proving the handoff is present in
new-episode generation and that both synchronous and asynchronous storyboard
paths map the mismatch to a repairable run without writing the candidate.
