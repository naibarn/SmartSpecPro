# Spec 224 Workspace-First Implementation Progress

Date: 2026-10-04 (Asia/Bangkok)

## Worktree and protection

- Worktree: `/home/dev/worktrees/spec224-workspace-first-20261003`, branch `codex/spec224-workspace-first-20261003`, based on `origin/main` `c9d6ae1ba64438787b6777823ec97bd547342f85`.
- The primary checkout had unrelated dirty changes and was behind `origin/main`; it remains untouched.
- Spec 224 Revision 21 is appended to the latest main version; prior resource-aware verification text is preserved.
- No retired Agency/workflow/OpenSandbox systems were used. No TypeScript typecheck was run.

## Implemented in source

- Chat binds a conversation to a trusted Runner workspace. Another authorized Chat section can select the same stable workspace and retrieve the workspace-keyed SpecSet state.
- Users can submit a prompt or multiple `.md`/`.json` files / ZIP. Intake validates bounds and safe paths, stores immutable SpecSet revisions, and preserves earlier inputs.
- The cross-file compiler emits requirement sources, work-package dependencies/readiness, validation findings, and revision impact. Fully declared independent packages can be READY while incomplete packages stay BLOCKED.
- Start uses the exact SpecSet revision shown by the preparation even if another Chat section adds a newer revision; staged files are limited to the selected package and its transitive requirement/dependency closure, with explicit size rejection before staging.
- Explicit prompt/package Start derives repository/workspace/base and SpecSet inputs server-side, stages immutable bytes, and creates a canonical DevelopmentRun awaiting the existing authorization step. It does not auto-build, test, or run the application.
- Synthetic prompt or compiled package identity is now persisted top-level through DevelopmentRun projection and agent manifest so canonical admission can bind the run to the same package identity.
- Runner gets sanitized workspace Git facts. Staged inputs are bound to the job lease/session/fence and delivered with a one-time grant over the authenticated Runner channel; Runner verifies and materializes input before provider spawn.
- Build/test/application-run remain independent user-owned actions per the user's direction; they are not implied by chat prompt, attachment, prepare, or DevelopmentRun Start.

## Verification evidence

- Backend focused suite: 10 files, 78 tests passed.
- Compiler + SpecSet service suite: 2 files, 23 tests passed, including server-derived prompt and package input resolution.
- New Spec 224 Chat UI focused cases: 4 passed.
- Full `UniversalControlPlanePanel` suite: 9 passed, 2 failed. Both failures are existing assertions for legacy Thai auth-status text and hidden workspace ID; they were reproduced against the baseline before this work.
- `runnerControl.test.ts`: 21 passed, 1 failed at credential refresh (`expected 200, got 503`). The test module loads after supplying the isolated dependency symlink, but it contains no endpoint-specific test for the new staged-input routes; the credential-refresh failure is not yet proven to be baseline.
- Runner `cargo test --lib`: 97 passed; focused `rustfmt --check` for changed Rust files passed.
- `git diff --check`: passed.

## Remaining readiness gates

1. The local candidate code is source-tested but has not yet been exercised through a live Runner process with a real authenticated Runner session/provider profile. Do not claim live runtime or deployed-server proof.
2. Full Final Verify remains explicitly fail-closed (`FULL_VERIFICATION_RUNTIME_NOT_CONFIGURED`); package-level test evidence and project-wide verification remain distinct.
3. Full verification remains deliberately fail-closed with `FULL_VERIFICATION_RUNTIME_NOT_CONFIGURED`; no passing Final Verify claim is possible.
4. Staged source retention has no TTL/GC contract yet; failed Start after pre-stage can leave orphaned prompt/spec bytes.
5. The migrations are present but not applied to a live database. `drizzle-kit generate` is blocked by the pre-existing malformed `apps/web/drizzle/meta/0149_snapshot.json`; that snapshot was not hand-authored.
6. The control-route suite has no direct staged-input endpoint coverage and has the credential-refresh failure noted above.
7. Astryx CLI is unavailable in this worktree (`@astryxdesign/cli` module is missing), so its UI discovery/build workflow could not run. No full build, typecheck, end-to-end suite, deploy, or production certification was performed.

