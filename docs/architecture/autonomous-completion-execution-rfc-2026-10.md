# Autonomous Completion First — Architecture & Execution Contract (RFC)

Status: **Proposed / audit-first; not implemented or certified**  
Date: 2026-10-10  
Repository: naibarn/SmartSpecPro  
Policy: non-invasive, incremental, preserve active sessions/worktrees and existing production authority.

## 1. North star

**Autonomous Completion First — Distributed Execution Second — Human Intervention Only When Necessary.**

A goal is not complete merely because agents finish tasks. Required outcome: functional deliverable, evidence-backed verification, integration into authorized target, truthful handoff and safe lifecycle reconciliation. The system should avoid leaving its own branches, PRs or worktrees for a user to clean up.

Success metric: **time to verified completion**, verified completion rate, human intervention per completed goal, blocked time, recovery and lifecycle reconciliation success; number of agents or machines is not success.

## 2. Authoritative ownership (audit, do not duplicate)

- SPEC-224: goal-to-implementation, adaptive dependency graph, autonomous repair/replan, integration, verification and Git lifecycle reconciliation.
- SPEC-267: authoritative durable job ledger, scheduler, leases/fencing, capacity and recovery; do not spawn a competing scheduler or job state machine.
- SPEC-269: goal understanding, delegation and bounded decision authority.
- SPEC-276: execution capability and sandbox/agent adapters; preserve existing runner protocol where possible.
- SPEC-226: existing task control bridge and API.
- SPEC-277: user-facing progress, machine status and exception-focused UX.
- **New numbered spec only after checking canonical registry:** cross-machine runner enrollment, secure connectivity, machine capabilities, artifacts and workspace portability. This is an execution fabric, **not** another orchestrator.

SPEC numbers are references to be verified against the repository. Do not invent a new number or status. Respect any in-flight migrations and existing canonical handoffs.

## 3. Completion contract

Each Goal has: goal_id; tenant/project/repo scope; acceptance criteria; authorized target branch and delivery environment; explicit authority envelope; budget/time limit; risk thresholds; critical dependencies; provenance/evidence requirements; and truthful terminal statuses.

Each Work Unit has: immutable identity; dependency kind (hard/soft/speculative); read/write workspace ownership; capability requirements; input/output contracts; retry/repair budget; lease and fencing identity; checkpoints; expected receipts; verification status.

Suggested goal states: `running`, `adapting`, `awaiting_external_authority` (only when no independent useful work remains), `verified_complete`, `partial_with_evidence`, `failed_with_evidence`. Map onto existing canonical state models instead of introducing a parallel enum if current models suffice.

Completion conditions: intended product behavior validated with available real execution evidence; changes integrated into the authorized target or explicitly documented non-merge deliverable; target commit verified reachable; CI checks genuinely passed where required (SKIPPED is not PASSED); owned temporary artifacts reconciled; outstanding exceptions truthfully reported.

## 4. Avoiding dead time

1. Dispatch ready independent work; prioritize critical-path progress and bounded parallelism.
2. A blocked Work Unit does not block its entire Goal while independent safe work exists.
3. Detect idle-with-backlog, circular dependencies, stale leases, repeated no-op retries, missing capability, and blocked PRs.
4. Create substantive unblock work only where it advances completion; replan and use alternate tools/runners where justified.
5. Permit interface-contract-based parallel implementation, mocks for development only, followed by real integration evidence.
6. Run integration incrementally rather than waiting for all candidate branches.
7. Keep guardrails risk-tiered: routine authorized development/test/repair proceeds autonomously; high-risk irreversible production data, secrets/privilege escalation, policy-bypassing merge, and excess spend remain authority-controlled. A single restricted action must not freeze unrelated work.

## 5. Git / GitHub lifecycle as mandatory owned work

Lifecycle: register owner + baseline + target + workspace -> isolated branch/worktree -> code/tests -> commit/push -> PR -> CI + review / autonomous candidate repair -> authorized merge -> verify ancestry + post-merge checks -> cleanup -> canonical handoff.

