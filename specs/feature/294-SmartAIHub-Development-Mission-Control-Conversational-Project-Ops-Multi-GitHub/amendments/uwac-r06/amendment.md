# SAH-UWAC-2026-10-R0.6 — Cross-SPEC contract

Date: 2026-10-21 (Asia/Bangkok). Scope: normative consolidation and implementation planning; no runtime activation or production acceptance.

This contract is adopted only by the owner-specific requirements appended to existing `spec.md` files. SPEC-294 hosts the coordination documents and owns observation, not execution. Existing owners retain their identities and authorities. The [ownership and dependency matrix](ownership.md), [source audit](g0-audit.md), [gap/requirement traceability](traceability.md), [acceptance scenarios](acceptance.md) and [implementation plan](claude-plan.md) are its companion artifacts. Canonical requirement state remains in each owner's official HandOff, never these tables.

## Precedence and scope

The user's consolidation request and repository AGENTS rules bound this work. The supplied R0.6 pack is design input, not evidence that its proposed architecture is implemented. This amendment supersedes only coding-only assumptions within the adopted requirements. Existing security, economic, protected integration, release and SPEC-224 live acceptance obligations remain in force.

The R0.6 references to saved/legacy workflows, sandbox execution and a new "Why stopped? Engine" do not authorize retired systems or a new controller. Use existing capability selection, Python OpenAI Agents API runtime, `worker_jobs` plus outbox, approved Cloudflare Container isolation and existing observation reducers. Do not add a new orchestrator, scheduler, task ledger, skill registry, approval engine or Git authority. R0.4 premium UX/source-release concepts and R0.5 Scion/GitAI changeset ideas apply as constraints on existing development integration; no new product dependency or deploy lane is authorized. The same supplied file embeds R0.4 §§55–70 and R0.5 §§71–84; the scoped mappings below adopt relevant design constraints only. Their external research/benchmark claims are not verified or adopted as SmartAIHub evidence.

## C1 — Work identity, routing and conditional source

Chat, Work, Skills and Develop are activities over existing authorized records. `work_context_ref`, `work_ref`, `parent_work_ref`, canonical job/attempt/session references, acceptance references and deliverable references are additive logical metadata/projections; they do not prescribe new tables. SPEC-196/269 own goal/work meaning; SPEC-198 owns conversation conversion; SPEC-256 owns capability choice; SPEC-221 owns Skill engineering. Durable long-running execution enters the canonical job/outbox path before execution. A direct answer or single authorized function does not silently create a development run or costly composite job.

The consumer contract includes a version, tenant/principal scope, stable work/context references, profile (`GENERAL_WORK`, `SKILL_RUN`, `SKILL_AUTHORING`, `DEVELOPMENT`), optional parent/dependencies, job/attempt/session bindings, source binding, route/Skill version, acceptance/delivery references and observation time. Existing owners negotiate concrete schema changes; this document alone does not authorize a migration.

`source_binding.kind` is `NONE`, `LIBRARY_ASSETS`, `EXTERNAL_SYSTEM`, `DATASET`, `GIT_SOURCE` or `MIXED`; source references carry revisions/digests and freshness where available. Git connection/repository/branch/worktree fields are optional. `NONE` is valid. A non-Git task has Git applicability `NOT_APPLICABLE`, never a Git health failure. An unavailable applicable Git source is `UNKNOWN`/unavailable with a reason. Local-only results disclose their recovery limit.

A source change requiring development policy creates an explicitly bound development child through SPEC-218/224; a general report or executable Skill does not enter SPEC-224 merely because it uses files or Python. Platform source changes always retain the repository's source and integration policy. Parent acceptance is the requested outcome, not an agent's turn end or one merged child.

## C2 — Lifecycle and delegation

Keep lifecycle, health and delivery separate, mapping existing canonical states without replacing their transition engines. Lifecycle distinguishes planning, queued, running, waiting, verifying and terminal states; health describes needs-input, authority, dependency, resource/quota, disconnect, suspected stall or unknown. Delivery is typed by output; integration/release status applies only when relevant. Preserve original state and mapping version for lossy normalization.

Parent-child bindings retain actor, tenant, work context, objective, acceptance, selected capability, attenuated permissions/budget, dependency/return destination and durable command/job receipts. A session can serve multiple work items only with explicit bindings; a work item can span multiple sessions. A disconnected/finished session cannot close siblings or parent. Resume/retry requires fresh authority and canonical idempotency/fencing; return delivery and cancellation propagate through existing owners.

