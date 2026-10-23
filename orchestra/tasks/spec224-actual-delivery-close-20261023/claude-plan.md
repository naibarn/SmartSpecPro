# Implementation Plan — SPEC-224 Actual Delivery Closure

## Approach

Continue from current canonical `main`; retain prior integrated code. Close concrete product/runtime gaps first, then exercise the same owned app through disposable infrastructure. Keep build, release and deployed acceptance as separate evidence. Use existing DevelopmentRun, worker_jobs/outbox, Gateway, artifact storage, App Identity, repository provisioning and release controls.

## Requirement ledger

## Current closure status at `origin/main` (`026f958abe0ee2319cd8e097d62903703c3346a6`)

The handoff inventory contains 1,280 requirements: 1,268 `OPEN/UNVERIFIED`, 9 `PARTIAL`, and 3 `BLOCKED_TRUE_EXTERNAL`. The Personal Mini-App work below covers the 12 rows reconciled for this delivery path; it does not certify the remaining SPEC-224 inventory. Canonical handoff validation is structurally valid but `completion_eligible=false` because the Spec-wide authority/reconciliation/lifecycle, open requirements, and required evidence are unresolved.

| Mission gap | Current status | Remaining closure evidence |
|---|---|---|
| 1. Trial milestone | Preview and verification-pending projection are implemented and tested. The independent receipt validator exists, but no trusted verifier invokes it. | A real independent browser receipt bound to appId, URL, and deployed artifact digest; only then record `USER_TRIAL_READY`. |
| 2. Repository ownership | Managed repository provisioning and source snapshots exist. User-owned GitHub binding is not implemented or configured; no existing account-connection authority is available in this runtime. | An existing authorized app-owner GitHub connection or managed repository token, then a durable per-app repository binding. |
| 3. App Home | Owner-scoped `/miniapp/{appId}` project home, progress/error/history projection, continuation, and sandboxed last-known-good preview exist. | Real browser evidence for initial creation, source/artifact availability, failure retention, and continuation. |
| 4. Two development paths | Personal apps use hosted worker execution; platform self-development remains Runner-admitted. | Focused profile regression evidence is present; retain Runner/source-trust protections and verify no cross-profile regression in required CI. |
| 5. Resume without restart | Continuation preserves appId and carries forward source/repository/artifact references into a linked DevelopmentRun. | Prove a real retry after worker interruption preserves source, artifact, repository, and observable build history for the same appId. |
| 6. Hosted execution | Disposable PostgreSQL worker/outbox retry, recovery, and settlement lane passes; its stage is synthetic. | A real authorized non-production Gateway run, provider receipt, source snapshot, artifact storage/binding, and settled job. |
| 7. Core deployment | Existing guarded Linux release workflow is available; current runtime serves `26640e87162576a1505e02a026cc35a846eb8517`. | Authenticated sudo release using the required integrated revision, followed by served-SHA and HTTPS verification. Current `sudo -n -v` reports that a password is required. |
| 8. User acceptance | No expense tracker appId or live trial exists. Unit and worker-lane checks are not user acceptance. | Run the supplied real prompt, then owner/second-identity browser checks for actions, totals/chart, reload, mobile usability, privacy, and prior-artifact retention. |

The following sections are an execution plan with truthful incomplete predicates, not a statement that all four sections or SPEC-224 are accepted. Continue independent engineering and scoped verification; resume the external paths as soon as their exact existing authority is available.

