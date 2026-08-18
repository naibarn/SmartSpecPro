# Section 01 — durable image-task failure

## Ownership

Own the existing JSONB `imageTask` contract and
`persistStartFrameImageTask` router mutation. Do not change provider payloads,
credits, auth, tenant scope, or unrelated task types.

## Target files

- `apps/web/shared/verticalDramaSeries/contracts.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- corresponding router/contract tests

## TDD expectations

Start with failing tests for provider/sync failure-stage persistence, no-task
admission failure, and protection against overwriting a newer pending task.
Preserve the transaction row lock and owner predicates.

## Acceptance checks

- provider/sync terminal writes retain `lastTaskId` and bounded error;
- admission terminal writes may omit task id only with no pending task;
- old terminal updates cannot replace a newer pending task;
- JSONB backward compatibility remains optional-field based;
- focused router/type tests pass.

## Risks

The no-task terminal branch must not use a fake provider id and must not clear a
newer pending retry.
