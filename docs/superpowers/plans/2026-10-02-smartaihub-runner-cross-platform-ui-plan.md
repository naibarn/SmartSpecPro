# SmartAIHub Runner Cross-Platform UI Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship a dedicated Windows/macOS SmartAIHub Runner UI, preserve CLI operations with `--workspace`, explain bounded tool probe outcomes, and build review installers in isolated GitHub Actions.

**Architecture:** A separate Tauri 2 host consumes the existing Runner Rust crate; the CLI and UI share connection, discovery, workspace, and execution code. The UI exposes only approved operations, and a separate workflow builds UI installers without changing Desktop releases or CLI artifact publishing.

**Tech Stack:** Rust, Tauri 2, native HTML/CSS/JavaScript frontend, existing GitHub Actions and Rust toolchain.

**Spec:** `docs/superpowers/specs/2026-10-02-smartaihub-runner-cross-platform-ui-design.md`

## Global Constraints

- Keep SmartAIHub Runner separate from `apps/tauri-shell` and its Desktop product identity.
- Preserve CLI commands and release artifacts; Linux remains CLI-only.
- Store workspace paths locally; publish IDs only.
- Do not expose raw probe output, executable paths, environment values, or credentials.
- Auto-start is opt-in and per-user; UI IPC exposes no arbitrary shell execution.
- Do not run workspace TypeScript typecheck.

## Review Focus

- Tool probes can time out, fail to launch, or return nonzero; map each to a bounded reason code.
- A successful version probe must not be presented as account authorization or readiness.
- A UI `Stop` action must not leave the owned Runner process running.
- Workspace defaults and paths remain local and never appear in server inventory.
- macOS Universal packaging needs both architectures and cannot claim notarization without signing secrets.

---

### Task 1: Shared Runner CLI and probe diagnostics

**Files:** Modify `apps/runner-app/src/main.rs`, `apps/runner-app/src/adapters.rs`, `apps/runner-app/src/diagnostics.rs`; inspect `workspace_registry.rs` without changing its privacy contract.

**Interfaces:** Preserve current CLI invocation; add `run --workspace <path>` and `rescan --workspace <path>`. Probe failures become serialized stable reason codes.

- [x] Add argument parsing that accepts the existing positional syntax and optional `--workspace <path>`; validate and register through `workspace_registry::register` before run/rescan.
- [x] Convert probe timeout, launch error, and nonzero exit to bounded safe codes; make every discovered approved candidate retain failed health/availability instead of silently remaining unknown.
- [x] Remove raw browser probe error strings from published `reasonCodes`; preserve internal diagnostics only where they do not enter the capability snapshot.
- [x] Make local Runner refresh sleep interruptible and expose a lifecycle stop flag at refresh boundaries for the UI host.
- [x] Keep authentication separate from version/health evidence.

### Task 2: Dedicated Runner desktop host and UI

**Files:** Create `apps/runner-desktop/Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json`, `src/main.rs`, and `ui/index.html`, `ui/app.js`, `ui/styles.css`.

**Interfaces:** Tauri commands: `runner_status`, `connect_runner`, `rescan_runner`, `start_runner`, `stop_runner`, `list_workspaces`, `add_workspace`, `remove_workspace`, `set_default_workspace`, `set_auto_start`, `quit_runner`. Every command returns bounded structured data or a safe error code.

- [x] Create a distinct product identity/bundle identifier and reference `apps/runner-app` as a path dependency.
- [x] Add owned process lifecycle management so stop/shutdown terminates the Runner cleanly; report startup, running, stopping, and error states.
- [x] Implement connect with the existing browser approval flow, showing waiting/success/failure in the window.
- [x] Build a focused UI for connection status, start/stop/rescan, tool readiness with safe reason explanations, and workspace selection/removal via native folder picker.
- [x] Persist selected default workspace and auto-start preference locally; apply auto-start through a per-user OS login integration; window close hides to the tray with Open and Quit actions.
- [x] Restrict Tauri capabilities to app commands, folder selection, and window/tray operations.

### Task 3: Task Control reason explanations

**Files:** Modify `apps/web/client/src/components/chat/UniversalControlPlanePanel.tsx`.

**Interfaces:** `runnerToolReadiness` consumes `reasonCodes` in addition to current status dimensions and returns a localized label/detail/readiness value.

- [x] Add safe mappings for probe launch failure, timeout, nonzero exit, auth required, and successful probe.
- [x] Render mapped explanations while keeping unknown codes generic and never rendering paths or raw command output.

### Task 4: Isolated Runner UI release workflow and operator guide

**Files:** Create `.github/workflows/runner-desktop-release.yml` and `apps/runner-desktop/README.md`.

- [x] Add manual Windows x64 NSIS and macOS Universal Tauri builds; produce checksummed manifests and upload review artifacts.
- [x] Keep UI workflow separate from `desktop-release.yml` and `runner-release.yml`; do not publish unless platform signing/notarization conditions are satisfied.
- [x] Document UI use, CLI `--workspace`, auto-start, Windows/macOS signing limits, and the current Linux CLI distribution.

## Validation

- Run focused Rust `cargo check`/release build commands for the Runner library and desktop host where host prerequisites permit.
- Inspect GitHub workflow syntax and diff; native Windows/macOS installer builds must be confirmed by their GitHub Actions runs.
- Do not claim signing, notarization, installation, or native OS runtime validation without corresponding evidence.