- One integration authority per target; optimistic concurrency / lock lease; never concurrent blind merges.
- Every owned branch, worktree, PR and artifact has durable owner, origin, lifecycle state and reconciliation attempt.
- Reconciler observes API state and local state; handles CI failure classification versus baseline; merges only when existing repository policies and permissions allow; rebase/resolve and retest within budget.
- Never auto-approve one's own change or bypass branch protection; never equate skipped checks with pass.
- Never force-push someone else's branch, delete uncommitted changes or prune unknown worktrees.
- Recovery requires validated committed checkpoint/artifact, fencing token, idempotency and outcome reconciliation; external side effects may not be exactly-once.
- After verified merge, clean only owned, inactive resources with confirmed remote state. Unknown orphan assets are inventoried, not deleted.
- Repeated conflicts or an unsatisfiable branch policy become an explicit exception; keep unrelated goals moving.

## 6. Multi-machine extension: capability, not dependency

Retain current Rust runner, control plane and Cloudflare/PostgreSQL design subject to repository audit. Runner enrolls with authenticated outgoing connection; machine capabilities, tenant/trust scope, health, availability and capacity are reported. Placement evaluates dependency readiness, CPU/RAM/GPU, tool presence, data locality, setup/transfer overhead, expected failure probability and cost. If remote placement is not beneficial or available, use one machine.

Job movement uses checkpoint + verified artifacts, **not live process migration**. Cross-machine execution must preserve tenant isolation and limit secret access. Optional Ray/Nomad/Kubernetes adapters only when real workloads warrant them; do not add them as platform prerequisites.

Reference patterns for audit (do not copy entire stacks): actions/runner (enrollment and routing), temporalio/temporal (durability), gastownhall/gastown (agent handoff/worktrees), ray-project/ray (placement), OpenHands software-agent-sdk (agent execution adapter). Check upstream license/version/security before reuse.

## 7. Required audit sequence (before changing implementation)

- Identify canonical SPEC-224, 226, 267, 269, 276, 277, registry and handoff paths; inspect their latest implementation status and active related PRs.
- Locate existing `session-finish`, `integration-controller`, `canonical-checkout-sync`, runner lifecycle, queue, task ledger, permissions and CI policies. Preserve existing behavior unless test evidence demonstrates a gap.
- Produce a capability/ownership matrix: implemented vs partial vs missing; overlap; failure modes; specific file paths; required migration; references.
- Establish baseline repo and CI state so preexisting failures are not falsely assigned to this change.
- Write/update canonical specs, including a new numbered execution-fabric spec **only after registry conflict check**, then update handoffs without claiming implementation complete.
- Implement the smallest vertical slice in a dedicated isolated worktree: a bounded goal, parallel independent tasks, autonomous repair, incremental integration, target verification, owned Git cleanup.
- Next add 2-machine Windows+Debian execution, runner disruption tests, performance comparison, then opt-in spare capacity/enterprise adapters.
- Use targeted tests; do not run unnecessary full builds on a resource-constrained Debian server. Defer optional platform/device acceptance without silently claiming it passed.

## 8. Acceptance and evidence

- Routine authorized changes: zero interactive approvals during a representative test goal.
- No unowned Agent-created PR/worktree/branch left in an untracked state at goal close.
- No deletion/overwrite of active session state; no unauthorized production operations.
- CI failure, conflict, runner loss, rate limit, context loss, Git API failure, and insufficient capacity test scenarios.
- Benchmark against one-machine baseline on same task: verified completion time, compute/API cost, idle-with-backlog, recovery, human intervention, reconciliation.
- Multi-machine is enabled only when it improves completion or reliability; speedup targets are experiments, not guarantees.
- Record evidence by commit SHA and test run, and distinguish `implemented`, `tested`, `verified`, `production-ready`.
- Unverified platform checks remain explicit, rather than forcing users to supply Safari, extra PCs or other devices for unrelated delivery.

## 9. Non-goals

No second control plane, generic workflow engine, duplicate approval service, new permanent memory keyed to legacy persona IDs, blanket cleanup of existing developer worktrees, forced cloud deployment, or autonomous bypass of high-risk external authority boundaries.

## 10. PR handoff contract

This RFC is a **safe starting artifact**, not a code implementation. Subsequent Codex changes must use their own isolated worktree and tracked PRs, reconcile branches, verify integration, and close handoffs. Do not mark the seven spec workstreams complete based on this RFC.
