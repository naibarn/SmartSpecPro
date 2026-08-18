# TDD plan

1. Add a regression that supplies an audio-plan line whose stored
   `speakerName` is `character-2`, whose `speakerCharacterId`/clip key resolves
   to `ภาคิน`, and assert `speaker === "ภาคิน"`.
2. Add a clip-only regression for `character-2 -> ภาคิน` and an unresolved
   opaque-key fallback assertion.
3. Run the focused test and confirm the new expectation fails against the
   current raw-key projection.
4. Implement the minimum resolver and mapping pass-through.
5. Re-run the focused suite, touched-file type diagnostics, and scoped diff
   validation.

The existing DB harness is not needed for the pure helper tests. No new fixture,
dependency, browser environment, or external service is required.

