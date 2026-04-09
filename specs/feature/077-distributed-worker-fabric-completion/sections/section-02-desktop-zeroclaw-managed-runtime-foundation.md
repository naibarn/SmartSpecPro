# Section 02: Desktop + ZeroClaw Managed Runtime Foundation

## Goal

Define SmartSpec Desktop as the worker host and ZeroClaw as the managed local runtime profile required by the revised fabric spec.

## Why this section exists

The repository already has a desktop app, but not yet a desktop worker-host product slice. The revised architecture depends on Desktop owning machine identity, runtime lifecycle, policy onboarding, diagnostics, and local execution trust boundaries.

## Scope

1. Add the missing desktop-host responsibilities:
   - sign-in and tenant binding for workers
   - worker registration UX
   - runtime profile selection
   - diagnostics and health reporting
   - background/tray/startup behavior
2. Define ZeroClaw managed profiles:
   - `native_constrained`
   - `wsl2_managed`
   - `docker_isolated`
3. Supersede the old “thin sidecar” wording from Feature 059.
4. Lock the minimum desktop worker registration metadata:
   - `desktopVersion`
   - `runtimeVersion`
   - `runtimeProfile`
   - `machineId`
   - `machineName`
   - `workspaceRootsSummary`
   - `gpuSnapshot`
   - `toolchainSummary`
   - `doctorSummary`
   - `serviceMode`
5. Define shared-worker identity and lifecycle rules for:
   - `shared_department`
   - `dedicated_gpu`
   including approval mode, budget attribution, and token-rotation triggers.

## Cross-section role

- This section depends on Section 01 for the runtime compatibility envelope, rollout gating, and handler-registration model.
- It exports the desktop worker registration contract and service-identity rules used by Section 03 for local job execution and by Section 05 for truthful operator/docs language.

## Suggested files

- `specs/feature/004-desktop-app/spec.md`
- `apps/web/shared/workerRuntime.ts`
- `apps/web/server/routes/workerRuntime.ts`
- future desktop worker-host modules under `apps/tauri-shell/src-tauri/src/`
- runtime profile and policy definitions in `apps/web`

## Reuse guidance

- keep using the existing Tauri shell and desktop packaging foundation
- bridge to runtime/worker modules instead of replacing the current desktop product path outright

## Design rules

- Desktop is the machine host; ZeroClaw is the runtime.
- Feature 075 remains the canonical source for Desktop Host identity, trust, package, and offboarding rules.
- Loopback-only defaults and explicit workspace trust should remain the baseline.
- WSL2-managed is a first-class option, not an afterthought, for Windows compatibility and stability.
- Do not bundle ZeroClaw semantics into OpenClaw-specific control paths.
- Desktop runtime updates and bundled binaries should follow the signing, trust, and revocation posture defined by Feature 075.
- Desktop worker metadata should be explicit enough for scheduler, fleet admin, and compatibility checks to reason about the machine without requiring ad-hoc JSON guessing.
- Shared or dedicated desktop workers must use service-operated execution identity and policy approval semantics; they must not silently borrow the registering admin's user context as a standing execution principal.
- Budget attribution and token rotation rules for shared desktop workers must be explicit and auditable at registration and in fleet admin views.
- Desktop registration payloads must carry the runtime-family schema/version fields defined in Section 01 rather than introducing a parallel desktop-only compatibility contract.
- Long-lived desktop registration/device secrets should live in an OS-backed secure storage abstraction where possible; short-lived execution/upload tokens should be memory-first and cleared on revoke, drain, failure cleanup, and offboarding.

## Testing first

- desktop registration payload contract tests
- diagnostics and status-shape tests for desktop-local workers
- runtime-profile compatibility tests
- device/trust integration tests where desktop worker registration intersects with Feature 075 desktop identity rules
- rollout tests that keep desktop runtime disabled until its own feature flag is on
- service-identity and budget-attribution tests for shared and dedicated desktop workers
- token-rotation and revocation tests for shared-worker registration and execution credentials
- desktop credential-storage tests for secret caching, revocation cleanup, and offboarding cleanup
