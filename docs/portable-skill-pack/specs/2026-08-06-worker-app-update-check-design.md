# Worker App and Runtime Dashboard Version Checks

## Goal

When Smart AI Hub Worker App starts, compare the installed Worker App version
with the latest published Worker App installer exposed by the Dashboard. If a
newer version exists, interrupt the user with a native Tauri/Windows dialog and
offer to open the installer download. The user installs the downloaded
installer manually. Once the Worker App itself is current, perform a second
check for the selected runtime pack and ask whether to download/install it now.

## Scope and non-goals

- Check the Worker App binary version, not the managed WSL/runtime-pack version.
- Reuse the existing `GET /api/desktop-releases/worker-app/latest` endpoint and
  `/api/desktop-releases/worker-app/download` URL.
- Check the runtime manifest for the selected runtime id and channel through the
  existing `/api/workers/runtime-pack/manifest` endpoint.
- Reuse the existing verified `worker_app_install_runtime_pack` command for the
  user-confirmed runtime download/install.
- Use the configured Worker server URL, including local/development servers.
- Do not auto-download, execute, replace, or silently restart the Worker App.
- Do not download or install a runtime unless the user confirms the dialog.
- Do not block the worker loop when the Dashboard is unavailable.
- Do not change the existing release publication workflow.

## Architecture and flow

1. The React shell reads its installed version with Tauri `getVersion()`.
2. After the persisted settings are available, it requests the latest Worker
   App release with `cache: "no-store"` and a bounded timeout.
3. The client compares dot-separated numeric version segments. A Worker App
   prompt is shown only when the Dashboard version is strictly newer.
4. The Worker App prompt uses the existing Tauri dialog plugin's native confirm
   dialog so it can be seen when the app is minimized. Confirming opens the
   absolute Dashboard installer URL through the existing Tauri opener plugin.
5. Runtime checking starts only after the Worker App check is current. A new
   Tauri command reads the effective local runtime manifest, fetches the latest
   server manifest for `hyperframes-wsl2` or `hyperframes-windows-x64` and the
   configured channel, then returns current/latest versions without changing
   local files.
6. If the runtime server version is strictly newer, a second native confirm
   dialog asks whether to download/install it now. Confirming invokes the
   existing verified runtime install command immediately. Declining does not
   persist a snooze; the app asks again on the next app launch, not on every
   background refresh in the same process.
7. Process-local deduplication prevents repeated prompts for the same version.
   Failed checks are ignored from the user's workflow and can be retried on
   the next app launch.

## Failure and security handling

- Network errors, malformed JSON, missing release, and invalid versions are
  non-blocking and do not produce an update prompt.
- Relative download URLs are resolved against the configured server URL. An
  absolute download URL is accepted only when its origin matches the
  configured server URL; cross-origin installer URLs are rejected.
- Runtime installation continues to use the existing archive size, SHA-256,
  manifest, extraction, and doctor readiness checks; a failed install leaves
  the Worker App available and reports the failure through a native dialog.
- The installer remains user-initiated, preserving Windows UAC and existing
  installer trust/signature behavior.
- The current Worker loop and saved connection remain untouched by the check.

## Verification

- Add focused pure-function coverage for version ordering and update-needed
  decisions, plus Rust coverage for runtime current/latest manifest resolution
  and no-file-change preflight behavior.
- Verify the declined-runtime path is not persisted and prompts again on a new
  app launch, while remaining deduplicated during one process lifetime.
- Run Worker App TypeScript checking/build and the existing Rust tests/checks.
- Inspect the final diff to confirm unrelated dirty-worktree changes remain
  untouched.
- Release/deployment smoke verification remains separate: the Dashboard must
  serve the newly published installer for the dialog to find it.
