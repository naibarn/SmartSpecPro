> Historical v1 planning evidence, retained unchanged below. Not v2 completion evidence; see `reviews/v2-readiness-review.md`.

# Feature 180 Research Notes

## Research decision

- Codebase research: required because this is an existing Git repository with Web, Worker App, Python media workers and shared contracts.
- SocratiCode research: attempted by project instruction, but the SocratiCode MCP transport is not available in this session. Targeted shell discovery was used instead; findings below are evidence-backed file paths, not a substitute for a live index.
- Web research: required because this feature depends on current UVoice and ElevenLabs API capability and provider terms.
- Testing research: required; the repository uses Vitest/Playwright for Web and Worker App and pytest for Python media workers.

## Existing codebase findings

### Web/Worker control plane

- `apps/web/shared/workerRuntime.ts` already validates worker scope, job state and bounded idempotency/correlation metadata. New jobs should extend these contracts instead of introducing a parallel queue.
- `apps/web/server/routes/workerRuntime.ts` already accepts idempotency keys and worker job reports. The new gateway must keep provider credentials server-side and return managed artifact references.
- `apps/web/server/services/workerRegistryService.ts` and `workerSchedulerService.ts` are the likely server orchestration boundaries for worker registration, claim, heartbeat, progress and durable publication.
- `apps/worker-app/src/screens/media-workspace/MediaWorkspaceHost.tsx`, `MediaVideoEditorPlayer.tsx` and `SpeakerAwareWorkflowPanel.tsx` are the existing Worker Media UI surfaces. Feature 180 should extend the current dock/panel patterns rather than create a second editor.
- Existing Worker tests include `apps/worker-app/tests/media-workspace/speakerAwareWorkflow.test.ts`, timeline, audio scoring, persistence and browser smoke coverage.

### Provider and media patterns

- `python-backend/app/llm_proxy/providers/uvoice_provider.py` is a thin server-side UVoice client. It calls `/generate`, sends `voiceID`, speed/pitch/volume/language-related settings and returns URL/base64 audio for managed downstream handling.
- `apps/web/server/routers/mediaProviders.ts` and the media generation service contain existing provider catalog/gateway patterns. Clone support must be a separate capability, not inferred from ordinary TTS availability.
- `python-backend/app/workers/vertical_drama_audio_worker.py` and its tests show the existing fail-closed boundary for Demucs/stem audio work. Feature 180 should reuse its real capability/QC principles.
- Existing media task/artifact and credit reconciliation paths should be reused. The plan must add idempotency and reconciliation tests around every new paid stage.

### Existing Skills

- `apps/web/skills/translation/SKILL.md` is a generic translation bundle with deterministic sandbox entrypoints and verification. It is not sufficient by itself for cue-level timing, speaker style, locale, glossary and provenance, so a new localized-dialogue skill contract is required.
- `apps/web/skills/elevenlabs-product-voiceover-dialogue/SKILL.md` is product/storyboard voiceover-oriented and has a different output contract. It must not be reused as a direct transcript-localization adapter without a new bounded contract.
- The existing vertical-drama dialogue/audio planning skill is relevant for emotion/style context, but deterministic cue timing and provider calls remain runtime services.

### Testing conventions

- Web uses Vitest (`apps/web/package.json`, focused server/shared tests) and Playwright browser tests.
- Worker App uses Vitest with `apps/worker-app/vitest.config.ts` and focused media-workspace tests; `tests/media-workspace/browser-smoke.mjs` is the browser smoke pattern.
- Python backend uses pytest (`python-backend/pytest.ini`, `python-backend/tests`), including focused vertical-drama audio-worker tests.
- Because the user requested avoiding `npm run check` due to RAM, implementation verification should use focused Vitest/Pytest tests, targeted browser smoke, `git diff --check`, schema/migration checks and bounded media fixtures.

## Provider research

### UVoice

