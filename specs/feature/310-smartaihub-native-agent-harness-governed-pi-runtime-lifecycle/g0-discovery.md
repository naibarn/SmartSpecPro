# SPEC-310 G0 Discovery Record

**Observed source:** `origin/main` at `0ebbd075ca4f71af1ffb8ce4f1e38bc3ba6013cf`, fetched 2026-10-22 (Asia/Bangkok).
**Work area:** registered task worktree `spec310-g0-g1-20261022`, branch `codex/spec310-g0-g1-plan-20261022`.
**Purpose:** establish number ownership, current cross-SPEC boundaries and a safe G1 contract scope. This is a design record, not runtime or acceptance evidence.

## Number and branch ownership

| Check | Evidence | Result |
|---|---|---|
| Canonical registry on `origin/main` | `specs/_config/spec-id-registry.json`: `reserved_spec_ids` is empty. `specs/_status/spec-id-registry.json`: `next_safe_spec_ids` begins `309`, `310`, `311`, `312`, `313`; the generated occupied list does not contain 309 or 310. | Canonical main does not yet reserve either requested number. |
| Canonical feature tree | `git ls-tree origin/main specs/feature/309* specs/feature/310*` returned no matching feature directories; current numbered feature directories end at 308. | No canonical SPEC-309 or SPEC-310 file is present at the observed SHA. |
| Local/unpublished workspace | The preserved primary checkout has untracked `specs/feature/309-smartaihub-unified-knowledge-sovereign-infrastructure-tenant-operating-model/`, `.../310-smartaihub-native-agent-harness-governed-pi-runtime-lifecycle/`, and a 311 pack. The 309 document has a distinct semantic identity. The 310 file is this task's supplied proposal. | Treat local 309 as occupied by another assignment; do not alter it. The local proposal is not canonical registry authority. |
| Open PRs | `gh pr list --state open --limit 200` returned 22 open PRs. None is titled or branched for SPEC-309/310 or Native Harness/Pi runtime. The only relevant PRs are the Runner chain below. | No SPEC-310 PR reservation found in the observed open-PR set. |
| Remote branches | `git ls-remote --heads origin` filtered for SPEC-309/310, Native Harness and Pi runtime returned no matches. | No matching published feature branch found. |
| Other registered worktrees | `git worktree list --porcelain` filtered for SPEC-309/310, Native Harness and Pi runtime found no other matching branch/worktree. The preserved primary checkout is the only local matching proposal. | No competing Native Harness worktree found in this Git common repository. |

**Allocation conclusion:** SPEC-310 is the requested replacement identity and was unoccupied in the checked canonical registry, canonical feature tree, observed open PRs, remote branches and other registered worktrees. SPEC-309 has a separate local/unpublished assignment and must remain untouched. Because the canonical generated registry still lists 309 as the first next-safe ID and has no reservation record for the local 309 assignment, the first docs PR must state this evidence and must not silently claim that canonical registry state already contains the local reservation. Re-run these checks immediately before any later merge or registry mutation.

### Post-merge projection repair

PR #1168 added the canonical SPEC-310 document at merge SHA `138ceb19ab805d3a8a45a262292eef0936603f93`. A follow-up read on current main `b46e5e910a44d276b25ce0371739086737afbce1` found the generated `_status/spec-id-registry.json` had not yet advanced and still advertised 310 as available. The official `tools.spec_handoff.index.build_views()` projection now reports 310 occupied and next-safe IDs starting at 311; the follow-up PR updates only this generated registry projection plus the canonical Spec handoff files. The distinct local 309 assignment remains untouched and is still not recorded as a canonical reservation.

## Open Runner PR dependency chain

Observed with `gh pr list` on 2026-10-22:

