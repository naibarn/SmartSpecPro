# Section 02 — story and prompt auto-repair

## Ownership

Prompt expansion validation/repair and durable deep-story completion worker.

## Target areas

- `apps/web/server/services/verticalDramaPromptExpansionService.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- story job persistence/checkpoint modules and focused tests

## TDD expectations

Cover 50-episode target sets, partial chunks, empty dialogue, repair-only missing episodes, refresh/resume, and bounded exhaustion.

## Acceptance checks

The “update detailed story” action itself completes missing dialogue or reports a durable, actionable failure; it never requires a second click for normal incomplete output.

## Risks

Preserve canonical active version and avoid overwriting user-approved episode summaries. Do not auto-run production media work.
