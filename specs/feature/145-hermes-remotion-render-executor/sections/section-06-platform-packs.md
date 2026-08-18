# Workstream 06 — Platform Packs and Release/Install Parity

## Purpose and completion boundary

This workstream turns the standalone Node executor from Workstream 04 into three
native first-release runtime packs that can be built, verified, installed,
started, updated, disabled, and rolled back without changing the existing Worker
App release. WSL2/Linux remain deferred compatibility targets on the existing
Worker App path. The pack matrix is:

| Pack ID | Execution environment | Architecture | Initial release status |
|---|---|---|---|
| `remotion-executor-windows-x64` | Windows 11 native, build `>= 22000` | `x64` | Mandatory release target |
| `remotion-executor-windows-wsl2` | Linux inside Windows 11 WSL2, with WSL2 feature/distro/kernel probe | `x64` | Deferred; existing Worker App path |
| `remotion-executor-linux-x64` | Native Linux | `x64` | Deferred; existing Worker App path |
| `remotion-executor-macos-arm64` | Native macOS on Apple Silicon | `arm64` | Mandatory release target |
| `remotion-executor-macos-x64` | Native macOS on Intel | `x64` | Mandatory release target |

Implementation boundary for Feature 145 v0.9: only the three native rows above
are part of the standalone connector implementation and release gate. The
WSL2/Linux subsections below are retained as a future compatibility plan for
the existing Worker App; their pack IDs must remain unavailable from the
standalone manifest, CLI, scheduler, and MCP catalog until a later feature adds
the missing descriptors, credential adapter, and native evidence.

“Supported” means more than producing an archive. A pack may be promoted with
`allowed: true` only after its native `doctor`, credential-store, service-manager,
short-render, checksum/signature, update, and rollback evidence is attached to the
release record. Building a macOS x64 archive on arm64 and running it through
Rosetta is not native x64 evidence. A Linux CI pass is not WSL2 evidence, and a
WSL2 pass is not Windows-native evidence.

This section does not redesign the executor loop, worker authentication, job
contract, Remotion orchestration, or artifact protocol. It consumes those outputs
from Workstreams 01, 02, and 04. It also does not replace or widen the semantics of
`apps/worker-app/scripts/package-runtime-release.mjs` or
`apps/web/scripts/build-hermes-runtime-pack.ts`. Those scripts remain compatibility
references for the existing HyperFrames/Worker App and Hermes CLI packs. The new
executor receives a separate pack builder and a separate server validation branch
so a failed executor release cannot alter an existing Worker App pack.

## Dependencies and contracts consumed

Implementation starts only after the following interfaces are stable:

- Workstream 01 exports the `remotion_executor` worker runtime identity, the three
  native pack IDs above, the Remotion platform contract version, and the dedicated
  feature flag. Runtime packs are non-secret release artifacts, so initial
  bootstrap does not depend on a worker token or a new runtime-pack permission.
  User/tenant authentication begins at executor connect/registration and is
  mandatory for all worker control-plane and artifact operations.
- Workstream 02 accepts registration/readiness metadata for the exact pack ID,
  operating system, architecture, executor version, and runtime profile hash. A
  worker may claim only after the server has accepted those values.
- Workstream 04 provides `apps/remotion-executor/dist/cli.js`, the fixed CLI
  commands `doctor`, `connect`, `run`, `status`, and `logout`,
  `src/runtimeManifest.ts`, the platform credential-store abstraction, and the
  portable Remotion runner. The pack must not add a second worker loop or a second
  credential format.
- Workstream 08 owns tenant rollout and end-to-end promotion. This section emits
  the signed candidate artifacts and platform evidence that Workstream 08 consumes.

### Connector adoption and automatic repair

The release contains the SmartAIHub Hermes Connector bootstrap alongside the
executor pack. It is intentionally small enough to start on a host that already
has Hermes CLI/Hermes One, while the full managed pack is downloaded only when
discovery or doctor proves a missing/incompatible component. The discovery
registry is closed per platform and returns sanitized metadata; arbitrary paths,
shell commands, package managers, and user-provided download URLs are not
installation mechanisms.

