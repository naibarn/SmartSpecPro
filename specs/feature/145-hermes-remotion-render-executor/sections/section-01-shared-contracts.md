# Section 01 — Shared contracts, runtime identity, flags, scopes, and additive migration

## Purpose and implementation outcome

This workstream creates the additive vocabulary that every later workstream uses. It does not route, claim, render, upload, or expose an MCP tool. Its outcome is a single set of browser-safe and Node-safe schemas for the dedicated Remotion executor, a new worker runtime identity, a typed default-off tenant flag, explicit least-privilege API scopes, and a PostgreSQL enum value that can be deployed before any dedicated executor is allowed to register.

The existing `remotion_render_video` payload, contract version, progress stages, failure codes, billing behavior, idempotency behavior, Worker App runtime identity, and existing scope grants remain compatible. In particular, this section must not copy or fork `remotionRenderVideoWorkerInputSchema`, and it must not turn `hermes_agent_gateway` into a renderer.

The key routing distinction is fixed here:

- `executionTarget` is caller input and may be `auto`, `desktop_worker`, or `remotion_executor`.
- The durable target is not that three-value input. It is the resolved worker runtime stored in `worker_jobs.runtimeType`: `desktop_zeroclaw_managed` or `remotion_executor`.
- `auto` must never be stored as the runtime type and must never be resolved again during claim, retry, reconciliation, or artifact completion.
- `desktop_worker` is an API-facing alias for the existing database/runtime value `desktop_zeroclaw_managed`; it is not a new PostgreSQL enum value.

This distinction closes an inconsistency in the parent plan, which used `desktop_worker` as prose shorthand even though the current durable schema already routes worker jobs through `worker_jobs.runtimeType`.

## Scope boundaries

This section owns schema and migration foundations only. Workstream 02 owns target resolution policy, queue insertion, claim admission, and the operator kill switch. Workstream 03 owns MCP tool registration and session authorization. Workstream 04 owns the executable package and doctor implementation. Workstream 05 owns object-level media authorization. Workstream 07 owns Redis outage policy and security observability.

Do not add scheduler branches, worker routes, MCP handlers, executor process code, platform installers, Redis keys, or storage operations here. Do not add a second job type. The only render job type remains `remotion_render_video`.

## Authoritative existing seams

Implementation must begin from the following current symbols rather than introducing parallel contracts:

- `packages/remotion-render/src/remotionRenderVideoSchema.ts` is the portable source of truth for `REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES`, `REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY`, `REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION`, `REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION`, and `remotionRenderVideoWorkerInputSchema`.
- `packages/remotion-render/package.json` already exposes the browser-safe `./render-video-schema` subpath. New executor metadata schemas added to `remotionRenderVideoSchema.ts` are exported through that same subpath; do not create a Node-only dependency in this module.
- `apps/web/shared/workerRuntime.ts` owns `workerRuntimeTypeValues`, `workerRuntimeTypeSchema`, `WorkerRuntimeType`, `workerRegistrationPayloadSchema`, `workerHeartbeatPayloadSchema`, `WorkerRuntimeDefinition`, `WORKER_RUNTIME_DEFINITIONS`, `getWorkerRuntimeDefinition`, `validateWorkerRuntimeMetadata`, and the current Remotion schema re-exports.
- `apps/web/shared/featureFlags.ts` owns `TenantFeatureFlags`, `TenantFeatureFlagKey`, `ALLOWED_FEATURE_FLAGS`, and `FEATURE_FLAG_DEFAULTS`.
- `apps/web/server/services/tenantFeatureFlagService.ts` owns `REDIS_SYNCED_FLAGS`, `validateFeatureFlags`, `resolveFeatureFlags`, `getTenantFeatureFlags`, and `updateTenantFeatureFlags`. PostgreSQL remains authoritative; Redis synchronization remains best-effort cache propagation.
- `apps/web/shared/publicApiTypes.ts` owns `ALLOWED_API_SCOPES`, `ApiScope`, and `ALLOWED_API_SCOPES_SET`.
- `apps/web/server/services/apiKeyService.ts#createKey` validates every persisted API-key scope against `ALLOWED_API_SCOPES_SET`; no API-key row migration is needed for new scopes.
- `apps/web/server/_core/mcpPublicServer.ts#normalizeMcpSessionAuth` currently grants first-party sessions only read/download MCP capabilities by default. This section must not implicitly add new mutation or generation scopes there.
- `apps/web/server/_core/mcpRegistry.ts#evaluateToolAvailability` requires an exact `requiredScope` and separately requires `mcp:write` for write tools. Later tool definitions must preserve both checks.
- `apps/web/drizzle/schema.ts#workerRuntimeTypeEnum` and `workerJobs.runtimeType` are the durable worker-runtime representation. The current migration sequence ends at `0223_vertical_drama_draft_job_inbox.sql`, and `_journal.json` currently ends at index 209.

