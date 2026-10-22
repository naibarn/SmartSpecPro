---
spec_id: 310
semantic_identity: smartaihub.native-harness.pi-runtime-lifecycle
canonical_title: SmartAIHub Native Agent Harness & Governed Pi Runtime Lifecycle
revision: R1.3-CUMULATIVE-SESSION-ALIGNED-DRAFT
status: PROPOSED_ADD_ONLY_DESIGN_NOT_IMPLEMENTED
numbering_status: USER_ASSIGNED_310_REVERIFY_CANONICAL_REGISTRY_AND_ALL_WORKTREES_BEFORE_COMMIT
supersedes_proposal_number: 309
source_drafts:
  - SPEC-310 R1.0 original user-supplied design (not present in the repository snapshot)
  - SPEC-310 R1.2 cumulative addendum, including R1.1
interface_baseline:
  main: 0ebbd075ca4f71af1ffb8ce4f1e38bc3ba6013cf
  wp1_chat_runner_pr: 1161
  wp2a_projection_pr: 1162
  wp2b_native_companion_pr: 1163
  wp2c0_desktop_transport_pr: 1164
  wp2c1_chat_workspace_pr: 1166
  wp2c2_recovery_approval_pr: 1167
rollout_default: disabled
protected_main_direct_write: forbidden
upstream_orca_role: design_reference_only_unless_separately_authorized_optional_external_adapter
original_spec_309_status: NUMERIC_COLLISION_RETIRED_AS_NEW_FEATURE_NUMBER
date: 2026-10-22
timezone: Asia/Bangkok
---

# SPEC-310 R1.3 — SmartAIHub Native Harness, Chat-First Workspaces & Multi-Agent: Parallel-Session Integration Protocol

> **Design/handoff artifact, not implementation or E2E acceptance.** The user confirmed that 309 collides with another assignment. Therefore **SPEC-310 is the intended feature number**; this document supersedes the earlier 309-numbered *proposal*, without modifying or taking ownership of any existing canonical SPEC-309. Recheck 310 on repository authority, active PRs, private/local worktrees and reserved assignments before a canonical commit. Semantic identity remains stable. Avoid claiming the file is already in GitHub.
>
> This is a **single cumulative handoff**: R1.3 coordination rules take precedence over the preserved R1.2 design below. The original R1.0 proposal was supplied in the planning conversation, not proven to be committed in the repository; its A01–A20 and Runtime/Gateway/Installer invariants remain required and must be reconciled from the actual provided R1.0 before implementation. Do not misrepresent this addendum as an exact verbatim replacement of R1.0.

## R1.3.1 Binding decisions / owner boundaries

1. **SmartAIHub alone is the product and UX.** The user commands work from existing Chat in Web/Tauri/Mobile. `Orca` is a research/UX reference, not an automatic installation, task coordinator, or required runtime. SPEC-210's legacy “SHALL integrate Orca” requirement is an explicit cross-SPEC conflict to resolve via a *small explicit amendment*, never by silently ignoring it or installing Orca anyway.
2. **Pi is a replaceable runtime library/sidecar behind first-party Native Harness**, not an alternative Chat/Runner/Orchestrator product. It is privately versioned, Gateway-only for inference, pinned per run, and feature-flagged. The Runner owns local child supervision, tool side effects and installation authority; SPEC-269 owns general-work team intent and SPEC-224 owns software-development phases. Cloud placement is an existing approved executor path, not a second Runner authority.
3. **Non-Git Workspaces are first-class.** `NONE`, `LOCAL_DIRECTORY`, `MANAGED_CLOUD`, `CONNECTED_SOURCE`, `TEMPORARY`, and `GIT_WORKTREE` are presentation/adapter kinds to map to *existing* SPEC-292/269/278/284/293 concepts at G0; these are **proposed discriminants, not deployed DB enums**. GitHub connection, repository, source checkout, and branch are optional and absent in ordinary tasks.
4. **WP1–WP2C2 are not re-owned by SPEC-310.** Native Companion/Auth/Chat/Projection/Recovery and actual Windows acceptance remain SPEC-205/277 work. SPEC-310 consumes a stable authenticated Chat intent and canonical Runner admission / Task Control read projection; it cannot create desktop credentials, extend C0 scopes, add parallel Chat services or bypass approval.
5. **SPEC-224 protected E2E remains top priority.** SPEC-310 G0 discovery, documentation, G1 bounded contracts and isolated spikes may proceed concurrently; there shall be no production enablement, protected-gate relaxation, or false UAT completion. A separate actual Gateway/Billing/Windows/independent verification gate is required to call SPEC-310 usable.

## R1.3.2 Verified repository checkpoint and PR dependency graph

GitHub connector inspection on 2026-10-22:

| Slice | PR / observed head | Target/owner | Constraint |
|---|---|---|---|
| WP1 Chat → Runner read-only | #1161, `27200602c5` | base `main`, SPEC-205 | Still open; `chat.runOnRunner` exists **on this PR head**, not certified in canonical main; mutation forces `operation=observe`, `action=none`. It cannot authorize general agent tasks. |
| WP2A projection | #1162, `7d3af710b7` | base `main`, SPEC-205/277 | Canonical `runner-companion.v1` projection; not independent job/approval authority. |
| WP2B floating native | #1163, `25121c3d57` | stacked on WP2A | Tauri Windows shell, OS/window lifecycle not yet real-device verified. |
| WP2C0 desktop auth/transport | #1164, `192bd1c0c9` | stacked on WP2B | Distinct desktop session with `runner:companion:read` and optional `llm:chat`; Rust-owned token; client is **not** tool/Runner execution grant. |
| WP2C1 Chat Panel / Full Workspace | #1166, `9e0234a418` | stacked on WP2C0 | Canonical conversation/LLM Chat path; not proof of executable task admission. |
| WP2C2 recovery + approval display | #1167, `f4e8ee0dad` | stacked on WP2C1 | Read-only approval/recovery display; no runner-scoped approval resolver. |

`main` observed at G0 on 2026-10-22: `0ebbd075ca4f71af1ffb8ce4f1e38bc3ba6013cf`. PRs #1161, #1162, #1163, #1164, #1166 and #1167 remain open; current heads are recorded in `g0-discovery.md`. The branch-head descriptions and local source must be refreshed before any consumer implementation. Do not treat earlier CI snapshots embedded in this draft as current check evidence. Record missing real Windows native acceptance, actual Chat→Runner E2E and MCP live-contract credentials as external constraints, not fake PASS. Never merge through a failing required protected check.

**Important semantic split:** `chat.runOnRunner` in WP1 is strictly read-only browser observation and is not a generic command bridge. C1 desktop Chat uses the authenticated conversation/LLM flow; it does not establish a dispatch-to-Runner grant. A future Native work command must enter the existing SPEC-279/195/205 admission boundary with its own scope, tenancy, execution and payment controls. **`llm:chat` must not imply `tool:exec`, filesystem write, shell, app control or native-team delegation.**

## R1.3.3 Parallel-session noninterference and coordination protocol

**Two independent workstreams with a narrow, versioned integration seam:**

- **Track C — Runner Companion completion** (`#1161/#1162/#1163/#1164/#1166/#1167`, owned by the ongoing SPEC-205 session): finish the existing PR dependency chain, handle mandatory CI within that owner, preserve real user-scoped desktop authentication, accurate read projection, explicit approval display and real-device E2E where authority exists. **Do not consume SPEC-310 drafts as authority to add Native tools to existing C0/C1/C2 branches.**
- **Track N — SPEC-310 Native Harness** (this document, independent branch/worktree): freeze on G0 canonical contract discovery, numeric owner check and formal design; allow G1 versions/schemas/test doubles or fully isolated read-only spikes. Do not write C0/C1/C2-owned files or introduce changes to their Tauri, auth route, schema, projection or Chat handler while those PRs are pending. Do not alter SPEC-308.
- **Track P — SPEC-224/271 E2E closure**: owns protected development finality and evidence. No SPEC-310 slice may change SPEC-224's production gates, independent verifier, canonical UAT or priority.

**Source-control rules:**

1. No direct write to protected `main`, no force-push or rewriting someone else's shared PR head. No parallel sessions editing the same worktree or migration index. Keep separate Git worktrees/branches and explicit branch owner/lease; use SPEC-293/278 where applicable.
2. Start Track N's *documentation-only* proposal branch from the latest observed `main`, not from WP2C2's stacked code; do not open a speculative dependency on unmerged C0–C2 for design. Verify SPEC-310 number in authoritative registry, reservation records, branches and all local/unpublished worktrees first. **Never overwrite the real SPEC-309**. If 310 is unexpectedly occupied locally, STOP numeric assignment and request authorized registry allocation rather than allocating another arbitrary ID.
3. A code PR for Native→Chat integration **must wait for a stable merged/integration-approved ingress contract**. If C0/C1/C2 is still open, author only an interface proposal/consumer contract against exact expected head SHA; when the owner merges, reconcile against merged SHA and rerun integration. Prefer small independent interface slices; never cherry-pick entire Companion branches into Native worktree.
4. Requests to amend an owner contract become a small `CROSS_SPEC_CHANGE_REQUEST` with producer, consumer, expected semantics, negative security cases, test fixtures, acceptance and owner ACK. No session “fixes” another session's PR by editing it unsolicited.
5. Sync using exact `repo`, `branch`, `head_sha`, `base_sha`, `contract_version`, `owner`, `risk`, `tests`, `required_checks`, `missing_authority` and `next_action`. When any referenced head moves, invalidate stale fixtures/approvals and revalidate before implementation. Do not claim merge or finality from an old head.
6. Shared touchpoints must remain **interfaces, not competing stores**. No `native_agent_jobs`, new status enum, independent team scheduler, approval table, credit ledger, workspace SoT or alternate desktop bearer auth. Existing event/outbox/fence and settled-charge IDs are canonical.
7. Feature flags: Native Harness and any speculative Chat→Native action remain off and not visible as executable while admission/auth/receipt/billing/capability/independent acceptance is unverified. Stale/unavailable is shown explicitly.

### Ownership / edit-intent matrix for parallel sessions

