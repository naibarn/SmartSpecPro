# Section 04 — Voice Consent and Providers

> v2 implementation prerequisite: read ../contracts-v2.md and the v2 section dependency graph. Both local and cloud execution are supported through one control plane. Existing v1 scope remains unless explicitly revised there.

## Goal

Bind approved voices and enable consented cloning through SmartAIHub orchestration, using local adapters or server cloud adapters.

## Implementation scope

- Add consent record creation, review, expiration/revocation and restricted artifact handling.
- Validate clone sample format, duration, clipping/noise and single-speaker quality before provider upload; keep provider deletion/revocation auditable.
- Add voice catalog/binding contracts with provider/model/voice/locale and rights status.
- Add a server-only ElevenLabs clone adapter for official clone/TTS/timestamps capability when configured.
- Keep UVoice ordinary generation through the existing provider. Add clone capability as explicit `unverified_api`; never call private web actions. Allow manually created UVoice voice IDs only after server capability and consent preflight.
- Add provider capability probe, usage normalization and failure mapping.
- Add clone preview/final generation confirmation that uses the standard credit gateway.

## Security boundary

Provider keys remain server-side. Clone samples use restricted managed artifacts with signed short-lived access, or owner-worker scoped local handles without upload. Logs contain IDs/checksums/status, not raw samples, voiceprints or credentials. Consent is checked immediately before every clone generation.

## TDD stubs

- Consent scope/expiry/revocation tests.
- UVoice ordinary-TTS versus clone-unavailable tests.
- ElevenLabs gateway contract and normalized usage tests.
- Provider key non-leak tests.
- Duplicate clone request/idempotency tests.
- Sample-quality rejection and provider deletion/revocation tests.

## Exit criteria

The UI accurately distinguishes usable, unavailable and unverified provider capabilities and cannot start clone generation without valid consent and server preflight.

## UI/UX Contract

### Target User / JTBD

Editors need to choose a voice with confidence about provider readiness and legal consent before spending credits.

### Surface Inventory

The Voices tab contains speaker-to-voice bindings, provider capability status, consent evidence, clone preview and revoke/replace actions.

### Component Map

`VoiceBindingPanel` owns mapping; `ProviderCapabilityBadge` owns ready/unverified/unavailable state; `ConsentChecklist` owns evidence/scope/expiry; `VoicePreviewAction` owns server job submission.

### State Matrix

Cover no binding, provider loading, available, unverified UVoice clone, consent missing/expired/revoked, preview running, preview failed and approved binding.

### Responsive Matrix

Use speaker rows and provider columns on desktop/laptop; stack each binding card with sticky save/confirm action on tablet/mobile.

### Accessibility Acceptance

Consent fields, provider status, clone confirmation and revoke actions require labels, keyboard focus, descriptive errors and non-color status text.

### Copy Contract

State clearly that “UVoice clone API ยังไม่ยืนยัน” is unavailable for automated creation; explain consent scope and credit impact before preview/generation.

### Browser Evidence Required

Capture available provider, UVoice unverified, missing consent, revoked consent, preview progress and approved binding without exposing keys or raw samples.

## v2 required integration

Separate provider-independent VoiceProfile revisions from local/cloud VoiceBindings. Local zero-shot reference conditioning is not persistent clone creation. Check consent on execution, cache hits and publication. Add local/cloud target, privacy and exact model selection UI. This section depends on 01, not localization.

## Expanded lifecycle dependency

Read ../voice-lifecycle-v2.md and sections 11/12. Validate reference-only vs transcript-required vs trained modes separately. Existing inference readiness cannot authorize training. Release evidence must distinguish A/B/C/D and must cover profile API lifecycle, transitive rights and rollback where enabled.

## Convergence audit requirements

Apply lifecycle sections 8–10 and contracts recovery clarifications; they refine earlier general wording. Use VoiceOwnerScope for profiles/datasets, AudioScope for executions. Include applicable C5-01 through C5-07 regression cases in ../claude-plan-tdd.md. Release reporting distinguishes core A+B, optional providers C and training D.