When a compatible existing install passes provenance, executable, Remotion,
browser, FFmpeg/ffprobe, font, path, disk, and contract checks, the Connector
adopts it with `runtimeSource: existing_hermes_install`. Otherwise it downloads
the exact allowlisted signed pack, verifies Ed25519 signatures, archive and entry
checksums, platform/architecture and contract versions, extracts atomically to a
new version directory, and activates it as
`runtimeSource: managed_runtime_pack`. Existing Hermes directories are never
overwritten. A failed or interrupted install leaves the last verified activation
usable and reports `not_ready` with one repair action.

Windows uses a per-user scheduled task and DPAPI; macOS uses a per-user
LaunchAgent and Keychain. Neither requires an Xcode/Tauri build on the render
host. The Connector starts one browser consent flow and receives separate worker
and `agent_pairing` credential lineages. It configures
`https://smartaihub.app/v1/mcp` through a dynamic credential broker, or the
fixed-origin compatibility proxy specified by Section 04 when required by an
older Hermes build.

The release pipeline must build from one immutable Git commit and one lockfile.
Every manifest records that commit, the executor package version, the
`@smartspec/remotion-render` package version, and
`REMOTION_RENDER_VIDEO_PLATFORM_CONTRACT_VERSION`. A version mismatch is a doctor
failure and a server admission failure, not a warning.

## Exact implementation surface

### Shared pack schema

Create `packages/remotion-render/src/remotionExecutorRuntimePackSchema.ts` and
export it from `packages/remotion-render/src/index.ts`. This is the only schema for
both the archive-internal manifest and the external release manifest. It exports
the three first-release pack IDs, their platform matrix, Zod schemas, inferred types, the
release-manifest schema version, and pure helpers that validate a pack ID against
OS/architecture/environment. Keeping this schema in
`@smartspec/remotion-render` lets the web server and executor consume the same
contract without importing files from each other's application directories.

Extend `packages/remotion-render/package.json` only if an explicit subpath export
is needed. Do not add a new package or dependency; this package already owns the
Remotion platform contract and already depends on Zod.

### Executor release tooling

Create these files under `apps/remotion-executor/`:

| File | Responsibility |
|---|---|
| `scripts/build-platform-pack.mjs` | Build one approved native target from a `runtime-pack/` input, create the ZIP with a safe top-level `runtime-pack/` directory, compute SHA-256, sign the digest, and write an external manifest. |
| `scripts/verify-platform-pack.mjs` | Verify the external signature, archive SHA-256, and required sidecar entry without installing the pack. |
| `scripts/promote-platform-pack.mjs` | Atomically publish an archive and manifest while retaining the previous pair. |
| `scripts/rollback-platform-pack.mjs` | Restore the previous archive/manifest pair without deleting credentials, jobs, or media. |
| `release/targets/remotion-executor-windows-x64.json` | Native Windows x64 build descriptor and required file paths. |
| `release/targets/remotion-executor-macos-arm64.json` | Native macOS arm64 descriptor and minimum supported macOS version. |
| `release/targets/remotion-executor-macos-x64.json` | Native macOS x64 descriptor and minimum supported macOS version. |

The target descriptor files are build inputs, not server rollout state. Each one
declares the expected `process.platform`, `process.arch`, execution environment,
bundled Node layout, Chromium layout, FFmpeg/ffprobe layout, required font files,
service template, installer/uninstaller, and executable mode requirements. They
must not contain URLs, credentials, signing keys, tenant IDs, `allowed`, or
`rollbackToVersion`.

Add the following scripts to `apps/remotion-executor/package.json`:

- `release:pack`: runs `node scripts/build-platform-pack.mjs`;
- `release:verify`: runs `node scripts/verify-platform-pack.mjs`;
- `release:promote`: runs `node scripts/promote-platform-pack.mjs`;
- `release:rollback`: runs `node scripts/rollback-platform-pack.mjs`;
- `platform:smoke`: runs the native doctor and deterministic short-render fixture.

Add a root convenience script named `release:remotion-executor` that delegates to
the workspace `release:pack` command. It is an operator entry point only; normal
application startup and tests must never invoke a release build.