| Area | Track C edit owner now | Track N actions permitted before C convergence |
|---|---|---|
| `apps/runner-desktop/{src-tauri,ui,tests}` | WP2B/C0/C1/C2 | Read, inspect, propose typed events/wireframes only; no changes to live windows or auth |
| `apps/runner-app/src/companion_auth.rs` | WP2C0/C2 | No direct edits; no reusing desktop credentials as execution credentials |
| `apps/web/server/routes/runnerCompanion.ts` and `deviceAuthRoutes.ts` | WP2C0 | Consume projection/auth behavior read-only; propose separate authorized work ingress |
| `apps/web/server/routers/chat.ts` / `chat.runOnRunner` | WP1 + canonical command owner | Do not broaden `observe/action=none`; new work-kind requires SPEC-279 contract review |
| Runner supervisor/executor/capabilities | SPEC-205/197/278 | Version-neutral Native plugin API **proposal**; implementation only after owner interface agreement |
| Canonical `worker_jobs`/outbox/receipts/billing | existing SPEC-195/267/207/280 | Consume canonical job and charge contracts, no competing ledger/status |
| SPEC-269/292 general work context | existing owner | Read/resolve; do not invent second Workspace or team orchestrator |
| SPEC-224/271 and SPEC-293 | existing owners | Noninterference, approved development delegation/worktrees only |
| New `specs/feature/310-*/spec.md` | Track N after G0 registry check | Own documentation and proposal; canonical PR separately from C stack |

## R1.3.4 Exact integration seam: Chat → Workspace → Native Harness

The following is an **interface sketch, not evidence of existing routes or tables**. G0 maps it to existing canonical contracts and can change names without semantic drift:

```ts
interface ProposedChatWorkIntentV1 {
  intentId: string;                   // stable replay identity
  conversationId: string;              // existing Chat ownership
  tenantId: string;                    // authenticated, never from untrusted UI
  actorId: string;                     // authenticated principal
  workContextRef?: string;             // SPEC-292
  workspaceRef?: string;               // SPEC-269/278/284/293 governed binding
  taskFamily: 'general_work' | 'software_development';
  harnessPreference: 'auto' | 'smartaihub_native' | 'external_allowed';
  teamPreference: 'auto' | 'single' | 'team';
  goal: string;
  attachmentRefs: string[];           // scoped canonical asset references
  requestedCapabilities: string[];    // proposal only, never self-granted
  policySnapshotRef: string;          // existing policy authority
  budgetLimitRef: string;             // existing economic authority
}

interface ProposedNativeAdmissionV1 {
  canonicalJobId: string;
  attemptId: string;
  executionGrantRef: string;          // not a desktop Chat bearer token
  leaseFence: string;
  assignedRunnerId?: string;
  runtimeManifestDigest: string;      // verified, pinned exact Pi + adapter release
  resolvedWorkspaceRef?: string;
  effectiveCapabilityGrantRefs: string[];
  gatewayInvocationGrantRef: string;  // run/model/budget scoped
}
```

**Required causal flow:**

1. User in Web/Tauri/Mobile Chat selects or creates a Work Context and optional Workspace. A Workspace may be virtual/none, local folder, cloud, connected source, temporary or approved Git worktree; no GitHub login is required for ordinary work. The existing owner performs scoped resolution and source ACL checks.
2. SPEC-279/269/224 interpret intent and plan; a user-facing `Ask/Plan` action does **not** inherently admit an OS run. Human approval is sought only at real capability/business decision gates. Existing Chat conversation persists messages, but Chat transcript is not the job source of truth.
3. Canonical job control admits bounded parent/child attempts, funds reservations as needed, grants capabilities, picks eligible Runner/cloud placement, checks fresh device authority and workspace writer fence. Rejection produces an explicit `BLOCKED_*`/`WAITING_*` projection, never a hidden provider/shell fallback.
4. SPEC-310 Native adapter receives **only the signed/referenced invocation grant**, filtered context and runtime version pin; starts Pi-backed loop inside Runner supervisor, not inside privileged WebView JavaScript. Every Native inference transits SmartAIHub Gateway with settled credit identity; each tool action is separately governed by the actual executor and task grant.
5. Multi-agent team members are subordinate bounded attempts; model/harness selection reflects capability, cost, skills, external-subscription classification and conflict risk. Two model instances may use the **same Native Harness installation**. Scheduling/phase transitions are SPEC-269 or SPEC-224, not Pi or Orca.
6. Result files become canonical artifact/evidence refs under existing Library/asset authority. For work not requiring compilation or Git, deliver PDF/spreadsheet/report/etc. with version, sources/provenance and validation; code work additionally uses SPEC-224/271 independent UAT and gated promotion.
7. One Task Control/Companion projection displays the authoritative run and child-agent stages, spend estimates versus settled credits, approvals, output and stale/reconcile state. C1's Chat may link to a Task, but cannot fabricate status or approve via renderer-only logic.

**Three security identities must remain distinct:** (a) interactive desktop user session (`runner:companion:read`, optionally `llm:chat`), (b) registered Runner device/control-plane execution identity, and (c) scoped *per-attempt* tool and Gateway invocation grants. Neither (a) nor (b) automatically implies (c). Remote/mobile command paths require the same server-side actor and capability authorization.

## R1.3.5 Parallel development sequencing and go/no-go checkpoints

| Gate | Track N can do concurrently | Prerequisite to advancing | Proof and status |
|---|---|---|---|
| N0 — Number/owner audit | Read-only discovery, registry scan, source/PR inventory | User-directed 309→310, confirm 310 free in local authority | `DESIGN_ONLY` until recorded |
| N1 — Contracts/spec | Docs-only SPEC-310 branch, compatibility matrix, typed sketch, negative tests specified | Named owners for Workspace/Chat/Runner/Gateway/billing and SPEC-210 amendment | `PROPOSED` |
| N2 — Isolated Native spike | Mocked/read-only Pi runtime loop isolated from C branch, no production dispatch | Authorized spike environment; pinned Pi and package trust/Node parity | `SPIKE_NOT_E2E` |
| C completion | Owner repairs CI, merges WP1/WP2A/B/C0/C1/C2 safely in dependency order | Protected checks, no bypass; staging/trust recorded | C-track independent status |
| N3 — Chat-work admission bridge | Consume **merged** approved Chat/Command ingress, add narrow workload kind, keep flag off | SPEC-279/195 authority and distinct `work:execute`-equivalent grant approved; exact scope name discovered, not invented | Contract/E2E partial |
| N4 — Native general-work end-to-end | First non-Git read-only request and real artifact via Gateway and canonically accounted job | Real Gateway auth, billing/ledger, Runner grant, evidence owner | Live receipt required |
| N5 — Team + optional code | Two Native child attempts, independent Reviewer, Worktree only if code | Parent/child durable fencing, shared budget and SPEC-224/271 acceptance, no double charge | Real concurrency proofs |
| N6 — Installer + Windows acceptance | Signed managed Pi runtime, update/rollback and actual Companion UX | Authorized Windows Runner and install policy | Real screen/runtime evidence |
| N7 — Cloud/Linux rollout | Approved headless/mobile execution | Existing cloud placement + quota + cross-device auth | Separate certified gate |

**Do not gate C completion on SPEC-310.** Do not block docs/isolated G0/G1 work on C if interfaces are sufficiently read-only. Do not allow N3/N4 to “borrow” WP1 read-only observation or C0 `llm:chat` to fabricate tool execution. Do not call N4 PASS on mocked Runner/Gateway/credits. SPEC-224 protected internet-first E2E remains higher-priority platform acceptance.

## R1.3.6 Mandatory regression/negative test plan

- **Identity:** C0 desktop token cannot authorize Native model/tool execution; Runner device token cannot impersonate a user; revoked browser tenant membership and server logout reject new native requests; cross-tenant Work Context/Workspace and attachment reads reject.
- **Workspaces:** non-Git task has no repository field, local folder access requires ownership/capability, directory traversal/symlink race denied, mutable shared-workspace writer fencing and remote offline behavior explicit; cloud task works without local PC only after real cloud placement certification.
- **Chat/Task causality:** duplicate/replayed Chat intent does not double-dispatch; `chat.sendMessage` success does not imply `worker_job` exists; `chat.runOnRunner` still read-only; cancellation request ≠ cancellation completion; approval display ≠ approval decision.
- **Model/credits:** Native direct OpenAI/Anthropic/provider HTTP denied by technical egress controls; every gateway attempt correlates to actor/tenant/run/fence, reserve/actual usage/abort/retry/reconcile; duplicate event charges once; provider subscription CLI never silently billed as Native Gateway.
- **Multi-agent:** nested delegation has depth/child count/budget/concurrency limits, no two simultaneous writers to mutable workspace, reviewer cannot self-certify implementation, selected harness/model route retains evidence, resumed child cannot replay unknown side effects.
- **Runtime updates:** old pinned Pi continues; untrusted digest/signature fails before execution; new certified side-by-side install rolls back on failure; preserves active evidence and no global Node/project dependency mutations.
- **Legacy/regression:** current WP1–C2 auth, Rust-owned token protection, Chat UI, Companion projection, approvals display and SPEC-224/271 finality remain unchanged with SPEC-310 flag off; no retired `agencyMcpService` shim or protected CI bypass introduced.
- **UAT honesty:** no Windows screenshot, native installer, cloud headless, actual Gateway credit settlement, or Real-device E2E is marked PASS without firsthand verifiable artifacts.

Review ten lenses with explicit findings and re-test receipts: authority, Chat identity, workspace ACL, tool permissions, egress+billing, agent coordination, Runner/process recovery, installer trust/rollback, UI/UX and independent acceptance.

## R1.3.6a Additional acceptance A57–A68 — cross-session safety and renumbering

