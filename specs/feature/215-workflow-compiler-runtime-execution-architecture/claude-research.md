# Spec 215 Deep-Plan Research

## Research decision

- Codebase research: required. This is an existing TypeScript/Python monorepo with Workflow Studio and Feature 195 job-control code.
- Web research: limited to the official OpenAI Agents SDK and Cloudflare queue/workflow execution semantics because these external integrations are named in Spec 215. No new provider/runtime capability is assumed from documentation alone.
- Testing: follow the focused Vitest suites under `apps/web/server/services/__tests__`, `apps/web/server/routers/__tests__`, and relevant shared tests. Use focused Python tests only where the implementation crosses into the Python Feature 195 adapter. Do not run repository-wide TypeScript typecheck due `AGENTS.md` RAM constraints.
- Discovery fallback: SocratiCode was not callable in this environment. Used targeted `rg`, bounded reads, repository manifests, and a read-only source scout. This limitation is recorded; no index-derived claims are made.

## Existing source surfaces

- `apps/web/server/services/workflowNodeContracts.ts`: canonical Spec 214 manifest schema-v4 and 16 core node IDs. Spec 215 consumes this contract; it must not define a competing registry.
- `apps/web/server/services/workflowCompilerRuntimeContracts.ts`: WorkflowDefinitionV2 validation, immutable `spec-215-v3` execution plan, in-memory WorkflowRun/NodeRun/NodeAttempt shapes, and `buildFeature195NodeAttemptJob` handoff.
- `apps/web/server/services/workflowStudioCanonicalAdapter.ts`: Studio graph conversion and compiler validation. It currently retains compatibility mappings for former graph-shell names; those mappings must be scoped to input migration and must not become new canonical type IDs or resurrect the retired workflow engine.
- `apps/web/server/services/workflowStudioRuntime.ts`: topological selection and one JobDefinition per selected node. Current plan creation is not a readiness scheduler.
- `apps/web/server/routers/workflowStudio.ts`: protected definition/run routes, persisted aggregate run/events/checkpoints, and Feature 195 admission. Current run admission loops over the complete plan job set, so dependency order is not enforced at dispatch time.
- `apps/web/server/services/workflowNodeTaskExecutor.ts` and `apps/web/server/jobs/jobExecutorRegistry.ts`: canonical job executor boundary; the workflow handler fails closed when no dispatcher is configured. No complete production node adapter registry was found.
- `apps/web/server/services/workflowStudioJobExecutor.ts`: older sequential payload.steps executor. Do not extend it as the Spec 215 runtime or route through prohibited legacy `/workflows`; perform a read-only dependency audit before any retirement.
- `apps/web/drizzle/schema.ts` and migration `0341_feature_209_workflow_studio.sql`: existing aggregate workflow Studio persistence. Current schema lacks durable per-node attempt input/output, dependency activation, and a direct attempt/fencing correlation surface.
- Focused tests exist for contracts, canonical adapter, Studio runtime, job executor, economics, and router. They do not prove full graph scheduling, durable output commits, production adapters, production data compatibility, or deployment activation.

## Cross-spec boundaries and constraints

- Spec 214 owns canonical node identity, manifest, and node semantics.
- Spec 215 owns workflow definition compilation, immutable plan, logical run/node/attempt state, graph scheduling, checkpoint/replay semantics, and translating physical-job results into logical workflow state.
- Feature 195 and Feature 186 own `worker_jobs`, events, outbox, physical attempts, leases, fencing, retries, and transport adapters. Every detached/background business operation must be admitted through this canonical control plane.
- Spec 220 owns tenant identity, authorization, data/capability/secret access. Spec 229 owns Retrieval Broker/search; Spec 225 owns attention delivery; Spec 226 owns client action mapping; Spec 207 owns economic authorization/settlement.
- Spec 251 exists at `specs/feature/251-creator-workspace-media-localization/spec.md` and assigns workflow plan/retry/checkpoint to Spec 215 with physical jobs in `worker_jobs`. The R4 amendment in Spec 215 that says Spec 251 was not found is stale and must be corrected before claiming Creator conformance.
- Retired systems in root `AGENTS.md` remain prohibited, including the legacy custom workflow engine and `/workflows`; no plan or implementation step may revive them.

## Confirmed implementation gaps

1. No dependency-aware persisted readiness scheduler; all selected jobs can be enqueued before predecessor outputs commit.
2. No complete durable logical NodeRun/NodeAttempt/output/checkpoint/fencing bridge, beyond aggregate Studio run state and physical `worker_jobs` refs.
3. Node adapter coverage is not complete for the 16 canonical types; the registered workflow job handler currently fails closed without an injected dispatcher.
4. Compiler policy declarations (scope, retry, timeout, checkpoint, cache, budget, fallback, instrumentation) are not all executed or translated into the physical job policy.
5. Human wait/approval and action resume require a durable Spec 225/226 bridge; current older executor behavior is not proof of this contract.
6. Retrieval Broker V2 is unverified. Production retrieval must remain disabled/fail-closed until Spec 229 and Spec 220 gates pass; no direct vector/search client is allowed.
7. Deployment data inventory, migration/backfill/rollback, production adapters, external account binding, and disaster-recovery proof remain distinct gates; local tests cannot certify them.

## External documentation checked

- OpenAI Agents SDK official overview and execution docs: https://openai.github.io/openai-agents-python/ and https://openai.github.io/openai-agents-python/running_agents/. Use SDK primitives only behind the existing agent/runtime authority; this is not permission to create a second workflow/job state machine.
- Cloudflare Queues delivery guarantee: https://developers.cloudflare.com/queues/reference/delivery-guarantees/. Delivery is at least once; handlers need idempotency and the database remains authoritative.
- Cloudflare Workflows overview: https://developers.cloudflare.com/workflows/. Native durable steps may be an adapter/transport for persisted steps, but cannot replace `worker_jobs` or Spec 215 logical run state.

## Plan decisions

- Plan in additive, independently verifiable sections, beginning with migration-safe persistence and job admission, then dependency scheduling, adapter execution, suspend/resume, policy, and system conformance.
- Preserve current user changes in the dirty worktree. Do not stage or commit unrelated changes; because the worktree is already dirty on `main`, record exact scoped edits and avoid broad formatting/reverts.
- Do not claim all 76 numbered spec headings represent new code modules. Map every normative section and amendment into an implementation section or a named cross-spec/external release gate; historical audit sections are traceability only.
- Do not run the prohibited root TypeScript typecheck. Do not invoke external providers or deploy infrastructure as local verification.
