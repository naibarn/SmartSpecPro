# Section 11: OmniVoice Desktop Readback and Managed Local Runtime

## Ownership

This section owns the optional Desktop Host OmniVoice path for premium local spoken readback on capable managed devices.

## Target files and modules

- `apps/tauri-shell/src-tauri/src/local_skill_runtime.rs`
- `apps/tauri-shell/src-tauri/src/package_materializer.rs`
- `apps/tauri-shell/src-tauri/src/desktop_runtime_capabilities.rs`
- `apps/web/client/src/features/local-ai/voice/localVoiceReadback.ts`
- `apps/web/client/src/pages/Settings*`
- Desktop Host tests under `apps/tauri-shell/src-tauri/tests/*`

## Scope

- add an optional OmniVoice desktop runtime path for spoken readback
- preserve current native TTS fallback behavior
- add capability, package-trust, and policy gates for local OmniVoice availability
- expose truthful desktop capability and fallback state in UX

## Implementation notes

- this section is intentionally not the first OmniVoice deliverable
- native TTS remains the baseline fallback for low-latency universal coverage
- desktop-local OmniVoice should be packaged and materialized like a managed runtime component, not as a hidden unmanaged binary drop
- UI must clearly distinguish:
  - native readback available
  - OmniVoice premium readback available
  - OmniVoice configured but not allowed/prepared

## TDD expectations

- write capability-state tests before desktop UX changes
- write package-trust and revocation tests before local runtime execution is enabled
- write fallback-order tests before switching any readback preference logic
- write local-vs-hybrid truthfulness tests before exposing provider labels in Settings

## Acceptance checks

- desktop can use OmniVoice readback when explicitly enabled and prepared
- desktop falls back to native TTS when OmniVoice is unavailable or disallowed
- managed local OmniVoice fails closed when trust, capability, or policy state is invalid
- Settings can explain why premium readback is unavailable

## Risks and coordination notes

- do not make every desktop build heavier by default if only a subset of managed tenants need this capability
- do not weaken Feature 075 package trust rules for convenience