The exact build and verification invocation is:

```text
npm --workspace @smartspec/remotion-executor run build
npm --workspace @smartspec/remotion-executor run release:pack -- --target <pack-id> --version <semver-or-release-version> --output-dir <release-dir>
npm --workspace @smartspec/remotion-executor run release:verify -- --archive <zip> --manifest <zip>.manifest.json --signature <zip>.manifest.json.sig
```

Promotion requires the `--evidence`, `--rollback-to`, and `--channel` arguments;
their values are an evidence JSON path, a verified version, and one of
`candidate`, `preview`, or `stable`. Rollback requires `--disable-version`,
`--rollback-to`, and `--reason`. Both commands must fail when the target archive or
prior rollback version does not independently verify.

### Installer and service assets

Create the following packaging assets. They are copied into the matching pack and
also tested from source:

- `packaging/windows/install.ps1`, `uninstall.ps1`, and
  `register-scheduled-task.ps1`;
- `packaging/linux/install.sh`, `uninstall.sh`, and
  `smartaihub-remotion-executor.service` for a systemd user service;
- `packaging/macos/install.sh`, `uninstall.sh`, and
  `com.smartaihub.remotion-executor.plist` for a per-user LaunchAgent;
- `docs/platform-install.md` with separate Windows-native, WSL2, Linux,
  macOS-arm64, and macOS-x64 procedures;
- `docs/platform-release.md` with signing, notarization, evidence, promotion,
  rollback, and key-rotation procedures.

Templates may contain non-secret install paths and fixed CLI arguments only. They
must not contain a bearer token, refresh token, device secret, tenant/user ID,
server API key, signing key, or a writable arbitrary command field. Server URL and
non-secret log level may be supplied through a protected configuration file, but
the credential store remains the only source of refresh/device secrets.

WSL2/Linux promotion additionally requires a protected Linux credential adapter.
If Workstream 04 still exposes only `unsupportedCredentialStore.ts` for Linux,
add `apps/remotion-executor/src/platform/linuxSecretServiceCredentialStore.ts`
and its platform-gated contract tests as the smallest prerequisite extension.
It may call only a fixed, probed Secret Service interface with fixed arguments;
it must not add a general shell runner. If no maintained Node 22 backend or
available Secret Service can satisfy create/read/rotate/delete and restart
persistence on the target, doctor leaves that target `not_ready` and its release
manifest remains `allowed: false`. A plaintext encrypted-by-configuration-key
file is not an acceptable substitute.

### Server distribution branch

Modify `apps/web/server/routes/workerRuntime.ts` by adding a dedicated
`REMOTION_EXECUTOR_RUNTIME_PACK_IDS` set and a dedicated filename pattern:

```text
smart-ai-hub-worker-runtime-<pack-id>-<version>.zip
```

The matcher must accept only the three native first-release pack IDs in this section and must
not reuse a caller-provided filename or generic suffix as a filesystem path. Add
`findLatestAllowedRemotionExecutorPack`,
`requiredRemotionExecutorArchiveFiles`, and
`isOfficialRemotionExecutorPackManifest` as a separate family from the existing
HyperFrames and Hermes helpers. The server consumes the shared Zod schema and
trusted public-key configuration; it does not infer trust from the presence of a
ZIP or `allowed: true` alone.

These three pack artifacts contain no tenant/user data and are not authorization
grants, so their manifest/download endpoints may remain public like the current
Worker App/Hermes pack distribution path. They must expose only an allowlisted,
latest, signed archive and never accept query-string credentials, cookie-derived
identity, arbitrary filenames, or a generic filesystem suffix. HTTPS is not the
integrity boundary: the pinned Ed25519 signature, SHA-256, platform/contract
validation, and server allowlist are mandatory. Responses use `Cache-Control:
no-store`, a fixed attachment filename, exact content length, and no local
release-directory path. Unknown, disabled, unsigned, wrongly signed,
wrong-platform, or non-latest filenames return a not-available response.

This avoids a fresh-install bootstrap deadlock: a minimal signed installer or
release client can obtain the non-secret pack, run `doctor`, and then start the
existing device-code connect flow. No pack download response contains a worker
token, MCP token, tenant data, or artifact URL.