| ID | Requirement | Required evidence |
|---|---|---|
| A57 | Canonical new-feature number is 310, without modifying the separate occupant of 309 | Registry, main, PR, reservation and local-worktree collision report at exact SHA |
| A58 | Running Track C does not require or include installing/enabling SPEC-310 | Runner Companion regression suite with SPEC-310 flag off |
| A59 | SPEC-310 docs and isolated spikes do not mutate Track C owned files or their open PR branches | Scoped diff and branch/worktree ownership report |
| A60 | Desktop `llm:chat` cannot admit filesystem, process, tool, deployment or Native Team authority | Negative token/scopes/permissions integration tests |
| A61 | Runner device identity cannot impersonate interactive actor or mint Native execution grant | Device/user/run identity-matrix tests |
| A62 | WP1 `chat.runOnRunner` continues to force `observe` plus `action=none` until separately governed SPEC-279 action admission exists | Regression asserting read-only semantics and no silently broadened permission |
| A63 | Native↔Companion code integration uses a stable owner-acknowledged merged contract, or remains feature-flagged/unintegrated | Producer/consumer handoff with contract version, merge SHA and approval receipt |
| A64 | General-work Non-Git Workspace completes a real scoped task with actual artifact and no GitHub requirement | Authenticated live job, artifact digest/provenance and real Runner/Gateway receipts |
| A65 | Two Native agents can share one managed Pi installation while preserving independent grants, attempts and credit accounting | Real parent/child receipts, model invocation IDs and ledger reconciliation |
| A66 | C0/C1/C2 protected checks and Windows native acceptance are not marked passed by SPEC-310 mocks/tests | Separated acceptance ledgers, required-gate evidence and native screenshots only if real |
| A67 | No new task/approval/Workspace/credit system or auth scheme was introduced in either track | Source diff, canonical owner matrix, 10-pass review evidence |
| A68 | Orca is not installed or required in default Native path; optional external route never owns team orchestration | Clean-environment process/package inventory and run-mode contract tests |

A57–A68 augment A01–A56 and are *proposed acceptance criteria, not passed results*. A57 is a pre-commit gate. A58/A59/A60/A62 are prerequisites for parallel implementation; A64/A65 require live evidence; A66 must hold at all times.

## R1.3.7 Two copyable work orders for different coding sessions

### Work order C — continuing Runner Companion owner (do this first in existing session)

```text
SmartAIHub Runner Session B — OWNERSHIP-LOCKED WP CLOSEOUT.
Repository: naibarn/SmartSpecPro. Latest observed main: 0ebbd075ca4f71af1ffb8ce4f1e38bc3ba6013cf.
Open PR stack: WP1 #1161; WP2A #1162; WP2B #1163;
WP2C0 #1164 (192bd1c0c9); WP2C1 #1166 (9e0234a418);
WP2C2 #1167 (f4e8ee0dad).

1. Preserve ownership of Runner Companion/auth/Chat UI/projection;
   do NOT implement SPEC-310 Native Harness in these PR branches.
2. Re-fetch current main and PR heads. Reconcile safely without
   force-pushing or writing protected main. Track the actual CI blockers:
   contract-and-security DB test state/retired agencyMcpService test,
   MCP live-contract missing MCP_SMOKE_URL/TOKEN, and Windows authority.
   Keep all required security and live-evidence checks; do not add
   dummy credentials or resurrect retired Agency service.
3. Verify and preserve existing hardening: honest logout revocation,
   original tenant/user refresh binding, safe local secrets,
   read-only approvals, canonical projection. Retest exact heads.
4. Confirm WP1 chat.runOnRunner exists ONLY as observe/action=none
   while PR #1161 remains unmerged; do not broaden its authority.
5. Merge in proven dependency order only when protected policy allows;
   otherwise report the precise gate and non-bypassing remediation.
6. Run actual Windows + Chat-to-Runner observation E2E only when an
   authorized Windows Runner exists. Capture real signed/traceable
   receipts, screenshots, native window tests and error evidence.
7. Publish a CONSUMER_HANDOFF snapshot for SPEC-310:
   exact merged SHA, public/typed Chat ingress interfaces,
   desktop auth vs Runner device boundary, command admission seam,
   projection schema, outstanding work-operation authority gaps,
   tests and blockers. No SPEC-310 implementation in this stream.
8. SPEC-224 protected E2E retains priority; no false Final Verify.
```

### Work order N — new SPEC-310 owner (parallel read-only planning)

```text
SmartAIHub SPEC-310 — NATIVE HARNESS + CHAT-FIRST NON-GIT + TEAMS.
This document supersedes the colliding SPEC-309 proposal number;
DO NOT write or alter canonical SPEC-309.
Repository: naibarn/SmartSpecPro, observed main 0ebbd075ca4f71af1ffb8ce4f1e38bc3ba6013cf.
Companion owners concurrently hold PRs 1161/1162/1163/1164/1166/1167.

G0: Read AGENTS.md and authoritative registry/reservation records.
Verify numeric 310 against main, branches, PRs and all local worktrees.
If 310 occupied, stop numeric assignment and report the authority.
Read actual SPEC-205/200/210/224/269/271/277/278/279/292/293/294
contracts, Gateway/207/280 billing, workspace, skills and evidence.

Create an INDEPENDENT docs-only SPEC-310 draft PR from fresh main.
Do NOT modify Companion/Tauri/auth/Chat code, protected main,
SPEC-308, canonical Job/ledger/approval systems or another PR head.
Do NOT install Orca; report a targeted SPEC-210 amendment proposal
that makes its adapter optional and non-default.

Publish a canonical owner/interface mapping and G0 acceptance ledger.
Keep Native Harness off by default. You MAY define versioned
Native execution manifests, Gateway-only model transport, Runtime
Manager trust contracts and negative tests. Isolated deterministic
spikes are allowed, but not production dispatch or false E2E.

Implement a non-Git Chat -> Work Context -> Native -> verifiable artifact
vertical slice only AFTER existing ingress has a stable reviewed,
merged interface plus run-scoped execution/billing/capability authority.
Use different user desktop, Runner device and run-tool credentials.
Keep SPEC-224 E2E higher priority. Preserve all 56 proposal acceptance
criteria where applicable and add R1.3 noninterference proofs.

No simultaneous edits to shared worktrees/PR branches. Any needed
owner change must be raised as CROSS_SPEC_CHANGE_REQUEST with tests,
not made opportunistically in WP2C branch.

Perform 10 focused gap passes, repair findings and report SHA/evidence.
Do not claim Windows/cloud/Gateway/credit/Final Verify PASS without
real receipts. Produce small, reviewable, independently mergeable PRs.
```

## R1.3.8 Cross-track status handoff schema (read-only shared document)

```yaml
handoff_kind: SPEC310_CONSUMER_HANDOFF
producer_spec: 205
consumer_spec: 310
repository: naibarn/SmartSpecPro
source_main_sha: <record_actual_sha>
producer_prs: [1161, 1162, 1163, 1164, 1166, 1167]
producer_merged_integration_sha: null  # populated only after merge
interface_contracts:
  - name: desktop-user-auth
    status: OPEN_PR_NOT_E2E
  - name: canonical-companion-projection
    status: OPEN_PR_NOT_E2E
  - name: chat-to-runner-observe
    status: OPEN_PR_READ_ONLY
  - name: native-work-command-admission
    status: NOT_PROVEN
runtime_authority: UNVERIFIED
windows_native_acceptance: UNVERIFIED
chat_to_runner_e2e: UNVERIFIED
spec224_final_verify: NOT_INFERRED
next_action: complete owner-side protected gates; hand off exact merged API surface
```

This is a **projection/handoff format only**, not a new job database, lease service or authoritative execution state. Do not put bearer tokens, filesystem secrets, user private paths or unredacted source documents into the handoff.

---

# PRESERVED R1.2 CUMULATIVE DESIGN (retained as subordinate baseline)

# R1.2 baseline — Chat-First Native Harness, Non-Git Workspaces & SmartAIHub-Owned Multi-Agent Teams

**Cumulative R1.2 design amendment, incorporating R1.1; not proof of implementation, deployment, registry allocation, Windows acceptance or SPEC-224 E2E.** This addendum is intended to be appended or incorporated into R1.0 after the repository's G0 authority review. All unmodified R1.0 clauses remain authoritative. In the event of a contradiction with an existing implemented canonical owner, preserve that owner and revise this proposal. Do not modify protected `main` directly.

## R1.2 normative priority and product decision

R1.2 clauses in sections L–U and acceptance A39–A56 below take precedence over any conflicting R1.1 wording; R1.0 acceptance A01–A20 and retained R1.1 A21–A38 continue to apply where relevant. This is **one cumulative addendum** suitable for one Codex attachment, not a replacement for the full R1.0 canonical spec.

**Primary customer journey: SmartAIHub Chat → authorize/select Work Context and Workspace → plan/admit canonical task → select Native Single/Team/eligible External harness → Runner or approved cloud executor → verified output artifacts and Task Control.** Coding/Git are optional capability families, not prerequisites. The same Native Pi-backed harness shall handle document analysis, research, reporting, spreadsheet work, media preparation, file organization, browser-based research and other policy-authorized general work. External Orca installation/use is neither required nor default; Orca is a UX/research reference only unless a separately authorized SPEC-210 external adapter is deliberately enabled. The Runner is the local agent/process supervisor; SPEC-269 (general work) and SPEC-224 (software development) retain orchestration responsibility and canonical job control remains authoritative.

## A. Executive decision

SmartAIHub SHALL deliver (1) a **first-party native harness** able to run a model/tool loop via the SmartAIHub Gateway without Codex/Claude/Orca CLI, and (2) **multi-agent execution** in which one canonical SmartAIHub task may delegate bounded child-agent work across Native, certified external CLI harnesses, A2A peers or approved cloud executors (Orca only when separately opted into as an external adapter). The resulting UX MAY resemble Orca's parallel worktrees, agent boards, terminal/diff/browser panes and mobile monitoring, but Orca itself SHALL remain optional.

**Correct product distinction:** Orca ADE already provides multi-agent orchestration, worker coordination, decision gates and worktree-native CLI-agent management; its documented main use case is BYO external coding agents. SmartAIHub's differentiator is a first-party Gateway-routed model-driven harness under its own identity, credit, capability, task and independent acceptance controls, including **non-Git, general-work, device-independent execution**.