## Current stage

IMPLEMENT / VERIFY; `stop_reason=live_runner_and_release_gates_pending`. The local source path now fingerprints the workspace, stages in an isolated candidate, enforces write sets, applies by per-path CAS, and rolls back interrupted application from a journal. Focused code proof is passing; live Runner/provider, migration, final-verification and release gates remain open.

## Completion planning

- Added `completion-roadmap.md` with six ordered waves, clear exit criteria and focused proof for each open gap.
- Resolved scope from the user's direction: build/test/application-run are independently user-operated; Spec 224 must preserve workspace continuity and truthful evidence, not introduce a second build/run control plane.
- Initial high-priority gaps are superseded by the Local Runner Candidate implementation below; remaining gates are separate live integration/release evidence.

## Orchestra continuation (2026-10-04)

- User explicitly authorized continuing implementation through completion without additional confirmation.
- Worktree remains `/home/dev/worktrees/spec224-workspace-first-20261003`; pre-existing dirty Spec 224 files are task work and preserved. Primary checkout and root Orchestra artifacts are unrelated and untouched.
- Route: large/high-risk, targeted source discovery, serial architecture/security contract, then implementation and scoped proof. Schema/migrations are conductor-only.
- Loop policy: orchestra_id `fable_style_coding_orchestra`; iteration `2/12`; tool_call_batches `11/30` (approximate); estimated_cost_usd `unknown <= 0.50`; dispatch_waves `1/6`; active_subagents `0/4`; parallel_writers `0/2`; repair_rounds `0/5`; stop_reason `active`.
- This was the pre-implementation status. See the completion update below; local dev Runner is the primary runtime and Cloudflare is a future adapter.
- Targeted impact discovery fallback: SocratiCode tools are not available in this session; used bounded `rg` and line-window reads. Existing `start_external_agent` launches with the registered workspace as working directory; pre-staged input sources have no expiry or cleanup field/contract.
- Scout batch 1: `/root/runner_isolation_scout` (read-only, required, Terra) owned no files; returned no existing safe writable candidate runtime. Local Runner writes shared workspace; approved Cloudflare Container integration has no source mount/provider/patch/CAS path; committed-tree snapshots are read-only and omit dirty/untracked state. Result is in its orchestration message; no code changes.
- Scout batch 1: `/root/input_retention_scout` (read-only, required, Terra) owned no files; returned source/attempt input plaintext persists without TTL; Start creates source before canonical worker job; retries need source until terminal. Recommended bind source to workerJobId after creation, 1h orphan grace cleanup, then terminal-only deletion of source + attempt files using existing canonical worker scheduler; reaper must lock/check job and active lease. Result integrated; no code changes.
- Both read-only scouts closed; no rate-limit or timeout.
- This earlier architecture finding was corrected by the user: existing local dev Runner is the first target, and Cloudflare is not a prerequisite. The candidate lane below replaces that blocked design.

## Continuation evidence (2026-10-04)

