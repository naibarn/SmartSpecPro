# Vertical Drama Initial Story Plan Resilient Generation

## Goal

Make the first full-story generation (`plan`) a durable background job that
does not lose a completed provider response when the worker fails during
validation, character reconciliation, or the final series write. The job must
remain safe to refresh, retry, and resume without charging the same provider
response twice or enqueueing duplicate deep-draft work.

## Current failure boundary

The plan job currently performs one provider request and keeps the validated
candidate only in memory. It writes the canonical `verticalDramaSeries.bible`
once, near the end of the executor. The story-job Redis checkpoint is only
resumable for `deep_generate` and `extend`, so a worker redelivery of `plan`
starts the provider call again and cannot expose a saved candidate.

The provider request remains one atomic planning call in this wave. Streaming
partial JSON is deliberately out of scope because it would expose malformed
or semantically incomplete plans. The durable boundary is moved immediately
after the validated provider response, then the remaining local stages resume
from that candidate.

## Design

1. Extend the story-job checkpoint with a plan stage and a validated
   `planCandidate`. The candidate is written through the existing serialized
   Redis writer before local post-processing continues.
2. Make `plan` checkpoint-resumable. On redelivery, a `planCandidate` skips the
   provider request and credit deduction, then resumes local validation,
   character reconciliation, canonical bible persistence, and deep-job
   enqueueing.
3. Emit explicit plan progress stages: generating, candidate saved,
   validating, saving, and handing off to detail generation. The existing
   polling contract remains backward compatible for deep/extend jobs.
4. Keep canonical series data unchanged until the candidate passes the durable
   final gate. A checkpoint is recovery state, not user-visible canonical
   story content.
5. Make the server-owned plan-to-deep handoff idempotent. The client consumes
   the returned `deepJobId` when available and only submits a deep job itself
   for legacy responses, preventing duplicate work after refresh or a race.

## Failure handling

- Insufficient credits before the provider call remains terminal and does not
  create a misleading partial story.
- A worker crash after candidate checkpoint resumes without a second provider
  call or second charge.
- A canonical write failure keeps the checkpoint and lets the worker retry;
  no incomplete candidate is published as the active bible.
- The deep job starts only after the canonical plan write succeeds. Its own
  per-episode checkpoint/recovery behavior remains unchanged.

## Scope and trade-offs

This wave does not add a database migration and does not stream provider
responses. It materially closes the long post-provider loss window and makes
refresh-safe progress explicit, while the provider's single request remains
atomic by design. Splitting the provider request into multiple planning calls
would create a larger prompt/schema/credit change and is deferred until real
provider latency evidence requires it.

## Verification

- Story-job unit tests cover plan checkpoint serialization and resume.
- Router tests cover skipping the provider call from a checkpoint and
  idempotent deep handoff.
- Client copy tests cover the new plan stages.
- Web typecheck, focused tests, and `git diff --check` are required.