**No duplication:** SPEC-269 owns primary/specialist assistant-team planning for general work; SPEC-224 owns durable coding lifecycle, phases and Final Verify handoff; canonical job/control/approval/ledger components own dispatch, replay, grant and settlement. SPEC-310 SHALL implement only subordinate native agent sessions, governed delegation adapters, multi-harness compatibility and read projections where ownership requires. SPEC-210 has a historically proposed Orca external CLI runtime adapter; any mandatory Orca integration clause requires a separate explicit SPEC-210 amendment. No Orca runtime is required for SPEC-310. SPEC-293 owns branch/worktree federation.

**Priority:** SPEC-224 protected E2E acceptance is not displaced. G0/G1 contracts and isolated test spikes may proceed, but SPEC-310 cannot claim GA or substitute its own tests for SPEC-224/SPEC-271 Final Verify.

## B. Component taxonomy

| Concept | Meaning and authority |
|---|---|
| User intent / Chat | Human goal and authorized request, not implicit OS permission |
| Assistant team / plan | SPEC-269 for general work; SPEC-224 for software delivery |
| Agent member | One bounded delegated reasoning/execution participant of a parent canonical run |
| Harness | Native Pi-backed loop, external Codex/Claude/OpenCode/Orca adapter, etc. |
| Model | Gateway-routed model for Native; external provider identity remains separate for subscription CLI modes |
| Executor / placement | Existing Windows/Linux Runner or approved cloud runner/container |
| Tool / Skill / MCP | Canonical capability + policy + grant; Skills are not permissions |
| Worktree / branch | SPEC-293 authority when coding; optional/absent for general work |
| Approval | Existing canonical approval authority; web/mobile/desktop display is not approval minting |
| Job/event/fence | Existing `worker_jobs`/attempts/outbox/receipts/control fabric |
| Cost | Canonical Gateway and SPEC-207/280 ledger, including per-model attempt charges |
| Acceptance | SPEC-224 phase outcomes + independent SPEC-271 Final Verify, never an agent's 'done' text |

No `native_agent_jobs`, `orca_team_jobs`, separate queue, parallel approval DB, additional payment ledger, independent worktree inventory, or recursive unbounded subagent scheduler may be created without an explicit cross-SPEC authority decision.

## C. Architectural flow

```text
SmartAIHub Chat / Tauri Companion / Task Control / Mobile
                        |
             Authenticated canonical ingress
                        |
      +-----------------+----------------------+
      |                                        |
SPEC-269 primary team (general)         SPEC-224 development run (code)
      |                                        |
      +--------- bounded delegation plan ------+
                        |
        Canonical worker_jobs / attempts / control / lease / fence
                        |
             Existing runner/harness registry
       +----------------+----------------+----------------+
       |                |                |                |
 Native Pi harness  Orca adapter    Direct CLI/A2A  Approved cloud placement
 (SPEC-310)         (SPEC-210)      (SPEC-200/206) (SPEC-267/204)
       |                |                |                |
 SmartAIHub Gateway  BYO provider mode / existing external authority
       |                |                |                |
       +--------------- governed tools/skills/MCP --------+
                        |
       Signed, scoped child receipts -> canonical events/evidence
                        |
      Parent team reconciliation -> independent acceptance
                        |
     Task Control / Mission Control / Companion projections
```

Orca or another external runtime MUST NOT be silently installed or become a dependency for Native execution. A native child can run in the same team as Orca/direct CLI children only when their separate cost/auth/permissions and acceptance profiles are visibly and explicitly satisfied.

## D. Supported team strategies

1. **SINGLE:** one native agent; initial production candidate after single-agent proof.
2. **PIPELINE:** planner -> implementer/worker -> reviewer -> verifier; ordered child gates.
3. **PARALLEL_COMPARE (Orca-style race):** identical or variant assignments in isolated worktrees/sandboxes; independent outcomes and comparative evaluation; no automatic blind merge.
4. **COOPERATIVE_DAG:** planner partitions independent subtasks, explicit dependencies; sibling parallelism only where write scopes do not overlap.
5. **REVIEW_DEBATE:** independent critic, security review or model comparison, with evidence and contradiction reporting; reviewer must not be the sole verifier of their own unreviewed mutation.
6. **MIXED_HARNESS_TEAM:** Native + installed external adapters, with per-member model/harness auth and cost labels; deny on missing adapter, grants or quota rather than silently converting to a different payment path.
7. **GENERAL_WORK_TEAM:** researcher/writer/analyst/reviewer without Git; document/retrieval/browser/action scopes remain capability-gated, no ambient filesystem access.

Automatic strategy selection SHALL be policy- and task-driven and explain its estimated additional cost and expected parallelism. The user MAY explicitly select a team strategy without gaining additional capabilities. A profile using multi-agent mode is an *execution strategy*, not a second canonical orchestrator.

## E. Team/child contracts (proposed, adapt at G0)

```ts
// Adapter-level projection over canonical IDs; not a new authoritative table.
type TeamStrategy =
  | 'single' | 'pipeline' | 'parallel_compare'
  | 'cooperative_dag' | 'review_debate'
  | 'mixed_harness_team' | 'general_work_team';

type AgentMemberSpec = {
  canonicalParentRunId: string;
  childJobId: string;            // actual existing canonical job ID
  parentAttemptId: string;
  actorId: string;
  tenantId: string;
  teamStrategy: TeamStrategy;
  role: 'planner'|'researcher'|'implementer'|'tester'|'reviewer'|'verifier'|'worker';
  harnessId: string;            // smartaihub-native, orca, codex-direct, etc.
  runtimeManifestDigest?: string;
  modelRoutePolicyId?: string;  // mandatory for Native; Gateway-resolved
  placementId: string;         // Runner/cloud approved target
  workspaceId?: string;        // Git optional for general work
  branchOrWorktreeRef?: string; // governed by SPEC-293 when present
  dependencyJobIds: string[];
  inputContextPackageRef: string; // authorized/redacted artifact ref
  executionGrantRef: string;   // opaque canonical authority, not client token
  leaseFence: string;
  maxSpendCredits: string;      // canonical decimal units, sub-reservation
  maxTurns: number;
  expiresAt: string;
};

type AgentHandoffReceipt = {
  fromJobId: string; toJobId: string;
  runId: string; attemptId: string; fence: string;
  inputDigest: string;
  artifactEvidenceRefs: string[];
  claimSummaryRef?: string; // claims are untrusted until independently checked
  resultClass: 'succeeded'|'failed'|'blocked'|'unknown_outcome';
  attestedAt: string;
};
```

These are **sketches**, not permission to add physical database tables/routes. G0 MUST map their fields to existing canonical task, job, run, attempt, handoff and receipt schemas. Parent progress is computed from actual child states/dependencies; no invented percentages. Child-level `agent_settled`, TUI idle and natural-language 'done' MUST NOT mark the parent successful.

## F. Delegation policy and budget invariants

- Parent execution grant must explicitly allow delegation, strategy, eligible harnesses/models, placement, child tools and output destination.
- Child scopes are a **strict subset** of the parent's effective tenant/actor/device/workspace/capability policy. A child cannot mint approval, extend TTL, expand spend or grant its sibling access.
- Every spawned child obtains a real canonical child job/attempt/lease/fence and bounded result/evidence linkage. The model cannot create raw processes as untracked 'subagents'.
- Concurrency, depth, total agent count, total turns, model tokens, wall-clock, tool time, nested tool calls and total credits must be bounded per run and tenant. The policy shall supply values; initial pilot SHOULD use small explicit limits and reject attempts to exceed them.
- Sum of child reservations + parent overhead + outstanding unknown usage may not exceed the authorized parent budget. Reservations are not charges; settle based on actual Gateway/provider evidence. External CLI subscription usage is labeled separately from Gateway-billed Native usage.
- A task retry may incur more provider charges; per actual provider attempt accounting identity is unique and deduplicated at settlement. Never declare racing agents cheaper without measured verification.
- No unbounded recursive spawn, circular DAG, repeated speculative retries, tool-loop amplification or child task that can outlive its grant without canonical reconcile.
- Every delegation/handoff carries causation, actor, tenancy, parent/child IDs, route, model/harness, version, fence, policy version and immutable evidence references.

## G. Isolation, conflicts, artifacts and review

**Coding:** use SPEC-293 to create isolated branch/worktree per concurrent *writer* (or provably disjoint scoped write domains in the same authorized workspace). Read-only reviewers MAY share immutable snapshots, not the live mutable worktree. No simultaneous same-path writes in one worktree. Merge is a separate authorized parent action after diff/review/tests/conflict detection, never a winner's implicit grant. Protected `main` remains PR-only per existing policy. Do not create a new Git database or branch ownership model.

**General work:** use independent scoped scratch/artifact namespaces, not mandatory Git; prevent agents from concurrently modifying the same document/output without a canonical revision/merge or lock authority. Keep provenance of retrieved documents and explicit trust boundaries for user/private/global knowledge.

**Cross-agent messages:** all sibling results and model-generated summaries are **untrusted content**. Strip or quarantine embedded instructions, secrets, prompt-injection attempts and forged tool/approval results; do not treat an agent's assertion of 'reviewed' as independent review. Parent sees source references and verification status, not privileged raw credentials.

**Review independence:** require distinct execution context / verification path for risk-relevant checks, with deterministic tests where available. Reviewer same-model/same-prompt agreement is not independent evidence. Final Verify remains external to the harness.

## H. Runtime, versioning and Orca adapter interaction

