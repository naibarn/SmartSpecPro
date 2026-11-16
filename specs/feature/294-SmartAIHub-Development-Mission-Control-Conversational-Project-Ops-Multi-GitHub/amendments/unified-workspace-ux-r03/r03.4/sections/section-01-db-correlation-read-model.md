# Section 01 — DB correlation/read model

## Deliverable

Expose Harness instances only from an authenticated Harness registration authority. Join execution to Mission only from an exact producer-owned correlation; a conversation-to-Runner binding alone does not prove that every Job executed by that Runner belongs to that conversation. Preserve distinct environment tenant, legacy tenant, and workspace IDs.

## Scope

SmartSpecPro `apps/web/drizzle` migration and migration tests; Modular Core repository SQL adapters in SmartAIHub Platform. Reuse `runner_nodes`, `spec224_conversation_workspaces`, `runner_execution_sessions`, `worker_jobs`, `worker_job_attempts`, and `worker_job_events`. Add no scheduler, execution store, or fabricated backfill.

## Prerequisites / checks

Prerequisite: the producer must persist a stable Harness type/instance identity and an exact Mission/conversation/workspace-to-Job/Run/Attempt/Session binding at an authenticated registration/dispatch/ack boundary. Confirm exact deployed column types, function owner and Core role ACL only after that source exists. Reauthorize user/workspace/conversation on each call. Historical missing identity stays null. Verify unauthorized workspace and mismatched Runner/Attempt return no rows.

## Known gap

Existing DEV Runner was previously observed inactive. More fundamentally, current schema has no Harness type/instance field and no exact external Job-to-Mission binding. A Runner's conversation/workspace binding cannot be used to associate all of its Jobs. Do not add a one-off projection or backfill based on that inference. See `../traceability.md` for exact resume inputs.
