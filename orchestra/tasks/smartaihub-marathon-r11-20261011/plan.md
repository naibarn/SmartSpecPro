# SmartAIHub Marathon R11 — Working Plan

Source request: `/home/dev/.codex/attachments/6cf589f9-08f9-4285-9436-bb0323f82938/Pasted text.txt`

## Classification

- Scope: large; Spec 224 runtime, workspace authority, evidence, and integration contracts.
- Risk: high; final completion and receipt trust boundaries are in scope.
- Route: continue the accepted R11 design inline in a clean worktree; no agents or owner approval will be assumed.
- Source SHA: `d3d6e9d92bd8120049dc993977043a07c64f548c` (`origin/main`).
- WorkUnit: `SPEC224_NATIVE_POSTGRES_DEVELOPMENTRUN_FULL_SLICE`, continued as R11 canonical-delivery/final-evidence slice.
- Worktree: `/home/dev/worktrees/smartaihub-r11-canonical-delivery-20261011`.

## Evidence ledger

1. Prior resolver hang: primary checkout ran at `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978`. Its `workspace_authority.py` runs `git worktree list` without a timeout and upserts every discovered workspace; `_git_facts` runs `git status --porcelain --untracked-files=all` without a timeout. Current canonical `d3d6e9d9` bounds resolution to 15 seconds, Git calls to the remaining deadline (max 3 seconds), SQLite waits to the remaining deadline, and worktree inspection to 16 entries while skipping foreign/active workspaces. Bounded call from the clean R11 worktree returned `AUTHORITY_RESOLVED` in 0.540 seconds; registry lists 378 workspaces. Root cause: stale primary checkout executed pre-hardening code; do not repeat on primary.
2. Receipt trust: before this slice, `workspaceLifecycleEvidenceErrorCode()` validated receipt-shaped values only, and both Final Verify and worker reconciliation could accept caller/worker objects. This slice adds a read-only lookup through scoped canonical `workspace.authority.safe_action` worker-job snapshots, then retains legacy inner receipt checks for run/repository/project/target/SHA. A forged payload without a successful authority job remains WAIT.
3. Completion mode: no typed, server-resolved delivery-target policy was found in DevelopmentRun contracts or current handoff. Spec 224 R21 names the long-lived user-owned workspace as primary context. Any server-managed target that omits local convergence therefore needs explicit policy/owner approval and an immutable server-owned target binding; a worker-set metadata flag is insufficient.
4. R10 evidence remains PARTIAL and unchanged: run `69d8af56-b919-435b-ac03-7f877a4c92c7`; final verify was blocked on genuine workspace lifecycle authority. PRs #676/#677/#678/#680/#682 are merged. Current main is `d3d6e9d9`.

## Accepted sequence

1. Reconcile R10 and diagnose resolver behavior using bounded read-only evidence.
2. Preserve existing bounded resolver behavior; add tests only if a remaining canonical defect is demonstrated.
3. Add a fail-closed receipt-reader contract consumed by both direct Final Verify and worker-job reconciliation. Only authority-loaded persisted receipts may satisfy the legacy workspace receipt shape checks. Missing authority remains WAIT; do not issue or fabricate receipts.
4. Add negative coverage for fabricated/foreign/stale/missing authority evidence and positive idempotency coverage using an injected test authority. Label this service-level test as synthetic; it does not prove live Runner authority.
5. Prepare, but do not activate, the additive canonical-delivery policy proposal (`policy-proposal.md`). Keep local-workspace delivery as the current default until owner/security approval and server-owned target policy exist.
6. Run focused current-schema tests; do not run repository typecheck/build or production migrations. Inspect Runner readiness read-only. The local test DB has no trusted Runner with a fresh snapshot and lacks a DevelopmentRun table; record exact acceptance blocker rather than creating simulated authority.
7. Promote any safe checkpoint through normal guarded PR flow, update the canonical SPEC handoff with exact evidence, then scan once for a collision-free next WorkUnit.

## Out of scope / safety

- No primary-checkout mutation, migration, deployment, live Runner dispatch, external spending, receipt issuance, forged fixture authority, or worktree retirement outside newly created disposable fixtures.
- No automatic edits to historical/dirty worktrees.
- If policy approval is required, leave the weaker server-managed completion mode inactive and record the exact approver/authority needed.
