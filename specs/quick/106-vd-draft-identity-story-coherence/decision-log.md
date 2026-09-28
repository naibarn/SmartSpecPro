# Decision Log

## Planning depth

- Chosen depth: standard quick-plan
- Reason: the change crosses shared contracts, synthesis service, router handoff, skill
  prompts, and one existing wizard surface, but requires no database migration or new
  provider. The product design has already been approved.
- Promotion trigger: promote to full deep-plan only if the existing create payload cannot
  carry the additive identity/story seed without changing persisted legacy semantics.

## Decisions

1. `targetMarket`, `storySetting`, `leadBackground`, `spokenDialogue`, and `namingPolicy`
   are separate facts with source/confidence; the UI must never label market as nationality.
2. If origin is ambiguous, preserve the broad identity and show a bounded creator choice;
   do not silently choose Thailand, Vietnam, or another country.
3. Reuse `storyControlSeed` for romance/threads/advantage/cost. Code validates IDs, enums,
   and episode windows; the skill owns dramatic meaning.
4. Role warnings become structured diagnostics with creator-facing copy. Apply is blocked
   only by unresolved structural errors, not by informational AI notes.
5. All new fields are optional and additive. Existing bibles, names, roles, images, and
   episodes remain untouched unless the user explicitly regenerates or repairs them.
