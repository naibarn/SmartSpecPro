# Contracts

## Marketplace Auto Review Image Repair Exhaustion

- If image generation has complete storyboard frame evidence and the minimum image attempts threshold is reached, exhausted repair budget must not loop in `repairing`.
- The handoff must preserve `accepted_with_warnings`, `userReviewRequired`, QA refs, repair refs, and warning approval refs so Storyboard Review can expose the issue safely.
- Whole-storyboard product fidelity failures are not silently accepted as clean media; they are forwarded only as user-review-required warnings after the configured repair budget is exhausted.

## Advance Outbox Persistence

- Manual/API advances may persist a durable `advance_run` outbox job.
- Background scheduler sources (`auto`) and existing outbox processors (`outbox:*`) must not enqueue another unique `advance_run` job on every claim.
