# SmartAIHub Runner Cross-Platform UI Design

**Status:** User-approved for implementation
**Date:** 2026-10-02

## 1. Goal and accepted scope

Provide a clear local Runner application on Windows and macOS while preserving
the existing command-line Runner for Linux and automation. Users should be able
to connect a device, start and stop Runner execution, inspect detected tools and
their probe results, and configure project workspaces without editing
environment variables or JSON files.

The request also includes correcting the current silent probe failure reporting
and producing platform installers from GitHub Actions. Linux remains a CLI
product. The existing Runner control protocol, browser approval flow, workspace
registry, release signatures, and Cloudflare Container profile remain the
canonical implementations.

## 2. Current evidence

- `apps/runner-app` is a Rust library and CLI. The no-argument command defaults
  to `status`; `connect`, `rescan`, `run`, and `workspace add|list|remove` exist.
- Windows release packaging currently emits a raw executable and ZIP, not an
  installer or graphical application.
- `run_local_entrypoint` is a long-running loop. Its normal operation does not
  provide a persistent interactive UI.
- During a Runner refresh, errors from the bounded tool version probe are
  discarded. Candidates therefore remain `Discovered` with unknown health,
  auth, and availability, and the Task Control UI cannot show the cause.
- Task Control already renders Runner status, registered workspaces, tools,
  and capabilities. Inventory already carries bounded `reasonCodes`; the local
  and web UIs currently need to preserve and explain probe failures rather
  than discard them.
- The repository already has Tauri 2 and a GitHub Actions release workflow for
  Windows, universal macOS, and Linux. The current Tauri product is SmartAIHub
  Desktop and is not the Runner UI.

## 3. Product behavior

### Windows and macOS application

Create a separate, branded **SmartAIHub Runner** Tauri application. It must not
open the SmartAIHub Desktop login/home page as its primary surface.

The main window provides:

- Connection state and a `Connect` / `Reconnect` action. Connect opens the
  existing browser approval flow and reports waiting, approved, failed, or
  timed-out states.
- `Start`, `Stop`, and `Rescan` actions with visible progress and actionable
  errors. Closing the window must have an explicit behavior; when background
  mode is enabled, closing hides to the tray rather than silently stopping the
  Runner.
- A tool inventory showing each detected tool, version, installation state,
  probe state, readiness, and a safe human-readable reason when not ready.
- Workspace management to add folders with the native folder picker, remove
  folders, and select a default workspace. Show the folder path locally so the
  user can identify it; never upload the local absolute path to the control
  service.
- An opt-in `Start when I log in` setting on Windows and macOS. It is per-user
  and requires no administrator privileges. Startup launches the Runner UI in
  background mode; the tray/menu allows the user to open the window and stop
  execution.

The UI calls the existing Rust Runner library through narrowly scoped Tauri
commands and polls local status while running. It does not duplicate the
pairing, control, or tool execution logic. Desktop updates use the desktop
installer channel and never replace the GUI executable with the CLI update
artifact. Runner execution runs under an owned, cancellable lifecycle so Stop
and application shutdown do not leave an orphan Runner process.

### CLI

Keep the existing commands and their behavior available on Windows, macOS, and
Linux. Linux distribution remains CLI-only. Add a convenience
`--workspace <path>` option for local `run`/`rescan` use: it validates and
registers the supplied folder in the existing local workspace registry before
starting the operation. Keep `workspace add|list|remove` for explicit
management and repeatable workflows. Server-dispatched work continues to use
registered workspace IDs and existing authorization checks.

### Tool probe diagnostics

When an approved adapter probe fails, preserve the candidate and publish a
degraded/probe-failed state with a stable reason code (for example, executable
launch failure, timeout, or non-zero exit). Do not silently leave the probe as
unknown. Do not include executable paths, raw command output, auth material, or
environment values in user-visible inventory. Task Control and the local UI
translate reason codes into actionable messages and distinguish:

- found but probe failed;
- found and healthy but account authorization is still required;
- ready for use;
- not installed/not found;
- stale or disabled.

Version detection alone must not imply authentication or execution readiness.

## 4. Architecture and data flow

