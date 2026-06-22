# Section 07: Worker App Shell And Runtime Pack

## Goal

Create the Windows-first **Smart AI Hub Worker App** as a separate lightweight
Tauri workspace with UI-managed settings, background/minimize behavior, and
HyperFrames runtime doctor/readiness.

## Dependencies

- section-01-contracts-and-flags
- section-06-worker-connect-auth

## In Scope

- New `apps/worker-app` Tauri workspace.
- Product naming/build profile for the lightweight worker app.
- Runtime manifest and doctor.
- Settings UI requirements.
- Runtime pack download/verification if lightweight mode is chosen.
- Windows installer/update/release gate.
- Tauri capability hardening.

## Files To Review

- `apps/tauri-shell/src-tauri/src/desktop_runtime_capabilities.rs`
- `apps/tauri-shell/src-tauri/src/desktop_worker_credentials.rs`
- `apps/tauri-shell/src-tauri/src/desktop_worker_control_plane.rs`
- `apps/tauri-shell/src-tauri/tests/desktop_runtime_capabilities_tests.rs`
- `apps/tauri-shell/src-tauri/tests/desktop_worker_runtime_tests.rs`

Review existing `apps/tauri-shell` code only to extract or mirror the small
worker client/runtime pieces that are still useful. The deliverable is a new
`apps/worker-app` product and must not require users to install the full
desktop shell.

## Files To Change

- `apps/worker-app/package.json`
- `apps/worker-app/src/**`
- `apps/worker-app/src-tauri/tauri.conf.json`
- `apps/worker-app/src-tauri/capabilities/*.json`
- `apps/worker-app/src-tauri/src/**`
- `apps/worker-app/src-tauri/tests/**`
- `apps/worker-app/scripts/**`
- `apps/worker-app/sidecars/**`
- `apps/worker-app/runtime-pack/**`
- new runtime pack manifest module if needed
- Worker App frontend for settings/readiness
- Rust tests for runtime doctor and config

## Test First

- Test: app registration payload advertises HyperFrames capability only when
  doctor passes.
- Test: doctor fails when HyperFrames sidecar missing.
- Test: doctor fails when Thai font check fails.
- Test: doctor reports FFmpeg/FFprobe/browser/HyperFrames versions.
- Test: runtime pack manifest hash mismatch blocks readiness.
- Test: credentials can be stored, read, deleted, and cleared.
- Test: settings serialize without exposing tokens.
- Test: `apps/worker-app` builds as a separate lightweight product named Smart
  AI Hub Worker App.
- Test: installing/running Worker App does not require installing or launching
  the full `apps/tauri-shell` product.
- Test: first-run connect opens browser approval and has no in-app username,
  password, API key, manual token, or cookie import field.
- Test: connected state survives app restart through secure token storage and
  automatic refresh, unless the server revoked or expired the connection.
- Test: Worker App creates one per-install device private key/proof secret in OS
  secure storage and never exports it through UI, logs, diagnostics, support
  bundles, settings, or artifacts.
- Test: Worker App signs authenticated worker requests with the bound device key
  and clears tokens when the server reports device proof mismatch or replay.
- Test: signed Windows installer metadata uses Smart AI Hub Worker App naming.
- Test: lightweight runtime download resumes and verifies hash/signature before
  enabling readiness.
- Test: runtime pack manifest includes license notices, checksum file,
  signature file, supported contract versions, and immutable version metadata.
- Test: runtime allowlist/denylist/rollback manifest blocks disabled runtime
  versions before the worker advertises capability or claims jobs.
- Test: release gate covers install, uninstall, update, first-run connect,
  runtime doctor, and minimize-to-tray behavior.

## Implementation Steps

1. Scaffold `apps/worker-app` as a separate Tauri v2 workspace and keep it
   focused on worker duties only.
2. Use **Smart AI Hub Worker App** for user-visible installer/window/tray/update
   naming.
3. Extract or mirror only the narrow worker credential/control-plane/runtime
   helper code needed from `apps/tauri-shell`; keep the full shell independent.
4. Add runtime manifest fields for sidecar path, HyperFrames version, browser,
   FFmpeg/FFprobe, fonts, hashes, license notices, checksum/signature files,
   supported contract versions, and runtime profile hash.
5. Add runtime allowlist/denylist/rollback handling so the server can block
   broken runtime packs before claim.
