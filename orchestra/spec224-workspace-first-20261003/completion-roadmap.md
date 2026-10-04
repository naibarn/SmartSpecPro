# Spec 224 Completion Roadmap

Date: 2026-10-04 (Asia/Bangkok)
Status: implementation plan; Spec 224 is not yet ready for production certification.

## Product boundary

The persistent development workspace is the user-owned source of truth. Chat sections are views over that same workspace, not separate project lifecycles. Users may add spec files at any time; each addition creates an immutable Spec Set revision, and each independently complete work package can proceed without waiting for unrelated packages. Prompt, attachment and preparation are input/planning actions. Code-changing work requires an explicit Start and existing authorization. The existing local Runner on the development server is the first supported execution runtime; Cloudflare is a later adapter/promotion target and is not a prerequisite for local development. Build, test and application run remain independently operated by the user; this task does not add a platform build/run orchestrator.

## Completion waves

### Wave 0 — Lock the scope and state model

- Reconcile Revision 21 with the user's workspace-first and user-owned build/run direction.
- Make workspace identity, workspace content revision, Spec Set revision, plan revision, DevelopmentRun and package status separate explicit concepts. A Chat section must always display which stable workspace it references.
- Define package states/evidence independently; adding a spec must not reset unrelated package state or erase workspace edits.
- Exit: one reviewed contract describes IDs, revision pinning, ownership and states across UI/API/Runner; no acceptance criterion silently requires platform-owned build/run actions.

### Wave 1 — Protect the shared workspace during autonomous changes (P0)

- Replace dirty-boolean-only freshness with a trustworthy content fingerprint covering tracked and non-ignored untracked source files. Capture it in the local Runner capability snapshot, pin that value during prepare/start and revalidate before candidate creation.
- Execute on the local Runner against a per-run candidate copied from the pinned source. The candidate lives under the Runner data root, outside the registered workspace. Providers may mutate only the candidate; the original stays unchanged during execution.
- Enforce `allowedWriteSet` against the complete candidate delta before apply. Work-package entries cover an exact file or descendant paths under that directory prefix. Prompt-only Start explicitly permits eligible source paths in the selected workspace, excluding `.git`, ignored/generated files and Runner control state.
- On success, apply candidate changes only when the target path still matches its candidate baseline. Use atomic per-file replacement and a durable transaction journal; roll back a partial apply. If a touched path changed during the run, preserve the original workspace and retain the candidate for conflict recovery. Unrelated user edits remain untouched.
- Preserve the existing workspace identity and stable location when accepted changes are applied, so later Chat sections and user build/run actions see the same continuing project.
- Never use reset/clean or overwrite user-owned edits as recovery.
- Exit: stale source is rejected; attempted out-of-set writes cannot reach the candidate result; unrelated dirty/untracked user content survives; concurrent user edit causes a recoverable conflict; failed/cancelled runs leave the shared workspace intact.

### Wave 2 — Make spec formats and incremental readiness usable

- Keep `.md`, `.json` and ZIP ingestion immutable, bounded and workspace-scoped; adding files creates a revision and produces an impact report.
- Define a documented Markdown package declaration convention so a Markdown-only spec can declare package IDs, requirement refs, dependencies, acceptance/verification obligations and write sets. Alternatively identify the required companion JSON in the UI before upload; do not silently infer execution authority from prose.
- Validate cross-file references and show per-package READY/BLOCKED reasons. Adding an independent spec later must not block or invalidate unaffected packages.
- Pin exact Spec Set + plan revision on Start; retain old run inputs and lineage.
- Exit: one Markdown-only package can be declared and run; multi-file cross references resolve; packages start independently; late spec changes invalidate only dependent evidence; UI shows active workspace/revision and package state consistently from multiple sections.

### Wave 3 — Durable input lifecycle and recoverability

- Add a source lifecycle for staged prompt/spec bytes: owner/workspace/run references, creation time, retention deadline, terminal-use state and cleanup eligibility.
- Make Start creation idempotent across retries and clean up unreferenced staged records after failed creation without deleting inputs pinned to a live/historical run.
- Define retention for historical immutable spec revisions separately from ephemeral dispatch grants. Expired grants are unusable; source deletion follows explicit retention policy and auditable cleanup.
- Add restart/reconnect handling so a running or interrupted package can be reconciled from `worker_jobs`/outbox and reattached from any authorized Chat section.
- Exit: duplicate request does not create duplicate work; crash at each boundary does not lose pinned input or leak an executable grant; GC cannot remove referenced run inputs; reconnect restores accurate per-package state.

