# Storyboard Policy Recovery Design

## Problem

Episode 258 run 1233 completed script and character-reference stages, then failed at `storyboard_shotgrid`. The generator attempted one safety rewrite, discarded the rejected candidate, and persisted only the stage name. A user retry therefore repeats the completed generation work.

## Approved behavior

1. Safety analysis evaluates storyboard story-bearing shot fields, not duplicated handoff, negative prompts, or transport metadata.
2. A high-risk candidate is repaired from that candidate. Only the affected safety findings are supplied to the repair prompt; unrelated shots must remain stable.
3. Safety recovery is bounded within one async run. Each accepted candidate replaces the previous checkpoint in memory and becomes the next repair base.
4. User credits are deducted once, only after the final candidate passes schema and safety gates. Rejected repair attempts are not separately charged.
5. If recovery is exhausted, the error retains the last candidate and structured safety findings for durable diagnostics. The unsafe candidate is never published to `vertical_drama_episodes.storyboard` and the safety gate is never bypassed.

## Components and flow

- `verticalDramaStoryboardGeneration.ts` owns a small storyboard-safety projection and the candidate-aware repair loop.
- `verticalDramaEpisodePipeline.ts` preserves the final rejected candidate and recovery metadata in the failed run artifact instead of reducing the artifact to `{stage}`.
- Existing async run lifecycle and episode persistence remain unchanged for successful output.

## Failure handling

- Transient provider/schema recovery remains owned by `executeJsonPlanningCallWithRetry`.
- Story-policy repair uses a separate bounded loop because it starts from valid JSON.
- Provider auth, insufficient credits, and other non-policy failures remain terminal and are not blindly retried.
- Exhaustion produces a repairable failure with structured evidence, without publishing unsafe storyboard state.

## Verification

- A duplicated/oversized handoff cannot falsely block an otherwise safe storyboard.
- First unsafe candidate followed by a safe repair succeeds and uses candidate-aware repair mode.
- Multiple unsafe candidates progress through the configured repair budget and retain the last candidate on exhaustion.
- Credit deduction occurs exactly once on success and never on exhausted recovery.
- Async failure artifact includes recovery candidate/findings while the episode storyboard stays untouched.

## Non-goals

- No provider call, production retry, database mutation, migration, or safety-policy bypass.
- No infinite retry loop; non-retryable provider failures remain honest failures.