6. Add runtime doctor command used by UI and heartbeat metadata.
7. Add first-run connect UX that opens the browser approval page, waits for
   device-code/custom-protocol approval, stores worker tokens in secure storage,
   and never asks for SmartAIHub credentials inside the app.
8. Generate and persist a per-install device key/proof secret in OS secure
   storage; use it to sign worker API requests and bind the token set to this
   machine.
9. Add UI-managed settings:
   - server URL preset;
   - worker label;
   - accept jobs;
   - sharing mode;
   - start with Windows;
   - minimize to tray;
   - max concurrent jobs;
   - workspace/cache folder;
   - runtime channel/version;
   - diagnostics level.
10. Add runtime pack download/update flow if lightweight installer is selected.
11. Narrow Tauri capabilities around sidecar execution and file access.
12. Persist safe settings in app data and secrets/device private key in secure
    storage.
13. Define Windows release gate checklist for complete installer and lightweight
   installer paths.

## UI/UX Contract

### Target User / JTBD

- Role: worker owner.
- Goal: install, connect, verify readiness, and let worker process jobs.
- Entry point: desktop app first launch.
- Success outcome: app shows "Ready for render jobs" and can be minimized.

### Surface Inventory

| Surface | File/route | Change |
| --- | --- | --- |
| Desktop app main window | `apps/worker-app` frontend | connect/readiness/current job/settings |
| System tray | Worker App shell | minimize/background state |

### Component Map

| Component | File | Owns | Consumes |
| --- | --- | --- | --- |
| Connect panel | Worker App frontend | connection CTA/state | worker connect APIs |
| Runtime doctor panel | Worker App frontend | readiness checks | Tauri doctor command |
| Settings panel | Worker App frontend | UI-managed config | secure settings store |
| Current job panel | Worker App frontend | local progress | worker loop state |

### State Matrix

| State | Expected UI | Verification |
| --- | --- | --- |
| not connected | one primary connect action | UI/Rust tests |
| browser approval pending | waiting state with retry/expiry, no credential fields | UI/Rust tests |
| runtime missing | download/install runtime action | UI/Rust tests |
| ready | accept jobs toggle and idle status | UI/Rust tests |
| running | current job progress | UI/Rust tests |
| error | readable blocker and diagnostics action | UI/Rust tests |
| disabled/focus/hover | accessible settings/actions | browser/manual evidence |

### Responsive Matrix

| Viewport | Expected behavior | Evidence |
| --- | --- | --- |
| mobile 390x844 | N/A desktop app Windows MVP | N/A |
| tablet 768x1024 | window min size handles settings stack | manual |
| desktop 1440x900 | full dashboard layout | manual |
| small-mobile 360x800 | N/A desktop app Windows MVP | N/A |
| laptop 1024x768 | app usable at min width/height | manual |
| wide-desktop 1280x800 | no oversized marketing layout | manual |

### Accessibility Acceptance

- Keyboard path: connect, settings, accept jobs, diagnostics reachable.
- Focus visibility: all controls show focus.
- Labels/semantics: settings controls have labels.
- Contrast: readiness/error states readable.
- Reduced motion: progress motion restrained.

### Copy Contract

- Tone: simple install/connect/run wording.
- Primary languages: Thai with English fallback where practical.
- Required labels: Connect to Smart AI Hub, Download render runtime, Ready for
  render jobs, Accept jobs, Minimize to tray.
- Installer/download copy must identify this as a lightweight worker helper, not
  the full SmartAIHub desktop shell.
- First-run copy must say approval happens in the browser and must not imply the
  user should log in, paste a token, or enter an API key inside Worker App.
- Error copy: say what dependency is missing and the one next action.
- Empty/loading/success copy: show idle/ready/current job state.

### Browser Evidence Required

- Manual screenshots/notes for Windows app states if browser automation is not
  available.

## Acceptance Criteria

- User can configure worker through UI.
- Runtime readiness is trustworthy and fail-closed.
- Worker app can run minimized and still report readiness/heartbeat.
- Worker App is independently installable and does not depend on the full
  `tauri-shell` product.
- Worker App connection uses browser approval/token exchange like the Chrome
  extension and contains no in-app SmartAIHub credential collection.
- Worker App tokens are bound to the local installation/device key and cannot be
  copied to another machine for worker API access.
- Windows installer/update smoke evidence exists before public release.