`apps/web/drizzle/schema.js` is a stale generated CommonJS mirror and is not the canonical schema source for current TypeScript services. Do not hand-edit it in this workstream. Only update it if the repository's established schema-generation command regenerates it as a tracked artifact during implementation.

## Exact owned files and symbols

### Portable Remotion executor schemas

Modify `packages/remotion-render/src/remotionRenderVideoSchema.ts` and add the following exported symbols beside the existing Remotion worker-job constants:

- `REMOTION_EXECUTOR_SUPPORTED_HOST_PLATFORMS`
- `REMOTION_EXECUTOR_SUPPORTED_RUNTIME_PLATFORMS`
- `REMOTION_EXECUTOR_SUPPORTED_ARCHITECTURES`
- `REMOTION_EXECUTOR_INSTALLATION_MODES`
- `REMOTION_EXECUTOR_READINESS_STATUSES`
- `REMOTION_EXECUTOR_BLOCKING_REASON_CODES`
- `REMOTION_EXECUTOR_MAX_CONCURRENCY`
- `remotionExecutorRuntimeMetadataSchema`
- `remotionExecutorCapabilityProfileSchema`
- `remotionExecutorReadinessSchema`
- inferred exported types for the three schemas

Keep these schemas in `remotionRenderVideoSchema.ts` because that file is already bundled as the neutral `@smartspec/remotion-render/render-video-schema` entry consumed by browser-safe server/shared code and by standalone Node consumers. They may import only browser-neutral modules already allowed by that entry, currently `zod` and the existing schema dependencies. They must not import `node:*`, Remotion renderer code, filesystem helpers, process state, or server files.

`REMOTION_EXECUTOR_SUPPORTED_HOST_PLATFORMS` contains `windows`, `macos`, and `linux`. `REMOTION_EXECUTOR_SUPPORTED_RUNTIME_PLATFORMS` contains the same vocabulary. `REMOTION_EXECUTOR_SUPPORTED_ARCHITECTURES` contains `x64` and `arm64`. `REMOTION_EXECUTOR_INSTALLATION_MODES` contains `windows_native`, `windows_wsl2`, `macos_native`, and `linux_native`. The initial valid matrix is:

| Installation mode | Host platform | Runtime platform | Architecture |
|---|---|---|---|
| `windows_native` | `windows` | `windows` | `x64` |
| `windows_wsl2` | `windows` | `linux` | `x64` |
| `macos_native` | `macos` | `macos` | `arm64` or `x64` |
| `linux_native` | `linux` | `linux` | `x64` |

The schema rejects every other combination, including Windows arm64, Linux arm64, a WSL2 process that claims a Windows runtime platform, and a macOS process that claims WSL2. Adding another platform later is an explicit contract change with fixtures and pack evidence, not a free-form string.

`remotionExecutorRuntimeMetadataSchema` is strict and bounded. It describes stable registration identity and contains only:

- `executorVersion`, `packId`, and `packVersion` as trimmed bounded strings;
- `hostPlatform`, `runtimePlatform`, `architecture`, and `installationMode` from the enums above;
- `platformContractVersion`, which must equal `REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION` for an initial ready registration;
- `rendererPolicyVersion`, which must equal `REMOTION_RENDER_VIDEO_RENDERER_POLICY_VERSION`;
- `maxConcurrency`, an integer from 1 through `REMOTION_EXECUTOR_MAX_CONCURRENCY`;
- an optional bounded build identifier or manifest checksum suitable for audit, never a local path or URL.

`remotionExecutorCapabilityProfileSchema` is strict and contains:

- `capabilityFamilies`, with no unknown values and with every value in `REMOTION_RENDER_VIDEO_CAPABILITY_FAMILIES` present;
- `claimCapability`, exactly equal to the value derived by `REMOTION_RENDER_VIDEO_CLAIM_CAPABILITY`;
- supported container `mp4` and codec `h264` for the initial contract;
- positive bounded `maxWidth`, `maxHeight`, `maxDurationInFrames`, and `maxConcurrency` values;
- booleans for the specific declared render behaviors required by the existing payload, such as Chromium rendering, FFmpeg probe/post-pass support, and font materialization.

The capability schema must not accept arbitrary composition module names, shell commands, executable paths, storage keys, external URLs, provider credentials, or environment maps. `maxConcurrency` must agree with the runtime metadata value; the registration-level refinement in `workerRuntime.ts` enforces this cross-object invariant.

`remotionExecutorReadinessSchema` is strict and bounded. It contains a status of `ready`, `blocked`, or `unavailable`; a bounded timestamp/string for the doctor observation; structured checks for browser, FFmpeg, ffprobe, font set, disk floor, credential store, manifest integrity, and contract compatibility; and an array of known blocking reason codes. Each check exposes only status and a sanitized version/reason code. It must not expose local absolute paths, usernames, home directories, command lines, tokens, object keys, presigned URLs, or raw diagnostic output.

The blocking reason vocabulary must at least distinguish browser missing/incompatible, FFmpeg missing/incompatible, ffprobe missing/incompatible, font set incomplete, low disk, credential store unavailable, manifest invalid, platform unsupported, architecture mismatch, and contract mismatch. `ready` requires every mandatory check to pass and an empty blocking-reason list. A blocked or unavailable state requires at least one reason. A worker cannot self-declare readiness by sending only `{ status: "ready" }`.

Update `packages/remotion-render/src/index.ts` to re-export these symbols for root-package consumers while retaining `./render-video-schema` as the source used by `apps/web/shared/workerRuntime.ts`. No package export path or package version must be removed. `packages/remotion-render/build.mjs` should require no logic change because the new schemas remain in the existing schema entry; its neutral bundle remains the guard against accidental Node imports.

### Worker runtime identity and registration contract

Modify `apps/web/shared/workerRuntime.ts` as follows:

- Append `remotion_executor` to `workerRuntimeTypeValues`. Do not rename, remove, or reorder any existing value.
- Let `WorkerRuntimeType` and `workerRuntimeTypeSchema` pick up the new value from the existing tuple; do not create a competing runtime enum.
- Import the three portable executor schemas and their constants from `@smartspec/remotion-render/render-video-schema`, use them in runtime-specific validation, and re-export them with the existing Remotion exports.
- Add `workerRemotionExecutorRegistrationSchema` as a strict composition of `remotionExecutorRuntimeMetadataSchema`, `remotionExecutorCapabilityProfileSchema`, and `remotionExecutorReadinessSchema`. This is a validation helper for the three existing JSON fields, not a replacement for `workerRegistrationPayloadSchema`.
- Extend `validateWorkerRuntimeMetadata` or add a narrowly named helper `validateRemotionExecutorRegistration` invoked from `workerRegistrationPayloadSchema.superRefine` when `runtimeType === "remotion_executor"`.
- Add `WORKER_RUNTIME_DEFINITIONS.remotion_executor` with display name `Dedicated Remotion Executor`, family name `Remotion`, feature flag `remotionDedicatedExecutorEnabled`, registration support `feature_gated`, dispatch support `limited`, the existing supported runtime family/profile schema versions, and `gatewayCompatibility: null`.
- Update exhaustive tests and literal snapshots that enumerate `workerRuntimeTypeValues`, especially `apps/web/shared/__tests__/agencyHybridFeatureFlag.test.ts`; an unchanged literal array there will fail after the additive runtime value.

A valid dedicated executor registration uses:

