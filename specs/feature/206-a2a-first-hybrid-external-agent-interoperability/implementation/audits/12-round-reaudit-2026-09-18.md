# Spec 206 — 14-Round Post-Repair Re-Audit

Date: 2026-09-18
Target: `specs/feature/206-a2a-first-hybrid-external-agent-interoperability/spec.md`
Method: targeted shell discovery because SocratiCode was unavailable in this session.
Scope: fresh verification after the previous convergence audit, with cross-spec checks against Specs 199, 200, 204 and 205 and current Web/Runner/job contracts.

## Baseline

Spec 206 remains planning-only. The current repository contains the Feature 200
manifest/adapter boundary and Feature 186 durable job/control-plane contracts,
but no A2A runtime implementation, A2A dependency, A2A route or A2A schema was
found in the reviewed runtime paths. This re-audit changes specification
contracts only and does not claim implementation completion.

## Independent rounds

| Round | Boundary checked | Evidence | Result and immediate action |
|---:|---|---|---|
| 1 | Revision and scope truth | Spec 206 header, repository baseline, runtime `rg` scan | Confirmed the document still describes a proposal. Bumped the document to Revision 8 and recorded this fresh re-audit instead of treating the prior audit as current proof. |
| 2 | Feature 200 manifest boundary | `apps/web/server/services/agentControlPlaneContracts.ts` (`AgentTaskManifest`, validator, `buildAgentJobDefinition`) | Found the Section 20 example could be read as the current validated TypeScript contract because it used an automatic provider value and additional interop fields. Clarified it as a pre-validation product envelope and required a server-owned interop sidecar or versioned additive extension. |
| 3 | Canonical job naming | `buildAgentJobDefinition`, `workerSchedulerService.ts`, Spec 200 implementation mapping | Confirmed `external_agent_task` remains the current durable job type. Kept `coding_agent` as a domain label only and preserved the no-second-queue rule. No further change required. |
| 4 | Canonical lifecycle status mapping | `jobControlPlaneTypes.ts` status/transition table | Found the A2A mapping used non-existent durable values (`accepted`, `waiting_user_input`, `waiting_auth`, `provider_completed`, `canceled`, `rejected`). Rewrote the table to use current statuses and canonical events/reason codes, with `waiting_external` for remote interruptions and verification pending. |
| 5 | Attempt, event and outbox durability | `schema.ts` worker tables; `jobControlPlane.ts` event sequence/idempotency/fencing paths | Confirmed A2A must bind to `worker_jobs`, `worker_job_attempts`, `worker_job_events` and `worker_job_outbox`; remote sends cannot be sole execution evidence. No gap remained after the prior audit. |
| 6 | Admission and executor fail-closed behavior | `jobControlPlaneGateway.ts`, `jobExecutorRegistry.ts` | Confirmed authenticated server context and registered executor are required, and unregistered `external_agent_task` must fail with `JOB_EXECUTOR_UNREGISTERED`. Existing prerequisite wording is retained. |
| 7 | Spec 199 ownership | Spec 199 header/body and Spec 206 Sections 2.3, 95 | Confirmed MCP upstream lifecycle, credentials, schema, quarantine and execution remain owned by Spec 199; A2A cannot become a second MCP gateway or receive arbitrary upstream credentials. No change required. |
| 8 | Spec 200 ownership and parity | Spec 200 header/body and Spec 206 Sections 2.2, 20, 95 | Confirmed A2A is an adapter/route choice and Spec 200 native adapters remain fallback. Companion wording names the real manifest/event/job boundary. No change required beyond Section 20 clarification. |
| 9 | Feature 204 Container boundary | Spec 204 header/body and Spec 206 runtime/phase sections | Found the relationship was only one-way: Spec 206 consumed Feature 204 but Feature 204 did not identify the A2A consumer. Added a minimal related-spec reference and stated that 204 remains owner of provisioning, pooling, image rollout, autoscaling, cost ceilings and rollback. |
| 10 | Feature 205 Runner boundary | `runnerContracts.ts`, Runner control references, Spec 205 header/body and Spec 206 Sections 55–56, 95 | Found the same one-way cross-spec metadata gap. Added a minimal Spec 205 related-spec reference and reinforced reuse of enrolled identity, capability snapshot, control channel and process envelope; no second A2A registry/socket/update path. |
| 11 | Protocol version/source governance | Spec 206 Sections 4, 89A, 100; versioned A2A v1.0.0 reference plus `/latest` links | Found moving `/latest` reference links were not explicitly classified. Added a rule that v1.0.0 and pinned `a2a.proto` are normative while `/latest` and SDK repositories are informative only and must not silently drive upgrades. |
| 12 | Tenant/data/idempotency/security | Spec 206 Sections 9, 27A, 40–45, 51, 98BE–98BM; current tenant/job schema | Confirmed tenant scope, server-derived authority, restrictive job/attempt references, uniqueness/idempotency, SSRF/JKU, replay and secret-handle rules are present. No remaining safe documentation gap found. |
| 13 | Rollout and acceptance completeness | Spec 206 Sections 88–90 and phases 0–7 | Confirmed Phase 0–3 client/hybrid release is separated from Phase 4 bindings and Phase 5 inbound server mode; flags default OFF and executor/credential/SSRF gates are explicit. No change required. |
| 14 | Retired systems and document integrity | AGENTS.md prohibited boundaries; Spec 206 retired-system scan; selected companion `git diff --check` | Confirmed no retired Agency/work-request/workpacks/OpenSandbox/Docker dispatch was introduced. Companion diffs have no whitespace errors. Existing unrelated worktree changes were preserved. |

## Immediate repairs applied

1. Clarified the Section 20 logical envelope versus the current validated
   `AgentTaskManifest` and prohibited unvalidated routing authority in job input.
2. Reconciled Section 23 with the repository's actual `CanonicalJobStatus` and
   transition table while preserving A2A-specific distinctions as events and
   reason codes.
3. Classified protocol references so moving `/latest` documentation cannot
   silently replace the v1.0.0 / wire `1.0` baseline.
4. Added reciprocal ownership references for Feature 204 and Feature 205 in
   the companion metadata and the Spec 206 cross-spec contract section.
5. Bumped Spec 206 to Revision 8 and recorded this re-audit separately from the
   previous twelve-round convergence record.

## Clean convergence passes

Two fresh reads after the repairs were clean:

1. Required contract/status assertions found the current manifest boundary,
   `external_agent_task`, `CanonicalJobStatus`, v1.0.0 source rule and
   Feature 204/205 ownership text with no stale lifecycle mapping terms.
2. Markdown/document checks found no new trailing whitespace in the repaired
   sections, selected tracked companion files passed `git diff --check`, and
   the scope scan showed no runtime A2A implementation claim.

## Residual gates

These remain implementation/release work and are intentionally not marked
complete by this documentation audit:

- select and pin an A2A SDK, update the appropriate lockfile and complete supply-chain review;
- implement/test the Feature 200 executor registration and A2A adapter;
- add and verify database migrations for the logical A2A projections;
- prove authenticated providers, A2A Inspector/TCK compatibility, Runner and Windows behavior, browser UX, deployment and rollback;
- complete Phase 4 binding expansion and Phase 5 inbound server mode only under their explicit gates.

No runtime source file was changed by this re-audit.