Add focused coverage to
`apps/web/server/routes/__tests__/workerRuntime.test.ts`; do not create a parallel
route test harness. If route complexity becomes unmanageable, extract only the
pure pack discovery/verification code into
`apps/web/server/services/remotionExecutorRuntimePackService.ts` and test it in
`apps/web/server/services/__tests__/remotionExecutorRuntimePackService.test.ts`.
The route remains the HTTP boundary.

## Archive and manifest contract

### Archive naming and layout

Every target is a ZIP because the existing runtime-pack endpoint already serves
ZIP archives and the executor verifier can apply one cross-platform extraction
policy. The archive name is exactly
`smart-ai-hub-worker-runtime-<pack-id>-<version>.zip`. The adjacent distribution
files are `<archive>.manifest.json` and `<archive>.manifest.json.sig`.

The ZIP has one `runtime-pack/` root and contains only these top-level areas:

- `runtime-pack/manifest.json`;
- `runtime-pack/SHA256SUMS` and `runtime-pack/SHA256SUMS.sig`;
- `runtime-pack/THIRD_PARTY_NOTICES.txt` and required license files;
- `runtime-pack/executor/dist/` plus the executor package metadata needed at
  runtime;
- `runtime-pack/node/` with the target-native Node 22 runtime;
- `runtime-pack/browser/` with the target-native managed Chromium/Chrome for
  Testing runtime;
- `runtime-pack/bin/ffmpeg[.exe]` and `ffprobe[.exe]`;
- `runtime-pack/fonts/` with the release-pinned fonts and licenses;
- `runtime-pack/service/` with only the installer, uninstaller, and service
  template for that target.

The pack must not include source `.env` files, `.git`, package-manager caches,
test fixtures containing credentials, browser profiles, prior render workspaces,
logs, coverage output, development dependencies, Tauri/Rust binaries, Worker App
UI assets, Xcode projects, or a private release key.

### Internal manifest

`runtime-pack/manifest.json` is immutable archive content. The shared schema
requires at least:

- `schemaVersion`, `runtimeType: "remotion_executor"`, `runtimePackId`,
  `version`, `gitCommit`, and `builtAt`;
- `platform`, `architecture`, `executionEnvironment` (`native`, `wsl2`, or
  `linux`), and `minimumOsVersion`;
- executor entry path/version, bundled Node version/path, browser version/path,
  FFmpeg and ffprobe versions/paths, font families/license paths, and service
  template path;
- `remotionRenderPackageVersion`,
  `remotionPlatformContractVersion`, supported codec/container list, and the
  supported `remotion_render_video` capability family;
- `checksumFile`, `checksumSignatureFile`, `signingAlgorithm: "ed25519"`,
  `signingKeyId`, and `runtimeProfileHash`;
- resource/readiness bounds used by doctor, including minimum free disk and
  maximum supported width, height, duration, and concurrency.

The internal manifest has no `allowed` field. Rollout state is external and can be
changed without rebuilding immutable runtime bytes. `runtimeProfileHash` is the
SHA-256 of canonical manifest capability/version fields plus the sorted internal
checksum list; it is the same value advertised at worker registration.

### External release manifest

`<archive>.manifest.json` repeats the signed identity fields needed before
download and adds `archiveFileName`, `archiveSha256`, `archiveSizeBytes`, sorted
`archiveEntries`, `channel`, `allowed`, `denyReason`, `rollbackToVersion`,
`evidenceRefs`, `publishedAt`, and signer metadata. Its detached signature covers
the canonical UTF-8 JSON bytes exactly. The server and executor reject unknown
fields where the shared schema is strict, unknown key IDs, a retired key outside
its overlap window, malformed hashes, non-canonical signatures, or a mismatch
between external and internal identity/version fields.