| ID | Requirement | Current evidence | Work / completion evidence |
|---|---|---|---|
| R1 | Personal milestones distinguish preview from trial acceptance | Durable state has statuses and deploy/smoke transitions; trial transition is not wired in the personal profile | Section 01: configure a trusted transition path and tests proving missing browser evidence stays VERIFICATION_PENDING and valid independent evidence can produce USER_TRIAL_READY |
| R2 | Per-app repository ownership modes and durable source binding | Managed GitHub provisioner and snapshots exist; user-owned mode is not demonstrated end-to-end | Section 01: reconcile supported ownership input, validate owner/repo permission, persist repository URL/revision and retry state; prove no Core repo fallback |
| R3 | App Home always shows latest partial/failed/successful state | Route returns App Home and last-known-good iframe; unit tests cover response shape after fixture repair | Section 01/03: verify identity, status, job/stage, errors, history, source, artifact, continuation and failure retention |
| R4 | CORE_DEVELOPMENT stays Runner/core-bound; ISOLATED_APP_DEVELOPMENT stays app-repo-bound | Separate profiles exist; ensure no cross-path regression while updating repo/milestone contracts | Section 01 tests both profiles and protected Runner admission |
| R5 | Same-app continuation preserves identity, repository, workspace/source history | Same appId continuation and source snapshot tests pass | Section 01/02: real retry uses original appId and app repo/source history |
| R6 | Actual hosted generation and artifact path uses worker_jobs/outbox + Gateway | At `24e252092c95fd9b71018deed5b1cf0c03eaa909`, the dedicated disposable PostgreSQL worker lane proves outbox dispatch, cross-process retry/recovery, and settlement. Its model stage is synthetic; no actual Gateway call, provider receipt, or bound app artifact exists. The trial `web.env` points its control plane at loopback port 1 and has no model provider key. | Section 02: use an authorized hosted non-production Gateway/runtime and test tenant, record the actual provider receipt, source/artifact digests, and owner-bound binding; repair any code defect exposed |
| R7 | Expense tracker works at the canonical route | No app exists; generated runtime supports static HTML/JS/CSS and isolated storage bridge | Section 03: actual model prompt, add income/expense, totals/chart, reload persistence; mobile viewport |
| R8 | Private owner access and unauthorized denial | Owner scoping tests and server-side denial check exist, no real app bytes checked in browser | Section 03: owner browser session can render and second test identity cannot fetch bytes |
| R9 | Build and deploy current Core once | Production SHA is `26640e...`, canonical SHA is `cb3ca...`; no current canonical artifact; sudo asks for interactive authentication | Section 04: build exact current SHA when resource evidence permits, use existing release controller, verify deployed SHA and HTTPS route; leave operation pending if the authorized sudo session is unavailable |
| R10 | Evidence is truthful and no retired system/security bypass | Existing AGENTS and pipeline contracts apply | Every section records exact SHA, scope, target, receipts and limitations; never downgrade required checks or claim a missing result |

## Section 01 — Contract and continuation correctness

Inspect current factory pipeline, durable state, executor, runtime, App Home projection, identity and repository services. Wire the trial milestone to an existing trusted independent-browser evidence input; do not let server smoke or mere preview availability claim USER_TRIAL_READY. Keep PREVIEW_AVAILABLE visible even if browser verification is absent. Complete durable managed/user-owned repository bindings using existing GitHub integration and app snapshot store; do not add a second repository registry. Ensure failures keep prior artifact/source and resumption reuses appId and repository. Add regression tests for both factory profiles, lifecycle transitions, repository modes and failure/resume behavior.

## Section 02 — Disposable live hosted execution

Use a clean canonical checkout and a disposable PostgreSQL database using the repository's supported schema/migration path. Make runtime bootstrap suitable for the non-production Mini-App acceptance profile without pointing at production or enabling unrelated legacy systems. Verify authenticated Start creates an App Identity and worker job/outbox record, registered worker executes the personal hosted stage via SmartAIHub Gateway, and real receipts/source/artifact bindings are persisted. Use only existing authorized non-production Gateway and GitHub credentials/policies. If an environment variable, provider credential or tenant policy is absent, diagnose it and use an existing authorized test configuration; do not invent authority or substitute fixtures for the final model run.

## Section 03 — Real user journey and private preview

Run the exact expense-tracker prompt from an existing authorized non-production account. Open `https://smartaihub.app/miniapp/{appId}` only after the deployment exists; during development use the registered non-production origin and real browser. Verify each action and totals/chart, storage after reload, mobile viewport, owner access, and denial for a second identity. Trigger a bounded failure/continuation and prove old artifact/source remains while the same appId resumes. Capture scrubbed evidence references and actual URL; never place credentials/tokens in evidence.

## Section 04 — Release and final verification

Fetch/reconcile canonical main and identify exact candidate. Record resource evidence; wait/retry builder only after capacity recovers or the builder storage strategy changes. Produce immutable `build:canonical` artifact for the exact candidate. Check existing release status and preserve rollback candidate; invoke `release:web:linux -- --required-integrated-revision <sha>` only through its existing sudo-gated controller. Verify release receipt, backend/frontend runtime SHA, HTTPS route, authenticated preview and unauthorized denial. Production deployment authority is not broadened by this plan; if this execution context lacks an authenticated sudo session, preserve the artifact and state the exact operator action once while completing all independent work.

## Execution order

1. Section 01 (code contract gaps and focused tests).
2. Section 02 (isolated live worker/Gateway execution; may expose fixes feeding section 01, which are integrated promptly).
3. Section 03 (real owner/browser acceptance; fix and integrate every issue, then repeat journey).
4. Section 04 (exact build, standard release, deployed Final Verify).

## Scope exclusions

Do not redo Development/Production authority decoupling, broad SPEC-224 architecture, production database migrations, platform Source Trust certification or Windows Runner acceptance unless a concrete dependency for this personal app path is proven. Do not create a new SPEC, policy/approval engine, app registry or test fixture as a replacement for actual generation.
