# TDD Plan: Feature 124 Smart AI Hub Worker App

This document mirrors `claude-plan.md` and defines tests to write before
implementation. Test descriptions are stubs, not full implementations.

## Shared Contracts And Feature Flags

Test files:

- `apps/web/shared/__tests__/workerRuntime.test.ts`
- `apps/web/shared/hyperframes/__tests__/runtimeApiSchemas.test.ts`
- `apps/web/shared/hyperframes/__tests__/contracts.test.ts`
- `apps/web/shared/__tests__/featureFlags.test.ts`

Tests to write first:

- Test: `workerRuntime` accepts `hyperframes_final_composite` job type.
- Test: HyperFrames final composite progress stages are valid and reject unknown
  stages.
- Test: HyperFrames final composite failure codes are valid and reject unknown
  failure codes.
- Test: capability hints include `hyperframes-final-composite`,
  `official-hyperframes-runtime`, `browser-render`, `thai-fonts`, and
  `ffmpeg-probe`.
- Test: final composite worker input schema requires composition/timeline
  hashes, template/version, asset manifest, and output requirements.
- Test: feature flags default fail-closed for worker final composite.
- Test: existing 300s final and 30s shot limits remain enforced.

## Scheduler

Test files:

- `apps/web/server/services/__tests__/workerSchedulerService.test.ts`
- `apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts`
- `apps/web/server/services/__tests__/hyperframesFeatureAccessService.test.ts`

Tests to write first:

- Test: `queueDesktopHyperframesFinalCompositeJob` inserts a `worker_jobs` row
  with runtime type `desktop_zeroclaw_managed`.
- Test: scheduler is idempotent for same tenant/run/composition/template/runtime
  hash.
- Test: scheduler returns existing active job instead of creating duplicates.
- Test: scheduler rejects when worker final composite feature flag is disabled.
- Test: scheduler rejects disabled/draining preferred worker.
- Test: scheduler does not require a preferred worker in normal Storyboard
  Review flow.
- Test: scheduler includes credit reservation metadata based on full duration and
  shot count.
- Test: credits are reserved on durable queue creation and not captured before
  server verification passes.
- Test: queued cancellation releases/refunds reservation according to policy.
- Test: worker/upload/verification failures reconcile billing as failed output,
  not completed render success.
- Test: scheduler records priority/fairness/quota metadata for deterministic
  claim ordering and monitor explanations.
- Test: one user can submit multiple queued jobs without serializing all jobs
  unless tenant policy requires it.
- Test: no eligible worker leaves job queued/blocked without server render
  fallback.
- Test: custom/manual storyboard project can queue without marketplace product
  lookup.

## Claim, Lease, Attempt, And Watchdog

Test files:

- `apps/web/server/services/__tests__/workerRegistryService.test.ts`
- `apps/web/server/routes/__tests__/workerRuntime.test.ts`
- new `apps/web/server/services/__tests__/workerStallWatchdogService.test.ts`

Tests to write first:

- Test: eligible worker with HyperFrames capability claims queued final
  composite job.
- Test: worker without HyperFrames capability cannot claim the job.
- Test: claim response includes `leaseOwnerToken`, `assignmentAttempt`, asset
  manifest, and output requirements.
- Test: progress events require increasing `sequenceNumber`.
- Test: HyperFrames progress events require both `leaseOwnerToken` and
  `assignmentAttempt`.
- Test: stale lease token is rejected.
- Test: stale assignment attempt is rejected after reassignment.
- Test: user can request reassignment only after the configured slow threshold.
- Test: heartbeat response can return cooperative stop commands for reassignment
  or timeout.
- Test: worker `cancel-ack`/`transfer-ack` releases or requeues only the active
  assignment attempt.
- Test: watchdog requeues abandoned/stalled job after configured hard threshold.
- Test: repeated stalls move job to an operator-required or failed state.
- Test: max attempts move a job to failed/dead-letter state without accepting
  stale uploads.

