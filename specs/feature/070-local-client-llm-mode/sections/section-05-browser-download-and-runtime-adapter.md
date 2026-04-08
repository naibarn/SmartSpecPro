# Section 05: Browser Download and Runtime Adapter

## Purpose

Implement the browser-local runtime path, including capability probing, consented model download, worker-based execution, safe per-request fallback to cloud, and the optional browser-local voice path for short dictation or short voice commands.

## Ownership

- browser capability probing implementation
- model download and removal lifecycle for web
- worker-based browser runtime adapter
- browser-local fallback reasons and progress state
- browser-local voice capability and fallback behavior

## Target files

- `apps/web/client/src/features/local-ai/hooks/useLocalAiCapability.ts`
- `apps/web/client/src/features/local-ai/hooks/useModelDownload.ts`
- `apps/web/client/src/features/local-ai/adapters/browserLocalRuntime.ts`
- `apps/web/client/src/features/local-ai/workers/local-llm.worker.ts`
- `apps/web/client/src/features/local-ai/state/localAiDownloadStore.ts`
- `apps/web/client/src/features/local-ai/components/LocalAiDownloadStatus.tsx`
- `apps/web/client/src/features/local-ai/hooks/useLocalVoiceInput.ts`
- `apps/web/client/src/features/local-ai/voice/legacyChatMicAdapter.ts`

## Implementation notes

1. Implement a two-stage capability detector.
   Cheap pass:
   - feature enabled?
   - user enabled?
   - secure context?
   - `navigator.gpu` present?

   Deeper pass:
   - `requestAdapter()` / adapter acquisition
   - `requestDevice()` / device creation
   - selected-profile WebGPU limit/feature validation
   - storage estimation
   - eligible installed profile availability
   - runtime health checks after explicit user action

   Important boundary:
   - `navigator.gpu` alone is not enough to mark browser-local ready
   - a browser-local profile is only ready after adapter/device acquisition and profile requirement checks pass
   - Gemma 4 browser readiness in v1 should be evaluated first against `gemma4-e2b-web-fast`; broader E4B enablement happens only after SmartSpecPro validates that second profile
   - browser-local Gemma 4 should remain unavailable if the shipped build does not yet include the approved runtime dependency and model-bundle path, even when hardware probing passes

2. Keep heavy runtime code behind dynamic import boundaries.
   - Do not import MediaPipe or other browser-local runtime packages at ordinary chat/settings page load.
   - The worker bootstrap should be the first place heavy runtime dependencies become reachable.
   - Gemma 4 browser support should assume an approved `@mediapipe/tasks-genai` or equivalent runtime path behind those dynamic imports; until that stack exists, capability must stay fail-closed.

3. Add a user-facing download manager for browser profiles.
   - Require explicit consent before download.
   - Display approximate size.
   - Validate manifest metadata before install success.
   - Support remove / re-download / integrity-repair flows.
   - Keep partial or corrupted downloads in a quarantined/non-routable state until repair or removal.

4. Coordinate multi-tab installs.
   - Allow only one active install/remove/repair per `tenant + user + profile` scope.
   - Use a device-local lock or leader-election helper.
   - Secondary tabs should observe progress instead of racing another download.
   - Stale locks must expire or be recoverable after tab crashes so install state cannot deadlock.

5. Implement the worker-based adapter with a narrow contract:
   - prepare profile
   - run local request
   - dispose runtime
   Keep full implementation details out of the plan, but preserve a small typed request/response contract.

   WebGPU safety expectations:
   - the worker must verify WebGPU availability in its own execution context
   - no silent CPU fallback should be introduced for profiles declared as WebGPU-only
   - device-lost or device-init failures must surface typed reasons instead of silently degrading into undefined local behavior

6. Standardize browser fallback reasons.
   Use values such as:
   - `webgpu_unavailable`
   - `webgpu_adapter_unavailable`
   - `webgpu_device_init_failed`
   - `webgpu_profile_requirements_not_met`
   - `model_not_installed`
   - `asset_integrity_failed`
   - `worker_init_failed`
   - `runtime_device_lost`
   - `runtime_timeout`

7. `local_only` handling must fail just the affected request.
   - Preserve the draft or conversation context for retry.
   - Hand back a typed reason so section 04 can persist an accurate fallback state when needed.

8. Browser voice support should stay narrow and compatibility-first.
   - Only explicit push-to-talk is in scope.
   - No background listening or always-on hot mic.
   - Local browser voice is for short dictation and short commands only.
   - V1 browser-local voice should target Gemma 4 E2B/E4B only, with `gemma4-e2b-web-fast` as the first validated profile.
   - Local browser voice should stay within the selected profile's short-clip limits and normalize audio before inference.
   - Browser-local Gemma 4 audio should be normalized to mono 16 kHz float32 and capped at 30 seconds or less.
   - `legacy_stt` should wrap the existing chat push-to-talk implementation for v1 rather than a second legacy path.
   - `auto` should fall back to the existing server STT path when local audio capability or profile readiness is missing.
   - Explicit `gemma4_local` selection should fail clearly or require explicit mode change instead of silently using third-party STT.
   - Direct client-side execution is limited to allowlisted first-party route intents; all side-effectful actions still flow through existing server APIs after transcription.

## TDD expectations

- Add jsdom capability tests for missing `navigator.gpu` and insecure contexts before writing runtime code.
- Add capability tests for `navigator.gpu` present but `requestAdapter()` returning null or `requestDevice()` failing.
- Add capability tests for selected-profile WebGPU limits/features not being met.
- Add download-manager tests for explicit consent, checksum failure, and multi-tab coordination.
- Add download-manager tests for quarantined partial installs and stale-lock recovery.
- Add adapter tests for lazy worker creation and typed fallback reasons.
- Add voice-path tests for local-audio capability failure, `auto` fallback, and allowlisted-route enforcement.
- Add a test proving the v1 chat mic does not silently switch to the separate realtime voice-session path when `legacy_stt` is selected.

## Acceptance checks

- Opening chat or settings with Local AI off does not create a worker or import browser-local runtime packages.
- Browser download flow requires consent and can recover from integrity failure.
- Partial/corrupt browser installs never become routable until explicit repair succeeds.
- Supported devices can prepare a local profile and surface typed fallback reasons when runtime work fails.
- Browsers that expose `navigator.gpu` but cannot satisfy adapter/device/profile WebGPU requirements still remain cloud-stable.
- Unsupported browsers stay cloud-stable.
- Browser voice mode never blocks typed chat, even when local voice capability or microphone permission fails.

## Coordination notes

- Consume catalog/capability contracts from section 03.
- Send advisory runtime details to section 04, but do not persist metadata directly from the client.
- Do not implement Tauri storage or OCR server behavior here.
