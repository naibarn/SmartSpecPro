# Section 02 implementation record — durable logical execution state

Status: partial / in progress.

## Implemented locally

- Added nullable pinned plan JSON and plan hash fields to `workflow_studio_runs` for compatibility with existing rows.
- Added `workflow_studio_node_runs` and `workflow_studio_node_attempts` tables with tenant/run composite foreign keys, constrained status vocabularies, uniqueness/idempotency guards, artifact references/digests, and links to canonical Feature 195 jobs and worker attempts.
- Added migration `0365_spec215_durable_logical_runtime.sql` and Drizzle journal entry 349.
- Workflow Studio admission persists selected logical nodes and links only initially ready node attempts to canonical jobs.
- Corrected node/run identities so the UUID persisted in the logical run is also the identity carried in worker payloads.

## Verification

- `npm test -- --run server/services/__tests__/workflowStudioRuntime.test.ts server/services/__tests__/workflowStudioDurableStateSchema.test.ts server/routers/__tests__/workflowStudio.test.ts` — 3 files, 11 tests passed.
- `git diff --check` — passed.
- `npx drizzle-kit check --config apps/web/drizzle.config.ts` from repository root — passed (`Everything’s fine`); no snapshot rewrite was made.
- Migration was not applied to a database; no production schema claim is made.

## Remaining acceptance gaps

- Fenced worker claim/result settlement must populate physical attempt ID and generation, commit output atomically, and activate newly ready successors.
- Durable checkpoint transition and resume, restart reconciliation, effect recovery, authorization/placement, budgets, and full adapter coverage are not implemented in this section.
