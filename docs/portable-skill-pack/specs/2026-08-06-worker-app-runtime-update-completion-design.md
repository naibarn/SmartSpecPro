# Worker App 0.1.170 and Runtime Update Completion

## Follow-up repair

The first implementation exposed a gap after a Managed WSL install: the UI kept
the startup runtime-check result and did not re-evaluate it when the user clicked
Run checks. The repair is shipped as Worker App `0.1.171` so an installed
`0.1.170` receives the fix through the existing latest-release updater. Manual
checks now refresh App/runtime state, and Managed WSL setup is followed by a
bounded poll that clears the render block only after the installed manifest is
current and the full doctor result is refreshed.

## Goal

Ship the next Worker App version (`0.1.170`) through the existing dashboard
release location and make startup update checks reflect the runtime that the
worker actually executes. An installed Worker App or render runtime that is
older than the dashboard latest release must produce a visible warning and a
concrete download/install action.

## Scope

- Keep the existing Worker App release naming and dashboard directories.
- Keep the strict Remotion contract gate; do not make old sidecars claim new
  payloads.
- Check Worker App and runtime independently so an App update does not hide a
  runtime update check.
- For Managed WSL, read the manifest from the configured WSL runtime root,
  not the legacy Windows app-data runtime-pack directory.
- For a stale runtime, open the verified Managed WSL setup flow or the existing
  checksum-verified runtime-pack installer, then require a full doctor check
  before render capability becomes claimable.
- Preserve non-render/Hermes work when only the Remotion lane is stale.

## Data flow and behavior

1. The app obtains the current binary version from Tauri and fetches the latest
   Worker App release with `Cache-Control: no-store`.
2. A newer binary sets a process-visible update-required state, shows a native
   warning with installed/latest versions, and opens the same-origin installer
   URL after confirmation. The warning remains visible until the app is
   restarted on the new binary.
3. Runtime update checking fetches the selected server manifest. Legacy mode
   compares the installed effective runtime-pack manifest; Managed WSL queries
   `managedWslRoot/runtime-pack/manifest.json` through `wsl.exe`.
4. A newer runtime shows the installed/latest versions and starts the correct
   install path. Successful installation must re-read the installed manifest,
   verify the profile/hash and full doctor readiness, and only then clear the
   warning.
5. Worker claim hints include the Remotion contract token only when the full
   doctor reports the expected contract. Thus stale App/runtime state cannot
   claim Remotion work, while unrelated lanes remain available.

## Failure and safety behavior

- Network or malformed-release failures do not fabricate an update, but remain
  visible as an update-check warning when the app cannot prove readiness.
- Cross-origin installer URLs are rejected.
- Runtime archives retain existing size, SHA-256, extraction, profile-hash,
  and doctor checks.
- No production job is retried or mutated as part of the release build.
- Existing dirty worktree changes are preserved; only focused Worker App,
  runtime-check, test, design, and release artifact paths are touched.

## Verification and release acceptance

- Unit tests cover numeric version ordering, App/runtime stale/current states,
  Managed WSL manifest parsing, and claim-hint gating.
- Build the next patch release with the repository release script and confirm
  the installer is copied to both source and live dashboard release folders.
- Verify the latest endpoint returns `0.1.170`, the download returns the new
  artifact, and the runtime manifest remains the latest allowed contract.
- Run focused TypeScript/Rust tests and inspect hashes, diff scope, and
  dashboard file placement. Git push/tag/GitHub release are out of scope for
  this run unless separately confirmed.