| PR | Current head | Base | SPEC owner | G0 boundary |
|---|---|---|---|---|
| [#1161](https://github.com/naibarn/SmartSpecPro/pull/1161) | `27200602c5` `naibarn/continue-smartaihub-runner-companion` | `main` | SPEC-205 | Read-only `chat.runOnRunner`; not general-work admission. |
| [#1162](https://github.com/naibarn/SmartSpecPro/pull/1162) | `7d3af710b7` `naibarn/smartaihub-runner-wp2a-view-state` | `main` | SPEC-205/277 | Companion view-state projection. |
| [#1163](https://github.com/naibarn/SmartSpecPro/pull/1163) | `25121c3d57` `naibarn/smartaihub-runner-wp2b-floating-companion` | #1162 branch | SPEC-205/277 | Native window lifecycle; keep ownership with producer. |
| [#1164](https://github.com/naibarn/SmartSpecPro/pull/1164) | `192bd1c0c9` `naibarn/smartaihub-runner-wp2c0-authenticated-transport` | #1163 branch | SPEC-205 | Desktop auth / Companion projection transport. |
| [#1166](https://github.com/naibarn/SmartSpecPro/pull/1166) | `9e0234a418` `naibarn/smartaihub-runner-wp2c1-chat-workspace-review` | #1164 branch | SPEC-205 | Chat Panel / Full Workspace; not yet an approved task dispatch seam. |
| [#1167](https://github.com/naibarn/SmartSpecPro/pull/1167) | `f4e8ee0dad` `naibarn/smartaihub-runner-wp2c2-approval-recovery` | #1166 branch | SPEC-205 | Approval and recovery read projection; not an approval authority. |

These PR head identifiers are observed references, not merged/integration-approved contracts. Refresh every head/base SHA, checks and owner acknowledgement before consuming any interface. SPEC-310 does not write to these branches or their owned paths.

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
| 1 | Numbering and ownership: both registry JSON files; local primary checkout status; open PR/remote ref/worktree queries. | Canonical registry has not yet reserved the local 309 assignment; SPEC-310 appears free in observed sources. Keep the 309 artifact untouched and make the mismatch visible in G0. | Repeat registry, PR, remote ref, worktree and reservation search at exact proposed merge SHA; resolve 309 registry discrepancy through its actual owner. |
| 2 | Chat ingress and causality: `apps/web/server/routers/chat.ts`; PR #1161 title/head; supplied R1.3 §§R1.3.2–3. | Existing Chat is conversational; #1161 is read-only Runner observation. No approved general-work dispatch path is evidenced. | Obtain stable merged/owner-acknowledged ingress schema, idempotency, causation and reject semantics before bridge work. |
| 3 | Identity and credentials: `apps/web/server/_core/deviceAuthRoutes.ts` lines 274, 362–366; Runner identity source in `apps/runner-app/src/control_channel.rs`; supplied R1.3 identity matrix. | Desktop scopes currently include `llm:chat`; no source reviewed authorizes it as execution. Define desktop user, device and per-attempt grants distinctly. | Negative tests prove desktop bearer and device identity cannot mint/impersonate per-run execution grants. |
| 4 | Gateway and economics: `python-backend/app/services/openai_agents_adapter.py`, `python-backend/app/services/openai_agents_contracts.py`, existing `python-backend/app/llm_proxy/`, SPEC-207/280 and canonical job gateway. | A Gateway client exists, but no Native Pi run-level live credit proof was found. No direct-provider fallback or mock-based production proof. | Verify actual Gateway auth, tenant/job/attempt binding, reserve/settlement/refund and ledger reconciliation from real receipts. |
| 5 | Workspace and non-Git ACL: SPEC-292/278/293, `runnerContracts.ts` workspace facts and allowed-path helpers, R1.3 non-Git journey. | Existing Runner contracts include workspace facts and path policy, but no evidence says proposed `NONE`/local/cloud variants are deployed domain enums. | Map each presentation kind to existing refs; test no-Git path, ACL, symlink/traversal rejection, offline state and artifact provenance. |
| 6 | Task Control, replay and recovery: SPEC-195/278, `jobControlPlaneGateway.ts`, `workerJobs.ts`, outbox-owned repo rules. | Durable jobs/control exist; adding `native_agent_jobs`, alternate status authority or a separate scheduler would duplicate ownership. Cancellation acknowledgement must not imply child termination. | Prove idempotent admission, lease/fence recovery, cancellation reconciliation and one authoritative projection. |
| 7 | Native runtime / package trust: supplied R1.2 §L/§M/§R and R1.3 N2/N6; Python OpenAI Agents adapter policy; no managed Pi release evidence in this G0 scan. | Exact Pi release/digest, adapter protocol, Node ABI and signed installation/rollback evidence are not established. Preserve managed Pi as internal runtime and keep isolated spike gated. | Owner-approved runtime contract; immutable pin/digest, egress enforcement, side-by-side update and rollback/failure injection in isolated environment. |
| 8 | Multi-agent limits and economics: SPEC-269 team ownership, SPEC-207/280 economic ownership, R1.3 R1.3.4–6. | Pi or Orca must not become team planner; child attempts must remain under SPEC-269 and canonical job/budget/capability authority. | Validate bounded depth/fanout/concurrency, single-writer workspace, per-child grant/usage and independent reviewer evidence. |
| 9 | Companion/UI and cross-session noninterference: open PRs #1161–#1167, exact branch chain; desktop auth route; R1.3 ownership matrix/A57–A68. | UI/approval/projection producers remain in SPEC-205/277. Existing open branches cannot be treated as an approved consumer contract or modified by this plan. | Check exact merged producer SHA and owner ACK; diff proves WP1–WP2C2, Desktop Auth and Chat files untouched by Native implementation. |
| 10 | Release, acceptance and priority: SPEC-224 and SPEC-271; R1.3 rollout defaults/A64–A68; repository `AGENTS.md`. | Real Gateway, credit, execution authority, Windows/cloud acceptance and SPEC-224 E2E are not proven by docs or fixtures. Production flag remains off; SPEC-224 E2E retains priority. | Require real target receipts and independent acceptance; ensure no production enablement or protected-gate change until every applicable prerequisite passes. |

**Gap-review disposition:** all ten lenses have a concrete requirement in `claude-plan.md` or a section file. Remaining unknowns are explicitly owner/external evidence gates, not falsely closed findings. Re-review the exact source HEAD after any future implementation; these ten planning passes do not substitute for the post-implementation review specified by the cumulative design.