- **Native Pi worker:** managed private Pi runtime from SPEC-310 R1.0, pinned exact version, digest, adapter version and approved extensions per child attempt; Gateway-only inference enforced at networking/model transport boundary.
- **Orca external worker:** remains SPEC-210 under SPEC-200. It may manage terminal sessions/worktrees for external CLI agents where certified, but its task DAG, local workspace DB, status dots and built-in multi-agent completion semantics are *not* promoted to canonical SmartAIHub orchestration authority.
- **Pi as optional Orca-managed CLI:** if an Orca adapter invokes Pi CLI, classify it as an *external harness route* unless it is demonstrably configured and certified for Gateway-only managed mode. Never infer that running the Pi binary equals SmartAIHub Native mode.
- **Mixed team:** each member snapshots route, model/provider/account class, runtime version, source revision and grant. Conversion from subscription CLI to Gateway Native, or vice versa, requires new admission and visible cost/permission approval where material.
- **Version updates:** G3 Runtime Manager stages releases side by side. Existing agents remain pinned. Parent may admit new-version children only under a compatibility decision; no silent mid-team tool/schema drift.
- **Recovery:** child reconnect/restart requires canonical lease/fence reconciliation. Agent prompt history is not proof an external action did/didn't occur. Unknown outcomes require reconciliation before re-execution.
- **Cloud-only/mobile-only:** user does not need a PC when an already-approved cloud executor has real placement authority; otherwise display waiting for available execution target.

## I. UI/UX: Orca-like multi-agent control without Orca dependency

**Simple / personal view:** one goal, selected computer/cloud, strategy badge, named assistant/team members, meaningful current step, estimated vs billed spend, outcome and a single Needs You affordance. No worktree/terminal jargon for non-developers.

**Pro / developer view:** parent timeline; lanes per agent; selected Native/external harness and provider/route; run/worktree/device identity; dependency DAG; budgets by child; structured tool receipts; terminal projection when authorized; diff review; CI/tests; version pin; lease/fence; cross-agent messages and decision gates. Show source/verification of each claim.

**Three levels, one projection:** Floating Companion = concise status/notification; Chat Panel = ask/steer/delegate within scope; Full Workspace/Mission Control = inspect multiple agents and evidence. All are read projections of existing canonical state. Window state and visual grouping are UI-local only; no new task authority.

**Remote/mobile:** view team progress across Runner/cloud placement; issue approved comments, bounded steer and decisions through existing ingress/approval APIs; never send raw terminal keystrokes that bypass canonical authority. If host is offline, show stale or blocked rather than completed.

### Proposed text wireframe (concept only)

```text
SMARTAIHUB | Goal: Repair signup flow                [Needs You: 0]
Device: Windows Runner / or approved cloud            Budget: est 18 / billed 9
Strategy: Cooperative Team [3 agents, 2 active]        Parent: VERIFYING?

[Planner: Native • Done] -> [Builder A: Native • Testing] --+
                           [Builder B: Codex • Reviewing] -+--> [Final Verify: pending]

Timeline | Agent messages | Changes/Diff | Tests | Evidence | Spend

Simple mode: 'Working on signup flow; two checks running.'
Pro mode: Worktree, runtime digest, tool receipts, fence, coverage, costs
```

The UI must show real states. The sample text does not assert an actual task is running.

## J. Implementation packages and gates

**M0 — authority and dependency audit (read-only):** verify SPEC-310 numeric allocation across canonical registry, `main`, open PRs, worktrees; current Pi release/source and Node ABI; actual SPEC-210 Orca adapter; SPEC-269 team contracts; SPEC-224 coding lifecycle and unfinished E2E; SPEC-293 worktree ownership; existing 195/267/277/294/207/280 stores, Gateway API, device/desktop auth and deployment. Produce code path matrix. No new migration/API until ownership proven.

**M1 — first-party single-agent loop (G1/G2, feature-flagged):** choose one Pi modular or Pi RPC baseline with comparative fixtures, introduce Native harness descriptor/adapter and Gateway-only inference. Read-only tools and receipts first. Demonstrate one real Runner + Gateway model turn, token usage and state reconciliation in a trusted environment. No external CLI dependency.

**M2 — bounded two-agent pipeline:** delegate Planner Native -> Reviewer Native as canonical linked jobs, hand off a hashed context/evidence package, enforce child scoped grants, per-agent usage, stop/cancel and independent parent verification. No parallel writes.

**M3 — two-writer Orca-style parallel comparison:** separate worktrees on Windows under SPEC-293, parallel Native agents or Native+one existing certified external harness, compare verified results/diffs; winner requires explicit review/merge authorization. Test conflicts, denial and cancellations.

**M4 — mixed-harness and general-work:** add direct external-harness compatibility first; consider SPEC-210 Orca only with separate explicit opt-in and certification; also demonstrate Native general work without Git and correct Skill/MCP policy. Do not make Orca installation a prerequisite.

**M5 — three-level UI and mobile:** project parent/child hierarchy into existing Task Control/Mission Control; add agent lanes and costs to Companion/Chat/Workspace; mobile displays authoritative status and decisions. No mock success claims.

**M6 — Runtime Manager canary + Windows acceptance:** signed/pinned/private Pi installation, update/rollback during pinned teams, real Windows lifecycle, screenshot, tool receipt, Gateway spend proof, negative direct-provider/network tests and recovery injection.

**M7 — Linux/headless and approved cloud:** real target admission, durable remote run and mobile-only start; isolated cloud execution, tenant quotas, placement cost; GA only after required SPEC-224/271 acceptance and R1.0 A01–A20 applicable acceptance gates.

**Merge ordering:** keep G0/G1 and isolated G2 spikes reviewable while SPEC-224 E2E is unresolved; do not divert protected authority work or represent SPEC-310 as GA. Break slices into focused PRs and merge allowed gates frequently; never disable required protection for convenience.

## K. Additional acceptance criteria A21–A38

| ID | Required proof | Minimum evidence |
|---|---|---|
| A21 | Native harness works without Orca/Codex/Claude installed | isolated Windows process inventory + actual Gateway/model/tool receipt |
| A22 | Same parent can dispatch two genuinely separate child agents without second job authority | canonical parent/child job, attempt, lease/fence trace |
| A23 | Bounded delegation, depth, fanout and quota reject unsafe recursion | limit/race negative tests |
| A24 | Child receives only subset of effective parent capability | denial/prompt-injection/tenant isolation tests |
| A25 | Per-agent reserve/charge/reconcile/refund never double-settles | Gateway attempt IDs and ledger replay/cancel tests |
| A26 | Parallel same-task comparison uses separate governed worktrees and distinct diffs | actual filesystem/Git + branch ownership proof |
| A27 | Same-worktree concurrent writer is denied or serialized under authority | conflict/race and lock tests |
| A28 | Agent-to-agent forged approval/receipt/prompt injection cannot gain authority | malicious handoff suite |
| A29 | Mixed Native/external team correctly labels BYO subscription vs Gateway billed costs | transport credential audit + UI contract |
| A30 | Upstream Pi version pins remain immutable per active child throughout update/rollback | active run + side-by-side upgrade fault test |
| A31 | Parent cannot report complete because children returned idle/agent_settled | terminal status precedence + Final Verify fixtures |
| A32 | Parent/child cancel and restart require lease/fence and side-effect reconciliation | process restart/unknown outcome/duplicate prevention suite |
| A33 | Review role has independent evidence path; findings link to source/test | reviewer isolation + acceptance receipts |
| A34 | Non-coding team completes without Git, repo or shell privilege | scoped document/research fixture |
| A35 | Companion, Chat, Mission Control show real per-agent status and source-labeled spend | authenticated Windows/browser/mobile test screenshots |
| A36 | Mobile-only user launches work on approved cloud executor without PC | real cloud target + evidence UAT |
| A37 | No Orca, no external CLI, or no native feature flag leaves other routes intact | regression/fail-closed routing tests |
| A38 | Complete correlation chain intent -> canonical parent/child -> model/tool attempt -> evidence -> settle -> Final Verify | sanitized cross-system trace |

**No all-green shortcuts:** R1.0 A01–A20 plus A21–A38 relevant to an enabled strategy remain authoritative. Unit tests, TUI idle detection and agent output cannot substitute for real Windows/cloud receipts and independent acceptance. Implemented state must be reported as PASS/PARTIAL/BLOCKED/UNVERIFIED per platform and strategy.

## L. Ten focused gap-review lenses (reviews NOT performed by this design artifact)

1. Existing SPEC authority/non-duplication, with SPEC-210 Orca vs SPEC-310 Native distinction.
2. Model and harness routing, Gateway-only and BYO authentication separation.
3. Parent-child grants, tenant/actor isolation, delegated revocation and approval freshness.
4. DAG validity, concurrency/fanout bounds, cancellation and unknown-outcome recovery.
5. Git worktree/branch and non-Git artifact writer consistency.
6. Cross-agent messages, prompt injection, evidence verification and reviewer independence.
7. Budget, reservations, model retry spend, external CLI usage classification and idempotent settlement.
8. Pi runtime lifecycle, pinned concurrent sessions, staged updates, malicious artifact and rollback.
9. Multi-surface projection fidelity, user/simple vs developer/pro views, mobile offline/stale UX.
10. Real Windows, Linux/cloud execution and SPEC-224/SPEC-271 independent Final Verify, failure injection and kill switch.

Each future review run MUST record exact implementation SHA, date, reviewer/test, finding, risk, fix/evidence and retest. This document makes no claim that reviews have been executed.

## M. Specific repo alignment checks before implementation

- Check active WP1/WP2A/WP2B/WP2C0–2C2 PR dependencies and Windows native E2E gaps; do not bypass them by starting a separate desktop stack.
- SPEC-210's existing `OrcaRuntimeAdapter` plan owns use of `stablyai/orca`; do not reimplement or embed Orca merely to get a multi-agent UX.
- SPEC-269's Primary Assistant/team planning and SPEC-224 development-phase ownership take precedence over Pi's internal task/session API or Orca task graph.
- SPEC-293 owns worktree federation, SPEC-277/294 the UX projections, SPEC-208 Computer Use, and existing Gateway/economic rails all money and model credentials.
- Do not automatically enable dangerous CLI flags or assume isolated Git worktrees constitute an OS sandbox. Even if Orca uses agent autonomy flags by default, SmartAIHub MUST enforce its own host/executor grants and sandbox.
- Verify Pi's current exact certified release by upstream API and SmartAIHub signed manifest at runtime; do not pin 1.4.0 as a timeless current release.

## N. Verified research links and limits

