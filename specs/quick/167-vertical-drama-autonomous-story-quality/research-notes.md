# Research notes

## Existing implementation

- `verticalDramaCompletionContract.ts` already identifies missing shots and
  dialogue, but the surrounding repair planner can still end in
  `needs_repair`/approval states.
- `verticalDramaLongFormRuntime.ts` already preserves accepted blocks and
  checkpoints, but returns `needs_repair` when a block remains invalid.
- `verticalDramaLongFormMemory.ts` already provides bounded retrieval packs and
  reverse dependency impact.
- `verticalDramaStoryBible.ts` has premium candidate/judge/revise/sweep logic,
  but its continuity checker is primarily thread lifecycle based. The premium
  floor permits dimension scores of 3/5.
- `verticalDramaScriptGeneration.ts` hydrates deep drafts in refine mode and
  validates schema, episode memory, story-control metadata, and speech
  coverage. It does not perform semantic knowledge/event validation.
- `verticalDramaEpisodePipeline.ts` has a bounded continuity repair loop before
  storyboard generation, but this is a later-stage path and does not repair
  the underlying full-story prose contract.
- Existing long-form tests cover 120-episode planning, bounded repair, accepted
  block resume, and stale checkpoint fencing.

## Fresh incident evidence

- Series 53 had 34 persisted deep versions, all `source: generate_story`.
- The ambiguous twin line existed in deep version 0 and remained in the active
  version; this is a generation/semantic-gate defect, not evidence of a later
  prose repair introducing it.
- Episode 1 and Episode 3 both used the same helper-fall interaction pattern.
- Actual episode run rows had structural continuity warnings for other duplicate
  thread openings, but no episode QC report for this series.

## Key risks

- A fallback must never accept a structurally incomplete episode.
- A repair loop must not charge duplicate work on redelivery.
- A semantic validator must not infer private facts from free text in a way that
  leaks secrets across viewpoint-bounded long-form retrieval.
- Expanding repair scope for a 120-episode story must remain bounded.
