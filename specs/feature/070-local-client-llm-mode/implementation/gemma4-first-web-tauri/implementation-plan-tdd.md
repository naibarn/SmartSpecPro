# Gemma 4-First Web/Tauri TDD Plan

## Test strategy

Write tests in the same order as implementation risk:

1. catalog and capability contract updates
2. browser runtime gating and fail-closed behavior
3. Tauri command boundary and scoped storage behavior
4. skill execution tiering and Tauri local-skill routing
5. chat/voice integration and regression checks

## 1. Contract and catalog tests first

- Add tests proving the catalog can distinguish:
  - `.web.task`-style browser profiles
  - `.litertlm`-style Tauri profiles
- Add tests proving only E2B/E4B profiles can advertise local voice.
- Add tests proving browser E4B stays non-default even when present in the catalog.
- Add tests proving duplicated Hugging Face sources do not override canonical profile metadata when SmartSpecPro ships its own catalog manifest.

Expected first failures:

- missing profile maturity fields
- missing artifact-kind distinction
- missing audio capability metadata

## 2. Browser runtime tests

- Add tests for capability remaining unsupported when:
  - secure context is missing
  - WebGPU is missing
  - adapter/device creation fails
  - runtime dependency or approved model bundle is absent
- Add tests proving E2B is the first routable browser profile.
- Add tests proving E4B web.task is hidden or marked experimental until explicitly enabled.
- Add tests proving browser local voice:
  - is offered only for audio-capable profiles
  - rejects oversized clips
  - normalizes audio expectations
  - falls back to `legacy_stt` only in `auto`

## 3. Tauri runtime tests

- Add tests for new Tauri commands:
  - probe capability
  - install profile
  - remove profile
  - run inference
  - dispose runtime
- Add tests proving install state is scoped per tenant/user visibility.
- Add tests proving revoked profiles cannot be reused.
- Add tests proving desktop defaults to E4B and can fall back to E2B.
- Add tests proving desktop local voice is limited to E2B/E4B and keeps typed chat working when init fails.

## 4. Skill execution policy tests

- Add tests proving every skill defaults to `cloud_required` until explicitly reviewed.
- Add tests proving `local_safe` can only be selected on Tauri when:
  - local runtime is ready
  - the invocation is user-present and interactive
  - the skill is on the reviewed allowlist
- Add tests proving `local_preprocess_only` may draft params or compact text locally but still executes through the existing server skill path.
- Add tests proving `media-generate`, automation/workflow, tool-using, scheduler, public API, and background skill paths never select Tauri local execution.
- Add tests proving locally produced skill params/results still pass the existing schema validation layer before durable save.
- Add tests proving reviewed scripted `local_safe` skills:
  - use packaged Python/Node runtimes only
  - use compiled reviewed entry artifacts for JS/TS/JSX/TSX bundles
  - cannot request arbitrary shell passthrough
  - are denied by default from network access
  - are restricted to app-owned filesystem roots
  - cannot receive reusable user or provider secrets
- Add tests proving extended local-script manifest validation rejects bundles missing:
  - `runtimeKind`
  - reviewed compiled entry metadata
  - artifact digest
  - permission profile
  - staged input/output root declarations
- Add tests proving local-safe offline executions are written to an app-owned outbox and synced by the app layer rather than by the script itself.

## 5. Chat and regression tests

- Add tests proving `legacy_stt` still wraps the current push-to-talk path.
- Add tests proving `gemma4_local` browser mode fails clearly instead of silently routing to third-party STT.
- Add tests proving mic-derived text still enters the same chat pipeline as typed input.
- Add tests proving runtime metadata stays server-authored / server-validated.
- Add tests proving unsupported devices still keep normal chat, settings, and Teams flows working.

## Fixtures and environment notes

- Browser runtime tests need WebGPU mocks and dynamic-import failure mocks.
- Tauri tests need command-layer mocks rather than real model files.
- Artifact tests should use manifest fixtures, not real 3GB model downloads.
- Local-script tests should use staged temp roots and fake outbox records, not the user's real filesystem.

## Minimum regression suite before merge

- `apps/web` unit tests for local-ai capability, catalog, voice provider resolution, and chat runtime metadata
- `apps/web` unit tests for skill tier resolution, local-skill allowlist gating, and preprocess-only fallback behavior
- Tauri command unit tests for probe/install/remove lifecycle
- one browser smoke test for `legacy_stt`
- one browser smoke test for unsupported local runtime
- one Tauri smoke test for desktop profile readiness lifecycle
- one Tauri smoke test for a reviewed `local_safe` text skill
- one Tauri smoke test for a reviewed packaged Python or JS local-safe skill
- one Tauri smoke test for offline local-safe execution followed by app-owned sync
- one regression test proving a `cloud_required` skill never routes to the local runtime