## Artifact Upload And Server Verification

Test files:

- `apps/web/server/services/__tests__/workerArtifactService.test.ts`
- `apps/web/server/services/__tests__/workerRegistryService.test.ts`
- new `apps/web/server/services/__tests__/hyperframesWorkerVerificationService.test.ts`
- `apps/web/server/services/__tests__/hyperframesLibraryFinalizeService.test.ts`

Tests to write first:

- Test: expected HyperFrames artifact types initialize upload sessions.
- Test: large HyperFrames final videos can use signed direct/multipart/chunk
  upload sessions without bypassing worker artifact attempt checks.
- Test: artifact completion rejects stale assignment attempts.
- Test: expired input manifests cannot be reused by an old attempt.
- Test: incomplete uploads are eligible for cleanup.
- Test: stale attempt artifacts are rejected and cleaned or quarantined according
  to policy.
- Test: sanitized log bundle redacts tokens, signed URLs, local paths, and raw
  composition HTML.
- Test: outputs produced by diagnostic smoke runtime or ASS/FFmpeg fallback are
  rejected as final composite artifacts.
- Test: verification rejects missing final MP4.
- Test: verification rejects hash mismatch.
- Test: verification rejects wrong MIME type or size outside policy.
- Test: verification rejects duration/aspect/fps mismatch beyond tolerance.
- Test: verification requires runtime doctor and probe reports.
- Test: verification records report in worker job output.
- Test: Library publish is called only after verification passes.
- Test: verification failure leaves user-readable safe error and does not
  publish output.

## HyperFrames Projection Bridge

Test files:

- `apps/web/server/services/__tests__/hyperframesRenderService.test.ts`
- `apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts`
- `apps/web/shared/hyperframes/__tests__/storyboardReviewState.test.ts`

Tests to write first:

- Test: queued worker job maps to HyperFrames status `queued`.
- Test: claimed/running worker job maps to rendering/progress projection.
- Test: uploading/verifying worker events map to user-readable status.
- Test: completed verified worker output appears as primary video output ref.
- Test: failed/stalled worker job maps to actionable safe message and next
  action.
- Test: legacy outbox render job still projects correctly.
- Test: worker projection takes precedence for new final composite jobs.
- Test: projection can resolve latest job by product/run when render id is
  missing.

## Storyboard Review Submission

Test files:

- `apps/web/server/routers/__tests__/marketplaceCapture.hyperframesRuntimeApi.test.ts`
- `apps/web/server/services/__tests__/hyperframesRuntimeApiService.test.ts`
- `apps/web/client/src/pages/StoryboardReviewPage.hyperframesText.test.ts`

Tests to write first:

- Test: `createHyperframesFinalComposite` submits worker job when feature flag
  is enabled.
- Test: server render worker kick is not called in worker-enabled path.
- Test: runtime-not-ready returns blocker projection without queueing fallback
  render.
- Test: manual/custom storyboard final composite queues successfully.
- Test: page hydration preserves render job id and refetches latest projection.
- Test: render status panel links to job monitor.
- Test: user-facing error copy hides raw command output outside diagnostics.

## API Contract Plan

Test files:

- `apps/web/server/routes/__tests__/workerRuntime.test.ts`
- new `apps/web/server/routes/__tests__/workerConnect.test.ts`
- new router tests for user/admin job monitor procedures.

Tests to write first:

- Test: worker register accepts HyperFrames runtime metadata.
- Test: worker heartbeat persists HyperFrames doctor summary.
- Test: canonical `/api/workers/*` and `/api/worker-jobs/*` routes are used for
  worker execution; any `/api/worker-app/*` alias delegates to the same handler
  and does not create separate persistence.
- Test: worker claim response redacts unrelated tenant/project data.
- Test: worker release route abandons claimed job safely.
- Test: worker connect start creates expiring device/user code.
- Test: Worker App connect screen never accepts SmartAIHub username/password,
  API key, manually copied bearer token, or web session cookie.