## C3 — Authorized commands and provider capabilities

Chat, Task Control, Mission Control and external agents use the existing action/command authorities. SPEC-226/220 govern user/client action mapping and authorization; SPEC-279 governs agent-originated command ingress/delegation and routes into the same applicable domain mutation authority. SPEC-207/280 and existing policy decisions govern economic effects. No read-model or UI owns transitions. Reuse an exact valid autonomous non-production policy decision; no extra human gate where existing policy authorizes the action. Production, IAM and trust permissions retain their existing boundaries.

Every mutation binds principal, tenant, target/context generation, operation, scope, policy/budget decision, idempotency identity, preconditions and expiry. Revalidate before dispatch/side effect. Commands expose requested/accepted/applied/rejected/unknown states through receipts; a click or transport ACK is not proof of applied cancellation or completed external action.

SPEC-200/205/206 adapters negotiate observed provider capabilities, account route, supported controls and continuity. An unsupported pause/resume/steer action is disabled with a reason. User-pinned harness/subscription routes are honored or explicitly unavailable; no silent paid fallback or credential extraction. Python OpenAI Agents API remains the backend agent runtime, and approved direct external workers remain adapters to the existing job control plane.

## C4 — One event and evidence projection

SPEC-294 consumes existing events/receipts, including general work, Skill invocation/release, delegation, Runner/provider sessions and optional Git/build/release. Task Control and Chat use the same authorized projection contract. Each event has stable event/source IDs, work/context and optional parent/session bindings, tenant-safe scope, event time, observed time, source cursor/generation, normalization version, original kind/state, evidence class/reference, freshness, coverage, confidence and redaction policy. Unknown fields remain unknown.

Evidence classes distinguish canonical receipts, provider observations, Runner observations, artifact proof, external-system confirmation and derived inference. Model text cannot prove an external write or accepted outcome. Expanding an event reveals permitted provenance, reason, state, progress, evidence and its validity. Signed tokens/cursors are consistency handles, never access grants.

Stop/stall reasons distinguish waiting input, waiting policy/approval, dependency, quota, executor availability, disconnection, user pause, test/eval failure, external-service failure, quiet-running and unknown. Record reason scope, source, last liveness/progress watermarks, as-of time and next responsible actor/action. Heartbeat loss only establishes missing observation. Progress uses verified milestones or completed/known units; unknown denominators never become invented percentages.

Monitoring remains observational and nonblocking. Collector/projection/query failure cannot gate worker leases, outbox execution, integration or continuation. Mutation admission still fails closed when required authoritative state is unavailable.

## C5 — Unified responsive UX

SPEC-277 owns navigation/lenses and SPEC-287 rendered conformance. Chat is the default general-user entry. Chat can answer, start authorized Work, invoke/create/improve a Skill, or start Develop when needed; conversions retain the conversation/work context. Task Control shows active work, verified outputs, blockers and next actions. Mission Control expands across sessions/agents/harnesses/Skills, with permission-aware event drilldown.

Simple View shows plain-language status, owner, next action and output/evidence links. Developer View adds provider/runtime details and, when applicable, worktree/branch/SHA/logs/CI/diff/release evidence. "Expert" in R0.6 means this same Developer lens; lens selection grants no additional permissions. Both views and Desktop/Tablet/Mobile use the same scope, projection version/token, as-of time and outcome/blocker semantics. No Git error appears for non-Git work. Preserve existing navigation, task controls and single-function paths; avoid duplicate apps.

R0.4 UX refinement: preserve context and deep links across Chat/Task/Mission/code/build lenses without restarting a harness or changing source/target. Present verified outcome, attention-needed/uncertainty, material timeline events, changes since the last authorized cursor and evidence/next action in that order. Code/source-health and Build & Release modules are contextual to applicable work; general tasks do not acquire empty Git/release warnings. Inspector/detail must adapt to mobile rather than shrinking desktop tables. Existing component/render governance applies.

## C6 — Skill lifecycle without mandatory Git

