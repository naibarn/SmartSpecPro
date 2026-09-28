# TDD Plan: Feature 135 Hermes Grok Media Worker

Mirrors `claude-plan.md` section structure. Each entry lists tests to write
BEFORE implementing that section. Conventions (claude-research.md A7 +
Testing context): Vitest; service tests in
`apps/web/server/services/__tests__/`, router tests in
`apps/web/server/routers/__tests__/`; injected-repo pattern (vi.fn(), no
DB) for schedulers/services; fake in-memory worker_jobs table pattern
(from `inlineRenderWorker.test.ts`) for claim/tick logic; Rust in-file
`#[cfg(test)]` for worker-app. Run from `apps/web` (`pnpm test`).

## §3 Shared constants and contracts (`shared/hermesMedia.ts`)

- Test: `HermesMediaJobContract` zod schema accepts a valid image.edit
  contract with 3 references and rejects: >3 refs for image.edit, refs
  with non-continuous indices, duplicate labels claiming one index,
  contract containing a `downloadUrl` field (URLs banned at rest),
  unknown operation.
- Test: `hermesErrorCopy` returns non-empty th + en strings and a
  retryability flag for every code in `HERMES_MEDIA_ERROR_CODES` (loop all
  22 — no missing copy).
- Test: `effectiveHermesCapability` returns min(model row, manifest) for
  maxReferences; operation disabled when either side disables; model-row
  value never widens a lower manifest value.
- Test (namespace guard): grep-style test asserting no file under
  `server/hermesWorker/` or the new services imports `queueHermesWorkerJob`
  or reads `hermesAgentRuntime`.

## §4 Database schema

- Test (schema shape, no DB): drizzle table object exposes camelCase
  columns per plan; no column name matching /token|secret|password|auth/i.
- Test: partial-unique default indexes exist for defaultForImage and
  defaultForVideo with the status predicate.
- Verification step (not vitest): `pnpm db:push` applies cleanly; journal
  gains the migration entry.

## §5 Connection service + router

- Test: `listHermesConnections` returns own personal/private rows +
  tenant-wide server_shared rows; never returns another user's personal
  rows; result objects contain no token-like fields.
- Test: `startConnect` rejects when scope flag disabled (HERMES_DISABLED),
  when consentAcknowledged false, when server_shared requested by
  non-admin, when private_worker workerId not owned by caller or offline;
  resolves shared unit from `hermes_shared_worker_id` setting and fails
  (not guesses) when the setting is absent or the worker is offline.
- Test: `startConnect` happy path creates row status=pending and enqueues
  exactly one `hermes_connection_authorize` job pinned to the resolved
  worker (assert insertJob args via injected repo).
- Test: `getConnectStatus` surfaces verificationUrl/userCode/expiresAt from
  the auth job's `hermes_device_code` event; maps auth-job failure to
  typed error codes; settles the connection row on terminal job states.
- Test: `setDefault` flips defaults atomically per assetType (old default
  cleared); `disconnect` enqueues the disconnect control job and marks the
  row only after job completion.
- Router test: every procedure rejects unauthenticated ctx; admin*
  procedures reject non-admin; `getAvailability` reflects flag states.

## §6 Connection control jobs

- Test: device-code stdout parser extracts URL + code from several
  plausible Hermes output shapes (URL+code same line, separate lines,
  decorated output) and falls back to raw-line payload when unparseable.
- Test: auth handler posts `hermes_device_code` event exactly once, never
  logs the code, finishes success on authorized status, fails typed on
  timeout/denial.
- Test: probe handler produces a manifest with operations gated by
  post-auth tool availability; xAI-403 classification marks
  entitlement_restricted.
- Test: disconnect handler runs logout then removes the profile dir;
  removal failure still reports typed failure (no silent success).

## §7 Admission + scheduler

- Test: `checkHermesMediaAdmission` — per-connection running=1 blocks a
  second submit (HERMES_CONNECTION_BUSY); queued-per-user cap (8) rejects
  the 9th queued (HERMES_QUEUE_FULL); tenant shared-pool cap; sliding
  window rate limit returns retryAfterSeconds (HERMES_RATE_LIMITED);
  dailyJobQuota exhaustion (HERMES_QUOTA_EXHAUSTED); limit-coherence
  config write rejects queued-cap < 4.