`SHA256SUMS` lists every regular archive payload file except itself and its
detached signature, with normalized forward-slash relative paths sorted by byte
order. `SHA256SUMS.sig` is an Ed25519 signature over the exact checksum-file bytes.
The release private key is supplied only by the CI secret
`REMOTION_EXECUTOR_RELEASE_SIGNING_KEY_B64`; it is never passed on a command line,
printed, copied into staging, or made available to untrusted pull-request jobs.
`apps/web/server/services/packageSigningService.ts` must not be reused because its
HMAC model requires a verifier to possess the signing secret; runtime-pack clients
need asymmetric public-key verification.

## Safe build, publish, install, update, and rollback sequence

### Build and publish

The builder uses an OS temporary directory created with a unique name, never the
fixed `.runtime-release-staging` path used by the legacy Worker App script. It
validates every input binary before copying, performs a production-only workspace
install from the pinned lockfile, rejects symlinks/reparse points and unexpected
files, creates the internal manifest/checksum/signature, and verifies the staged
tree before creating the ZIP. It then creates and signs the external candidate
manifest with `allowed: false`. Any failure removes only that unique staging
directory and leaves prior release files untouched.

Publishing to the flat runtime release directory is ordered so an incomplete pack
cannot become visible: copy the immutable ZIP under its final versioned name,
copy its detached signature, and atomically rename the fully written external
manifest last. The server ignores archives without a valid external manifest and
signature. Promotion re-signs and atomically replaces only the external manifest.
No release command mirrors directly into a live `dist` tree; normal atomic web
deployment copies the already verified release assets.

### Install and update

All installers use a versioned layout with a stable data root and a separate
active-version pointer. They download the external manifest/signature first,
verify against a trust anchor already shipped with the installer/executor, download
the exact bounded archive, verify archive hash/size, inspect every ZIP entry,
extract into a unique version staging directory, verify internal checksums and
signature, run `doctor --json` from staging, and only then atomically activate the
new version.

Extraction rejects absolute paths, drive/UNC prefixes, `..`, NULs, Unicode/case
collisions, alternate data streams, symlinks, hard links, reparse points, device
files, and entries outside `runtime-pack/`. Executable mode is restored only for
manifest-declared files on Unix. The installer never executes a binary from the
download directory before signature and entry validation.

Updates occur only between claims. The running process keeps its current version
until it drains or relinquishes the active lease; a new process starts from the
new active pointer. Keep at least the active and `rollbackToVersion` directories.
Never roll back by deleting the current directory while a render is running.

Rollback disables new downloads/registrations for the bad version at the server,
stops new claims through the feature/runtime-pack gate, drains or safely expires
in-flight leases, atomically points the host back to the last verified version,
runs doctor, and restarts the user service. It preserves credentials, device
binding, durable jobs, artifacts, logs needed for audit, and all Worker App packs.
If the previous pack no longer verifies, rollback stops and leaves the current
process disabled rather than activating untrusted bytes.

## Platform-specific implementation

### Windows 11 native x64

The pack contains Windows-native Node, Chromium, FFmpeg, and ffprobe and must pass
PE/platform probes; it must not call `wsl.exe`, read a WSL distribution path, or
depend on `/mnt/c`. Install under
`%LOCALAPPDATA%\SmartAIHub\RemotionExecutor\versions\<version>` and keep writable
config/log/work roots outside the immutable version directory. Production uses a
Scheduled Task named `SmartAIHub Remotion Executor` under the dedicated local
non-admin executor account required by Workstream 04, with that account's profile
loaded. Enrollment/connect and every later service start run under this same
identity so user-scoped DPAPI remains decryptable. Do not install as LocalSystem,
an administrator, or a different interactive user.

`register-scheduled-task.ps1` supplies a fixed bundled Node path, fixed
`dist/cli.js run` arguments, and a fixed protected config path. It never embeds a
token in the task action or environment. PowerShell scripts use strict error
handling and literal paths. Authenticode-sign SmartAIHub-owned PowerShell/native
launchers in the production release pipeline when a code-signing certificate is
configured; do not re-sign vendor Node/Chromium/FFmpeg binaries. The independent
Ed25519 release signature remains mandatory regardless of Authenticode status.

Native acceptance runs on a real Windows 11 x64 host. A `windows-2022` CI build
may prove packaging but cannot be the only Windows 11 runtime evidence.

### Windows 11 WSL2

