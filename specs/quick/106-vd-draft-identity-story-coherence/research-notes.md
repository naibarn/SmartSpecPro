# Research Notes

## Repository evidence

- `apps/web/shared/verticalDramaSeries/characterNaming.ts` currently derives a naming default primarily from spoken locale. The UI renders it under a single character-naming line, so target market can be read as nationality.
- `apps/web/shared/verticalDramaSeries/targetAudienceRegion.ts` is explicitly an image-casting default and has a legacy Thai fallback. It must remain separate from story identity.
- `apps/web/server/services/verticalDramaPresetSynthesis.ts` accepts lenient `narrativeRole`/`roleTier`, then `normalizeSynthesizedCharacters` backfills from free-text role. The draft shape has no explicit role-review status or diagnostic payload.
- `apps/web/shared/verticalDramaSeries/storyControl.ts` already owns bounded thread IDs, romance phases, advantage side/cost/opponent response, and validation. It is the correct reuse point for a draft seed.
- `apps/web/client/src/components/verticalDramaSeries/CreateSeriesWizard.tsx` already has an AI draft card, title gate, warning list, language contract preview, and a draft-apply handoff. The new identity/story sections should extend this card rather than add another modal.
- `apps/web/server/routers/verticalDramaSeries.ts` seeds characters from both free-text and structured `characterProfiles`; existing role fields are optional for legacy rows and `needs_role_review` is already an established status.

## Existing pattern decision

Reuse the existing Create Series draft card, `warnings` rendering, `Field`/`Select`/`Alert`
patterns, `storyControlSeedSchema`, `validateVerticalDramaStoryControlSeed`, and the
existing skill-copy synchronization pattern. Do not introduce a second story ledger or a
new visual system.

## Risk notes

- The LLM may still return an invalid enum or omit optional context. The server must preserve
  the draft with a diagnostic and bounded repair/fallback, not throw away the whole draft.
- Broad identity phrases such as “Asian international student” are valid incomplete facts;
  the system must not turn them into an arbitrary country.
- A creator-provided name may be culturally cross-border. Coherence requires an explicit
  rationale/context check, not a name blacklist.