- Test: full portrait batch of 4 admits in one submit under defaults.
- Test: `queueHermesMediaJob` — flags-off → HERMES_DISABLED; unauthorized
  connection status → typed reject; single-pass resolution (configured
  default that fails admission does NOT fall through to shared pool);
  shared-pool auto-pick chooses lowest queue depth with quota headroom.
- Test: fee reservation called iff scope=server_shared AND fee>0 (assert
  reserveFee spy for all three scopes); billing block present only then.
- Test: insertJob args — runtimeType equals the assigned worker's
  registered type (desktop_zeroclaw_managed for a private worker fixture,
  hermes_agent_gateway for shared), workerId pinned for private,
  capabilityRequirementsJson carries requiredClaimCapability +
  connectionId, timeout/resourceProfile differ image vs video.
- Test: idempotency — duplicate submit of in-flight contract dedupes
  (created:false); same contract after terminal failure creates a fresh
  job.
- Test: taskId returned is `hermes_<jobId>`.
- Test (claim gating, fake-table pattern): claimWorkerJob skips
  hermes_media candidates when capabilityHints lack the claim capability;
  skips candidates whose connectionId is hosted on a different worker;
  unrelated job types remain claimable in the same pass (no availability
  regression — mirror of the F133-05 remotion fix).

## §8 Task projection + credits

- Test: `getHermesMediaTask` maps every worker_job_status to the MediaTask
  status contract (queued→pending … canceled→failed+HERMES_JOB_CANCELLED);
  enforces requester ownership (foreign userId → null); completed task
  exposes resultUrl only after finalize registered the asset.
- Test: `mediaGenerationService.getTask` routes `hermes_` prefix to the
  adapter and still routes `mcp_` and gateway ids as before (regression).
- Test: `reconcileTaskCredits` hermes branch — failed shared-pool job
  refunds exactly the reserved fee once (Redis idempotency respected);
  personal/private jobs reconcile to zero adjustments; never runs
  per-duration math for hermes ids; existing mcp/gateway behavior
  unchanged (regression).
- Test: `settlePortraitCandidate` settles a hermes_ candidate end-to-end
  with a stubbed getTask (stuck-candidate recovery path included).
- Test: `finalizeHermesMediaArtifact` — re-validates checksum/mime against
  init metadata (mismatch → OUTPUT_INVALID, job failed), creates
  media_assets + library_items with lineage fields, sets publishedItemId,
  transitions publishing→completed; idempotent on duplicate completion.

## §9 Reference URL minting

- Test: claim response for a hermes job includes fresh referenceUrls for
  every assetId with ownership re-verified; non-hermes jobs unaffected.
- Test: refresh route rejects missing/expired lease token and jobs not in
  an active state; returns re-minted URLs for active leases.
- Test: worker-side download verifies sha256 and fails the reference
  (HERMES_REFERENCE_DOWNLOAD_FAILED) on mismatch.
- Test: inputJson persisted by the scheduler contains assetId+sha256 only
  (no URL fields).

## §10 Shared server worker

- Test (`hermesInvocation`): envelope is deterministic for a fixed
  contract (snapshot); argv array contains no shell metacharacter
  interpretation (prompt with `"; rm -rf` stays a single argv element);
  toolsets never include `file` by default; fallback command template
  selected when the composition probe reports `-z` incompatibility;
  inactivity + hard timeouts kill the child; cancellation escalates
  term→kill.
- Test (`outputCollector`): trust order — valid marker block wins; marker
  absent → workspace scan; then MEDIA: tag parse; then cache scan bounded
  by job time window; path-confinement rejects `../` and absolute paths
  outside workspace/cache; corrupt image (magic-byte mismatch) and
  truncated video (ffprobe stub) → OUTPUT_INVALID.
- Test (`profileStrategy`): native-profile strategy selected when
  isolation probe passes; fallback per-connection HERMES_HOME when it
  fails; profile paths never escape the HERMES_HOME root.
- Test (`jobHandlers`): media handler posts the progress event sequence
  (downloading_references → starting_hermes → generating →
  collecting_output → validating_output → uploading); artifact upload
  retries once on 401 after token refresh; per-connection lock serializes
  two jobs for one connection while different connections run in parallel
  up to global concurrency.
- Test (`workspace`): completed workspace deleted after verified upload;
  failed workspace retained then evicted after 72h (clock injected);
  disk-pressure eviction removes oldest terminal first.
- Test (`controlPlaneClient`): registration payload advertises
  hermesMedia capability gated on doctor readiness; heartbeat carries
  freeDiskBytes.

