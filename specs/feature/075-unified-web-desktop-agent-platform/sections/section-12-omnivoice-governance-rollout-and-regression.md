# Section 12: OmniVoice Governance, Rollout, and Regression

## Ownership

This section owns the trust, policy, rollout, observability, and regression controls needed to ship OmniVoice safely.

## Target files and modules

- rollout notes under this feature directory
- desktop-host and media governance services under `apps/web/server/services/*`
- docs under `apps/web/docs/help/en/*` and `apps/web/docs/help/th/*`
- web, Tauri, and backend regression suites touching voice capability contracts

## Scope

- define rollout phases for server-side OmniVoice, narration, and optional desktop-local readback
- define policy controls for plain TTS vs voice cloning
- add provenance, locality, and trust labeling requirements
- add regression coverage that proves fallback paths and truthful UX survive rollout

## Implementation notes

- recommended rollout order:
  1. backend provider support behind flag
  2. media/narration availability for selected tenants
  3. desktop-local managed runtime for capable pilot devices
- cloning should have a stricter default posture than plain TTS
- all docs and UI must stay explicit about whether generation is:
  - server-side OmniVoice
  - desktop-local OmniVoice
  - native desktop fallback
  - browser speech synthesis fallback

## TDD expectations

- add rollout-flag tests for each enablement phase
- add policy tests separating plain TTS from cloning
- add audit/provenance tests before broadening asset sharing or export
- add regression tests proving native/browser fallback still works

## Acceptance checks

- OmniVoice rollout can be enabled progressively and fail closed
- cloning can be disabled independently from plain OmniVoice TTS
- admins and users can tell where spoken output came from
- fallback behavior remains intact under degraded or disallowed conditions

## Risks and coordination notes

- do not let a premium voice feature blur locality or trust semantics
- do not broaden rollout until package trust, policy, and regression coverage all exist