- Orca product: https://www.onorca.dev/ ; repository: https://github.com/stablyai/orca
- Orca worktrees: https://www.onorca.dev/docs/model/worktrees ; agent sessions: https://www.onorca.dev/docs/model/agents-sessions
- Orca orchestration skill: https://github.com/stablyai/orca/blob/main/skills/orchestration/SKILL.md
- Orca mobile: https://www.onorca.dev/docs/mobile ; official repo README: https://github.com/stablyai/orca/blob/main/README.md
- Pi: https://github.com/earendil-works/pi ; releases: https://github.com/earendil-works/pi/releases
- SmartAIHub external Orca authority: `specs/feature/210-orca-runtime-adapter-cli-agent-execution-bridge/spec.md`
- SmartAIHub Primary Teams: `specs/feature/269-smartaihub-primary-specialist-assistant-teams-autonomous-workforce/spec.md`
- SmartAIHub Development: `specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md`
- SmartAIHub Git: `specs/feature/293-SmartAIHub-Unified-Git-Workspace-Repository-Federation/spec.md`

**Historical R1.2 research snapshot:** The feature-directory listing ended at 308; this source line has been renumbered to SPEC-310 for proposal continuity. It is not a repository reservation. Verify number 310: check pending assignments, open PRs, registry and unmerged worktrees before canonical commit. No code was modified in the repository, no protected branch was touched, and no actual agent/Runner E2E, installation or charge settlement was performed by preparation of this document.

---

# R1.2 AUTHORITATIVE EXPANSION — CHAT-FIRST, NON-GIT, GENERAL-WORK WORKSPACES

The following clauses **override conflicting R1.1 descriptions**; keep the retained multi-agent and runtime lifecycle contracts in sections A–K. The revision does NOT claim that the UI, API, persistence or tests are already implemented. Proposed interface names below must be reconciled to code before use.

## L. Product rule: one SmartAIHub Chat, no coding or Git prerequisite

1. A user SHALL be able to start a general-purpose task from the existing authenticated SmartAIHub Chat / Desktop Chat Panel / Full Workspace / approved Mobile Chat with natural language, choosing an existing accessible Work Context/Workspace or creating an authorized, non-Git workspace. No repository, Git provider connection, `git init`, branch, worktree, compiler, Codex, Claude CLI or Orca installation may be required for an ordinary non-coding task.
2. Examples: "Summarize the Q4 invoices and generate a PDF", "analyze this CSV and prepare a spreadsheet report", "organize these local documents into folders after preview", "research competitors and assemble a presentation", "prepare meeting notes from an uploaded audio transcript", "use my approved Drive and calendar sources to prepare a briefing", "draft reply to customer inquiries but do not send without approval", "work on this folder with three specialist agents".
3. The **same first-party Chat** remains the task ingress across Desktop, Web and Mobile; Native Harness is selectable invisibly via policy in Auto mode or explicitly in Pro mode. Do not create Pi Chat, Orca Chat, a disconnected terminal-first workflow, or an alternative conversation store.
4. The same request may be (a) answer-only, (b) read-only analysis, (c) artifact creation, (d) authorized existing-source update, or (e) OS/browser/communication side effects. Classify intent before admission; a conversation reply does not silently imply permission for (d) or (e).
5. An agent can operate without any OS workspace for pure inference/knowledge queries. An execution workspace is allocated only if the approved tools require materialization, transformations, or temporary files. A persistent Work Context is not mandatory for one-off work.
6. The system SHALL distinguish **Chat message** (request/communication), **Work Context** (durable collaboration context), **Workspace** (data/materialization and execution scope), **Task/Run** (canonical accountable work) and **Deliverable/Artifact** (verified output). None may be inferred as equivalent solely from a shared name.
7. Multi-agent work is an optional execution strategy: Auto SHALL default to Single when it satisfies quality, latency and budget; parallel/team activation must have a justified skill, latency, coverage or independent-review benefit and a bounded cost estimate.

## M. Existing canonical ownership — non-Git Workspace is NOT a new product database

| Concern | Canonical owner consumed by SPEC-310 | R1.2 requirement |
|---|---|---|
| Chat / Personal or Specialist assistant teams | SPEC-269 + existing Chat | Reuse intent, plan, delegation and user-facing continuity. |
| Cross-conversation and organization Work Context | SPEC-292 | Bind to existing Work Context identity and ACL; do not create `native_workspaces` as a parallel business table. |
| Chat command and approved delegation | SPEC-279 / ingress | Use authenticated command intent and canonical admission, not WebView/terminal raw instructions. |
| Execution session / workspace continuity and writer fencing | SPEC-278 (resolve canonical semantic identity because numeric collision history exists) | Map host/sandbox/container/remote workspace and generation/writer lease. |
| Runner OS, process supervisor and local capability readiness | SPEC-205 / existing Runner Control | Local directory access, process start/stop, child supervision and receipts. |
| Native model-driven loop, Pi sidecar, Pi updates | SPEC-310 | Native runtime only; no independent Team Orchestrator. |
| Development lifecycle and independent verification | SPEC-224 / SPEC-271 | Apply development gates for code delivery and independent artifact acceptance for general work where applicable. |
| User data, evidence and source provenance | SPEC-266 / 284, Library / R2 and existing data owner | Preserve versioned deliverables; no new unconditional file store. |
| RAG / knowledge / memory | SPEC-229 / 268 | Retrieval/knowledge scoped to actor and Work Context; Chat transcript not memory or task truth. |
| Skills, MCP and computer use | SPEC-199 / 208 / 221 / 256 | Capabilities and OS/network side effects use granted tools with existing audit/approval. |
| Git repository/worktree | SPEC-293 | Optional only for Git-governed development tasks. No Git for general work. |
| Task Control / Mission Control | SPEC-277 / 294 | One read-model family across Chat, Companion and Full Workspace. |
| LLM usage, credits and settlement | SPEC-207 / 280 + existing Gateway | Model usage and tool costs by canonical run and child, not Pi telemetry alone. |
| External subscription CLI / Orca option | SPEC-200 / 206 / 210 | Optional separately authorized adapter; never a Native dependency or silent installer step. |

**Cross-SPEC change request:** SPEC-210's older directive that Orca SHALL be integrated as a first-class adapter conflicts with the now-decided *no mandatory Orca installation / no Orca-owned coordination* product policy. G0 SHALL propose a narrowly scoped SPEC-210 amendment that reclassifies Orca as `optional_external_adapter` or `reference_only` in product default; do not silently rewrite or bypass SPEC-210 authority. Existing installed Orca adapters, if any, shall not be forcibly removed without separate migration/authorization.

## N. Workspace taxonomy, resolution and lifecycle

### N.1 User-visible workspace choices (not necessarily new physical kinds)

| User-facing Workspace | Logical intent | Physical/runtime mapping (discover exact implementation at G0) | Git requirement |
|---|---|---|---|
| Personal or team Work Context | Durable conversation, attachments, sources, tasks and output history | Existing SPEC-292 Work Context + approved Library and execution materialization | None |
| Local Folder on Windows/Linux | Analyze/edit a specifically approved host folder | Existing SPEC-278 `host_directory`, SPEC-205 Runner; opaque workspace/root ID | None |
| Managed Cloud Workspace | Work without a personal computer; persist versions/files across sessions | Existing approved Library/R2 canonical artifacts + ephemeral `container_filesystem`/`sandbox_filesystem` materialization | None |
| Remote Workspace | Approved remote worker/resource | Existing `remote_workspace`, approved runner/placement and authorization | None |
| Connected Source Workspace | Work with Gmail/Drive/Notion/MCP or other connected sources | Virtual Work Context over authorized source refs, not an unrestricted writable OS mount | None |
| Temporary Scratch | Read/transform files and return outputs, with bounded retention | Existing `sandbox_filesystem` or `container_filesystem`, optionally `none` for no-tools tasks | None |
| Development Workspace | Source code and versioned build/review | Existing workspace; optionally SPEC-293 Git repository/worktree when required | Conditional |

`connected_source_workspace` and `managed_cloud_workspace` are *product-level choices / bindings*, not permission to add physical SPEC-278 workspace enum values or new canonical stores. Provider connection grants do not imply all API operations are allowed.

### N.2 Workspace selection and binding

- `Auto`: resolve the currently selected, eligible Work Context and optional default workspace. Never guess a write destination when more than one materially different target is valid. For a one-off read-only task, use ephemeral scratch and display the actual target; for mutation, file overwrite, sending messages or changing shared sources, ask for or obtain explicit target authorization.
- `Use existing`: authenticated list scoped by tenant/user/project/Work Context; expose source kind, selected Runner/cloud placement, read/write/egress grants, expiration and storage/retention.
- `Create workspace`: non-Git by default, unless explicitly a Git development task; provision through the **existing** Workspace/Library/Work Context authority. No new repo is created implicitly.
- `Bind local folder`: user intentionally chooses a folder on an authorized Runner; show path summary locally, use opaque workspace ID in backend, explicit read/write scope, no root/home/disk-wide grant by default. Canonicalize paths/symlinks and protect against races and protected-directory escapes.
- `Attach files or sources`: preserve each artifact/source identity and provenance; uploaded binary material and external connectors must be authorized. Attaching a document to Chat does not grant filesystem-wide access or permission to exfiltrate other documents.
- `Switch workspace`: new admission or explicit scope reauthorization when changing tenant, Runner/device, project, Work Context, artifact/source disclosure set or mutation target. Conversation context alone is not an authority token.

### N.3 Data persistence, output, versioning and custody

- Each task has a **separate bounded scratch area** (where needed) and a declared **deliverable destination**. Scratch is never silently treated as the durable user workspace, and a source location is not automatically a write destination.
- Cloud object storage (e.g. approved R2-backed Library) is authoritative for committed artifacts **only where the existing Library/evidence model says so**; R2 is object storage, not a magical POSIX filesystem. Use scoped materialization and integrity-checked commit/publish operations.
- Write actions SHALL be prepare/preview/authorize/commit/verify where risk and source contract require. Preserve prior versions or verifiable before-state snapshots when supported; avoid overwriting originals by default for document/report workflows.
- Deliverables SHALL be registered with canonical artifact refs, content digest, media type, lineage/source citations, tenant/owner/ACL, version/revision, retention and safe preview/download projection. Never use `done` as proof that a file exists.
- For multi-agent edits to **the same ordinary non-Git document**, enforce single-writer generation, semantic revision/CAS, or separate candidate copies with an authorized merge. Git worktree isolation does not apply.
- On disconnect, device sleep, process crash or token expiry: keep durable task state and committed checkpoints; reconcile external writes and fencing before resume. Retention/cleanup never deletes unreconciled source or pinned run output.
- Offline PC work and cloud work are distinct execution/deployment policies; do not claim cloud continuation for unsynced local-only files or unauthorized connector data.

