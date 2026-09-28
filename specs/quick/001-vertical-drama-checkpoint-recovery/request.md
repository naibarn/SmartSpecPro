# Request

## Task summary

Implement a complete Vertical Drama story-job recovery flow. A user must be
able to repair or continue an interrupted/stalled job from the UI without
regenerating the whole story or overwriting completed episodes.

## Affected areas

- Redis/BullMQ story-job record and worker lifecycle
- owner-scoped tRPC recovery/read contracts
- `VerticalDramaDeepStoryDraftsPanel` status and action states
- focused service, router, and UI regression tests

## Constraints

- preserve the existing checkpoint and authored episode content;
- prevent duplicate queue deliveries and double charging from duplicate clicks;
- retain tenant/user ownership checks;
- no database migration unless implementation evidence proves it necessary;
- do not enqueue or execute production paid work during this code change;
- preserve unrelated dirty worktree changes.

## Assumptions

- `deep_generate` and `extend` remain the primary checkpoint-recoverable kinds;
- the existing executor already skips completed episodes when given its
  checkpoint and remains the authority for credit admission/deduction;
- a failed job with no checkpoint is not safely resumable and must be reported
  as requiring a new generation.

## Non-goals

- changing story prompts, episode schemas, or credit ledger semantics;
- deploying to production or running the current series 58 recovery;
- redesigning notification SSE transport.
