# Decision Log

## Planning depth

**standard quick-plan** — the change crosses the shared Vertical Drama prompt
contract, Start Frame projection, Legacy and Enhanced prompt builders, and
focused tests, but does not require a new service, schema migration, UI change,
or provider integration.

## Decisions

1. Use the approved frame's user-selected character refs as the visual-cast
   authority whenever they are present.
2. Keep explicit caller refs separate from physical cast refs and pass them only
   as caller/media presence.
3. Preserve synopsis/storyboard text as narrative context, but never use its
   character list to add visual subjects when the frame cast is explicit.
4. Do not block on narrative-only extra characters. Keep existing safety checks
   for genuinely ambiguous dialogue identity so the fix cannot cause mouth
   movement on the wrong person.
5. Centralize resolution so Legacy and Enhanced cannot diverge again.
6. Do not mutate episode 262 or invoke paid providers during this change.

## Review rounds

- Round 1: checked that the user-selected frame, not storyboard prose, is the
  authority for Start Frame and video paths.
- Round 2: separated physical cast from explicit caller presence and avoided
  treating a caller as a physical duplicate.
- Round 3: added the no-block rule for narrative-only characters while retaining
  wrong-speaker protection.
- Round 4: aligned Legacy and Enhanced around one resolver and included Start
  Frame regressions.
- Round 5: checked dirty-worktree safety, paid-action boundaries, and no schema
  migration/provider call requirement; no blocking gaps remain.