The WSL2 pack is a Linux x64 pack with `executionEnvironment: "wsl2"`; it is not
the Windows archive with changed labels. It installs inside the selected
distribution under
`$XDG_DATA_HOME/smartaihub/remotion-executor/versions/<version>` (falling back to
`~/.local/share/...`) and uses Linux Node, Chromium, FFmpeg, fonts, paths, modes,
and process signals. `doctor` verifies `/proc/version`/WSL interop identity and
rejects Windows executables, drive-letter paths, UNC paths, `/mnt/<drive>` render
roots, and credentials imported from Windows DPAPI.

Use the systemd user unit only when systemd user services are active in that WSL
distribution. Otherwise install files but leave unattended mode disabled and tell
the operator to run the foreground `run` command; do not silently create a
background shell loop. Persistent credentials use the Linux credential adapter
selected in Workstream 04 and must pass its own doctor check. The Windows host and
WSL guest never share a plaintext refresh-token file.

### Native Linux x64

The Linux pack uses the same immutable/versioned layout and systemd user unit as
WSL2 but declares `executionEnvironment: "linux"` and rejects a WSL kernel. The
service uses `NoNewPrivileges`, a private temporary directory, a restrictive
umask, fixed writable state/render roots, and no root requirement. Browser shared
libraries and native modules are enumerated in the target descriptor and verified
with `ldd`/runtime probes on the build runner and doctor host. A missing supported
secret-service/keyring path blocks unattended mode rather than causing a plaintext
fallback.

### macOS arm64 and x64

Build each macOS pack natively. The arm64 pack accepts only `process.arch ===
"arm64"`; the x64 pack accepts only native `x64` and rejects a translated process
detected through `sysctl.proc_translated`. Neither pack may claim readiness under
Rosetta or by invoking binaries from the other pack.

Install under
`~/Library/Application Support/SmartAIHub/RemotionExecutor/versions/<version>`.
The initial supported background mode is a per-user LaunchAgent at
`~/Library/LaunchAgents/com.smartaihub.remotion-executor.plist`, not a system
LaunchDaemon. The installer runs `connect` interactively in the same logged-in
user session, stores refresh/device material in that user's Keychain through the
Workstream 04 adapter, validates a non-exporting read/proof operation, then uses
`launchctl bootstrap gui/<uid>` and `kickstart` for the LaunchAgent. The plist has
fixed program arguments and paths, `RunAtLoad`, `KeepAlive` only for process
failure, bounded restart throttling, and separate non-secret stdout/stderr logs.
It contains no token or Keychain item value.

`doctor` must distinguish “Keychain item absent,” “Keychain locked,” “wrong user
session,” and “LaunchDaemon context unsupported.” A headless pre-login LaunchDaemon
is explicitly unsupported in the first release and must fail closed; there is no
plaintext credential fallback. Logout removes only the Keychain item for the exact
tenant/user/device binding. Uninstall unloads the LaunchAgent and removes runtime
versions only after confirmation, while preserving credentials unless `logout` or
an explicit credential-removal option is requested.

Production macOS packs code-sign SmartAIHub-owned executable code with Developer
ID, verify nested bundled binaries without rewriting vendor signatures, submit the
final archive for Apple notarization, and record the notarization request/result in
the external manifest/evidence. `codesign`, `notarytool`, and any Apple signing
certificate are release-runner concerns. The installed executor runs with bundled
Node/Chromium/FFmpeg and does not require Xcode, Xcode Command Line Tools, Rust,
Cargo, Tauri, Homebrew, or an Xcode project on the render Mac.

## CI and release workflow

Create `.github/workflows/remotion-executor-release.yml`. Keep it independent of
`.github/workflows/desktop-release.yml`; it must not run `tauri-action`, install
Rust, or build the Worker App. The workflow is manually/tag triggered and uses a
matrix with these logical targets:

- Windows x64 pack build on a Windows runner, followed by a separate real
  Windows 11 x64 evidence job;
- WSL2 x64 pack build on Linux plus a real Windows 11 WSL2 evidence job;
- Linux x64 pack build/evidence on the declared supported Linux version;
- macOS arm64 pack build/evidence on an arm64 runner;
- macOS x64 pack build/evidence on a native Intel runner.