## O. Chat-first execution and end-to-end handoff

### O.1 One canonical flow

```text
SmartAIHub Web/Mobile/Native Chat (existing authenticated conversation)
  -> Intent + task_family classification (work/code/research/etc.)
  -> Resolve Work Context + Workspace (Git optional) + inputs/sources
  -> Preview proposed output destinations and side effects
  -> SPEC-279 canonical delegation/admission (tenant, actor, target, quotas)
  -> SPEC-269 team plan for general work OR SPEC-224 lifecycle for software development
  -> Canonical parent task and bounded child tasks/attempts/grants
  -> SPEC-205 Runner supervisor OR existing approved cloud execution placement
  -> SPEC-310 Native Pi-backed model loop (SmartAIHub Gateway only)
  -> SPEC-199/208/256 approved tools, retrieval, Skills/MCP
  -> Receipts + versioned outputs + usage reconciliation + independent checks
  -> Task Control/Mission Control read projection
  -> Original Chat receives result summary, actual artifact links and next actions
```

For read/analysis-only tasks, no OS process or workspace need be allocated if the approved transport supports equivalent safe retrieval/inference. For code work, SPEC-224 can require branch/worktree and independent public UAT where its delivery contract demands it. A general-work PDF report does not inherit a mandatory `https://smartaihub.app` application-preview requirement, although its SmartAIHub control surfaces must still use authorized endpoints.

### O.2 Proposed metadata envelope (adapters/projections only)

```ts
type TaskFamily = 'general_work' | 'research' | 'document' | 'analysis'
  | 'media' | 'automation' | 'software_development';
type WorkspaceSelection =
  | { mode: 'none' }
  | { mode: 'ephemeral'; retentionPolicyRef: string }
  | { mode: 'existing'; workspaceRef: string; workContextRef?: string }
  | { mode: 'create'; workContextRef?: string; workspaceProfile: string };

type ChatWorkspaceTaskIntent = {
  canonicalConversationId: string;
  userMessageId: string;
  actorId: string;
  tenantId: string;
  taskFamily: TaskFamily;
  goal: string;
  workspaceSelection: WorkspaceSelection;
  sourceRefs: string[];             // explicitly disclosed, scoped inputs
  outputDestinationRef?: string;   // distinct from sourceRefs
  executionPlacementPreference: 'auto' | 'authorized_local' | 'approved_cloud';
  executionStrategy: 'auto' | 'single' | 'team';
  requestedHarnessId?: string;     // optional; Native default if certified/selected
  allowedSideEffectClasses: string[]; // admission decides; Chat does not grant
  budgetPolicyRef: string;
  idempotencyKey: string;
};

type WorkspaceExecutionBinding = {
  canonicalJobId: string;
  canonicalAttemptId: string;
  workspaceRef?: string;           // opaque, optional
  workContextRef?: string;
  workspaceGeneration?: string;
  placementRef: string;
  sourceSnapshotRefs: string[];
  outputDestinationRef?: string;
  executionGrantRef: string;       // opaque, never exported to UI
  capabilitySnapshotRef: string;
  leaseFence: string;
  runtimeManifestDigest: string;
};
```

**All types are illustrative.** Do not add tables or HTTP routes on the basis of these declarations. Map onto existing SPEC-279/278/269/205/186/195 contracts during G0; retain identifiers and cross-source semantics as documented by the real code. If no canonical capability exists to commit an artifact or write a connected source, deliver a safe draft and mark the mutation unavailable.

### O.3 One Chat session can own many tasks and workspaces

- A conversation can have multiple canonical tasks; a Work Context can span multiple conversations; each task retains an immutable resolved workspace/grant snapshot for its attempt.
- Repeated requests such as "continue the spreadsheet from yesterday" must resolve the latest **authorized artifact version** / explicit task context, not infer it from a stale chat summary or similarity search alone.
- Follow-up steers for active runs attach to the correct task/attempt and are subject to freshness/risk/approval gates; a follow-up must not restart an indeterminate side effect or silently authorize a new destination.
- Chat completion responses must distinguish `ready_for_review`, `awaiting_approval`, `blocked_unavailable_source`, `delivery_committed` and `verified` according to canonical status/accepted vocabulary. Progress percentages may be shown only from grounded, clearly defined measurements.

## P. Native General-Work tool profiles and safety

Default `native-work` SHALL NOT inherit `native-code` tools or host root access. Suggested capability groups, all centrally resolved and independently authorized:

1. `knowledge.read` / `source.search`: approved RAG/Work Context/retrieval/connector reads with classification/ACL and provenance.
2. `workspace.read` / `workspace.search`: bounded workspace root or approved materialized input only.
3. `artifact.create` / `artifact.transform`: draft/edit files in isolated scratch, deliver via approved artifact gateway; typed file handlers where installed, avoid arbitrary shell scripts for a PDF or spreadsheet when a safer handler exists.
4. `workspace.write` / `workspace.organize`: opt-in mutation; list planned renames/deletions/moves and provide preview/undo evidence where feasible; no irreversible bulk deletion by default.
5. `connected_source.write` / `communication.send` / `calendar.modify`: separate per-provider, per-operation capability and approval; a read grant never implies send/edit/delete permission.
6. `browser.observe` / `computer.use`: mediated by SPEC-208 and existing browser grants; non-coding tasks do not permit arbitrary UI control by default.
7. `exec.argv` / `network.fetch` / `git.*`: default **deny** in ordinary personal-work spaces; permit only when selected task, executor isolation and explicit grants justify them. Shell-string execution has higher separate risk.
8. `skill.execute` / `mcp.invoke` / `codemode.nested`: each nested call is individually authorized, metered when chargeable and bounded by source/target disclosure, time, output and concurrency budgets.

Threats to test: hostile document prompt injection; shared-folder escape; symlink/TOCTOU path traversal; stale source permissions; exfiltration across tenant/user Work Context; unexpected email sending; re-running a non-idempotent source write after disconnect; poisoned generated files; malicious Skills; OCR/transcript hidden instructions; output file macro/executable creation; user data exposure to the wrong model/provider/region; oversized documents causing unbounded token/disk usage.

Workspace root controls, sandbox/process identity and cap grants must be enforced by the actual OS/connector executor; a natural-language instruction "stay in this folder" is not a security boundary. The Runtime Manager's private Pi update/install controls remain distinct from file-manipulation permissions granted to an agent.

## Q. General Work Multi-Agent execution without Git

1. Parent general-work goal is planned by SPEC-269; native child agents may have `researcher`, `analyst`, `writer`, `fact_checker`, `reviewer`, `formatter`, `publisher` roles. These roles are labels and routing hints, **never an authority expansion**.
2. Initial two-agent general-work pipeline: `Researcher (read-only approved sources) -> Writer (write isolated output draft) -> Reviewer (read source + candidate result) -> committed artifact`, with only the number of agents justified by budgets. Do not impose all roles on every small job.
3. Parallel research: separate context packages and result refs, source-labeled summaries and dedup/contradiction report; no shared mutable document writes during research.
4. Parallel document drafting: each writer produces an isolated candidate artifact; a selected merge/publish agent obtains explicit writer-generation authority to compose a final artifact. **Do not require `git init` just to isolate drafts.**
5. Multi-source knowledge is not multi-tenant memory: only authorized inputs may pass to each child; child handoffs carry bounded provenance and classification labels, not raw credentials or unlimited file copies.
6. Team costs aggregate with per-child Gateway invocation IDs and verified outputs; cancellation and review obligations do not disappear when the coordinator text reply ends. If the only approved executor is offline, parent remains waiting for placement; no invented background execution on the user's device.
7. Mixed-harness general work MAY use an already installed, explicitly authorized External Harness or remote A2A participant, but it is optional and must not require Orca or Git. If provider-native CLI subscriptions are used, show their billing/auth semantics separately; Native uses SmartAIHub Gateway credits.

## R. UX contract: Workspace-centric, with Chat remaining the entrypoint

### R.1 Simple mode

- Start Chat with normal prompt; use optional Workspace chip (`Personal`, `Work Context`, `Local Folder`, `Cloud`, `Connected Sources`, `New Workspace`). No mandatory repository picker.
- Optional operation chip `Auto / Single Agent / Team`. `Auto` explains why a team is used and displays estimate before expensive or privileged fan-out.
- Clear status: chosen Workspace/source, agent(s), current work step, last confirmed action, estimated vs billed credits, Needs You, and real deliverables. Users are not forced to learn Pi/Orca/Worktree terms.
- Clicking an output opens an authorized artifact preview/download/known existing-source revision; not a fabricated link. Show source lineage and whether work is a draft or verified delivery.
- If a task changes existing files, show preview of exact files/operations and require the designated approval boundary; no silent overwrite/dispatch.

### R.2 Developer/Pro mode

- Workspace kind, Work Context identity, concrete Runner/cloud placement, scoped capabilities, source and output identities, lease/fence/generation, per-agent model/route, budget, tool receipts, checkpoint/artifact refs, failures and replay status.
- Git/worktree tabs appear only when a real Git-governed workspace is bound; otherwise replace with `Files`, `Sources`, `Artifacts`, `Changes`, `History`, `Team`, `Evidence`. A non-Git workspace MUST NOT show a fake branch/commit SHA.
- Terminal pane is optional and gated by executor capability/grant. Read-only inspect and interactive input privileges are separate.

### R.3 Three synchronized surfaces

