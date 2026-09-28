# Special Tie-in Story Lineage Design

## Goal

Keep the existing normal Vertical Drama prompt-generation flow unchanged while
making a special tie-in episode use one authoritative source:

`selected reviewed idea + selected dialogue + selected character/product references`
`-> nine special shot summaries -> existing image/video prompt flow`

## Evidence and confirmed defects

- Episode 248 is `special_tie_in`; its persisted special idea and reviewed
  episode story are the same, while the active series breakdown for episode 11
  is the unrelated normal story `กลับกรุงเทพฯ`.
- `getEpisodeDetail` currently resolves the normal series breakdown for every
  episode kind, and the page passes its `shotDrafts` to the storyboard even
  for a special episode.
- The storyboard prefers those canonical drafts over the special prompt, and
  the prompt+image and stop-frame handlers reuse those normal drafts as their
  canonical summary.
- The fallback currently cycles six dialogue lines over nine generic product
  actions, which can make a shot's dialogue contradict its visible action.

## Design

1. Special source isolation

   Do not expose normal `episodePlan.shotDrafts` as canonical drafts for a
   special episode. The special storyboard summary must come from the
   persisted special nine-shot artifact (`startFramePlan.frames[].canonicalShotSummary`)
   and its paired motion clip only.

2. Existing prompt flow reuse

   Normal episodes keep the existing `episodePlan.shotDrafts` path exactly as
   it is. For special episodes, the per-shot handlers use the special shot
   summary as the canonical input to the existing prompt mutation, with the
   existing selected character references and product references appended by
   the existing adapter. No new generation pipeline or paid provider path is
   introduced.

3. No cross-flow writes

   Special storyboard summary editing is disabled until a special-owned edit
   contract exists. The existing series `updateEpisodeDraftShot` mutation must
   never be called from a special episode, preventing a special edit from
   changing the normal series breakdown.

4. Fallback coherence

   The deterministic fallback must derive each shot's dialogue from the
   reviewed action sequence. It may preserve exact user dialogue lines, but it
   must not attach a line describing a different action to a shot. If the
   reviewed dialogue has fewer lines than nine shots, only assign lines to
   matching action beats and use narration/silence for the remaining shots;
   never repeat unrelated lines merely to satisfy the nine-shot contract.

5. Safety and compatibility

   Existing safety validation, selected-reference isolation, additive product
   references, and normal episode generation remain in place. A special result
   is marked for review when fallback is used, but remains usable for manual
   repair without mutating normal-series data.

## Verification

- Unit tests prove normal canonical drafts remain unchanged.
- Unit tests prove special episodes never receive parent-series shot drafts in
  the UI or per-shot prompt authoring path.
- Unit tests prove fallback dialogue/action pairing and exact selected
  references.
- Targeted server/client tests and TypeScript checks run after the change.
- Episode 248 is re-read from the local database to verify the persisted
  special source, nine-shot count, and no normal-series summary in the special
  prompt path.

