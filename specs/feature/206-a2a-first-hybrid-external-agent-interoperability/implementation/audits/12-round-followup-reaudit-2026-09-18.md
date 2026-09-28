# Spec 206 — 12-Round Follow-up Re-Audit

Date: 2026-09-18
Target: `specs/feature/206-a2a-first-hybrid-external-agent-interoperability/spec.md`
Method: targeted shell discovery because SocratiCode was unavailable in this session.
Scope: fresh follow-up after Revision 8, focused on code-type alignment, interop persistence, API ownership, protocol source pinning and Specs 199/200/204/205 relationships.

## Independent rounds

| Round | Boundary checked | Evidence | Result and immediate action |
|---:|---|---|---|
| 1 | Spec revision and implementation truth | Spec 206 header and current runtime scan | Confirmed Revision 8 remains planning-only; no A2A runtime implementation was claimed. |
| 2 | Undefined type names | `rg` for `UniversalAgentTaskManifest` across spec/code | Found the name existed only in the suggested interface and nowhere in the repository. Clarified it as logical-only and replaced interface parameters with `AgentTaskManifest` plus `AgentInteropIntent`. |
| 3 | Manifest validation boundary | `agentControlPlaneContracts.ts` validator and job builder | Confirmed current fields/provider/runtime union and `external_agent_task` mapping; Spec 206 now explicitly requires validation before interop routing. |
| 4 | Interop sidecar persistence | Spec 206 Section 20 and `agent_interop_route_decisions` model | Found “sidecar” did not define durable ownership. Spec 206 now states it is server-owned pre-admission state and is projected after admission through route-decision snapshots/binding rows, not a second manifest or queue. |
| 5 | Lifecycle status compatibility | `jobControlPlaneTypes.ts` and A2A mapping | Confirmed mapping uses existing canonical statuses and keeps A2A-specific states as events/reason codes. No new durable status was introduced. |
| 6 | Admission and executor safety | `jobControlPlaneGateway.ts`, `jobExecutorRegistry.ts` | Confirmed authenticated server context and executor registration/fail-closed behavior remain explicit. |
| 7 | Durable database linkage | Drizzle worker job/event/attempt/outbox tables and Spec 206 data model | Confirmed job/attempt/event/outbox identity, tenant scope, idempotency and restrictive-link requirements remain aligned. |
| 8 | Spec 199/200 ownership | Companion headers and Sections 2/95 | Confirmed MCP ownership stays in Spec 199 and native external-agent execution stays in Spec 200; no second queue or MCP gateway is authorized. |
| 9 | Spec 204/205 ownership | Companion headers, Runner/Container sections and Section 95 | Confirmed A2A consumes existing Container/Runner contracts without creating a second scheduler, registry, socket or release path. |
| 10 | Management API boundary | Spec 206 Sections 53–54 | Found target management APIs lacked explicit auth/tenant/SSRF/idempotency wording. Added server-derived authorization, opaque-ID correlation, broker checks and no duplicate registry rule. |
| 11 | Protocol source pinning | Official A2A v1.0.0 specification and versioned `a2a.proto` reference | Added a direct versioned `a2a.proto` reference and retained `/latest` as informative-only material. |
| 12 | Retired paths and document integrity | prohibited-system scan, selected companion `git diff --check`, Markdown fence count | No retired-system path was introduced; selected companion diffs and document structure passed the follow-up checks. |

## Repairs applied

- aligned suggested interop interfaces to the real Feature 200 manifest boundary;
- defined sidecar ownership and prohibited a second durable manifest/queue;
- added management API authorization, tenant, idempotency and SSRF/credential boundaries;
- added a versioned official `a2a.proto` reference;
- preserved all unrelated dirty worktree changes and did not modify runtime source.

## Residual implementation gates

SDK/lockfile selection, executor registration, A2A adapter implementation,
migrations, provider/TCK/Runner/browser/deployment evidence and Phase 4–5
release gates remain implementation work.