Every matrix job checks out the same commit, installs Node `22.22.x` with npm
`10.9.8`, runs `npm ci`, builds `@smartspec/remotion-render` and
`@smartspec/remotion-executor`, runs focused unit tests, assembles only its native
pack, verifies it, runs native doctor, and renders the deterministic short fixture.
Signing jobs run only for protected tags/environments and receive the release key;
pull-request jobs build unsigned test fixtures with a test key that can never be
accepted by production trust anchors.

The workflow uploads the ZIP, external manifest, detached signature, doctor JSON,
render report, output MP4 SHA-256/size/probe JSON, service status, and rollback
report as immutable CI artifacts. Evidence JSON records runner OS/build,
architecture, `process.arch`, translation/WSL probe, Git commit, pack/profile hash,
dependency versions, test command/result, render duration, and redacted failure
codes. It must not upload Keychain/DPAPI blobs, worker tokens, device keys, full
environment dumps, server URLs containing query credentials, or user media.

Only `promote-platform-pack.mjs` may turn a candidate manifest to `allowed: true`,
and it does so only when the expected native evidence set is complete. Windows
native and both macOS architectures are mandatory for the first release gate.
WSL2 and Linux are independently enabled only after their own evidence; failure in
one does not relabel or disable a different platform pack.

## Test-first implementation and evidence

### Unit and contract tests written before release logic

Add package tests before implementing the corresponding behavior:

- `packages/remotion-render/src/remotionExecutorRuntimePackSchema.test.ts` covers
  all valid IDs, OS/architecture/environment mappings, strict unknown-field
  rejection, contract/version bounds, and cross-architecture rejection.
- `apps/remotion-executor/scripts/__tests__/build-platform-pack.test.ts` uses tiny
  fixture files to prove deterministic entry ordering, manifest contents,
  checksums, signature input, unique staging, allowlisted output, and cleanup that
  cannot touch a prior release.
- `apps/remotion-executor/scripts/__tests__/verify-platform-pack.test.ts` rejects
  changed bytes, wrong hash/key/platform/contract, duplicate/case-colliding names,
  traversal, absolute/UNC/drive paths, symlink/reparse/device entries, oversized
  archives, missing licenses, and unlisted files.
- `apps/remotion-executor/scripts/__tests__/promotion-rollback.test.ts` proves
  evidence completeness, atomic external-manifest replacement, signature renewal,
  exact rollback target validation, and preservation of archive/credentials.
- Extend `apps/remotion-executor/test/runtimeManifest.test.ts` from Workstream 04
  with staged extraction, active-pointer update, interrupted install, previous
  version retention, and update-during-active-lease refusal.
- Extend `apps/web/server/routes/__tests__/workerRuntime.test.ts` with the three native IDs,
  valid/invalid signatures, disabled releases, latest-version selection,
  filename traversal, absence of query/cookie credential authorization,
  redacted errors, and unchanged legacy pack behavior.

Tests use generated ephemeral Ed25519 keypairs and temporary directories. No test
uses or requires a production key, live release directory, user Keychain, or user
DPAPI store.

### Platform-native acceptance

Each native evidence job must execute, in order:

1. verify the downloaded external manifest/signature and archive digest;
2. install into a clean temporary/user test root;
3. run `doctor --json` and assert every mandatory check is green;
4. connect to a non-production fake or isolated control plane using the real OS
   credential adapter, restart the process/service, and prove the credential can
   authenticate without appearing in config, process arguments, logs, or output;
5. render a deterministic 3–5 second, 720×1280 H.264/AAC MP4 through the actual
   bundled Node, browser, Remotion package, FFmpeg, fonts, and executor entrypoint;
6. verify MP4 probe metadata, non-zero size, SHA-256, expected progress stages,
   process cleanup, and isolated workspace cleanup;
7. install a second signed test version, prove atomic activation between jobs,
   deliberately fail its doctor, and prove automatic/manual rollback retains the
   first working version;
8. stop/unload the service and verify no orphan renderer/browser/FFmpeg process
   remains.