SPEC-256 discovers/selects a capability and pins the invoked Skill/version/digest; tool execution still requires independent permission. SPEC-221 owns create/improve/evaluate/version/release/revoke in the existing registry/Skill Studio. SPEC-198 proposes deduplicated evolution; it does not create another publisher. Existing non-Git private package/artifact storage is allowed by policy; executable candidates use approved isolation, locked dependencies and reproducible evaluation. Release policies may require source governance for executable platform changes, but GitHub is not a universal Skill prerequisite.

Creation, evaluation, publication, installation, invocation and accepted result are separate facts. "Save as Skill" creates a redacted draft with input/output contract, examples and evaluation plan; it cannot silently publish or install traces. A published version is immutable and revocable by existing governance. An invocation records the loaded version and its permitted capabilities, not an implicit privilege increase.

## C7 — Non-code results and external effects

Use existing Library/R2/evidence/domain authorities for ArtifactRefs, versioned document/spreadsheet/media outputs and external record-change receipts. Bind work, artifact revision/digest, access scope, verification/QC method and result. A draft email is not sent, upload is not sharing and an attempted browser action is not externally confirmed. Missing external confirmation leaves the relevant acceptance criterion pending; do not retry an uncertain irreversible effect blindly.

## C8 — Development checkpoints and one Git integration authority

SPEC-218/224 own development execution/workspace attachments; SPEC-293 owns repository/workspace identity and freshness. Distinguish remote canonical main (with fetch/observation receipt), cached `origin/main`, local `main`, task branch/worktree HEAD, last verified main (check scope/revision/time) and observed production source SHA. A cached tracking ref is not proof of current remote state; last verified main is not automatically latest main or deployed source.

Register scoped worktrees and owner/fencing leases through existing workspace authority. Preserve unknown/dirty/in-flight worktrees. Do not reset, rebase, clean or retire another owner's work to converge. Source/content checkpoints are immutable; a protected integration receipt binds checkpoint SHA, base generation and integrated canonical SHA. Existing integration-controller is the single integration route for all sessions/harnesses, honoring actual protection and required checks. Safe independently useful checkpoints can integrate while siblings continue; serializing the merge-critical section must not serialize all work. Non-Git work does not wait for integration.

R0.5 selected-delta refinement: checkpoint metadata on existing records includes canonical work/session, immutable source/base SHA, previous integrated checkpoint, selected delta digest, allowed-write-set digest, request fingerprint and policy/proof references. An integration attempt binds original source, exact effective candidate tree, expected remote head, governance/access generation and actual merged SHA. Admit only the non-integrated delta; preserve original→effective→merged lineage after squash/cherry-pick. Patch-id alone cannot prove semantic equivalence. Duplicate delivery after a lost response reconciles provider ref/PR/receipt to MERGED, NOT_MERGED or UNKNOWN before retry, rather than applying a checkpoint twice.

MAIN_ADVANCED observations notify active sessions to refresh source health and sync at a safe point; they do not reset/rebase those worktrees. A disjoint accepted checkpoint can integrate while another conflict repairs. Optional bounded batching is a later existing-controller policy, disabled unless explicitly authorized, dependency-compatible and checked against the combined exact tree. It cannot bypass actual protected-branch PR/check/merge-queue requirements; current repository policy still determines whether a PR is required.

AI conflict repair, if later authorized, remains a proposed scoped patch until independent exact-effective-tree checks pass. Risky resolver/verifier execution uses approved Cloudflare Container isolation without production credentials or cross-tenant source access and bounded network/budget rights. No new Graft/Scion service is required. The source-health/"Source Guardian" view is diagnostic over existing facts, never Git mutation authority.

## C9 — Build, release and runtime provenance

SPEC-295 consumes SPEC-293's authorized immutable source; existing builders/releases remain execution authorities. Every applicable release build records repository identity, authorized source SHA, canonical/source observation generation, required integrated ancestors, build method (`LOCAL` or `GITHUB_ACTIONS`), builder/workflow revision, run identity, toolchain/dependency locks, input/config/secret-reference digests, artifact digest and verification results. A mutable branch/tag alone is insufficient. Remote runners check out the exact admitted SHA, and local and remote builders emit the same provenance meanings; unsupported remote proof is explicitly unavailable.

