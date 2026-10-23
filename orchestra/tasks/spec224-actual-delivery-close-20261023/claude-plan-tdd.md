# Focused Verification Plan

## Section 01 — Contract and continuation

- `miniAppFactoryDurableState`: PREVIEW_AVAILABLE can be rendered before verification; missing/stale/forged browser evidence cannot set USER_TRIAL_READY; valid independent evidence sets it once and remains app/source bound.
- `miniAppFactoryRunExecutor` and `miniAppFactoryStageWorker`: personal stages remain hosted; platform profile still routes through protected Runner; stage completion and failure are checkpointed durably.
- Repository contracts: SmartAIHub-managed and user-owned modes bind only repositories authorized for the app owner; missing provisioning keeps the private source snapshot and preview; no Core repository fallback.
- Continuation tests prove same appId, app repository, source digest, previous artifact and build history are reused; build failure does not replace last-known-good.
- App Home tests assert BUILDING, preview available, verification pending, failed build with retained preview, errors, source/repository status, history and continue action.

## Section 02 — Live hosted path

- Disposable PG schema/migration integration; reject production database/runtime identifiers.
- Authenticated `startWorkspaceRun` writes App Identity, DevelopmentRun, worker_jobs and outbox atomically/idempotently.
- Worker registration and outbox dispatch execute actual Gateway generation; verify provider receipt, source digest, artifact digest, binding version and worker settlement.
- Restart/resume and bounded retry preserve one appId; unauthorized tenant/owner cannot consume or read private artifact.
- Keep unrelated baseline schema failures separate; classify OOM/SIGKILL/I/O exhaustion as resource-blocked, not code failure.

## Section 03 — Browser acceptance

- Playwright or visible browser at the app's canonical route; real model output only.
- Add income and expense; assert balances, monthly summary chart and accessible mobile controls.
- Reload and assert designed persistence; continue the same app and verify source/artifact/version history.
- Owner session reads/renders; second non-production identity is denied without receiving HTML/assets.
- Failed build leaves prior artifact usable and logs failure in App Home.
- Trial milestone changes only after independent browser journey evidence is persisted against exact app/artifact/source revision.

## Section 04 — Release

- Canonical builder candidate SHA equals integrated `origin/main` SHA; archive digest and file manifest recorded.
- Existing release preflight/rollback and required checks pass; release controller accepts exact integrated revision.
- Release status shows matching frontend/backend/runtime SHA and target identity.
- HTTPS home/login, canonical Mini-App route, functional authenticated browser journey and private denial pass after release.
- No production data mutation or manual service restart; any required sudo interaction is performed only through the existing gate.
