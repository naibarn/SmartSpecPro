# Orchestra Progress — Spec 215 Deep Plan and Implementation

## Loop policy ledger
- mode: standard-light; inline conductor plus one bounded read-only scout
- user minimum review rounds: 10
- review rounds completed: 52 / 10 minimum
- plan self-review rounds completed: 2
- implementation sections: 1 locally closed; 11 partial/in progress; 0 implementation-complete; no section commit-closed due protected dirty main
- dispatch waves: 1 scout; no implementation agents
- current stage: IMPLEMENT
- resume_from: IMPLEMENT
- stop reason: active

## Worktree boundary
- Branch: `main` (protected branch warning accepted by workflow).
- Existing worktree was dirty before this task. Relevant Spec 214/215 files include user changes; unrelated app, Python, skills, and deleted Spec 216 files are preserved.
- Current implementation stays scoped to canonical Workflow Studio/Spec 215, Feature 195/186, and specified owner surfaces. No reset, stash, broad stage, commit, push, or deploy.
- Previous completed Spec 214 Orchestra state archived safely at `.orchestra-archive/20260927T175455Z`.

## Discovery
- SocratiCode tool unavailable; targeted source reads and one read-only scout used.
- Scout: `/root/spec215_code_scout`, read-only; found dependency scheduler, durable NodeAttempt, production dispatcher, runtime-policy, human resume, and Spec 251 stale-reference gaps; completed and closed.
- Deep-plan setup: file-based session in `specs/feature/215-workflow-compiler-runtime-execution-architecture`.
- Deep-plan section manifest: 12/12 sections; coverage map includes Spec §0–76 and R4/R5 amendments. `check-sections.py` and UI/UX contract validator both pass.
- Deep-implement setup: file-based compatible backend; protected `main` and 40+ dirty paths detected. No commits/pushes will be created because tracked implementation files overlap existing user changes.
- Official docs checked only for OpenAI Agents SDK and Cloudflare queue/workflow adapter semantics; no external account/live claims.

## Evidence
- Planning files: `claude-research.md`, `claude-interview.md`, `claude-spec.md`, `claude-plan.md`, `claude-plan-tdd.md`, `sections/`.
- Implementation and convergence evidence will be appended as sections complete.

## Implementation checkpoint — 2026-09-28
- Section 01 complete locally: Spec 251 path claim corrected; retired legacy executor caller audit recorded.
- Sections 02–05 in progress: durable logical state, retry/timeout policy projection, root-only admission, fenced terminal settlement, and successor job creation through the Feature 195 gateway.
- Focused proof: durable schema/runtime/Workflow Studio router tests passed 11/11.
- Earlier `drizzle-kit check` invocation showed a snapshot-parent collision. Re-running from the repository root with the explicit config now passes (`Everything’s fine`); no snapshots were rewritten.
- Successful physical node settlement now projects fenced output and activates ready successors through the Feature 195 gateway. No durable retry outbox exists for failure in the post-completion hook window.

- Ten focused gap-review rounds recorded in `orchestra/spec215-gap-review-10-rounds-2026-09-28.md`; eight confirmed gaps fixed, remaining runtime/control-plane sections explicitly open.
- Current implementation remains incomplete: dispatcher readiness is explicitly gated because no manifest-bound adapter dispatcher is configured; settlement retry/reconciliation and Sections 07–12 remain open. No successful run is claimed.

- Follow-up implementation adds `workflowStudioSettlement.ts` plus typed job settlement hooks. Settlement requires canonical worker job success, matching physical attempt fencing generation, matching tenant/run/node/plan, and an artifact reference plus SHA-256 content digest before committing logical output.
- `jobControlPlane.complete` invokes registered settlement hooks after physical settlement; failures are logged and remain retry/reconciliation gaps because the callback is not in the same transaction as the canonical completion event.

- Follow-up gap rounds 11–20 are recorded in `orchestra/spec215-gap-review-10-rounds-2026-09-28.md`; 30 review passes completed, with the second pass fixing run-ID lookup, root redispatch, output-digest, hook-init, dispatcher-preflight, and idempotency-length gaps.
- Latest focused proof: 5 files, 67 tests passed; `git diff --check` passed.