### Wave 4 — Scoped verification and truthful readiness

- Implement the configured Final Verify adapter for the approved execution runtime, or keep execution blocked where no safe verifier is configured. It must consume the exact pinned source/spec/plan and return scoped evidence.
- Separate package-level testable/verified status from whole workspace/project/production readiness. Build and app run remain user actions; Chat may show user-provided or externally observed evidence only when its source/revision is verifiable.
- Exit: no READY/VERIFIED/complete claim without corresponding scoped evidence; stale evidence is invalidated by source/spec changes; verifier-unconfigured state is explicit and fails closed.

### Wave 5 — Focused certification and rollout gates

- Cover API authorization, workspace binding across Chat sections, intake/ZIP safety, revision races, same-key retries, source staging endpoint, lease/fence replay, freshness/CAS, write-set enforcement, failure recovery, cleanup and scoped verification with focused tests.
- Repair or clearly baseline-classify the existing runnerControl credential-refresh failure and UI baseline failures; add direct tests for the new staged-input routes.
- Resolve the pre-existing Drizzle metadata problem through the repository's supported migration workflow; apply migrations in a disposable integration database and prove clean upgrade/replay. Do not hand-edit generated snapshots to bypass generation.
- Verify Runner/provider end-to-end in an approved non-production workspace, including denial/expiry/reconnect paths. This is distinct from source unit tests and from production deployment proof.
- Run focused Rust/backend/UI suites and diff checks. Do not run repository-wide typecheck, full monorepo build or full E2E on the shared host.
- Exit: code proof, disposable DB migration proof, Runner/provider proof and rollout/deployment proof are separately recorded. Only claim the gates actually exercised.

## Dependency order and stop rules

1. Wave 0 contract review precedes edits that lock API or database semantics.
2. Wave 1 workspace isolation and freshness precede enabling autonomous package execution against user-owned projects.
3. Wave 2 Markdown declaration and incremental package behavior can proceed in parallel with Wave 3 lifecycle design once the contract IDs are fixed.
4. Wave 4 verifier must bind to Wave 1's isolated candidate and Wave 2's pinned package closure.
5. Wave 5 certifies the integrated result; live migration/provider/deployment gates cannot be inferred from local tests.

Until Wave 1 passes, fail closed on code-changing runs from the shared workspace path. Once it passes, runs can execute on the existing local Runner using current authorization and `worker_jobs`; Cloudflare is not required. Until Wave 4 passes, do not label packages verified or claim full Spec 224 readiness. Spec 213 is not a prerequisite for contract-first implementation; any live external-agent/runtime dependency must still pass its own admission and Runner certification gate.

## Verification matrix for open work

| Gap | Required focused proof |
|---|---|
| Workspace freshness/CAS | Clean, dirty and untracked source fingerprints; mutate between prepare and dispatch; mutate during run; assert reject/conflict and byte-for-byte preservation outside accepted patch |
| Write-set enforcement | Provider attempts allowed and disallowed create/edit/delete/rename/symlink paths; only allowed normalized paths enter result |
| Markdown-only readiness | Valid declared package compiles; absent/invalid declaration stays BLOCKED with actionable reason; unrelated package remains READY |
| Staging lifecycle | Failed run creation, duplicate start, terminal retention, live reference and expired grant; assert no dangling executable credential and no premature source deletion |
| Cross-section continuity | Two authorized sections bind same workspace, add later Spec revision, reconnect during run, and observe same durable package/run state |
| Runner input route | Authenticated lease/fence valid delivery, wrong tenant/session/digest, replay/expiry, and no prompt/grant in logs/events |
| Final Verify | Exact revision consumed; scoped pass/fail and stale evidence behavior; missing adapter remains fail-closed |
| Migration/live runtime | Disposable database upgrade/replay, registered Runner/provider handshake, restart/reconnect, then deployment provenance separately |

## Current status

The local Runner isolation wave is implemented and source-tested: workspace binding, safe Spec Set ingestion, incremental compilation, explicit Start, Markdown package declarations, lease-bound input staging/retention, workspace-scoped status, source fingerprint, per-run candidate, enforced write set, per-path CAS, journal rollback, and recovery references all travel through the existing Runner/job path. The dispatcher now sends the policy. Cloudflare remains future porting work. Live Runner/provider smoke, migration application, full Final Verify and deployment remain separate gates.