- Add a Runner-specific Tauri 2 app with its own product name, bundle identifier,
  frontend, and installer configuration. Keep it separate from
  `apps/tauri-shell` so the product identity and release lifecycle remain clear.
- Reuse `apps/runner-app` as the shared Rust engine and CLI. The Tauri host
  starts and stops a cancellable Runner lifecycle and forwards structured state
  events to the UI; it does not shell out to an unowned background process.
- Store non-secret UI preferences (workspace selection and auto-start) in a
  versioned settings file under the Runner data root using atomic writes and
  user-only permissions where supported. Keep connection credentials in the
  existing protected connection store.
- The Runner sends bounded capability/tool snapshots through the existing
  control protocol. The web Task Control panel displays safe diagnostics from
  the snapshot; it does not receive local folder paths.
- UI actions are restricted to approved Runner operations. Arbitrary shell
  commands are not exposed through Tauri IPC.

## 5. Packaging and GitHub Actions

- Add a dedicated manual Runner UI release workflow or a clearly isolated UI
  job in the existing Runner release workflow; do not repurpose the SmartAIHub
  Desktop release workflow.
- Build the Tauri Runner app on GitHub-hosted Windows and macOS runners. Produce
  a Windows installer and a macOS Universal `.dmg`/`.app` supporting Intel and
  Apple Silicon. Keep the existing Linux CLI build and artifact unchanged.
- Build and validate the standalone CLI separately for Windows x64, macOS x64,
  macOS arm64, and Linux x64 so automation users retain a small command-line
  download.
- CI must produce unsigned review artifacts without platform certificate
  secrets. Production distribution must gate publication on Windows
  Authenticode signing and Apple Developer ID signing/notarization secrets.
  `RUNNER_SIGNING_KEY` continues to sign Runner update assets and is not an OS
  installer certificate.
- Record artifact hashes, target architecture, version, source commit, and
  signing status in the manifest. Failed target builds must fail the workflow;
  publishing cannot proceed with a missing required platform artifact.

## 6. Compatibility and security

- Do not alter the browser approval trust model or expose tokens/private keys to
  the webview.
- Preserve the existing connection store and release signature verification.
- Validate workspace paths as absolute existing directories and register them
  through the existing registry. Paths remain local; only workspace IDs and
  bounded capability metadata are sent to SmartAIHub.
- Auto-start is opt-in, per-user, reversible from the UI, and limited to
  launching the signed/installed Runner application.
- Existing command invocations and shared-container behavior remain compatible.

## 7. Acceptance criteria

1. Windows and macOS builds open a dedicated SmartAIHub Runner UI and do not
   default to the Desktop web home/login surface.
2. A user can connect through browser approval, start/stop Runner, and see live
   connection and probe status with understandable failure reasons.
3. A user can add/remove local workspace folders and choose the default; only
   workspace IDs appear in server inventory.
4. Windows and macOS login auto-start is opt-in, starts in background mode,
   and can be disabled from the UI. Windows uses a tray entry; macOS uses a
   menu-bar entry.
5. A failed probe is no longer presented as an unexplained `Discovered ·
   Unknown`; it reports a stable reason without leaking local paths or secrets.
6. Tool discovery is scan-only. The user can explicitly Verify each found tool;
   the result distinguishes command responsiveness from provider authentication
   and real task dispatch. Codex Verify submits `สวัสดี` through the real CLI,
   displays its answer, and warns that it may use quota. The desktop panel also
   shows app version, setup build date, first launch on this device, access-token
   expiry and re-pair deadline.
7. Linux CLI behavior remains intact and accepts `--workspace <path>` for the
   convenience flow.
8. GitHub Actions builds Windows installer, macOS Universal installer, and
   existing Linux CLI artifacts; each required matrix artifact is verified
   before publication.

## 8. Implementation decisions

- Tauri 2 auto-start and tray/menu integration is used with a per-user setting.
- Windows UI review artifacts use the Tauri-supported NSIS setup `.exe`.
- Confirm production signing secret availability. Without Apple and Windows
  signing identities, GitHub can build review installers but cannot produce
  fully trusted public installers.

## 9. Validation evidence

