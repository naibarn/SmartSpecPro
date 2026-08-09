# Section 02 — Router and Lifecycle

## Ownership

- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/_core/index.ts`
- focused router and lifecycle tests

## Work

Extract the existing slow prompt behavior into an exported executor. Make the
public mutation validate ownership and enqueue quickly. Add status and active
queries with exact tenant/user/series/episode/shot checks. Initialize and close
the worker with the server lifecycle.

## TDD expectations

Prove submit does not invoke the LLM inline; keep all current executor prompt,
cast, credit, and persistence regressions passing; verify lifecycle calls.

## Acceptance checks

- Existing prompt result shape is the worker terminal result.
- Unauthorized or mismatched status lookups expose no job data.
- Startup and both graceful-shutdown paths close the queue.

## Coordination risks

The router file is already dirty. Limit edits to imports, the prompt procedure,
new status procedures, and the extracted executor boundary.
