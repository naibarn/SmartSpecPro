# Section 06: Tauri Adapter and Device Storage

## Purpose

Extend the Local AI architecture into the existing `apps/tauri-shell` desktop runtime with app-local storage, on-demand install/remove UX, the same scoped routing semantics used on the web, and the fuller local voice path preferred for desktop.

## Ownership

- Tauri-local runtime adapter
- app-local model storage and scoped device state
- desktop install/remove lifecycle
- desktop-specific capability and failure handling
- desktop local voice path and provider fallback semantics

## Target files

- `apps/tauri-shell/src-tauri/src/lib.rs` or adjacent command registration files
- `apps/web/client/src/features/local-ai/adapters/tauriLocalRuntime.ts`
- `apps/web/client/src/features/local-ai/state/localAiDeviceStateStorage.tauri.ts`
- `apps/web/client/src/features/local-ai/hooks/useTauriLocalAi.ts`
- `apps/web/client/src/features/local-ai/components/TauriLocalAiStatus.tsx`

## Implementation notes

1. Reuse the shared router and metadata contracts from sections 01, 03, and 04.
   Desktop is not a second product path; it is a second adapter implementation.

2. Store model assets and scoped device state in app-local storage.
   - Use Tauri filesystem primitives under app-local data.
   - Keep consent/install visibility partitioned by tenant and signed-in user.
   - Allow physical blob reuse only if logical visibility remains isolated.

3. Implement real v1 install/remove behavior for one curated desktop profile.
   The UX should:
   - show required disk usage
   - support explicit install
   - support removal
   - report readiness and errors clearly

   Gemma 4 desktop profile stance:
   - ship `gemma4-e4b-tauri-balanced` as the primary desktop-local profile
   - support `gemma4-e2b-tauri-fast` as the lower-capability fallback profile
   - keep Gemma 4 26B / 31B profiles out of v1 scope

4. Add desktop-specific capability and error reporting for:
   - insufficient disk
   - filesystem permission problems
   - interrupted install cleanup
   - revoked profile detection on startup

5. Keep the adapter future-ready for multimodal extensions.
   The request envelope should already be able to carry modality metadata even if v1 only executes text tasks.

6. Desktop should host the fuller local voice experience.
   - Support short push-to-talk dictation and short voice commands with Gemma 4 local audio when the selected E2B/E4B profile and machine support it.
   - Keep local voice within the selected profile's short-clip/audio-format limits instead of presenting it as general long-form transcription.
   - Normalize desktop-local Gemma 4 audio to mono 16 kHz float32 and cap v1 clips at 30 seconds or less.
   - Reuse the same `voiceInputMode` values as web: `legacy_stt`, `gemma4_local`, `auto`.
   - Preserve configurable fallback to legacy/server STT when local voice init fails.
   - Keep optional readback/TTS as a separate layer rather than coupling speech output to Gemma 4.

7. Do not make desktop capability assumptions that bypass tenant or user policy.
   A Tauri device can still be cloud-only if:
   - tenant policy forces it
   - the user leaves Local AI off
   - the selected profile is revoked or not installed

## TDD expectations

- Add adapter tests proving desktop uses the same routing/task-class contracts as browser.
- Add storage tests for per-scope visibility and cleanup behavior.
- Add failure tests for disk/permission errors and revoked-profile startup checks.
- Add desktop voice tests for provider fallback and non-regression of typed chat when local voice fails.

## Acceptance checks

- Desktop install/remove works in `apps/tauri-shell` without requiring Docker or prebundled large assets.
- App-local state is scoped so one account does not inherit another account's consent or derived artifacts.
- Revoked profiles are not reused on desktop startup.
- Desktop capability errors do not break normal cloud chat.
- Desktop local voice failure does not break typed chat or the legacy STT path.

## Coordination notes

- Section 02 owns the generic settings and browser device-state UI model; keep Tauri-specific behavior inside the adapter/storage layer here.
- Reuse the same Local AI settings entry points from section 02 where possible instead of inventing a second desktop-only control surface.
- Section 04 owns authoritative message metadata persistence.
- Section 09 will add desktop-specific regression coverage where practical.
