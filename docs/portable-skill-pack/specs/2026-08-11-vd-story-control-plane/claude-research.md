# Research Findings

## Research decision

- Codebase research: required because this is an existing git repository with an implemented Vertical Drama pipeline.
- Web research: skipped. The request is primarily an internal architecture and skill-contract problem; no external API or unstable technology decision is required for the plan.
- Testing: use the existing `apps/web` Vitest suite for service/schema/regression tests, and targeted Playwright coverage only for the UI verification surface. Existing commands are defined in `apps/web/package.json`.
- SocratiCode: unavailable in this runtime. Research used targeted `rg` discovery and narrow source inspection instead of broad repository reads.

## Current architecture evidence

### Duration and shot contract

- `apps/web/shared/verticalDramaSeries/assembly.ts` currently pins two legacy 60-second assembly profiles, but even those profiles already represent duration as arrays (`clipDurationsSeconds`/`shotDurationsSeconds`) and the default profile maps 9 frames to 8 clips. This makes the fixed `totalSeconds=60` value a production compatibility constraint, not a safe story-planning abstraction.
- `apps/web/skills/vertical-drama-storyboard-shotgrid/skill.md` keeps the logical storyboard contract at exactly 9 shots. The story-control plan must preserve that shot count while allowing each logical shot to receive a provider-supported duration.
- `apps/web/shared/verticalDramaSeries/contentBudget.ts` and `dialogueQuality.ts` already derive speech budgets from each clip/shot duration. This is the correct extension point for variable-duration episode planning; do not introduce a second fixed episode-duration calculator.
- `apps/web/skills/vertical-drama-script-builder/SKILL.md` already refers to the episode duration profile rather than requiring a fixed number of shots for every duration. The revised plan should pass the selected profile/vector into the bounded episode context.
- Imported skill fixtures/references still contain literal `duration_seconds=60` compatibility assertions. They must be treated as legacy contract fixtures and migrated only through an explicit profile/version change, not silently reinterpreted as the story planner's canonical runtime.

### Existing continuity gate

- `apps/web/shared/verticalDramaSeries/storyContinuity.ts` already validates stable thread structure, including duplicate openings, resolutions for unregistered IDs, repeated resolution, and unresolved season-end threads.
- `apps/web/server/services/verticalDramaEpisodePipeline.ts` invokes continuity validation in paid pipeline stages. Legacy/non-structured memory can be grandfathered outside season boundaries, so the current gate is intentionally not a complete semantic story validator.
- `apps/web/server/services/verticalDramaStoryBible.ts` validates completed deep drafts when the target season is complete and episode memories are available, and can reject a complete draft with continuity issues.

### Current source-of-truth risk

- `verticalDramaSeriesMemoryProjection.ts` accepts optional fields and falls back to a deterministic recap when `episode_memory` is absent or invalid.
- `verticalDramaScriptGeneration.ts` defines `open_loops` as optional in the TypeScript/Zod output even though the skill text asks the model to emit it. `resolveScriptEpisodeMemory` trusts a valid `episode_memory` block and does not merge `open_loops` into that valid block; the two fields can therefore diverge.
- `verticalDramaStoryBible.ts` carries `openThreads` between deep-draft chunks as free-text strings. That is useful as a prompt recap but is not suitable as the canonical identity for durable plot arcs.

### Existing skill capabilities

- `apps/web/skills/vertical-drama-full-story-architect/skill.md` already requires episode coverage, character consistency, state-changing scenes, layered reveals, protagonist agency, antagonist adaptation, power shifts with cost, and episode memory when trustworthy.
- `apps/web/skills/vertical-drama-script-builder/SKILL.md` already asks for open loops, retention loops, character emotional arcs, and episode memory.
- `apps/web/skills/vertical-drama-episode-quality-review/SKILL.md` and `verticalDramaEpisodeQualityReview.ts` already support semantic review plus deterministic facts such as reversal count, change cadence, hook/retention quality, emotion variety, and pacing. The natural extension point is a season-level control contract, not a second independent authoring engine.

### Existing UI/test boundary

- The series memory UI already exposes stable thread IDs and resolved-thread history from the earlier continuity work. The next plan should extend observability around status, age, overdue state, and evidence rather than create a second thread UI.
- The web package uses Vitest for unit/service tests and Playwright for selected browser evidence. Repository-wide typecheck has known baseline noise, so future implementation should report focused changed-flow validation separately.

### Data audit evidence carried from the prior read-only audit

- The current database contains legacy records where opened threads and resolution references do not consistently match. For series 21, the audit found many unresolved/open records and only a minority of resolution references that linked to registered openings.
- This is evidence for a migration/audit mode. It is not evidence that every old record should be automatically resolved, rewritten, or used as a new episode authoring contract.

## Design implications

1. Add a single versioned story-control plan for newly planned content. Treat observed episode memory as a materialized result, not a competing plan.
2. Treat episode runtime as a derived value from the 9 logical-shot duration vector plus any explicit assembly mapping. A fixed 60-second profile remains a compatibility profile for existing production paths, not a universal planning rule.
3. Keep the full ledger server-side and pass only a bounded episode slot plus relevant canon facts to each authoring skill call.
4. Let skills judge meaning: whether a reveal pays off, whether romance chemistry is earned, whether a reversal is compelling, and whether the core premise remains intact.
5. Let deterministic code reject structural contradictions: unknown IDs, duplicate actions, silent drops, invalid character keys, impossible episode ranges, missing payoff windows, unbounded thread growth, and invalid shot-duration vectors.
6. Treat legacy data as read-only/audited until a human or explicit planning action classifies it as carry, resolve, park, or sequel hook.