## §11 Surface integration

- Test (helper generalization): `resolveVdMediaTransportDecision` returns
  byte-identical MCP/gateway decisions for existing fixtures (run the
  existing transport-helper tests unchanged — zero regressions), and the
  hermes arm for a hermes-transport model row + hermesConnectionId.
- Test (per surface, table rows 1–10): each resolver with a hermes model
  id reaches `queueHermesMediaJob` (spy) with the right operation +
  references; each still fail-closes on empty model.
- Test (remediation row 9): `resolveEpisodeVideoModel` throws BAD_REQUEST
  on empty and on disabled selection — the DEFAULT_MODELS.video fallback
  is gone; call sites updated (episode workspace shows selection UI state).
- Test (remediation row 10): ad-banner rejects empty model
  (no DEFAULT_MODELS.image fallback) and routes hermes/mcp model ids
  through the shared helper.
- Test: VD mapping validator still rejects conflicting Image-N mappings
  before enqueue for hermes jobs.
- Test: `generateVideoClip` trims references to effective
  maxReferenceImages (grok video = 1: only the start frame survives,
  "identity before environment" order preserved for higher limits).
- Test: prompt formatter resolves `hermes-grok/grok-imagine-video` to
  family `grok`.

## §12 Model catalog

- Test: seed script upsert is idempotent and preserves isEnabled on
  re-run; hermes rows carry transport hermes_worker, distinct display
  names (assert ≠ existing kie.ai "Grok Imagine" name), disabled by
  default.
- Test: `resolveMediaModelTransportConfig` returns hermes_worker for the
  seeded configJson and existing mcp/gateway fixtures unchanged.
- Test: mediaTransportResolver rejects hermesConnectionId on a
  non-hermes model (mirror of the mcpConnectionId rule).

## §13 Client (web)

- Test (HermesConnectionPicker, RTL pattern from McpConnectionPicker
  tests): renders authorized connections filtered by assetType, auto-
  selects a single eligible, shows scope badges, offline worker rows
  disabled with reason, empty state links to settings.
- Test (panel wiring): CharacterStock/LocationStock persist
  hermesConnectionId under their own storage keys via safeStorage
  (QuotaExceeded does not crash — state-first ordering); StoryboardPanel
  prop contract forwards hermesConnectionId through EpisodeWorkspace.
- Test (EpisodePage model memory): auto-hydration fires for a remembered
  hermes model only when the row is enabled AND an authorized connection
  exists; otherwise selection stays empty and generate stays disabled.
- Test (connect panel): consent gate blocks startConnect until
  acknowledged; device-code screen renders URL/code/countdown from
  getConnectStatus; private-worker selector appears only for
  private_worker scope.
- Test (error rendering): representative codes render Thai + English copy
  and retry-after where present.

## §14 Worker App (Rust, in-file #[cfg(test)])

- Test: hermes doctor reports ready only when python + pinned hermes
  version + writable profile root all pass; version mismatch → degraded
  with reason.
- Test: dispatch arm rejects hermes job types when doctor not ready;
  `prepare_hermes_execution_plan` builds argv without `file` toolset.
- Test: claim capabilityHints include hermes_media only when advertised;
  connection-affinity re-check refuses a job whose connectionId is not
  hosted locally.
- Test: registration payload gates capabilitiesJson.hermesMedia on doctor
  status (mirror of the hyperframes gating test).
- Test (server side, vitest): registration/heartbeat processing forces
  hermesMedia.advertised=false when hermesVersion < hermes_worker_min_version.
- Test: hermes job slot accounting — 1 hermes job never blocks a render
  job slot and vice versa.

## §15 Observability

- Test: submit/claim/complete/fail emit audit events with traceId +
  connectionId; admission rejections logged with code; completed jobs
  write provider_usage_log rows (provider xai-hermes) and bump the daily
  quota counter consumed by admission.

## §16 Delivery order

- Gate per step: full `pnpm test` green + typecheck; step 4 adds the live
  smoke (fake-CLI e2e: enqueue→claim→events→artifact→finalize→getTask
  completed) run in CI with the fake `hermes` binary fixture (a small
  script emitting configurable stdout/outputs used across §6/§10 tests).

## §17 Risks

- Test (token-leak guard): CI grep test over server + worker sources
  asserting no logging of auth.json contents/device codes; diagnostics
  masking helper truncates any token-like string to 4 chars.