Build-passed, published, deployed and serving-verified are separate claims. Promotion rechecks policy, allowed source, digest and target/environment; runtime evidence identifies deployed release, observed component source SHA/digest, health/readiness, observation time and rollback result. No session/harness creates an alternative deploy path. A failed CI/build/deploy records phase, exact source, failed check, affected scope, resource classification and bounded recovery/rollback evidence. Never fabricate production evidence or auto-release on this document's integration.

Build intent distinguishes an authorized preview from a release build. A preview may test an admitted task snapshot and must be labelled unintegrated; it cannot become a canonical release artifact by renaming. Local and remote release builds retain the same admitted immutable-source/provenance rules. Automatic source revert is disabled unless the existing authority explicitly authorizes the exact action; post-merge repair and rollback preserve unrelated accepted work and failed-attempt receipts.

## C10 — Acceptance and rollout boundary

Existing requirement ledgers remain authoritative. The traceability matrix records source-review status separately from runtime acceptance. `IMPLEMENTED` means the explicitly named inspected source capability exists; `PARTIAL` means only some requested behavior exists; `SPEC_ONLY` means normative coverage without demonstrated implementation; `MISSING` means absent within the recorded search scope; `BLOCKED` requires an identified authority/dependency boundary; `UNVERIFIED` means evidence is insufficient. None implies production acceptance.

Implementation uses owner-scoped work packages, compatibility fixtures and additive rollout on existing flags/policy. No retired route, second authority, schema migration, costly execution or production deployment is authorized in this phase. SPEC-224's current blockers, grants, live criteria and continuation remain intact; a documentation amendment cannot close them.

## C11 — Normative refinements from fifteen gap reviews

These refine C1–C10 without moving ownership. They apply only within the adopting owner's scope and its existing authority. Each maps to a reviewed source/acceptance row in [review-log.md](review-log.md).

- C11-01 (Ownership): Document identity does not certify runtime; retain raw duplicate diagnostic and historical bytes.
- C11-02 (UX): Declare field-level snapshot/live coverage and never silently present live state as a historical snapshot.
- C11-03 (General Work): Use profile-conditional bindings; mixed inputs declare Git applicability per development child/output, not by parent label.
- C11-04 (Skills): Bind evaluation to candidate/package and evaluator version; edits invalidate old eval, rollback/revoke retain prior immutable versions.
- C11-05 (Multi-Agent): Enforce cycle/depth/fanout and aggregate reservations via existing authority; duplicate child/result/settlement cannot multiply credit or close parent.
- C11-06 (Session Lifecycle): Resume from durable work/job/attempt and confirmed checkpoint, rebind new session with fresh grant and account capability; never treat process restart as completed work.
- C11-07 (Git): Use configured remote/canonical_ref per repository; last verified main binds check set and source, not assumed latest or production.
- C11-08 (Merge): Guard exact checkpoint head and current base/protection generation at mutation; record integrated commit ancestry and invalidate only affected check evidence.
- C11-09 (Build/Deploy): Promotion rechecks provenance and scoped source policy; config references are redacted digests, artifact secrets excluded; component serving mismatch cannot be hidden by build success.
- C11-10 (Security): Apply current ACL/redaction before counts and dereference; remote transcripts/Skills/logs never provide executable instructions or credentials to controls.
- C11-11 (Billing): Reserve/settle through existing economic ledger once by canonical effect/call identity, carry funding/currency/units and corrections; unknown consumption is not zero or a billable estimate.
- C11-12 (Multi-Tenant): Bind tenant/principal/context policy epoch in observations; reauthorize at query, aggregation, drilldown and mutation, with no hidden-scope counts/inference.
- C11-13 (Cross-Device): Keep lens preference separate from scope; invalidate cached cards/links on tenant or permission change and disclose inaccessible local-only outputs.
- C11-14 (Recovery): Prove monitor outage noninterference with continuing job/event watermarks; reconcile uncertain effects before retry and retain failed-attempt/rollback lineage.
- C11-15 (Production Acceptance): Receipt assertions remain scoped to exact source/target/method/time; integration/build/publish/deploy/serving are independent and production remains NOT_RUN here.

For the 50-session acceptance fixture, predeclare a representative non-production target and resource profile, then measure p95 authorized list/detail latency ≤2 seconds and event visibility ≤5 seconds at the declared load; errors and unavailable sources remain explicit. These are proposed acceptance budgets, not measured performance claims. Product owners may revise budgets through existing SPEC277/294 acceptance governance before execution.
