# Section 07: Tests and Rollout

## Test Matrix

### Unit Tests

- Provider normalization and templates.
- Model seed configs.
- Provider credential validation with `xi-api-key`.
- ElevenLabs request builders.
- Binary response upload.
- Transcript result handling.
- URL safety validation.
- Credit estimate formulas for character, second, and minute units.

### Integration Tests

- Mock ElevenLabs TTS returns audio bytes and creates media task result URL.
- Mock voice changer downloads source audio and returns transformed audio.
- Mock STT returns transcript JSON and task completes.
- Media Studio workflow filtering.
- Provider-disabled path returns setup message and preserves credits.

### Manual QA

- Configure provider in Admin > Media Providers.
- Seed models.
- Run each Audio workflow:
  - TTS
  - Voice Changer
  - STT
  - Sound Effects
  - Voice Isolator
- Verify media history.
- Verify credit deduction and refund behavior.

## Rollout

1. Ship provider/model registry disabled by default.
2. Seed ElevenLabs models disabled or provider-gated.
3. Enable provider in staging with real API key.
4. Run all five workflows.
5. Enable production only after binary artifact and transcript handling pass.

## Risk Controls

- Do not expose ElevenLabs API keys to frontend.
- Validate all source URLs server-side.
- Enforce documented size/duration limits in UI and backend where possible.
- Store enough request metadata for audits without storing sensitive raw audio unless user explicitly saves it.
- Add a kill-switch path by disabling the `elevenlabs` provider without deleting model rows.
- Preserve refund behavior on provider errors, upload errors, and transcript contract errors.

## Implementation Checklist

- [ ] Provider template and validation.
- [ ] Model seeds and static fallback registry.
- [ ] Direct Python ElevenLabs provider client.
- [ ] Node/Python request mapping for JSON and multipart workflows.
- [ ] Binary audio upload and result metadata.
- [ ] STT transcript result contract.
- [ ] Media Studio workflow UI.
- [ ] Media history transcript rendering.
- [ ] Thin skills and routing tests.
- [ ] Targeted unit/integration tests.