- `runtimeType: "remotion_executor"`;
- `workerMode` of `per_user`, `shared_department`, or `dedicated_gpu`; reject the default `external_runtime` mode for this executor because it is an authenticated render host, not an arbitrary gateway;
- top-level `runtimeMode: "native_constrained"` for Windows/macOS/Linux native packs or `runtimeMode: "wsl2_managed"` for the WSL2 pack; reject `docker_isolated` and `external_managed` in the initial release;
- `externalReference` beginning with `remotion-executor://` and containing only a server-approved opaque device identifier, not a local hostname/path supplied as authority;
- `fileScopeMode: "workspace_scoped"`; reject `team_drive` and `full_machine` because all render inputs are server-authorized and materialized into isolated per-job workspaces;
- a non-null `deviceBinding`; registration cannot omit device identity for this runtime;
- `runtimeMetadataJson` parsed by `remotionExecutorRuntimeMetadataSchema`;
- `capabilitiesJson` parsed by `remotionExecutorCapabilityProfileSchema`;
- `healthSummaryJson` parsed by `remotionExecutorReadinessSchema`.

Cross-field refinement maps the top-level runtime mode to the installation mode: `windows_wsl2` requires `wsl2_managed`; every native installation mode requires `native_constrained`. The runtime metadata and capability profile must report the same concurrency. The contract and claim capability must derive from the existing shared constants, not from duplicated literals.

Do not bump `WORKER_RUNTIME_PROTOCOL_VERSION`, `WORKER_RUNTIME_FAMILY_SCHEMA_VERSION`, or `WORKER_RUNTIME_PROFILE_SCHEMA_VERSION` merely because an additive runtime value is introduced. A global replacement would make existing workers appear stale. If implementation proves a generic protocol bump is unavoidable, add backward-compatible supported versions to each runtime definition and add old-worker fixtures; do not replace the current version in place.

### Execution-target request and durable resolution contracts

Add these exact shared symbols to `apps/web/shared/workerRuntime.ts`:

- `remotionExecutionTargetRequestValues` with `auto`, `desktop_worker`, and `remotion_executor`;
- `RemotionExecutionTargetRequest` and `remotionExecutionTargetRequestSchema`;
- `remotionResolvedRuntimeTypeValues` with `desktop_zeroclaw_managed` and `remotion_executor`;
- `RemotionResolvedRuntimeType` and `remotionResolvedRuntimeTypeSchema`;
- `REMOTION_EXECUTION_TARGET_POLICY_VERSION = "2026-08-16.1"` for the first implementation;
- `remotionExecutionTargetResolutionReasonValues`;
- `RemotionExecutionTargetResolution` and `remotionExecutionTargetResolutionSchema`.

The resolution reason vocabulary is closed and includes `explicit_desktop_worker`, `explicit_remotion_executor`, `auto_dedicated_ready`, `auto_tenant_flag_disabled`, `auto_operator_kill_switch`, and `auto_no_eligible_executor`. The strict resolution object contains `requestedTarget`, `resolvedRuntimeType`, `reason`, and `policyVersion`. It contains no worker ID, readiness payload, token, URL, local path, storage key, or billing data.

The schema enforces valid pairings:

- `explicit_desktop_worker` resolves only to `desktop_zeroclaw_managed`;
- `explicit_remotion_executor` resolves only to `remotion_executor`;
- `auto_dedicated_ready` resolves only to `remotion_executor`;
- the remaining `auto_*` fallback reasons resolve only to `desktop_zeroclaw_managed`.

Workstream 02 will add `executionTarget?: RemotionExecutionTargetRequest` to `QueueRemotionRenderVideoJobInput` as a queue-only field, strip it before parsing the strict `remotionRenderVideoWorkerInputSchema`, resolve it before credit reservation and insertion, persist `resolution.resolvedRuntimeType` in `worker_jobs.runtimeType`, and persist the bounded resolution object under `capabilityRequirementsJson.executionTargetResolution`. It must not add the request field to `inputJson` or to `remotionRenderVideoWorkerInputSchema`.

The database already provides the durable target column. This section therefore does not add an `executionTarget` column. The enum migration is sufficient. Persisting the resolution envelope in `capabilityRequirementsJson` provides reason/version audit without duplicating the target. `worker_jobs.runtimeType` remains authoritative if malformed legacy JSON is encountered.

An explicit `remotion_executor` request that cannot be honored produces no resolution object and no job; Workstream 02 must fail before credit reservation/insertion. `auto` may fall back to desktop according to policy and records the exact fallback reason. Once inserted, retry and reconciliation reuse `worker_jobs.runtimeType` and the stored policy envelope; they do not re-run flag/readiness selection.