- Section 06 now has an exact manifest-bound adapter registry and dispatcher contract; no application bootstrap registers concrete adapters, so admission remains closed.
- Final focused proof at this checkpoint: 6 files, 70 tests passed; `git diff --check` passed.

- Migration metadata validation refreshed: `npx drizzle-kit check --config apps/web/drizzle.config.ts` passes from repo root. This supersedes the earlier collision result for the current checkout.

- Sections 08–09 now include checkpoint write/read integrity, resumed artifact-ref hydration, and retry/failure/cancel state projection. Gap ledger rounds 31–40 cover checkpoint integrity, retry/cancel transitions, idempotency, and the latest 70-test focused proof.
- Final remaining code gaps: no manifest-bound adapters are registered, post-completion settlement has no durable retry outbox, graph control-flow expansion is absent, Specs 225/226 human resume is not wired, policy enforcement beyond retry/timeout is incomplete, and Sections 10–12 are not implemented.

## Resume checkpoint — 2026-09-28
- Continued in manifest order with Section 03. Compiler now rejects validly shaped but unenforced policies/scopes/instrumentation and non-data graph channels instead of silently locking them into a runnable plan.
- Section 03 implementation record and requirement-to-test matrix updated. Added workflow input schema/default/unknown-key validation, canonical input fingerprints, exact pinned-plan replay, and empty-graph rejection. Focused regression run: 4 files, 32 tests passed.
- Section 03 remains partial: exact adapter/bootstrap, live secret/binding authorization, and capability binding revision are not implemented. Sections 04–12 acceptance remains open as recorded above and in the section implementation records.
- Section 04 follow-up adds a durable compare-and-set `dispatching` state so concurrent/retried successor schedulers use one deterministic canonical job intent. A schema test path still pointed at the pre-renumbered migration; corrected it to current migration `0365` and added a check for the new status.
- Worktree remains mixed and dirty across Specs 215, 231, 245, Python, and skills; no files were reset, staged, committed, or pushed.
- The schema/migration single-writer update for Section 04 was applied serially by the conductor only; no wave was active.
- Deep-implement section artifacts now include Sections 03 and 04. Runtime input hash stability and unsupported policy/graph fail-closed cases are part of the focused matrix.
- Section 06 adapter context now receives trusted tenant/actor identity from `worker_jobs`; the focused adapter test passes. Section 08 run-level approve/reject/input and retry/resume actions now fail closed without the Spec 225 or logical-node bridge; cancel resolves all canonical job refs and requests cancellation for each verified non-terminal job.
- Latest focused cross-section suite: 7 files, 87 tests passed; `drizzle-kit check` and `git diff --check` passed. No migration was applied and root typecheck was skipped per repo policy.
- Final compiler admission review found two second-order gaps: declared defaults were not reflected in persisted idempotency fingerprints, and idempotency replay did not compare run mode/checkpoint/selected nodes/plan hash. Run persistence now uses resolved inputs and replay requires the exact pinned plan envelope.

## Resume checkpoint — 2026-09-28 (owner/runtime boundary audit)
- User authorized autonomous completion of the remaining exact-version adapters, settlement recovery, workflow input artifacts, graph control flow, cross-spec integrations, and migration/deployment/DR proof.
- Rechecked current source before attempting integrations. `workflowNodeAdapterRegistry.ts` has exact `(typeId, typeVersion, manifestDigest)` resolution but there is no production registration/bootstrap; `workflowNodeTaskExecutor.ts` and the run mutation both fail closed without a configured dispatcher.
- Feature 195 invokes `runJobSettlementHooks` only after canonical success/failure commits and deliberately catches/logs hook errors (`jobControlPlane.ts`); no durable settlement event consumer/scheduler is registered. A local retry loop or in-memory hook would not close the crash window, so no false durability patch was introduced.
- `workerArtifactService.ts` only publishes artifacts already owned by a completed worker job under `worker-artifacts/<tenant>/<job>/`; it is not an input-artifact writer/resolver and cannot safely be reused as one. Current `workflow-input:<fingerprint>` references therefore remain unresolved artifacts and the run table still stores resolved input JSON.
- Workflow Studio has persisted static DAG readiness only. Router/join/loop/subflow execution requires branch activation, iteration bounds, and child lineage absent from the current schema/runtime. Non-data channels are already rejected; the missing dispatcher keeps all workflow execution admission closed.
- Targeted source discovery did not find callable owner integrations for Specs 220/225/226/229/251 or Spec 207 in the Spec 215 runtime path. `economicDurableService.ts` provides generic durable holds but no workflow budget/intent mapping; no Spec 229 Broker runtime was found (Spec 215 itself documents this absence); 225/226 attention and resume are explicitly fail-closed; Spec 251 draft registry/owner approval remains unverified.
- No production DB/runtime credentials or deployment/DR evidence were supplied or available in this checkout. Migration metadata/local tests can be checked, but they cannot prove production migration, deployment, restore, or failover. No production action or success claim was made.
- Decision: keep workflow execution disabled until owner contracts and runtime evidence are connected. Remaining sections 02–12 are not implementation-complete; user authorization does not manufacture external owner APIs, credentials, deployed state, or DR proof. Next safe action is obtaining/locating those owner services and environments; then resume from Sections 02/05/06/07/08/09/10/11/12 in that dependency order.

