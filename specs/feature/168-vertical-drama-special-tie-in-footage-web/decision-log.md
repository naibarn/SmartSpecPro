# Decision log

## Planning depth

**Promote-equivalent cross-domain plan.** The request crosses React UI, tRPC/API, Drizzle persistence, Skill runtime, managed media, billing and Worker jobs. Two feature specs are maintained separately, with Feature 168 §5 as the shared Web/Worker contract authority.

## Decisions

1. Keep the user-facing entry point in the existing Special Tie-in dialog.
2. Make prepared footage a prerequisite for the new ideation path.
3. Preserve source footage and create immutable derived revisions.
4. Treat transcription as timed evidence/continuity guidance, not speaker identity proof.
5. Story review precedes the exact nine-shot generation action.
6. AI B-roll is overlay/cutaway and muted by default.
7. No new wallet or media registry; reuse existing credit and managed-media boundaries.