### Typed tenant flag and cache propagation

Modify `apps/web/shared/featureFlags.ts`:

- add `remotionDedicatedExecutorEnabled: boolean` to `TenantFeatureFlags` adjacent to `remotionRenderVideoJobEnabled`;
- add the exact key to `ALLOWED_FEATURE_FLAGS`;
- add `remotionDedicatedExecutorEnabled: false` to `FEATURE_FLAG_DEFAULTS`;
- preserve the independent meanings and defaults of `hermesAgentRuntime`, `hermesMediaWorker`, and `remotionRenderVideoJobEnabled`.

Modify `apps/web/server/services/tenantFeatureFlagService.ts` by adding the key to `REDIS_SYNCED_FLAGS`, because scheduler and rollout guards need cache invalidation behavior consistent with other runtime flags. This does not make Redis the source of truth: `updateTenantFeatureFlags` writes PostgreSQL transactionally and performs best-effort Redis propagation afterward. A Redis sync failure must not revert the committed database value, and a missing cache value must resolve through the existing database/default path.

Do not add this flag to worker registration, heartbeat, queue input, MCP tool input, or executor configuration. A worker or MCP caller may request an execution target only through its authorized operation schema; it cannot set tenant rollout policy. Unknown payload fields must never mutate `tenants.featureFlags`.

Workstream 02 owns the separate operator kill switch. The tenant flag alone cannot override a disabled operator switch, and the existing desktop and in-process Remotion flags remain independent.

### Scope compatibility and least privilege

Modify `apps/web/shared/publicApiTypes.ts` by appending these scopes to `ALLOWED_API_SCOPES` and therefore `ApiScope`/`ALLOWED_API_SCOPES_SET`:

- `hermes:generate`
- `hermes:disconnect`
- `remotion:submit`
- `remotion:read`
- `remotion:cancel`

Also export a frozen `HERMES_REMOTION_SCOPE_REQUIREMENTS` mapping for later MCP tool definitions. The mapping is contractual:

| Operation | Required operation scope | Existing secondary MCP rule |
|---|---|---|
| Hermes capabilities, connection status, and completed probe result | `hermes:read` | read tool |
| Start/authorize a Hermes connection | `hermes:connect` | `mcp:write` also required |
| Run a new connection probe | `hermes:connect` | `mcp:write` also required |
| Disconnect a Hermes connection | `hermes:disconnect` | `mcp:write` also required |
| New Hermes-specific provider media execution | `hermes:generate` | `mcp:write` also required |
| Dedicated Remotion submit | `remotion:submit` | `mcp:write` also required |
| Dedicated Remotion status | `remotion:read` | read tool |
| Dedicated Remotion cancel | `remotion:cancel` | `mcp:write` also required |
| Library download | existing `library:download` | existing broker policy |
| Media/history/artifact download | existing `media:download` | existing broker policy |

Preserve `hermes:connect`, `hermes:read`, and `hermes:write` in the allowed list. `hermes:write` remains a legacy grant and is not normalized into any new scope. Preserve existing `media:generate`, `jobs:create`, and `jobs:read` behavior for existing tools; they are not aliases for the new Hermes-specific or Remotion-specific operations.

No compatibility normalizer may auto-expand an old API key. API keys store string arrays and therefore need no row migration: a key created before this feature lacks every new scope until its owner/admin explicitly rotates or updates the grant through the existing API-key flow. `createKey` and the API-key router continue to reject unknown scopes through `ALLOWED_API_SCOPES_SET`.

Do not add the new mutation scopes to the implicit first-party read/download list in `normalizeMcpSessionAuth`. In the first implementation, browser cookie sessions remain read/download-only; mutating MCP tools require an API key, verified bearer token, or Connector-issued `agent_pairing` session carrying the exact operation scope plus `mcp:write`. The pairing is an authentication mode with explicit browser/device consent, not a new implicit browser grant and not a worker/provider credential. Delegated worker profiles also receive no new scopes in this section; any later profile expansion requires its own explicit policy change and tests. Exact string matching remains fail-closed; no wildcard or prefix matching is introduced.

