# Spec 206 — 12-Round Codebase/Cross-Spec Convergence Audit

Date: 2026-09-18
Target: `specs/feature/206-a2a-first-hybrid-external-agent-interoperability/spec.md`
Method: targeted shell discovery because SocratiCode was unavailable in this session.
Scope: Spec 186/199/200/204/205 boundaries, current Web/Runner contracts, A2A v1.0.0 normative references, security and rollout completeness.

## Baseline

The repository contains Feature 200 agent contracts and Feature 186 durable job
contracts, but no A2A implementation was found under `apps/web`,
`apps/runner-app`, `python-backend`, or `packages`. This audit therefore updates
the proposal's integration contract and phase gates; it does not claim that A2A
runtime behavior is implemented.

## Independent rounds

| Round | Boundary checked | Evidence | Result and immediate action |
|---:|---|---|---|
| 1 | Scope/status | `rg -i a2a` across runtime paths; Spec 206 sections 0–2 | Found proposal overstated as implementation-ready. Added an explicit repository baseline and planning-only status. |
| 2 | A2A protocol version/source | Official v1.0.0 specification, `a2a.proto`, Agent Card/Interface rules | Found `1.0.1` treated as a protocol correction/version source. Changed normative target to release `1.0.0`, wire `1.0`, and versioned source; retained old audit prose as historical. |
| 3 | Feature 200 manifest | `apps/web/server/services/agentControlPlaneContracts.ts`; `agentControlPlaneContracts.test.ts` | Found the real manifest fields/provider union and narrow `AgentAdapter` were not named as constraints. Added exact bridge rules and prohibited treating provider session IDs as A2A task/context IDs. |
| 4 | Feature 200 job naming | Current code uses `external_agent_task`; Spec 200 examples also mention `coding_agent` | Found a naming collision that could create a second queue. Added a normative mapping: preserve `external_agent_task`; `coding_agent` is only a domain label unless separately migrated. |
| 5 | Feature 186 admission | `jobControlPlaneGateway.ts` requires authenticated context and registered executor; `jobExecutorRegistry.ts` has no current `external_agent_task` registration | Found the spec assumed a ready executor. Added a fail-closed Phase 0 prerequisite for executor/transport registration and explicit `JOB_EXECUTOR_UNREGISTERED` behavior. |
| 6 | Durable lifecycle/recovery | `workerJobs`, `workerJobAttempts`, `workerJobEvents`, `workerJobOutbox`; canonical statuses include `waiting_external` and event idempotency/sequence | Found logical A2A identities were not mapped to the existing attempt/event model. Added canonical identifier mapping and required use of existing wait/reconcile/idempotency/fencing records. |
| 7 | Data/tenant isolation | Spec 206 logical tables; `worker_jobs` and `worker_job_events` schema | Found new logical tables omitted explicit tenant/FK/index requirements. Added tenant scope, restrictive references, server-derived authorization, idempotency and uniqueness requirements. |
| 8 | Spec 199 ownership | Spec 199 sections 3–4 and Spec 206 sections 2–3 | Confirmed MCP upstream/credential/quarantine ownership. Strengthened the rule that A2A cannot receive arbitrary upstream MCP credentials or create a second MCP gateway. |
| 9 | Spec 204 runtime boundary | Spec 204 control-plane/runtime ownership and current Feature 186 Cloudflare adapters | Confirmed remote execution must remain on approved runtime/control-plane paths. Added no-new-queue/no-retired-runtime language to phase/admission interpretation; no OpenSandbox/Docker path introduced. |
| 10 | Spec 205 Runner boundary | `runnerContracts.ts`, `runnerGateway.ts`, `runnerControl.ts`; Runner capability snapshot and authenticated control channel | Found local A2A wording could imply a second device registry/socket. Added reuse of the enrolled Runner identity, snapshot revision/freshness, existing control channel, restart endpoint revalidation and no inbound public port. |
| 11 | Security/credentials | Agent Card JWS/JCS/JKU sections; manifest secret rejection; artifact and push sections | Confirmed security sections exist but needed current repository authority boundaries. Added that cards are untrusted projections, remote IDs cannot widen scope, and all secret/URL operations remain brokered and server-derived. |
| 12 | Release/acceptance/test completeness | Acceptance checklist, phases 0–7, SDK policy, current package/runtime layout | Found gRPC, inbound server mode and TCK were mixed into one undifferentiated completion bar. Added phase-gated acceptance, disabled-by-default rollout, lockfile compatibility manifest and exact Phase 0 prerequisites. |

## Post-repair convergence

Two fresh reads after the edits were clean:

1. `rg` confirmed the normative sections use v1.0.0/wire 1.0 and the remaining
   older version wording is explicitly marked as historical audit text.
2. `git diff --check` passed for the Spec 206 changes and the acceptance/phase
   sections were re-read against the current code anchors.

## Residual gates

These are intentionally not marked complete by this documentation audit:

- A2A SDK dependency selection, lockfile update and supply-chain review.
- Feature 200 executor registration and a real A2A adapter implementation.
- Database migrations and target-database verification for the logical tables.
- Authenticated remote provider, A2A Inspector/TCK, Runner/Windows, browser,
  deployment and production rollback evidence.
- Phase 4 binding expansion and Phase 5 inbound server mode.

No safe in-scope MUST_FIX/MUST_DO_NOW documentation gap remains in the reviewed
boundaries. No runtime source files were changed in this spec-only task.

## Cross-spec follow-up repair

After the twelve rounds, a final relationship check found that the headers of
Specs 199 and 200 did not name Spec 206. Their headers were amended with the
minimal companion-reference text required by Spec 206 Section 95. No unrelated
body content was changed.
