# Section 02: Tauri Gemma 4 LiteRT Runtime

## Ownership

- desktop-native Gemma 4 runtime bridge
- app-local model storage and install/remove lifecycle
- E4B primary profile with E2B fallback
- Tauri local voice runtime foundation
- bundled helper / sidecar lifecycle
- packaged local skill runtime foundation for reviewed Python/JS/TS/JSX/TSX skills

## Target files

- `apps/tauri-shell/src-tauri/src/lib.rs`
- `apps/tauri-shell/src-tauri/src/local_ai/mod.rs`
- `apps/tauri-shell/src-tauri/src/local_ai/install.rs`
- `apps/tauri-shell/src-tauri/src/local_ai/runtime.rs`
- `apps/tauri-shell/src-tauri/src/local_ai/storage.rs`
- `apps/tauri-shell/src-tauri/src/local_ai/sidecar.rs`
- `apps/tauri-shell/src-tauri/src/local_ai/skill_runner/mod.rs`
- `apps/tauri-shell/src-tauri/src/local_ai/skill_runner/manifest.rs`
- `apps/tauri-shell/src-tauri/src/local_ai/skill_runner/permissions.rs`
- `apps/tauri-shell/src-tauri/src/local_ai/skill_runner/python.rs`
- `apps/tauri-shell/src-tauri/src/local_ai/skill_runner/node.rs`
- `apps/tauri-shell/src-tauri/src/local_ai/skill_runner/outbox.rs`
- `apps/tauri-shell/src-tauri/bin/smartspec-local-ai`
- `apps/web/client/src/features/local-ai/adapters/tauriLocalRuntime.ts`
- `apps/web/client/src/features/local-ai/hooks/useTauriLocalAi.ts`
- `apps/web/client/src/features/local-ai/state/localAiDeviceStateStorage.tauri.ts`
- `apps/web/server/services/localAiCatalog.ts`

## Implementation approach

1. Add a dedicated Local AI module to the Tauri shell.
   - Follow the existing sidecar/binary resolution pattern already used in the Tauri shell for FFmpeg-style tooling.
2. Implement a narrow command surface:
   - probe capability
   - install profile
   - remove profile
   - run inference
   - dispose runtime
   - run reviewed packaged local skill
3. Use `gemma-4-E4B-it.litertlm` as the primary desktop artifact.
4. Use `gemma4-e2b-tauri-fast` as the explicit fallback profile.
5. Keep artifact storage under app-local data and scope logical visibility by tenant/user.
6. Use a tightly scoped native helper / sidecar invoked only through the Tauri command boundary.
7. Add bounded desktop local voice support on top of the same runtime bridge.
8. Add a separate reviewed local-skill runner for packaged Python/JS/TS bundles:
   - packaged interpreter only
   - reviewed entrypoint only
   - JSX/TSX source supported only through compiled reviewed bundle artifacts
   - network deny by default
   - app-owned filesystem roots only
   - bounded timeout and output-size limits
   - bounded execution envelope with no reusable auth/provider secrets
   - offline result outbox owned by the Tauri app layer
9. Add local-script manifest validation and permission-profile resolution:
   - reject missing digest/provenance metadata
   - reject missing staged root declarations
   - map reviewed bundles to named permission profiles

## TDD expectations

- Add command tests for probe/install/remove/infer/dispose.
- Add command tests for reviewed packaged-skill execution boundaries.
- Add command tests for manifest validation, permission-profile resolution, and offline outbox behavior.
- Add tests for helper/sidecar resolution and non-public launch behavior.
- Add storage tests for scope isolation and revoked-profile invalidation.
- Add tests proving E4B is attempted first on capable machines.
- Add tests proving E2B fallback works without broadening to unsupported larger profiles.

## Acceptance checks

- Tauri can install and remove the primary E4B profile
- Tauri can report readiness without relying on browser capability logic
- desktop local voice failure does not break typed chat
- no cross-account install visibility leak occurs
- the helper/sidecar is launched only through the intended Tauri command boundary and is not exposed as a general network service
- reviewed Python/JS/TS/JSX/TSX local skills can run without exposing arbitrary shell or unrestricted filesystem/network access
- reviewed local-script executions never receive reusable session/provider secrets
- offline reviewed local-script results can be staged and later synced without the script owning backend auth

## Risks and coordination

- Keep the command surface small enough to preserve desktop security.
- Section 04 owns additional security and rollout constraints.
- Scripted local-skill execution must stay a reviewed sub-surface of this runtime, not a generic desktop code-execution API.
- The runner should prefer staged file roots and outbox writes over direct access to user-chosen host paths.