- Public product pages currently advertise voice cloning/Persona capabilities and API access in some plans, but Persona terms state that Persona voice cloning is not available through the API. This is a material capability ambiguity.
- The public API documentation currently documents generation and a `voiceID` input. It does not establish a public clone create/list/delete contract in the reviewed documentation.
- Decision: expose UVoice clone as `unverified_api`/capability-gated. Do not call private website actions. A manually created permitted UVoice voice ID can be used only when SmartAIHub server preflight validates provider acceptance and consent.
- Current server provider code is suitable for ordinary TTS but must not claim clone management is implemented.

Sources:

- https://www.uvoice.app/th/
- https://api.uvoice.ai/assets/Uvoice_API_Documentation.pdf

### ElevenLabs

- Official API documentation provides a server-side Instant Voice Clone flow, TTS generation and timestamps, and a dubbing API.
- Decision: implement the first automated clone adapter behind the SmartAIHub gateway when account/provider configuration permits it. Keep upload, consent, ownership, deletion and credit reconciliation in SmartAIHub.
- Timestamps can inform cue-level timing review, but they do not guarantee lip-sync.

Sources:

- https://elevenlabs.io/docs/api-reference/voices/ivc/create
- https://elevenlabs.io/docs/api-reference/text-to-speech/convert
- https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps
- https://elevenlabs.io/docs/api-reference/dubbing/create

### Visual and audio detection boundary

- MediaPipe Face Detector is appropriate for face evidence, not identity verification. Body/person detection is needed when a face is absent or turned away.
- Silero ONNX remains the baseline VAD; FireRed, TEN VAD and WebRTC are explicit adapters with user-selected policy. pyannote is optional for multi-speaker diarization and must have a real capability/license check.
- Active-speaker fusion should combine time-aligned VAD/diarization, visual tracks and subtitle overlap. Low-confidence disagreement must become review state, not a silent camera jump.

## Architecture conclusions

1. Use Feature 179’s scan/edit-map and Silence Cut artifacts as inputs, not a replacement pipeline.
2. Keep semantic translation/condensation in versioned Skills and keep media operations in explicit adapters.
3. Make source/derived artifacts immutable and make all jobs resumable/idempotent.
4. Require consent and capability preflight before clone use; no real-person identity claim.
5. Compose one localized edit map for both FFmpeg and Remotion and run the same post-encode QC.
6. Treat provider failure/unavailability truthfully; never fabricate audio, QC or usage.

## Implementation risks to carry into the plan

- UVoice clone API ambiguity can cause a false “clone works” claim; the capability flag and release gate must remain explicit.
- Dialogue separation from music/SFX may be poor on dense Thai drama audio; the explicit remove-all-audio/manual-DAW branch is mandatory.
- Subtitle timing, target-language word expansion and TTS duration can overflow cue intervals; cue review and bounded time-stretch are required.
- Worker and server can disagree about a source path; source resolution must prefer existing project asset metadata and return a precise missing-source error.
- New panel content can be hidden by nested scroll containers; browser evidence must prove primary actions and full-height panel navigation.

## Additional gap-closure findings

- Derived-video workflows need a source-to-derived timeline transform and render-plan hash; an artifact ID alone is insufficient when subtitle-first editing happens before speaker scan.
- Worker-local source paths need an explicit metadata/checksum/upload handoff because the Web server cannot assume it can read a Windows/local Worker path.
- Durable cancellation must distinguish before-provider and after-provider behavior so paid usage and publication are both correct.
- New jobs require runtime-manifest compatibility and additive migration/rollback rules to avoid offering schemas to an older Worker.
- Voice-clone sample quality must be preflighted (format, duration, clipping/noise, single-speaker likelihood) before a provider upload; this is quality validation, not identity verification.
- A localized cue without an approved voice or explicit retention policy must block final replacement rather than disappear silently.
- Audio mixing needs deterministic sample-rate/channel normalization, bus routing, ducking, headroom and loudness/true-peak configuration.
- QC thresholds and per-export exceptions must be versioned and included in provenance; hidden constants are not auditable.