```text
Chat (primary request / conversation / follow-up)
  ↕ shared canonical task projection
Floating Companion (compact status, notification, Needs You)
  ↕ same projection
Full Workspace / Mission Control (sources, artifacts, agents, approvals, evidence)
  ↕ same projection
Mobile/Web (durable control and resume; actual executor not on phone)
```

No Pi or Orca UI session is required. Disconnected local folders show unavailable/stale until an authorized Runner reconnects. Cloud-managed work can continue without a personal PC only when real cloud placement, source materialization and policy grant are present.

### R.4 Conceptual user experience (not implemented)

```text
SmartAIHub Chat
Workspace: [Personal Reports ▼]       Execution: [Auto ▼]
Prompt: "Read the selected sales sheets, find anomalies,
         prepare a report and an executive presentation."

Plan preview: 3 steps / 2 agents / Read selected inputs / Create new outputs
Placement: Approved Cloud Runner      Credit cap: 25 credits
[Start authorized task]

Task timeline:
1. Analyst (Native)     ✔ evidence-linked anomaly table
2. Writer  (Native)     ▶ report draft from approved analysis
3. Independent check    ◻ waiting for verified draft

Files | Sources | Artifacts | Task History | Approvals
Result: Report.pdf (draft) · Executive.pptx (draft) · Source citations
```

The screen is a conceptual wireframe and does not assert any UI capability exists now.

## S. Implementation sequencing / integration constraints

**Do not reorder the already-established SPEC-224 protected E2E priority.** R1.2 adds the following scoped packages, after G0 discovery and compatible with the R1.0 G0–G7 and R1.1 M0–M7 sequencing:

- `W0 — Ownership + non-Git journey inventory`: inspect actual authenticated SmartAIHub Chat, WP1 `chat.runOnRunner`, WP2C0/1/2 Desktop transport and auth, SPEC-269 assistant/workspace concepts, SPEC-292 Work Context, SPEC-278 Runner workspace, existing Library/artifact APIs, SPEC-279 command ingress, actual Gateway and credit rails. Identify missing adapters with exact file/route names. Check SPEC-310 ID across live registry/PRs/worktrees; add no premature DB migration. Document SPEC-210 Orca mandate conflict and proposed amendment.
- `W1 — Read-only Chat -> Native Work attempt (off by default)`: one authorized prompt with one selected source or ephemeral scratch, Native Gateway turn, actual canonical task/usage event and result reply; no Git/provider CLI/Orca required. Test no workspace case and valid non-Git local/cloud selection.
- `W2 — Artifact output end to end`: take bounded uploaded files, transform using approved tools and commit verifiable PDF/text/spreadsheet/report artifact to existing Library with source lineage. Verify download/preview auth and real content. No simulated artifact reference.
- `W3 — Local Folder without Git`: on Windows use existing Runner scoped folder selection, root/path policy, read-only inspection then separately gated file mutation; actual receipt and before/after/undo evidence. No implicit full-drive access. Real Windows acceptance required.
- `W4 — Non-Git Native Team`: bounded researcher -> writer -> independent reviewer and parallel-research or candidate-artifact variants under SPEC-269, canonical parent/child job and receipts; per-agent budget and artifact merge generation.
- `W5 — Cloud/mobile journey`: a user with only phone/tablet starts a general-work job against approved cloud storage/sources, cloud executor runs it, persistent deliverables accessible from Chat/Task Control; no user's PC required. Cloud placement does not imply secrets/ACL bypass.
- `W6 — Work UX`: synchronized Workspace selection and output/deliverable visibility in Chat, Companion and Full Workspace, Simple/Pro mode, explicit no-Git and offline/stale semantics. Use actual canonical read models and endpoint auth.
- `W7 — Enhanced Skills/MCP and controlled external side effects`: connected-source write, communication/calendar actions, browser/computer-use, document/media pipelines under distinct capability/approval/receipt contracts; no broad default grants. No external harness required.

Deliver each package as a small reviewable slice rather than a huge feature PR; preserve all current WP1/WP2 PR histories and protected CI. Do not silently turn a read-only desktop Chat into unlimited tool execution. `W1–W2` contract/isolated work may be performed while SPEC-224 E2E work continues, but GA and production rollouts remain gated.

## T. Additional acceptance A39–A56 (in addition to R1.0 A01–A20 and R1.1 A21–A38)

| ID | Required proof | Evidence |
|---|---|---|
| A39 | A normal Chat message starts a canonical Native general-work task **without Git/CLI/Orca** | Actual Chat ingress, task/admission + Gateway receipt, no .git/git executable dependency |
| A40 | Existing accessible Work Context/Workspace selection is explicit and authorization-scoped | Same-user selection and cross-tenant/foreign workspace negative tests |
| A41 | New non-Git personal or managed workspace is created through existing authority without repository initialization | Real backend/Library/Work Context evidence + filesystem/source inspection |
| A42 | A Chat answer-only or retrieval-only request succeeds with `workspace=none` where supported | No OS workspace allocation fixture + correctly scoped result |
| A43 | A local Windows folder without `.git` can be safely read using opaque workspace ID and per-root grant | Windows real-device file fixtures; outside-root/symlink denial receipts |
| A44 | Mutating existing local files requires distinct write authority, correct target and approved preview/rollback behavior | Before/after hashes, denied write test, mutation receipt |
| A45 | Cloud workspace persists a real report/document artifact with digest, ACL, source refs and valid download | Browser/mobile auth UAT, immutable artifact/version and restore proof |
| A46 | Connected source read access does not imply write/send/delete privileges | Gmail/Drive/MCP provider-scope negative tests and server denial evidence |
| A47 | Non-Git multi-agent research/writer/review produces a real versioned final deliverable | Canonical parent-child jobs, isolated candidates and independent check |
| A48 | Concurrent non-Git same-document writers cannot silently overwrite one another | CAS/writer generation conflict tests + safe retry/merge evidence |
| A49 | Switching source, tenant, device, workspace or output destination revalidates admission/grants | Explicit reauthorization and stale context negative tests |
| A50 | One Chat conversation can own multiple tasks without status, artifacts or cost leaking across task IDs | Canonical task association and Chat/Workspace parity tests |
| A51 | Native general-work budget includes Gateway attempts, chargeable Skills/MCP and canceled/partial outputs | Reservation, usage reconciliation and single-settlement ledger assertions |
| A52 | Prompt injection inside documents or outputs cannot expand tool permissions or exfiltrate other sources | Malicious document, hostile handoff and direct-provider denial suite |
| A53 | Native UI shows Files/Sources/Artifacts instead of fake Git controls when workspace has no repository | Actual authenticated UI UAT + screenshots |
| A54 | Chat/Companion/Full Workspace share one authoritative task status and deliverable refs through reconnect | Reconnection, stale-state, restart and read projection tests |
| A55 | Mobile-only user completes cloud general-work task without their own machine online | Real approved cloud placement and signed artifact receipt |
| A56 | No mandatory Orca, Codex, Claude or repository installation in Native Work mode; external modes remain optional and unaffected | Isolated process/tool inventory and off-by-default regression suite |

`A01–A56` numbering is cumulative; A39–A56 do not imply all acceptance requirements apply to every capability profile. Missing live Gateway usage/settlement, real Windows evidence, cloud authority, verified output or SPEC-224/SPEC-271 requirements keeps applicable profiles PARTIAL, not GA. Do not mark A39–A56 PASS on contract fixtures alone.

## U. Focused review checklist and Codex instruction

Ten **actual** review passes are required on exact source HEAD after implementation: (1) workspace/non-Git startup, (2) Chat/Work Context authorization, (3) scratch-vs-durable artifact custody, (4) source-vs-destination and side-effect consent, (5) tenant/source isolation and prompt injection, (6) non-Git concurrency/cancel/recovery, (7) delegation budget/credit accounting, (8) Windows/remote/cloud placement and portability, (9) Chat/Companion/Mission Control truthfulness, (10) canonical ownership, Orca removal from default and regression of existing harnesses. Record findings/evidence and actually repair actionable gaps. Mentioning ten topics is not ten reviews.

### Copyable implementation instruction

```text
Implement the cumulative SPEC-310 R1.2 proposal after mandatory G0 discovery.
Retain R1.0/R1.1 invariants and acceptance; resolve SPEC number first.

Product: SmartAIHub Chat -> Workspace -> Native Agent(s) -> real artifact.
No Git/GitHub/repository, Orca, Codex, Claude CLI or terminal required for
ordinary general work. Git/worktree is an optional development capability.

Reuse SPEC-269 Assistant/Team ownership, SPEC-292 Work Context, SPEC-279
command admission, SPEC-278 Workspace Session + writer fencing, SPEC-205
Runner Supervisor, SPEC-266/284 Library/evidence, SPEC-229/268 retrieval/memory,
SPEC-199/208/256 tools/skills, SPEC-207/280 accounting, SPEC-277/294 UI.
SPEC-310 owns only Native Pi-backed agent runtime, Gateway inference adapters,
versioned Pi Runtime Manager and subordinate tool/delegation integrations.

Treat SPEC-210 Orca clause as an explicit cross-SPEC design conflict:
propose a targeted amendment making Orca reference-only or optional external
adapter; do NOT install Orca or make it a Native dependency by default.

Start with a first-party Native single-agent read-only general-work vertical
slice through canonical Chat and Gateway, then a real artifact deliverable,
then a non-Git Windows folder, then bounded multi-agent general-work,
then mobile/cloud, then governed write/communications/browser skills.
No second workspace database, scheduler, orchestrator, approval, memory,
provider bypass, payment ledger or task status authority.

For every slice show exact code paths, true scope, tests, permission/tenant
negative cases, Gateway/ledger receipts, verifiable output and blockers.
Respect SPEC-224 E2E as current priority and preserve protected main.
Mark Real Windows/Cloud/UAT gates UNVERIFIED unless actually observed.
```

**Verification limitation:** Repository code/spec excerpts were inspected in the planning session (SPEC-205/210/224/269/278/279/284/292/293/294). The existence of a proposed type or UX operation is not evidence of a deployed API, database migration or functional product. SPEC-310 number remains user-assigned and subject to G0 checks against all branches, PRs, worktrees and reservations. This file is an additive proposal, not an implementation or release record.
