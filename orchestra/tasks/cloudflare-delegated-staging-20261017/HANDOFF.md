# Cloudflare Delegated Staging Deployment Handoff

Status: staging deployment blocked by missing verified delegated authority and executor; no deployment was attempted.

## Source and changes

- Canonical source at start: `cb67dc2c3f4801ecc4dd258cc2cf06db1cb5360c` (`origin/main`, 2026-10-17).
- Credential verification PR: [#1053](https://github.com/naibarn/SmartSpecPro/pull/1053), merged as `5b51f5a8c569573affd5ad8257cf41396515ae70`.
- Test correction: the fixture provides the compatible Container target, DB, migration, recovery, and trusted qualification authorities, but its qualification expired on `2026-10-12` while CI ran on `2026-10-17`. `PENDING` was the correct fail-closed behavior. The fixture now expires on `2030-10-12`, preserving the original expected `PASS` for valid evidence.
- The Cloudflare local-readiness workflow now runs `infrastructure.deploymentTargets.test.ts` so the corrected behavior is exercised by CI.

## Existing authority inspection

- Reused source authority exists in `provider_deployment_targets` and `provider_deployment_credentials`, scoped to tenant, project, environment, and provider. The credential resolver keeps the decrypted token inside its callback.
- Exact-admin guards protect target and deployment-credential mutations. No guard was bypassed and no credential value was read.
- Existing approval integration can request approval for the separate project-wiki staging provisioning operation. Its description explicitly says approval does not execute deployment.
- The repository source has no Cloudflare deployment executor or staging deploy workflow. The old GCP staging workflow is intentionally retired; the active Cloudflare readiness workflow only performs local dry-run/build/runtime checks. No registered Cloudflare deployment runner is evidenced by source.
- Cloudflare Staging config pins `smartspec-cloudflare-staging`, `workers_dev: true`, and disabled activation, with no production routes, queues, cron consumers, or database binding. This config alone is not authorization to deploy.

## External blocker and resume condition

Owner: SmartAIHub platform administrator / Cloudflare account owner.

Required before implementation can invoke a live deploy:

1. A recorded delegated grant in the existing authority path for the exact staging target and environment, bound to an approved immutable source SHA/build artifact and rollback version.
2. An existing registered executor identity authorized for that grant and scoped credential, or explicit approval for the platform team to register one through its normal protected workflow.
3. A live target/credential binding verified by the authorized backend. The agent has no Admin session, target-record read permission, or executor receipt, so no live Cloudflare credential/permission verification is claimed.

Resume when the Admin/Control Plane shows the exact staging grant and an authorized executor receipt path. Then validate the pinned artifact, execute idempotently, capture the runtime deployment receipt, verify SPA/native Hono/fail-closed behavior, and exercise rollback. Do not report `SUCCESS` before the runtime receipt. Do not change production DNS/routes/activation, queues, cron, or database.

## Verification

- `git diff --check`: passed for the handoff update.
- Local vitest was not run because this isolated checkout had no `vitest` installation; the focused test passed in the PR's Cloudflare readiness CI.
- `Cloudflare local readiness` passed on PR head `9ba99e6f5175a3191d0d7acee5a922e0c3b70e8d`, including the focused preflight test, Wrangler dry-runs, local workerd smoke tests, and runtime contract suite.
- `Mocked SPEC-308 browser simulation` and `progressive_integration_gate` passed on that head. `build-preview` was skipped by workflow policy.
- The exact GitHub run evidence is linked from PR #1053.
- No live token probe, target lookup, Cloudflare deployment, or rollback was attempted.

## Executor implementation continuation — 2026-10-17

- Source base: `02201073e1cc9427393eb7b140a7f4de8c73f889` (`origin/main`).
- Reconciled promotion base: `d67738a92` (`origin/main` immediately before PR preparation); implementation commit: `ae7607bd54dde1555bad9b4ccc2a9ea638964860`.
- Worktree: `/home/dev/.cache/codex/canonical-sources/f29801373bfd4154c0d8/cloudflare-staging-executor-20261017`, branch `codex/cloudflare-staging-executor-20261017`.
- Added a staging-only executor registration to the existing canonical `worker_jobs` executor registry. It consumes job ID as an idempotency key, validates the exact staging target/environment, binds target and credentials through the existing SPEC-288 authority/resolver, and requires an executor identity, unexpired artifact-bound grant, immutable SHA/digest artifact, workers.dev runtime receipt, and verified rollback target. Credential-backed API errors are reduced to safe diagnostic codes before they can reach the job reporter.
- Added focused tests for missing runtime, unregistered executor, expired/unauthorized grant, tenant/executor mismatch, wrong target/environment/artifact, unsafe deployment URL, idempotent retry keys, credential denial, partial deployment failure and verified rollback. Command: `./node_modules/.bin/vitest run server/services/cloudflareStagingDeploymentExecutor.test.ts server/services/providerDeploymentTargetAuthority.test.ts server/services/cloudflareDeploymentCredential.test.ts` from `apps/web`; result: 3 files / 14 tests passed. `prettier --write` and `git diff --check` passed.
- The default code registry now exposes the job contract but intentionally has no configured deployment runtime and fails closed. Source contains no generic delegated deployment-grant authority, immutable deployment-artifact verifier, externally registered/attested Cloudflare deploy executor identity, or Cloudflare Workers deployment transport. The adapter has explicit injection points for the existing authorities; it does not implement a new grant registry, approval system, or schema. The mock tests are not live Cloudflare evidence.
- Live deployment status: **NOT ATTEMPTED**. No Cloudflare credentials were resolved, no Admin or executor authorization was inferred, and no Production configuration or database was changed.
- Required Platform Admin / owning teams action before live staging: (1) identify and expose the existing delegated-grant read authority with exact requester, tenant/project, executor, staging target, artifact SHA/digest, expiry/revocation, and rollback binding; (2) identify the immutable trusted build artifact/verifier and server-side artifact bytes/transport; (3) register and attest the staging executor identity through the existing runner registration path; (4) bind an implementation of the staging-only Cloudflare API transport; (5) confirm the existing encrypted credential and enabled SPEC-288 target are exact `smartspec-cloudflare-staging` / `staging` and least-privileged. Then run mocked integration/CI, stage only after successful target and permission probes, verify workers.dev runtime receipt, and exercise rollback.
- Resume condition: the owners make those existing grant, artifact, runner, target/credential, and transport authorities readable by server-side composition without returning secret values. Until then do not wire a caller-controlled grant/artifact fallback and do not report deployment success.

## Integration receipt

- PR [#1056](https://github.com/naibarn/SmartSpecPro/pull/1056) merged through the repository promotion workflow at `2026-10-17T11:26:32Z`.
- Merge SHA: `90eb901ffb85387270f72275d96c288a530146f9`, verified as `origin/main` and reachable from the fetched canonical ref.
- CI on PR head `05874f9fbbe22836e7879f2a8b0e7edf043da3fd`: `git_lifecycle` passed (run 39028480038); Cloudflare `local-contract` passed (run 39028480030; duplicate push run 39028453442 also passed); `progressive_integration_gate` passed (run 39028480033); Mocked SPEC-308 browser simulation passed (run 39028480043). `build-preview` was skipped by workflow policy (run 39028480024). No required check was skipped or bypassed.
- Integration scope is the fail-closed executor contract and tests. These checks do not supply the missing delegated grant, trusted artifact verifier, external runner identity or Cloudflare deploy transport; there is still no live credential probe, staging URL, runtime receipt or rollback evidence.
- Post-integration full build remains pending and belongs to the normal canonical build workflow. Live staging resume remains owned by the SmartAIHub platform and Cloudflare account teams as listed above; only proceed after their server-side authority bindings exist and are verified.

## Runtime wiring continuation — 2026-10-17

- Source: `744987eebe320b17f5dcff41fef25720e6325589` (`origin/main`); isolated branch `codex/cloudflare-staging-runtime-wiring-20261017`.
- Rechecked the deployed source authorities. `worker_job_grants` is scoped to a canonical worker job and delegated worker session, and `runner_nodes` identifies trusted device runners. No existing grant type, approval binding, registered platform service identity, or trusted SmartAIHub web build artifact is authorized for Cloudflare deployment. Reinterpreting a delegated worker grant or a Node PID-based worker ID as a Cloudflare deployment grant/identity would bypass the missing Admin authorization boundary, so the executor remains fail-closed.
- Added `cloudflareStagingApiTransport.ts`, a server-side Cloudflare Workers API transport for the exact `smartspec-cloudflare-staging` script. It verifies the SHA-256 digest of resolved bundle bytes, uploads static assets and a module-syntax version, deploys a single 100% version, verifies deployment/version metadata plus the workers.dev health URL, and rolls back only to a single-version prior deployment with matching SmartAIHub SHA/digest provenance. It hard-pins the staging account/script path and stages only the ASSETS, disabled activation, and staging environment bindings; it has no API path for production DNS/routes, cron, queues, Hyperdrive, or database changes.
- Added the transport integration test to the Cloudflare `local-contract` workflow's explicit Vitest file list after confirming that the workflow did not discover new tests automatically.
- Added focused Vitest coverage for version/assets upload, target/path isolation, digest mismatch, receipt verification, retry receipt reuse and rollback. The isolated canonical worktree has no node_modules/Vitest/TypeScript binaries. `git diff --check` passed. Node 22 strip-types import passed. A direct Node 22 mock-fetch transport smoke passed (10 mocked API/runtime requests); this is not Cloudflare live evidence.
- This transport is a real Cloudflare API implementation, but cannot be wired as an enabled runtime until the Platform Admin exposes an exact staging deployment grant (target + SHA/digest + expiry/revocation + rollback), a trusted artifact resolver with server-side bytes/provenance, and a registered/authenticated service executor identity. The existing canonical build ledger verifies source/build digests but only records an isolated build workspace path; the application has no authorized artifact download/registry path for that output. The existing Cloudflare target/credential tables and encrypted callback are available, but there is no verified live target or permission probe.
- Status: `CODE_INTEGRATION_COMPLETE` is **NOT ACHIEVED** (transport only; authority composition and trusted artifact access remain incomplete); `MOCKED_E2E_ACCEPTED` is **pending CI**; `LIVE_AUTHORIZATION_PENDING`; `LIVE_STAGING_ACCEPTED` is **NOT CLAIMED**. Do not enable this executor or report deployment success until the authority blockers above are closed. No Cloudflare credentials were resolved and no deployment was attempted.
- Resume owner: SmartAIHub Platform Admin / Runner Platform owner / canonical build-artifact owner. Admin UI must register/approve target `smartspec-cloudflare-staging`, environment `staging`, operation `workers:script:version-upload+deploy+rollback`, least-privilege Workers Scripts Read/Write scope, exact immutable artifact SHA/digest, executor identity, expiration/revocation and rollback version; the artifact/build owners must provide server-side pinned bytes + provenance through the canonical artifact authority. Resume after these records are readable by the server-side executor without secret disclosure.