- Markdown-only package declarations now accept one bounded `spec224-work-packages` JSON fence in `.md`; malformed/multiple fences fail closed. UI and Spec Rev21 document the convention.
- Staged input sources now bind to canonical `worker_jobs`, reconcile a crash between job creation and binding in bounded batches, retain active/retryable source, and remove eligible orphan sources after 24h and terminal source/attempt copies after 30d. Cleanup is scheduled through Feature186 canonical jobs. Worker-job deletion is restricted while retained source still references it.
- Chat workspace query now projects durable DevelopmentRun status scoped by tenant, actor and shared workspace, allowing a second authorized section to see continuation state.
- Focused tests: 2-file router/bridge pass (13/13); compiler/staging/retention/workspace/router/timer suite pass (43/43); Rust Runner `cargo test --lib` passes (97/97). `git diff --check` and journal JSON parsing pass.
- Broader Spec224 unit run: 28 files passed, 3 files failed (3 tests), 11 suites skipped (54 skipped tests); 275 passed. Failures are in untouched baseline files: `spec224MultiSectionConformance` ordering expectation, `spec224SourceBundle` external-lock metadata expectation, `spec224DevelopmentRunPersistence` idempotency fixture. Registered Runner integration suite cannot load because `JWT_SECRET` is absent. No PostgreSQL migration application or live Runner/provider proof.
- Retention SQL reconciliation was changed to a bounded `FOR UPDATE SKIP LOCKED` batch after review found it could otherwise scan/update all unmatched rows in a transaction.
- These statements describe the previous blocked guard and are superseded by the implementation below.

## Local Runner Candidate completion update (2026-10-04)

- Runner capability snapshots now include a redacted deterministic SHA-256 fingerprint over tracked and non-ignored untracked source. Server contracts validate and pin it at Start with prompt/package mode and `allowedWriteSet` in the existing Agent manifest and authenticated Runner command.
- Local Runner now snapshots source to private `data_root/spec224-candidates`, stages governed prompt/spec inputs inside the candidate, uses Codex `workspace-write` or Claude strict shell sandbox settings, keeps provider output under Runner storage, and leaves the original workspace untouched during provider execution.
- Successful provider completion checks every candidate file change, rejects denied paths and symlinks, performs per-path compare-and-swap, and applies with atomic file replacement plus a private journal and restart rollback. A same-path user edit fails safely and keeps the candidate; unrelated edits survive.
- The temporary server denial is removed. The existing `worker_jobs`/lease/fence lifecycle remains the only durable job authority. No Cloudflare dependency or platform build/test/application-run orchestrator was added.
- Focused proof after this update: Runner `cargo test --lib` 104/104; Web Runner-contract/Spec224 compiler and workspace/manifest/dispatcher/router suites 54/54 (the router suite also reran 8/8 after its policy assertion); `git diff --check` passes. Live provider execution, migrations against a disposable database, full Final Verify and deployment have not been run.
- No TypeScript typecheck or broad build/E2E suite was run. Current scope is source-level candidate readiness; do not call it live or production certified until the separate gates above pass.

## Readiness repair update (2026-10-04)

- Corrected the stale lifecycle ledger: the source branch now includes candidate isolation, source fingerprint/CAS, enforced write set and journaled recovery; the former GAP-8/GAP-9 architecture blockers are closed in source.
- Applied Drizzle migrations 0382–0386 to the development database `smartspec` using `drizzle-kit migrate`; confirmed the six Spec 224 tables and migration ledger through timestamp `1790530000022`.
- The current `smartspec-web.service` still runs `/home/dev/projects/SmartSpecPro/apps/web` at `main` `bd61133`; it does not yet serve the Spec 224 branch. The feature branch remains `READY_FOR_HEAVY_VERIFICATION` and must go through the designated Integration Controller before the Chat flow can be live-tested.
- Live local Runner/provider smoke is assigned to the separate Runner session per the user's instruction. This progress update does not claim that smoke test has passed.
- Remaining gates: integrate the source branch into the dev runtime; finish the separate Runner/provider smoke; exercise prompt-only, multi-file/ZIP SpecSet revisions, cross-section workspace continuity and safe candidate apply/conflict recovery through Chat; then record the configured Final Verify result. Build/test/application-run stay user-operated.
- Evidence: `drizzle-kit migrate` completed successfully; read-only DB query confirmed `spec224_conversation_workspaces`, `spec224_workspace_spec_set_revisions`, `spec224_workspace_spec_set_heads`, `spec224_runner_job_inputs`, `spec224_runner_input_sources`, and `spec224_verification_leases`; systemd reports the Web service active on the primary `main` checkout.