The shared runtime-registration contract must also carry `runtimeSource` as
`existing_hermes_install | managed_runtime_pack`. This is provenance metadata,
not a trust decision: the server accepts it only after the same signed-manifest,
doctor, platform, architecture, executable, and contract checks pass. A
compatible existing Hermes installation may be adopted; a missing or incompatible
component must use the signed managed pack path and must never weaken admission.

Update tests that copy the allowed scope list instead of importing it, notably `apps/web/server/routers/__tests__/apiKeys.test.ts`, so the test validates the canonical exported list rather than maintaining a stale count.

### Additive PostgreSQL migration

Modify `apps/web/drizzle/schema.ts#workerRuntimeTypeEnum` by appending `remotion_executor` after `hermes_agent_gateway`. Since `worker_policies`, `runtime_profiles`, `workers`, `worker_heartbeats`, `worker_jobs`, and `worker_access_keys` use this shared enum, no table recreation or per-table column migration is needed.

Create `apps/web/drizzle/0224_remotion_executor_runtime.sql` with the repository's additive enum convention: `ALTER TYPE "public"."worker_runtime_type" ADD VALUE IF NOT EXISTS 'remotion_executor';`. Do not rename or recreate the enum, cast columns through text, reorder existing values, or backfill existing worker/job rows.

Append the matching `0224_remotion_executor_runtime` entry to `apps/web/drizzle/meta/_journal.json` using the next index after the current checkout. At the time this section was written, that is index 210 after `0223`/209. Re-check the migration head immediately before implementation; if another migration has landed, keep the filename/tag and journal ordering collision-free using the repository's current next sequence rather than overwriting another migration. Late migrations in this repository do not have corresponding generated snapshots, so do not fabricate a snapshot solely for this one-value enum migration.

Migration deployment precedes application deployment. The application must not accept `remotion_executor` registration before PostgreSQL accepts the enum value. Existing rows are not changed. An implementation test may execute the migration twice against an isolated PostgreSQL database or statically assert `ADD VALUE IF NOT EXISTS`; it must not use SQLite as proof of PostgreSQL enum behavior.

## TDD implementation order and concrete test stubs

Write failing tests before changing production symbols. The tests are behavioral stubs, not full implementations.

### Test group 1 — portable executor contract

Create `apps/web/shared/__tests__/remotionExecutorContracts.test.ts`. Import the executor schemas/constants once from `@smartspec/remotion-render/render-video-schema` and once through the `../workerRuntime` re-export where relevant.

The initial failing cases must prove:

- each supported platform matrix row parses;
- Windows arm64, Linux arm64, mixed Windows/WSL runtime claims, unknown architecture, and unknown installation mode fail;
- a ready profile requires all mandatory checks, no blocking reasons, all required capability families, the exact claim capability, matching contract/policy versions, and matching concurrency;
- missing browser/FFmpeg/ffprobe/font/disk/credential/manifest checks fail or produce a non-ready profile according to the strict schema;
- unknown fields, unbounded strings/arrays, local paths, URL-shaped diagnostic fields, and arbitrary command/environment fields are rejected;
- imported constants from the package and `workerRuntime.ts` re-export are identical;
- existing `remotionRenderVideoWorkerInputSchema` golden fixtures still parse unchanged and contain no `executionTarget` field.

### Test group 2 — runtime identity and target type separation

Extend `apps/web/shared/__tests__/workerRuntime.test.ts` and update `apps/web/shared/__tests__/agencyHybridFeatureFlag.test.ts`.

The failing tests must prove:

- `workerRuntimeTypeValues`, `workerRuntimeTypeSchema`, and `WORKER_RUNTIME_DEFINITIONS` include `remotion_executor` while every old value remains accepted;
- the new definition uses the dedicated flag and has no gateway compatibility;
- a complete dedicated registration parses for Windows native, Windows WSL2, macOS arm64, macOS x64, and Linux x64;
- invalid worker mode, runtime mode, external-reference prefix, file scope, missing device binding, stale contract, incomplete capabilities, false ready claim, or inconsistent concurrency fails;
- existing desktop and Hermes registration fixtures serialize as before;
- `remotionExecutionTargetRequestSchema` accepts `auto | desktop_worker | remotion_executor` and rejects durable-only `desktop_zeroclaw_managed` as caller input;
- `remotionResolvedRuntimeTypeSchema` accepts `desktop_zeroclaw_managed | remotion_executor` and rejects `auto` and `desktop_worker`;
- every reason/target pairing is enforced and the resolution object rejects extra fields;
- the generic worker protocol/family/profile versions remain backward-compatible.

