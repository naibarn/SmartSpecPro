# D3.41 Focused Execution Record

## Classification

- Intent: continue implementation from D3.40, not a new deep plan.
- Scope/risk: large / critical (cross-runtime approval and financial provisioning).
- Route: direct sequential implementation in isolated worktree; no subagents dispatched under standard light mode because explicit delegation was not requested and scoped sequential ownership is safer for DB/auth boundaries.
- Base: `98f1451c67fd2beb3a6922e72dc9b2981900f444`; clean D3.40 worktree verified. D3.35 `01a6ea96d45bb4e959b13da105eb6020922f2d76` is an ancestor of D3.40.
- New worktree: `/home/dev/projects/SmartSpecPro-spec224-d341`, branch `codex/spec224-d341-completion`.
- Exclusions: shared dirty checkout, Cloudflare source, production, paid providers, full regression, TypeScript typecheck.

## Exact implementation slices

1. Track A: make pending Python ApprovalDBService decisions reclaimable using a bounded lease on the existing Approval row; expose a narrowly authenticated claim API; add a consumer to the existing Feature 186 reconciler; continue only through existing Node continuation and job event/outbox authority.
2. Track B: add canonical tenant-scoped account/budget provisioning using existing economic tables and audit events, with existing authenticated admin boundary; initial accounts remain zero-balance. Add only a disposable-test funding fixture guarded by loopback and `spec224_*_test` database identity if needed by certification.
3. Refund/reversal: preserve no-post-capture-refund behavior until an approved accounting policy and canonical provider/rail contract exists; add fail-closed contract tests if current service exposes a request surface.
4. Track C: use this candidate from D3.40 (already descends D3.35); record compatibility and verify existing required commits by ancestry without merging Cloudflare work. Add only the missing Runner authorization tables to the isolated Spec 224 fresh-profile schema; do not alter the historical chain or Feature 245 migration files.
5. Track D: read-only scan of repository certification evidence; never inspect production.

## Ownership

| Paths | Owner | Boundary |
|---|---|---|
| `python-backend/app/services/approval_db_service.py`, `python-backend/app/api/approvals.py`, focused Python integration tests | D3.41 Track A | Existing Approval authority only; no new queue/table |
| `apps/web/server/services/spec224ApprovalContinuation.ts`, `apps/web/server/jobs/unifiedJobControlPlaneReconcilerJob.ts`, focused tests | D3.41 Track A | Existing Node continuation/job reconciler only |
| `apps/web/server/services/economicProvisioningService.ts`, `apps/web/server/routers/economicControlPlane.ts`, focused service/router tests | D3.41 Track B | Existing economic schema only; no migration |
| `apps/web/drizzle/schema.ts`, historical migrations, Cloudflare files, shared checkout | Not owned | Read-only only; D3.41's exception is the isolated `drizzle/spec224-fresh-baseline/**` profile/schema/migration solely for disposable testing |
| `orchestra/spec224-d341/**` and D3.41 certification report | D3.41 conductor | Isolated branch records |

## D3.35→D3.40 ancestry and integration

D3.40 is a descendant of D3.35. No cherry-pick/merge of the D3.35 integration commit is needed. D3.41 is branched from D3.40 and will represent the integrated candidate. Cloudflare remains an external compatibility handoff; no migration-owned paths are writable here.
