# Spec Audit 195–200

Date: 2026-09-17  
Scope: Features 195, 196, 197, 198, 199 and 200  
Repository: `/home/dev/projects/SmartSpecPro`

## Result

The six specifications are now cross-spec consistent as target specifications. Feature 199 owns the External MCP upstream boundary and Feature 200 owns delegated External Agent runtime behavior. The documents share one execution, capability, Runner, context and asset contract surface and do not define a second Job, Runner, RAG, approval, asset, billing, permission or audit source of truth.

Executable consistency review: **40/40 rounds passed** (requirement was at least 20). Each round checked all six documents, identity/relationship metadata, shared contracts, required sections, retired-system boundaries, ownership separation, current-code anchors and the principal UI/runtime anchors.

## Findings fixed

1. Corrected Feature 199's old relationship text that incorrectly associated Intelligent Chat with Feature 196. Intelligent Chat is Feature 198; Feature 196 owns Goal/Plan/Capability/Command semantics.
2. Added codebase-honest `Partial` status and dated alignment baselines to Features 199 and 200. Target tables/routes are no longer implied to be already implemented.
3. Changed Feature 200 status to `Implementation-ready target specification` so it agrees with its partial implementation statement.
4. Added explicit related-spec and shared-contract metadata across Features 195–200.
5. Added the same ownership/non-overlap matrix and canonical flow to Features 199 and 200:

   `Feature 198 Chat/Assistant UI → Feature 196 Goal/Plan + LangGraph → shared Capability/Approval/Retrieval/Asset → Feature 199 MCP OR Feature 200 Agent → Feature 195 worker_jobs → Feature 197 Runner → Feature 198 result surface`

6. Added the required Problem, Solution, Requirements, Architecture, Implementation, Assumptions, Constraints, Risks, Alternatives, User Stories and Acceptance Criteria sections to the audited documents.
7. Made the retired execution boundary explicit. New work must not add Agency, work requests/workpacks, the retired `/workflows` engine, OpenSandbox, `sandbox_jobs` or Docker/OpenSandbox dispatch. `Workflow` in these specs means only a governed Feature 196 Goal/Plan or approved LangGraph flow.

## Ownership contract

| Feature | Single owner | Explicitly not owned |
|---|---|---|
| 195 | Durable `worker_jobs`, outbox, lease/fencing and job lifecycle truth | Chat UX, MCP upstream lifecycle, Agent provider sessions |
| 196 | Goal/Plan, capability resolution, command and orchestration semantics | Runner device control, upstream MCP transport, delegated Agent adapter |
| 197 | Runner/device identity, local execution and control channel | A second queue, MCP gateway, Agent runtime or Chat surface |
| 198 | Chat, Universal Assistant surfaces and evolution/evaluation semantics | Durable Job truth, Runner channel, MCP upstream or Agent provider lifecycle |
| 199 | External MCP upstream lifecycle, protocol/OAuth, schema/risk/quarantine and MCP invocation | External Agent runtime and a second shared control plane |
| 200 | External Agent adapters, provider sessions/events/results and Agent Runtime Core | Arbitrary upstream MCP access and duplicate Job/Runner/RAG/approval/asset systems |

## Codebase alignment evidence

- Canonical durable execution tables are present in `apps/web/drizzle/schema.ts`: `worker_jobs`, `worker_job_events`, `worker_job_attempts`, `worker_job_provider_reservations`, `worker_job_dispatches` and `worker_job_outbox`.
- Existing MCP foundations are present in `apps/web/server/_core/mcpRegistry.ts`, `mcpRoutes.ts`, `mcpPublicServer.ts`, `mcpOAuthServer.ts`, the MCP routers, and Python MCP client/executor services. They are an inbound/hosted MCP and connection foundation, not proof that the full Feature 199 multi-upstream gateway exists.
- Existing MCP persistence includes provider templates, user connections, shares, schema cache, usage events, media tasks, tenant MCP servers and assignments. Features 199/200 now require reuse/mapping rather than parallel tables.
- Existing product surfaces include `/chat`, `/admin/mcp-servers` and `/workers/connect`; the target role-specific MCP Center, Connected Apps settings, Agent Panel/live task card and approval/result surfaces remain implementation work.
- Existing delegated execution includes `external_agent_task` and the current OpenAI Agents/LangGraph/Web runtime foundations. No complete provider-independent Feature 200 Agent Task/session/result contract was found.
- The current capability catalog intentionally excludes retired Agency/workflow surfaces. Residual legacy code is classified as non-evidence and was not removed because removal is outside this spec-audit scope.

## Validator evidence and limitations

`python3 .smartspec/scripts/validate_spec.py --spec <file> --registry .spec/registry` returned exit code 0 for all six files:

| Spec | Exit | Warnings | Errors |
|---|---:|---:|---:|
| 195 | 0 | 49 | 0 |
| 196 | 0 | 26 | 0 |
| 197 | 0 | 17 | 0 |
| 198 | 0 | 26 | 0 |
| 199 | 0 | 301 | 0 |
| 200 | 0 | 25 | 0 |

Warnings are expected because `.spec/registry` is a legacy registry with `apis`, `data_models`, `glossary` and `critical_sections` keys while the validator reads `endpoints`, `models`, `terms` and `sections`; the target endpoints and models are not yet registered. This audit did not change the registry or application schema.

## Remaining implementation gaps

These are documented target gaps, not spec contradictions:

- Feature 199 still needs the complete external upstream lifecycle: install/discover, protocol/OAuth, credential isolation, quarantine/review, schema revisions, revocation, health/reconciliation, policy and RAG projection.
- Feature 200 still needs the provider-independent Agent Task/session/event/result contract, provider adapters, Runner command/event reconciliation, workspace verification and UI integration.
- The five `SAH-*` identifiers are compatibility identifiers only; runtime adapters, mixed-version tests, migrations and rollback evidence do not yet exist.
- Exact target API routes, persistence models and role-specific UI named by Features 199/200 require normal tenant/auth, migration, idempotency, observability and rollback review before implementation.

No application source, database schema or runtime route was changed in this audit; unrelated dirty-worktree changes were preserved. SocratiCode was unavailable in this environment, so discovery used targeted `rg` and narrow file reads after the repository instructions required that fallback.