## Migration dependency repair — Feature 209 / Spec 215 (2026-09-28)
- Root cause confirmed: journal omitted `0341_feature_209_workflow_studio`, while pending `0365_spec215_durable_logical_runtime.sql` altered `workflow_studio_runs` before ensuring the Feature 209 baseline exists.
- Restored 0341 in journal order between 0339 and 0342. Because databases with later journal timestamps skip newly restored historical entries, 0365 now replays the additive, idempotent 0341 baseline before its Spec 215 DDL.
- Added regression coverage for journal ordering and baseline-before-ALTER ordering. Focused migration test: 1 file / 3 tests passed; `npx drizzle-kit check --config apps/web/drizzle.config.ts` and scoped `git diff --check` passed.
- No database migration was executed. Existing Spec 215 implementation remains incomplete and uncommitted; unrelated dirty worktree paths were preserved.
- Expanded repair after the journal audit found the adjacent `0340_feature_207_economic_control_plane.sql` was also omitted. Restored both 0340 and 0341 in order and included both additive baselines in 0365 recovery before Spec 215 DDL.

## Redis retirement continuation — 2026-09-29
- Resumed the Redis retirement loop from Round 10; completed Round 11 across admin/runtime UI, queue reporting, scale-tier configuration, and auto-draft admission state.
- Current proof: Python monitoring 31 passed; focused Vitest auto-draft + scaleTier 40 passed; `git diff --check` passed. Admin overview test remains blocked by an unrelated retired Workpack Access expectation; ESLint invocation resolved to global 6.4.0 without project config and is not valid lint evidence.
- Runtime still has active project Redis/Celery containers and multiple source callers. No Docker services stopped. Continue with source-owned callers, remove retired integration surfaces, then manifests/Compose/runtime.

## Resume checkpoint — AUTONOMOUS_MINI_APP_FACTORY_PROGRAM (2026-10-08)
- Reconciled to `origin/main` and clean canonical workspace SHA `526b40b6df8e8aee730aeb7be13bca2a1120b7f1`; PRs #249–#252 merged through the retryable GitHub recovery flow.
- Read-only runtime scout found no configured non-production deployment or Cloudflare target. The local port 3000 service is production-mode/stale and was not touched. Chosen safe experiment: existing development server + loopback binding + disposable PostgreSQL + existing migration receipt and PostgreSQL-pull worker.
- Started disposable PostgreSQL 17 target `local-disposable-research-notes-uat` on `127.0.0.1` port 35645, database `research_notes_uat`, under `/tmp/research-notes-nonprod-v7e5fmbp`.
- First normal `pnpm --filter @smartspec/web run db:migrate` exited before running Drizzle: `readAppliedHead()` did not traverse `DrizzleQueryError.cause.code === 42P01` for the absent migration ledger. This is a task-caused runner defect; no migration was applied and no receipt was emitted.
- Added a failing focused test then fixed the helper. Current focused unit proof: 1 file / 2 tests passed; `git diff --check` and the migration harness Python syntax check passed.
- Next: fast-gate and integrate this isolated fix, retry normal full migrations on the same temporary DB, and continue authenticated local smoke/worker/UI acceptance without production access.
- Residual: full migration, migration receipts, test fixture, HTTP auth, background worker, provider success, responsive browser UAT, deployment target, and second-app reuse are still pending.