### Test group 3 — feature flag registration and cache sync

Create `apps/web/shared/__tests__/remotionDedicatedExecutorFeatureFlag.test.ts` and extend the focused tenant flag service tests, preferably `apps/web/server/services/__tests__/tenantFeatureFlagsUpdate.test.ts` or a new narrowly named `tenantFeatureFlagsRemotionExecutorSync.test.ts` if isolation is cleaner.

The failing tests must prove:

- `TenantFeatureFlags` contains the key, `ALLOWED_FEATURE_FLAGS` permits it, and `FEATURE_FLAG_DEFAULTS` sets it to false;
- `resolveFeatureFlags` returns false when stored state omits the key and preserves an explicit true value;
- `validateFeatureFlags` accepts only a strict boolean for the key and strips objects, strings, and unknown names;
- `updateTenantFeatureFlags` writes the database result and attempts the existing Redis sync for this key;
- Redis sync failure does not alter the committed database result;
- a worker registration or execution-target object containing a lookalike flag cannot change or become the resolved tenant flag.

### Test group 4 — scope compatibility

Create `apps/web/shared/__tests__/hermesRemotionApiScopes.test.ts`, extend `apps/web/server/services/__tests__/apiKeyService.test.ts`, and update `apps/web/server/routers/__tests__/apiKeys.test.ts` to consume the canonical scope list.

The failing tests must prove:

- all five new scopes are valid `ApiScope` values and are accepted by `createKey`;
- unknown or prefix-similar scopes remain rejected;
- the operation-to-scope mapping matches the table above;
- legacy scope sets containing only `hermes:connect`, `hermes:read`, `hermes:write`, `media:generate`, `jobs:create`, or `jobs:read` do not contain or imply any new scope;
- adding scopes to `ALLOWED_API_SCOPES` does not mutate scopes already persisted on an API key;
- first-party read/download session defaults and delegated profile definitions do not gain the new mutation scopes as a side effect of this section.

### Test group 5 — schema and migration

Extend `apps/web/server/services/__tests__/workerRuntimeSchema.test.ts` and add `apps/web/server/__tests__/remotionExecutorRuntimeMigration.test.ts`.

The failing tests must prove:

- Drizzle `workerRuntimeTypeEnum.enumValues` contains every previous value plus `remotion_executor`;
- `workerJobs.runtimeType` remains the sole authoritative durable target column and is non-null;
- the `0224` migration exists, contains only the additive `ADD VALUE IF NOT EXISTS` change for this enum, and contains no `DROP TYPE`, enum rename, destructive cast, row backfill, or table rewrite;
- `_journal.json` contains exactly one matching tag after `0223` with a monotonically increasing index;
- applying the migration twice on isolated PostgreSQL is safe where the migration harness is available.

## Focused verification commands

Use the repository's existing package manager and test runner. Deep-implement should first run the exact focused Vitest files added or changed in this section, then run the Remotion package typecheck/build and relevant shared/server tests. The expected proof set is:

- focused Vitest for `remotionExecutorContracts`, `workerRuntime`, the feature flag tests, API scope/API key tests, and migration/schema tests;
- `@smartspec/remotion-render` typecheck and build, proving the neutral schema entry still contains no Node-only import;
- `git diff --check` limited to the section's implementation files;
- a migration dry run or isolated PostgreSQL application where credentials are available.

Do not describe focused green tests as a repository-wide clean typecheck. Record pre-existing unrelated failures separately. Do not use SQLite to claim enum-migration compatibility.

## Failure and security edges

