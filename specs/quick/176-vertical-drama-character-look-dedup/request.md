# Request

Prevent duplicate character looks during Vertical Drama sub-episode creation.
Reuse an existing look when it represents the same outfit/age-stage intent,
including user-created rows, without deleting or merging materially different
looks.

## Repository assumptions

- The affected persistence boundary is `resolvePipelineCharacterLooks` in
  `verticalDramaEpisodePipeline.ts`.
- `requestKey` intentionally retains shot context for evidence, but must not be
  the roster deduplication identity.
- No schema migration is needed because the full series roster is already
  loaded before look resolution.

## Non-goals

- Do not delete historical duplicate rows in this patch.
- Do not rewrite user-authored look data during reuse.
- Do not change manual shot overrides or tenant scoping.
