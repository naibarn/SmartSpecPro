# SPEC-310 G0 Discovery Record

**Observed source:** `origin/main` at `5cb2d07f91fd5da7fd486c317760be199cf03336`, fetched 2026-10-22 (Asia/Bangkok).
**Work area:** registered task worktree `spec310-impl-20261022`, branch `codex/spec310-deep-implement-20261022`.
**Purpose:** establish number ownership, current cross-SPEC boundaries and a safe G1 contract scope. This is a design record, not runtime or acceptance evidence.

## Number and branch ownership

| Check | Evidence | Result |
|---|---|---|
| Canonical registry on `origin/main` | `specs/_config/spec-id-registry.json`: `reserved_spec_ids` is empty. Generated `specs/_status/spec-id-registry.json`: `occupied_spec_ids` contains `310`; `next_safe_spec_ids` starts at `311`; 309 is not in occupied/reserved. | SPEC-310 is canonically occupied by this feature. SPEC-309 has no canonical reservation/identity in this snapshot. |
| Canonical feature tree | `git ls-tree --name-only origin/main specs/feature/` has SPEC-310 and no 309 or 311 feature directory. | SPEC-310 identity is canonical; the separate 309 assignment remains unpublished. |
| Local/unpublished workspace | The preserved primary checkout remains dirty and contains the separate untracked `specs/feature/309-smartaihub-unified-knowledge-sovereign-infrastructure-tenant-operating-model/` plus user-owned 310/311 material. | Treat SPEC-309 as occupied by that separate assignment; do not modify it or invent a canonical reservation. |
| Open PRs | `gh pr list --state open --limit 40` shows #1161–#1167 still open. None is a SPEC-310 implementation PR. PR #1161 checks show `local-contract` failure; its `chat.runOnRunner` interface is read-only observation. | No stable merged Runner/Chat dispatch contract is available. Preserve all producer PR ownership. |
| Remote branches | `git ls-remote --heads origin` shows the prior SPEC-310 planning branches `codex/spec310-g0-g1-plan-20261022` and `codex/spec310-registry-projection-20261022`; no Native runtime/bridge branch exists. | Prior docs branches are historical inputs, not competing runtime implementation. |
| Other registered worktrees | `git worktree list --porcelain` shows the two prior SPEC-310 planning worktrees and this new implementation worktree. | Preserve the existing worktrees; no competing runtime implementation is present. |

**Allocation conclusion:** SPEC-310 is the requested replacement identity and is now present in the canonical feature tree and occupied projection. SPEC-309 remains a separate local/unpublished assignment and must remain untouched; canonical registry reservation is still absent. Re-run the ownership checks before any later registry mutation or merge that changes SPEC identity.

### Post-merge projection repair

PR #1168 added the canonical SPEC-310 document at merge SHA `138ceb19ab805d3a8a45a262292eef0936603f93`; PR #1169 repaired the canonical handoff and generated registry projection. On this review source (`5cb2d07f91fd5da7fd486c317760be199cf03336`), 310 is occupied and 311 is next-safe. The distinct local 309 assignment remains untouched and is still not recorded as a canonical reservation.

## Open Runner PR dependency chain

Observed with `gh pr list` on 2026-10-22:

