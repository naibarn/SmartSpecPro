# Implementation-State and Authority Matrices

Snapshot basis: latest canonical tree `b65e1f5488880c0555556d5a0badf1e9661903ea`, targeted reads on 2026-10-05, plus the preserved original dirty checkout where noted. This is a source-state audit, not runtime/deployment proof.

## Implementation-state matrix

| Spec/component | State | Evidence / boundary |
|---|---|---|
| Spec 084 — Stateful Handoff and Durable Run Ledger | Conflicting historical proposal | `Status: Proposed`; owns a generic `run_ledger` and refers to legacy workpack concepts. Do not reactivate; reconcile historical language against implemented Spec 186/224 and repository retired-system rules. |
| Spec 186 — Job Control / `worker_jobs` and outbox | Implemented authority | Current Drizzle schema/migrations and Spec 224/278 explicitly keep job state, events, lease/fencing, approval and dispatch authority here. This task does not change it. |
| Spec 224 — Autonomous Development Orchestrator Runtime | Partial implementation | Spec describes a `DevelopmentRun` lifecycle correlated to `worker_jobs`/events/outbox and records gaps in production callers/continuation. The current task adds cross-session canonical source checkpoints; it does not replace its lifecycle owner. |
| Spec 261 — SPAAS | Partial implementation; canonical version semantics | Spec 261 §5 owns stable Application/Application Version identities and immutable released versions; §60 defines registry capability. Phase A validator is on main; registry persistence and authoring draft recovery are not proven by that package slice. |
| Spec 269 | Unknown / not located | No canonical Spec 269 `spec.md` in current main and no numbered directory found across 117 registered worktrees. Resolve reference/source in P0.4 before changing it. |
| Spec 275 | Unknown / not located | No canonical Spec 275 `spec.md` in current main and no numbered directory found across 117 registered worktrees. Resolve reference/source in P0.4 before changing it. |
| Spec 277 — Task Control Experience R1.6 | Proposed / uncanonicalized local proposal | Present in the original dirty checkout, absent from `origin/main`. It describes a read-model/presentation owner reusing 186/224/226; preserve and reconcile before implementation. |
| Spec 278 — Durable Runner Execution Sessions R1.4 | Partial / recent canonical implementation | Current `origin/main` includes durable session service/schema/Runner foundations. It owns process/session continuity beneath job authority, not Git source checkpoint integration. Runtime/provider verification remains separate. |
| Spec 281 — Mini App Knowledge Runtime R1.0 | Proposed / uncanonicalized local proposal | Present in the original dirty checkout, absent from `origin/main`; uses Spec 261 as source contract. Keep version persistence under the existing app owner. |
| P0.1 repository Skills and policy | Implemented in this PR checkpoint | Changed policy and discovery now accept partial/unmarked work. Focused tests pass; full skill audit has baseline failures listed in `progress.md`. |
| P0.5 stranded-work reconciliation | Discovered, not semantically reconciled | 84 branch-ref rows and 117 worktree rows are in the inventory; ownership/path-level classification remains open. |

## Cross-spec authority matrix

| Responsibility | Single authority for this correction | Existing evidence / unresolved point |
|---|---|---|
| Development work lifecycle | Spec 224 `DevelopmentRun` | State is projected/correlated through existing `worker_jobs`; generic non-development Work/Goal identity needs a precise cross-feature mapping before runtime implementation. |
| Git source canonicalization | Repository lifecycle with `origin/main` as shared integrated baseline | Implemented by repository Skills/policy in P0.1; no feature-owned shadow Git ledger. |
| Job state and execution authority | Spec 186 `worker_jobs`, events, leases, fencing, approval and outbox | Spec 278 and Spec 224 both preserve this authority. |
| Runner process/session continuity | Spec 278 | Session checkpoint/reattach is subordinate to current job authorization and does not itself integrate source changes. |
| Cross-session source handoff | Spec 282 proposed contract; use existing Spec 224/job/task/version IDs for persistence | Exact universal Work/Goal owner is an open P0.3/P0.4 audit item; do not add a second ledger. |
| Verification obligations | Spec 224 / existing Spec 186 resource-aware verification contracts | Results must be tied to exact integrated SHA; release/deployment proof remains separate. |
| User visibility and alerts | Spec 226 integration surface; proposed Spec 277 projection | Do not persist independent task status in UI tables; Spec 277 remains uncanonicalized pending owner review. |
| App/Mini App canonical product/version semantics | Spec 261 SPAAS | Spec 261 owns Application/Application Version and package digest/release identity. Registry persistence and accepted draft recovery still need implementation evidence; do not use the retired custom workflow engine or add a parallel Mini App store. |
| Knowledge bundle/revision semantics | Spec 266 data/evidence authority; proposed Spec 281 portable package | Spec 281 is a local proposal and not canonical. Its knowledge object revisions do not replace Spec 261 application versions. |

## Source files reviewed

- `specs/feature/084-stateful-handoff-and-durable-run-ledger/spec.md`
- `specs/feature/224-Autonomous Development Orchestrator Runtime/spec.md`
- `specs/feature/261-smartaihub-portable-ai-application-standard-v1-6-0/spec.md`
- `specs/feature/278-durable-runner-execution-sessions-recovery-fabric-r1-4/spec.md`
- `specs/feature/265-smartaihub-decision-intelligence-vertical-mini-app-platform/spec.md` (status: proposed; decision-pack/analysis versions only, not generic app source owner)
- Original dirty checkout only: Spec 277 R1.6 and Spec 281 R1.0 proposals.

Git history across available refs was also searched for `specs/feature/269*` and `specs/feature/275*`; no matching paths were found. The 269/275 references remain unresolved inputs, not an invitation to invent replacements.
