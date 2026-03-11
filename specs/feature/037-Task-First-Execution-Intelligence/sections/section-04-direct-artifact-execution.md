# Section 04 — Direct Artifact Execution

## Objective

Allow the runtime to complete selected tasks as artifacts rather than plain text.

## Scope

1. define artifact-oriented execution paths for report and presentation outcomes
2. route presentation tasks between direct completion and deterministic draft pipeline
3. persist artifact linkage to task runs and downstream messages

## Actual files created/modified

### New files
- `apps/web/server/services/artifactRouter.ts` — artifact intent classification + execution route selection
- `apps/web/server/services/artifactRouter.test.ts` — 14 tests
- `apps/web/drizzle/0065_cynical_darkhawk.sql` — adds artifact columns to task_runs

### Modified files
- `apps/web/drizzle/schema.ts` — added `artifactIntent`, `executionRoute`, `routeReason`, `presentationDeckId`, `artifactMessageId` to task_runs
- `apps/web/server/services/taskRunStore.ts` — artifact fields in createTaskRun, linkArtifactToTaskRun helper

## Strategy rules implemented

- **Presentations**: deterministic pipeline by default; direct completion only for simple tasks with structured-output-capable model
- **Reports**: always direct completion (models handle text well)
- **Chat/media**: direct completion
- `routeReason` persisted on every task run for future telemetry

## Artifact intent types
- `chat_reply` — default for chat/unknown
- `research_report` — report/research skills
- `presentation_deck` — presentation/slide/deck skills
- `media_prompt` — media generation sources

## Artifact linkage
- `task_runs.presentationDeckId` — links to created presentation deck
- `task_runs.artifactMessageId` — links to output message
- `linkArtifactToTaskRun()` — sets these after artifact creation

## Acceptance criteria

1. ✅ presentation/report tasks are represented as artifact-oriented task runs (artifactIntent + executionRoute stored)
2. ✅ the runtime can choose deterministic pipeline vs direct completion intentionally (selectExecutionRoute logic)
3. ✅ resulting artifacts are linked to runtime/audit records (presentationDeckId, artifactMessageId, routeReason)

Note: Runtime wiring (calling artifactRouter from aiPresentationService) deferred to section 05 rollout.

## Tests
- 14 tests for artifactRouter (intent classification, route selection, edge cases)
- 52 total tests across sections 03-04, all passing