| PR | Current head | Base | SPEC owner | G0 boundary |
|---|---|---|---|---|
| [#1161](https://github.com/naibarn/SmartSpecPro/pull/1161) | `27200602c5` `naibarn/continue-smartaihub-runner-companion` | `main` | SPEC-205 | Read-only `chat.runOnRunner`; not general-work admission. |
| [#1162](https://github.com/naibarn/SmartSpecPro/pull/1162) | `7d3af710b7` `naibarn/smartaihub-runner-wp2a-view-state` | `main` | SPEC-205/277 | Companion view-state projection. |
| [#1163](https://github.com/naibarn/SmartSpecPro/pull/1163) | `25121c3d57` `naibarn/smartaihub-runner-wp2b-floating-companion` | #1162 branch | SPEC-205/277 | Native window lifecycle; keep ownership with producer. |
| [#1164](https://github.com/naibarn/SmartSpecPro/pull/1164) | `eda4361224ca` `naibarn/smartaihub-runner-wp2c0-authenticated-transport` | #1163 branch | SPEC-205 | Desktop auth / Companion projection transport. |
| [#1166](https://github.com/naibarn/SmartSpecPro/pull/1166) | `9e0234a418` `naibarn/smartaihub-runner-wp2c1-chat-workspace-review` | #1164 branch | SPEC-205 | Chat Panel / Full Workspace; not yet an approved task dispatch seam. |
| [#1167](https://github.com/naibarn/SmartSpecPro/pull/1167) | `f4e8ee0dad` `naibarn/smartaihub-runner-wp2c2-approval-recovery` | #1166 branch | SPEC-205 | Approval and recovery read projection; not an approval authority. |

These PR head identifiers are observed references, not merged/integration-approved contracts. Refresh every head/base SHA, checks and owner acknowledgement before consuming any interface. SPEC-310 does not write to these branches or their owned paths.

### G0 refresh on implementation baseline

At `5cb2d07f91fd5da7fd486c317760be199cf03336`, a fresh query confirmed PRs #1161, #1162, #1163, #1164, #1166 and #1167 remain open; #1165 is not in the open set. #1161 head is `27200602c527`, and its `local-contract` checks failed while its browser simulation and progressive integration gate passed. Passing mocked/browser checks do not turn its read-only observe operation into a general-work dispatch contract. #1166 and #1167 remain based on the WP2C producer chain and do not establish the stable approved ingress required by section 05.

The canonical registry now occupies 310. `reserved_spec_ids` remains empty; `next_safe_spec_ids` begins at 311. The primary checkout is still dirty with user-owned vertical-drama edits and unpublished 309/310/311 materials; it was left untouched. The previous plan and registry-projection worktrees/branches remain present and were not reused or overwritten. A new registered clean task worktree was created at this exact main SHA for implementation.

The original R1.0 A01–A20 source was not found in this canonical source scan; the supplied cumulative SPEC includes R1.2/R1.3 and explicitly notes the missing earlier source. Do not freeze acceptance mapping or mark these criteria complete until their canonical source is located and reconciled.

## Owner and implementation source map

| Concern | Existing authority / source inspected | Consequence for SPEC-310 |
|---|---|---|
| Runner device and enrollment | `specs/feature/205-smartaihub-runner-cross-platform/spec.md` §7; `apps/runner-app/src/control_channel.rs`; `apps/web/server/services/runnerContracts.ts` | Consume device identity and existing control protocol; do not add a second device registry. |
| Desktop user identity | `apps/web/server/_core/deviceAuthRoutes.ts` (desktop scopes include `llm:chat` and `mcp:read`) | Desktop identity authenticates the user/Chat only. It cannot grant tool or Native execution. |
| Existing Chat | `apps/web/server/routers/chat.ts` | Keep existing conversation store and authenticated Chat; `sendMessage` success is not a durable job receipt. |
| Durable work admission and state | `specs/feature/195-unified-async-job-control-plane/spec.md`; `apps/web/server/services/jobControlPlaneGateway.ts`; `apps/web/server/routers/workerJobs.ts`; canonical `worker_jobs` plus outbox | Any admitted Native work must use canonical job, attempt, idempotency, lease and outbox contracts; no parallel job table or scheduler. |
| General-work team planning | `specs/feature/269-smartaihub-primary-specialist-assistant-teams-autonomous-workforce/spec.md` | SPEC-269 owns intent/team planning. Native Harness is a subordinate execution capability. |
| Command admission | `specs/feature/279-universal-command-ingress-agent-delegation-gateway-r1-0/spec.md` | Native future work must enter the approved command ingress; G1 may describe a consumer contract only. |
| Work Context / workspace | `specs/feature/292-adaptive-work-context-organizational-collaboration-federated-exchange-r1-0/spec.md`; `specs/feature/278-durable-runner-execution-sessions-recovery-fabric-r1-4/spec.md`; `specs/feature/293-SmartAIHub-Unified-Git-Workspace-Repository-Federation/spec.md`; `apps/web/server/services/runnerContracts.ts` | Map non-Git and Git workspace variants to existing authority and path policy. Do not add a workspace source of truth. |
| Development lifecycle and independent acceptance | `specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md`; `specs/feature/271-smartaihub-portable-uat-acceptance-execution-platform-rev1-5/spec.md` | Preserve SPEC-224 E2E priority and SPEC-271 independent verification for code delivery. |
| Credits / economic admission | `specs/feature/207-agentic-economic-control-plane/spec.md`; `specs/feature/280-metered-capability-commerce-creator-economy-runtime-r1-0/spec.md`; current Gateway code under `python-backend/app/llm_proxy/` and `apps/web/server/services/jobControlPlaneGateway.ts` | Consume existing reserve/usage/settlement authorities. Mocks cannot prove credit or production readiness. |
| OpenAI agent runtime policy | `python-backend/app/services/openai_agents_adapter.py`; `python-backend/app/services/openai_agents_contracts.py`; repo rule in `AGENTS.md` | Keep the OpenAI Agents API/Python backend as the canonical agent runtime authority. Managed Pi may be an internal Native harness implementation, not another orchestrator or job authority; make that layering explicit in G1. |
| Orca | `specs/feature/210-orca-runtime-adapter-cli-agent-execution-bridge/spec.md` describes an Orca route and implementation gap. | Orca is not required by this user request. If SPEC-210 currently implies mandatory use, submit a separate owner-approved amendment; do not install/use Orca as a workaround. |

## G0 decisions and unresolved owner inputs

1. **G1 is docs/contracts only.** Define versioned producer/consumer expectations and negative cases. Do not alter Chat, Runner Companion, auth, projection, canonical job, credit, approval, workspace or task-control code.
2. **Runtime layering:** managed Pi is internal to the first-party Native Harness, while the OpenAI Agents API/Python backend remains the canonical agent-runtime authority under repository policy. Pi gets no independent top-level scheduler, task DB or approval authority.
3. **All Native LLM traffic uses SmartAIHub Gateway.** Gateway grant and usage/credit receipt are scoped to canonical actor, tenant, job/attempt and policy; direct provider fallback is prohibited.
4. **Three identities:** desktop user, registered Runner device, and per-run/per-attempt execution credentials remain separate. `llm:chat` never authorizes execution.
5. **Chat-first general work:** GitHub, Git repository, branch and worktree are optional. No-Git request and artifact paths are first-class contracts.
6. **Dispatch gate:** actual Chat-to-Native bridge is waiting for a stable, owner-approved Runner/Chat ingress contract, plus canonical execution authority. The current WP1 `chat.runOnRunner` contract is read-only.
7. **Production gate:** remain disabled pending real Gateway, credit settlement, execution authority and acceptance evidence. SPEC-224 protected E2E remains higher priority.
8. **Original design gap:** this input contains R1.3 and preserved R1.2, but states that original R1.0 A01–A20 was supplied outside the repository. Keep that as a pre-implementation reconciliation item; do not claim complete acceptance coverage until the owner supplies or locates the canonical R1.0 source.

## Ten evidence-backed gap-review passes

Each pass was a separate review lens of the supplied R1.3 design against the exact `origin/main` source above. Findings are planning closures or explicit gates; none is a runtime PASS.

| Pass | Lens and evidence | Finding / plan closure | Required re-check before implementation |
|---|---|---|---|
| 1 | Numbering and ownership: current `_config` and `_status` registry files; local primary checkout status; open PR/remote ref/worktree queries at `5cb2d07f`. | SPEC-310 is occupied canonically; 309 remains unpublished and unreserved, so preserve it without claiming canonical reservation. | Repeat registry, PR, remote ref, worktree and reservation search before any registry mutation or merge that changes Spec identity. |
| 2 | Chat ingress and causality: `apps/web/server/routers/chat.ts`; PR #1161 title/head; supplied R1.3 §§R1.3.2–3. | Existing Chat is conversational; #1161 is read-only Runner observation. No approved general-work dispatch path is evidenced. | Obtain stable merged/owner-acknowledged ingress schema, idempotency, causation and reject semantics before bridge work. |
| 3 | Identity and credentials: `apps/web/server/_core/deviceAuthRoutes.ts` lines 274, 362–366; Runner identity source in `apps/runner-app/src/control_channel.rs`; supplied R1.3 identity matrix. | Desktop scopes currently include `llm:chat`; no source reviewed authorizes it as execution. Define desktop user, device and per-attempt grants distinctly. | Negative tests prove desktop bearer and device identity cannot mint/impersonate per-run execution grants. |
| 4 | Gateway and economics: `python-backend/app/services/openai_agents_adapter.py`, `python-backend/app/services/openai_agents_contracts.py`, existing `python-backend/app/llm_proxy/`, SPEC-207/280 and canonical job gateway. | A Gateway client exists, but no Native Pi run-level live credit proof was found. No direct-provider fallback or mock-based production proof. | Verify actual Gateway auth, tenant/job/attempt binding, reserve/settlement/refund and ledger reconciliation from real receipts. |
| 5 | Workspace and non-Git ACL: SPEC-292/278/293, `runnerContracts.ts` workspace facts and allowed-path helpers, R1.3 non-Git journey. | Existing Runner contracts include workspace facts and path policy, but no evidence says proposed `NONE`/local/cloud variants are deployed domain enums. | Map each presentation kind to existing refs; test no-Git path, ACL, symlink/traversal rejection, offline state and artifact provenance. |
| 6 | Task Control, replay and recovery: SPEC-195/278, `jobControlPlaneGateway.ts`, `workerJobs.ts`, outbox-owned repo rules. | Durable jobs/control exist; adding `native_agent_jobs`, alternate status authority or a separate scheduler would duplicate ownership. Cancellation acknowledgement must not imply child termination. | Prove idempotent admission, lease/fence recovery, cancellation reconciliation and one authoritative projection. |
| 7 | Native runtime / package trust: supplied R1.2 §L/§M/§R and R1.3 N2/N6; Python OpenAI Agents adapter policy; no managed Pi release evidence in this G0 scan. | Exact Pi release/digest, adapter protocol, Node ABI and signed installation/rollback evidence are not established. Preserve managed Pi as internal runtime and keep isolated spike gated. | Owner-approved runtime contract; immutable pin/digest, egress enforcement, side-by-side update and rollback/failure injection in isolated environment. |
| 8 | Multi-agent limits and economics: SPEC-269 team ownership, SPEC-207/280 economic ownership, R1.3 R1.3.4–6. | Pi or Orca must not become team planner; child attempts must remain under SPEC-269 and canonical job/budget/capability authority. | Validate bounded depth/fanout/concurrency, single-writer workspace, per-child grant/usage and independent reviewer evidence. |
| 9 | Companion/UI and cross-session noninterference: refreshed open PRs #1161–#1167, exact branch chain; desktop auth route; R1.3 ownership matrix/A57–A68. | UI/approval/projection producers remain in SPEC-205/277. PR #1161 is read-only and its local-contract check currently fails; no branch can be treated as an approved dispatch contract. | Check exact merged producer SHA and owner ACK; diff proves WP1–WP2C2, Desktop Auth and Chat files untouched by Native implementation. |
| 10 | Release, acceptance and priority: SPEC-224 and SPEC-271; R1.3 rollout defaults/A64–A68; repository `AGENTS.md`. | Real Gateway, credit, execution authority, Windows/cloud acceptance and SPEC-224 E2E are not proven by docs or fixtures. Production flag remains off; SPEC-224 E2E retains priority. | Require real target receipts and independent acceptance; ensure no production enablement or protected-gate change until every applicable prerequisite passes. |

**Gap-review disposition:** all ten lenses have a concrete requirement in `claude-plan.md` or a section file. Remaining unknowns are explicitly owner/external evidence gates, not falsely closed findings. Re-review the exact source HEAD after any future implementation; these ten planning passes do not substitute for the post-implementation review specified by the cumulative design.