- Test: if the user is not logged in, the normal browser approval page handles
  SmartAIHub login before approval and the Worker App receives only pairing
  state.
- Test: browser approval can hand off to the desktop app through
  `smartaihub-worker://connect?code=...` when registered.
- Test: device-code polling remains the fallback when custom protocol handoff is
  unavailable.
- Test: worker connect token exchange fails before approval.
- Test: worker connect token exchange succeeds after browser approval.
- Test: token exchange returns worker-specific access token plus rotating refresh
  token metadata comparable to the Chrome extension pairing model.
- Test: Worker App automatically refreshes worker tokens before expiry and
  clears tokens on revocation/reuse failure.
- Test: token exchange binds the worker token set to one Worker App device key
  or proof-of-possession identity.
- Test: heartbeat/claim/upload/complete/refresh rejects a copied token when the
  request is signed by a different device key or missing device proof.
- Test: refresh token replay from another device revokes/blocks the connection
  and requires a new browser approval.
- Test: device proof replay with stale timestamp, reused nonce/request id, wrong
  method/path, or wrong token `jti` is rejected.
- Test: marketplace extension token is rejected by worker routes.
- Test: revoked worker connection cannot refresh or claim.
- Test: user job list returns only requester-visible jobs.
- Test: admin worker list enforces admin/tenant access.
- Test: authenticated worker routes reject cookie-only state-changing requests.
- Test: authenticated worker routes do not allow wildcard CORS origins in
  production configuration.
- Test: connect polling, heartbeat, claim, diagnostics, artifact upload
  init/complete, and MCP worker tool calls are rate-limited.

## Desktop Worker App

Test files:

- `apps/worker-app/src-tauri/tests/worker_control_plane_tests.rs`
- `apps/worker-app/src-tauri/tests/worker_runtime_tests.rs`
- `apps/worker-app/src-tauri/tests/runtime_capabilities_tests.rs`
- new Rust tests for HyperFrames worker executor/runtime pack.
- existing `apps/tauri-shell` tests only as compatibility/reference checks when
  shared worker code is extracted.

Tests to write first:

- Test: `apps/worker-app` builds as a separate lightweight Tauri product named
  Smart AI Hub Worker App.
- Test: worker app install/run does not require installing or launching the full
  `apps/tauri-shell` product.
- Test: worker app first-run connect opens browser approval and does not require
  in-app login or manual token/API-key configuration.
- Test: worker app creates and persists one per-install device key in secure
  storage and does not export it through logs, diagnostics, settings, or support
  bundles.
- Test: worker app signs worker API requests with the bound device key and
  clears tokens when the server reports device proof mismatch/replay.
- Test: worker app builds registration payload with HyperFrames capability only
  when doctor passes.
- Test: runtime doctor fails when sidecar is missing.
- Test: runtime doctor fails when Thai font check fails.
- Test: runtime doctor reports FFmpeg/FFprobe/browser/HyperFrames versions.
- Test: runtime pack includes license notices, checksum file, signature file,
  supported contract versions, and immutable version metadata.
- Test: runtime allowlist/denylist/rollback manifest blocks disabled runtime
  versions before claim.
- Test: HyperFrames executor runs event sequence in expected order for a mocked
  sidecar.
- Test: executor uploads final video, manifest, doctor report, and probe report.
- Test: executor reports failed event when sidecar exits nonzero.
- Test: executor rejects output outside workspace.
- Test: sidecar receives structured manifests and allowlisted arguments, not
  server-provided shell command strings.
- Test: sidecar does not expose a local HTTP/LAN service in the MVP worker app.
- Test: executor uses signed direct/multipart/chunk upload sessions for large
  artifacts while preserving assignment attempt validation.
- Test: executor stops sidecar safely and sends `cancel-ack`/`transfer-ack`
  when the server requests reassignment or timeout.