Validate the Rust Runner crate and the dedicated Tauri app locally where the
host platform permits. GitHub Actions must independently build Windows and
macOS artifacts; Linux host builds do not prove native installer correctness.
Inspect produced artifact names, architecture, hashes, signatures, and the
release manifest before enabling catalog publication. Do not claim Windows or
macOS runtime behavior solely from a successful cross-platform compile.

## 10. Implementation status update — 2026-10-03

The following release-management behavior is implemented in source:

- The admin build panel defaults to the Runner Desktop GUI product and keeps
  the standalone CLI build as a separate selectable product.
- Desktop builds dispatch the dedicated `runner-desktop-release.yml` workflow.
  The admin can request Windows, macOS Universal, or both unsigned review
  installers.
- On opening the admin panel, the next patch version is suggested from the
  recorded Runner build history when that history request succeeds. The build
  action stays disabled until the history request completes; if it fails, the
  panel currently falls back to the desktop app's base version.
- Completed desktop builds expose admin-only download links for each available
  GitHub Actions artifact. Downloads are streamed through SmartAIHub after
  checking the admin session, build, repository, workflow run, platform, and
  artifact identity.
- The Windows/macOS workflow artifacts are ZIP downloads containing the
  installer and its checksum/manifest files. The Windows installer is an NSIS
  setup executable; the macOS installer is a Universal DMG.

The desktop package currently contains the GUI application only. It does not
bundle the standalone CLI, so installing once does not provide both the GUI and
CLI. Combining both products in one installer remains a separate, unimplemented
requirement. Desktop review installers are unsigned and are not published to
the public Runner catalog.

In the initial implementation update, the admin release-flow changes were on branch
`codex/runner-desktop-build-ui` at implementation commit
`0219acdc54602a6c49231935f7af4f90c5f7b57d`; they have not yet been integrated
into `origin/main` or deployed.

Production investigation on 2026-10-03 confirmed that the public Windows
catalog package `smartaihub-runner-windows-x86_64-0.2.8.zip` contains only the
4.46 MB `smartaihub-runner.exe` CLI. It cannot show a desktop UI. The separate
Tauri review build produced a 3.23 MB NSIS setup executable and a manifest with
SHA-256, target, version, source commit, and `unsigned-review` status. The UI
installer is available through the admin desktop build flow; public catalog
assets remain CLI-only until platform signing/publication is implemented. The
Admin GUI download flow is implemented on the session branch but is not yet
available on production before integration and deployment.

Follow-up fixes clarify this distinction in English and Thai on the public
Runner page and correlate each desktop build to a unique workflow dispatch so
an earlier successful run cannot be mistaken for the current build. The first
focused GitHub Actions check did not reach tests because the baseline
`pnpm-lock.yaml` omits the existing `apps/cloudflare` local shared-package
specifier. The focused workflow now resolves only the web test dependency graph
without changing the repository lockfile. On branch commit
`9f623b80de23703e138781e7c78268e9c105fb1d`, GitHub Actions run `37144728074`
passed all four targeted suites (11 tests): Runner public panel, admin GUI
default state, release build service, and release API route. Follow-up auth
regression tests on `codex/runner-artifact-auth-20261004` passed in run
`37146039331`, bringing the scoped total to 13 tests and proving unauthenticated
and non-admin artifact download requests are rejected before artifact access.
The Windows NSIS
job passed in run `37143619426`, producing the 3,222,641-byte
`SmartAIHub Runner_0.2.12_x64-setup.exe`. Its manifest identifies source commit
`1c3afa4e4f85d38fb9c270c19c0e729ed712ce4b`, and the SHA-256 listed in
`SHA256SUMS` verified successfully. The installer is an NSIS GUI executable;
it is unsigned review output. The same latest branch commit built the 9,590,914-
byte macOS Universal DMG in run `37144728074`; its manifest lists x86_64 and
aarch64, and checksum `70fc29feae8770e49cf6e3eaf8667798bd5aa8e97b0a839a3598e3b95316ca00`
verified successfully. Both platform installers are unsigned review artifacts.
Integration into `origin/main`, deployment, and live Admin download verification
remain pending.
