<!-- PROJECT_CONFIG
runtime: typescript-npm
test_command: npm --prefix apps/web test
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-provider-and-model-registry
section-02-backend-elevenlabs-client
section-03-media-task-results-and-artifacts
section-04-media-studio-ui
section-05-skills-and-routing
section-06-eleven-agents-follow-on
section-07-tests-and-rollout
END_MANIFEST -->

# Section Index: Feature 099 Direct ElevenLabs Provider

## Implementation Order

1. `section-01-provider-and-model-registry.md`
2. `section-02-backend-elevenlabs-client.md`
3. `section-03-media-task-results-and-artifacts.md`
4. `section-04-media-studio-ui.md`
5. `section-05-skills-and-routing.md`
6. `section-06-eleven-agents-follow-on.md`
7. `section-07-tests-and-rollout.md`

## Recommended Scope Split

- Phase 1: Provider template, model seeds, direct API client, binary audio artifact upload, TTS/SFX/voice-isolator/voice-changer outputs.
- Phase 2: Speech-to-text transcript result contract and Media Studio/history transcript rendering.
- Phase 3: Thin skills and Chat/Team routing.
- Phase 4: Dynamic ElevenLabs voice listing, transcript-to-library/subtitle export, and richer voice settings.
- Phase 5: ElevenAgents product surface.

## Phase Gates

- Do not start Phase 2 until audio binary upload is covered by tests.
- Do not start Phase 3 until direct provider model execution works from Media Studio.
- Do not start ElevenAgents implementation inside this feature; keep it as follow-on planning only.