- Test: pause accepting jobs, quit after current job, and policy-approved quit
  now states do not orphan the active lease.
- Test: worker loop continues after idle and can stop on request.
- Test: credentials are stored/read/deleted through secure credential APIs.
- Test: Windows installer/update release gate covers install, uninstall,
  first-run connect, runtime doctor, and minimize-to-tray behavior.

## Web UI Plan

Test files:

- new client tests for user job monitor components.
- new client tests for admin worker monitor components.
- existing Storyboard Review page tests.
- browser evidence recorded during implementation.

Tests to write first:

- Test: user job monitor shows loading, empty, queued, running, completed,
  failed, and canceled states.
- Test: queued job exposes cancel action and running job does not.
- Test: request another worker action appears only after threshold.
- Test: completed job shows output link.
- Test: job detail shows progress events in order.
- Test: admin worker monitor shows online/offline/unhealthy/disabled/draining
  states.
- Test: admin pause/drain/revoke actions show disabled states and confirmations.
- Test: admin monitor shows queue depth, oldest waiting job, verification
  failure count, stale upload rejection count, reassignment count, and runtime
  version distribution.
- Test: audit trail shows connect, claim, stall, reassign, upload, verification,
  cancel, fail, and complete events with redaction.
- Test: Storyboard Review status survives query/refetch after refresh.
- Browser evidence: mobile, tablet, desktop for user monitor.
- Browser evidence: desktop/laptop/wide desktop for admin worker monitor.

## Auth And Security

Test files:

- `apps/web/server/services/__tests__/workerAuthService.test.ts`
- `apps/web/server/services/__tests__/marketplaceExtensionAuthService.test.ts`
- new worker pairing tests.
- Tauri credential tests.

Tests to write first:

- Test: worker token has worker-specific token use/audience.
- Test: worker token scopes cannot access marketplace capture routes.
- Test: extension token cannot access worker routes.
- Test: refresh token rotation revokes reused refresh token.
- Test: revocation prevents heartbeat/claim/report.
- Test: logs and diagnostics redact tokens and signed URLs.
- Test: runtime sidecar command arguments are allowlisted.
- Test: worker route scopes align with existing `workers:*` bearer checks while
  worker token claims still prevent access to marketplace/media/admin routes.

## Future Local AI Worker Plan

Test files:

- shared contract tests only in MVP unless implementation adds adapters.

Tests to write first:

- Test: local AI job schemas reserve text, vision, and multimodal job families.
- Test: provider config requires loopback URL by default.
- Test: output schema/artifact limits are present.
- Test: local AI capability families do not grant HyperFrames render capability.

## Future MCP Worker Plan

Test files:

- shared contract or MCP route tests when implemented.

Tests to write first:

- Test: MCP tool contracts use public names
  `smartaihub.worker.claim_job`, `smartaihub.worker.get_job_manifest`,
  `smartaihub.worker.report_progress`,
  `smartaihub.worker.init_artifact_upload`,
  `smartaihub.worker.complete_artifact_upload`,
  `smartaihub.worker.complete_job`, `smartaihub.worker.fail_job`, and
  `smartaihub.worker.release_job`.
- Test: MCP worker action requires tenant/user/worker scope.
- Test: MCP complete requires assignment attempt identity.
- Test: MCP artifact upload uses same server verification path.

## Rollout And Migration

Test files:

- feature flag tests.
- HyperFrames runtime API tests.
- worker scheduler tests.

Tests to write first:

- Test: worker final composite flag disabled keeps legacy behavior.
- Test: worker final composite flag enabled disables server render kick.
- Test: legacy outbox jobs remain readable after flag enable.
- Test: operator kill switch prevents new worker jobs but does not hide existing
  status.
- Test: monitoring projection reports queue depth, stalled attempts, and worker
  availability.
- Test: rollout metrics/audit events are emitted for connect, claim, stall,
  reassign, stale upload, verification, cancel, fail, and complete.