- Unknown runtime types, platforms, architectures, installation modes, capability aliases, contract versions, and resolution reasons fail closed.
- Registration readiness is evidence, not authority. Workstream 02 must still evaluate current worker status, heartbeat freshness, lease capacity, feature flag, and operator switch before claim.
- The registration contract accepts bounded sanitized facts only. Secret material, device refresh tokens, provider credentials, filesystem roots, raw commands, environment variables, object-storage keys, and URLs have no schema field and are rejected by strict objects.
- The runtime requires device binding and workspace-scoped file access. It cannot advertise full-machine authority to obtain render work.
- Contract version and claim capability are derived from one shared package. A stale executor cannot claim by inventing a capability alias.
- A caller cannot inject `executionTarget` into the strict renderer payload. A target request is queue metadata; the resolved runtime is durable server-owned state.
- Explicit dedicated targeting must fail before reservation/insertion if unavailable. `auto` fallback is allowed only with a recorded reason. Idempotent replay returns the existing job and existing target; it does not select a newer target.
- Tenant flag state comes from the existing admin-controlled flag service. Worker, MCP, and queue payloads cannot mutate it.
- Existing API keys receive no new authority. There is no wildcard matching, scope prefix matching, implicit `hermes:write` expansion, or `jobs:create` to `remotion:submit` expansion.
- PostgreSQL and the application may be temporarily version-skewed during rollout. Deploy the additive enum first; keep the feature flag false until all application instances understand the new value.
- Enum rollback is intentionally non-destructive. Once a row references `remotion_executor`, removing the enum value is unsafe and out of scope.

## Dependencies and handoff contracts

This section has no dependency on another Feature 145 workstream. It depends only on the existing worker runtime, Remotion schema package, feature flag service, API-key scope validation, and Drizzle migration framework.

It exports the following stable interfaces to later sections:

- Workstream 02 consumes `RemotionExecutionTargetRequest`, `RemotionResolvedRuntimeType`, `RemotionExecutionTargetResolution`, `REMOTION_EXECUTION_TARGET_POLICY_VERSION`, `remotionDedicatedExecutorEnabled`, and the portable executor readiness/capability schemas.
- Workstream 03 consumes `HERMES_REMOTION_SCOPE_REQUIREMENTS` and the new `ApiScope` values; it must not reinterpret old scopes.
- Workstream 04 consumes the portable metadata/capability/readiness schemas and the existing Remotion render-video schema from the package subpath.
- Workstream 05 continues to consume existing `library:download` and `media:download`; this section adds no storage authority.
- Workstream 06 consumes the exact platform/architecture/installation-mode matrix.
- Workstream 07 treats the typed flag cache as best effort and adds no durable state to Redis.
- Workstream 08 uses the shared fixtures as the cross-platform contract drift gate.

If a later section needs a field not declared here, it must update this section's shared schema and fixtures rather than creating a local lookalike interface.

## Deployment and rollback

Deploy in this order: additive SQL migration and journal entry; shared Remotion package build; web shared/schema code; server code with the new flag still false. Do not register a production executor or expose dedicated routing in this section.

Rollback disables or leaves disabled `remotionDedicatedExecutorEnabled` and the later operator dispatch switch. The application may stop advertising/accepting the new runtime, but the PostgreSQL enum value, new API scope vocabulary, and additive package exports remain. Existing Worker App jobs continue using `desktop_zeroclaw_managed`. Do not delete worker/job rows, strip scopes from existing keys, remove the enum value, or rewrite durable targets during rollback.

## Completion gate

Workstream 01 is complete only when all focused tests above pass, the neutral Remotion schema bundle still builds, the migration is ordered and additive, old runtime/scope/flag fixtures remain valid, and the section's exported names match every dependent section. Passing schema tests alone is insufficient if a stale scope snapshot, literal runtime list, or migration journal entry remains inconsistent.

## UI/UX Contract

### Target User / JTBD
N/A — shared server contracts and migration foundations; no browser task is changed.

### Surface Inventory
N/A — no browser route or component is introduced.

### Component Map
N/A — no frontend ownership changes.

### State Matrix
N/A — state is represented by schemas, flags, migration state, and API outcomes.

### Responsive Matrix
N/A — no responsive layout is changed.

### Accessibility Acceptance
N/A — no browser interaction is introduced; errors remain bounded and sanitized.

### Copy Contract
N/A — no browser copy is added.

### Browser Evidence Required
N/A — contract and migration evidence belongs to Section 08.

This section has no browser-visible surface, route, component, responsive state, or accessibility interaction. Browser screenshot evidence is not required. Any later admin UI that displays the flag, executor readiness, or target reason belongs to its owning workstream and must consume these shared values without inventing display-time aliases that can be written back as durable runtime values.