Windows evidence additionally proves that no WSL process was invoked and that the
Scheduled Task runs as the connected user. WSL2 evidence proves Linux-only paths
and rejects `/mnt/c` render roots. Linux evidence proves the systemd user sandbox
and native shared libraries. macOS evidence proves the correct architecture,
non-translated execution, LaunchAgent user context, Keychain persistence across a
service restart, code-signature validation, and that no Xcode/Tauri command or
artifact is required on the host.

Focused test success must be reported as focused evidence. Repository-wide
typecheck/test failures outside these files remain separate baseline diagnostics
and must not be presented as a globally clean build.

## Failure handling and security invariants

- Unknown or mismatched platform data fails closed before registration and before
  extraction; it is never normalized to the current host.
- A valid SHA-256 without a valid pinned-key signature is untrusted. HTTPS and
  server authentication do not replace artifact signature verification.
- Release keys never enter archives, logs, PR jobs, command-line arguments, or web
  server responses. Public key rotation requires an overlap window signed by a
  currently trusted key and is tested before retirement.
- Installer/update code never follows links, executes from staging before full
  verification, broad-deletes an install root, or mutates another pack family.
- Service definitions run as the paired user and expose no secret through process
  arguments or environment. Windows uses user-scoped DPAPI; macOS uses the paired
  user's Keychain; Linux/WSL2 require the approved secure credential adapter.
- Pack download is a public signed-release operation, not a tenant data grant.
  Pack metadata never grants job access; worker tokens, MCP tokens, and pack
  signatures remain separate trust planes.
- Disabling a pack blocks new download, registration readiness, and claims for
  that pack without deleting durable jobs or uploaded artifacts. In-flight jobs
  follow the lease/cancellation policy from Workstream 02.
- Existing `hyperframes-*`, `hermes-*`, and Worker App release files, IDs, routes,
  manifests, and installers remain independently testable and rollback-safe.

## Implementation order

1. Add the shared strict schema and three native target descriptors/tests;
   target tests.
2. Add deterministic build and verify tests, then implement the release helper,
   pack builder, verifier, archive layout, and package scripts.
3. Add server tests for ID matching, signature/trust, public-release safety, and legacy
   compatibility; then implement the separate route/service branch.
4. Add installer/service tests and assets for Windows, Linux/WSL2, and macOS;
   extend Workstream 04 runtime-manifest/doctor behavior only where the tests prove
   a platform gap.
5. Add promotion/rollback tests and commands, including atomic publication and
   previous-version retention.
6. Add the independent CI release matrix and produce unsigned/test-key artifacts.
7. Run native evidence for the three mandatory targets; keep any target
   `allowed: false` until its complete evidence passes. WSL2/Linux remain
   deferred and unadvertised.
8. Hand signed manifests, evidence references, rollback targets, and operational
   docs to Workstream 08 for staged tenant rollout.

## Rollback and handoff gate

This workstream is complete only when all unit/route tests pass, each target pack
is reproducibly named and independently verifiable, the three mandatory desktop
targets have real native short-render evidence, WSL2/Linux remain safely disabled
until their own proof passes, macOS installation is demonstrated without Xcode or
Worker App/Tauri, and a rollback drill restores a previously verified pack without
credential or job loss.

The handoff to Workstream 08 consists of the immutable archive hashes, signed
external manifests, public key IDs, native evidence JSON, current and rollback
versions, exact feature/pack gates, and the platform install/release runbooks. No
production promotion occurs as part of this section alone.

## UI/UX Contract

### Target User / JTBD
N/A — platform packaging, installers, and release operations; no browser task is changed.

### Surface Inventory
N/A — no browser route or component is introduced.

### Component Map
N/A — no frontend ownership changes.

### State Matrix
N/A — state is represented by installer/doctor/release evidence.

### Responsive Matrix
N/A — no responsive layout is changed.

### Accessibility Acceptance
N/A — no browser interaction is introduced; installer output remains bounded and sanitized.

### Copy Contract
N/A — no browser copy is added.

### Browser Evidence Required
N/A — native platform evidence belongs to Section 08.
