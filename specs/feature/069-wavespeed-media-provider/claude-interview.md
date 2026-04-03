# Deep Plan Interview Transcript: WaveSpeed Media Provider

Note: No new live interview was required for this run because the user had already clarified the critical scope and ambiguity points in earlier turns on 2026-04-03. This transcript captures those decisions in Q&A form so the plan can remain self-contained.

## Q1. What exactly should this feature add?

Add a new media provider entry for WaveSpeed in the admin UI and support the official WaveSpeed video model `wavespeed-ai/cinematic-video-generator` as the first seeded model.

## Q2. Which WaveSpeed model is the launch target?

Use `wavespeed-ai/cinematic-video-generator` as the canonical model ID and present it with the display name `Seedance 2.0 Grade Cinematic Video Generator`.

## Q3. Should this release support the whole WaveSpeed catalog?

No. The first release should stay intentionally narrow: one provider, one launch model, and the documented async submit/poll flow required for that model.

## Q4. What should happen when the API contract has gaps or ambiguous choices?

The LLM should decide deterministically and write those decisions into the spec/plan instead of leaving implementation-time ambiguity.

## Q5. What exact provider/API root should the plan use?

Use the official API root `https://api.wavespeed.ai/api/v3` for the seeded provider configuration.

## Q6. What health-check behavior is expected in the admin UI?

Use a read-only connection test against the official balance endpoint. The behavior should be explicit for success and for `401`, `403`, and `429`.

## Q7. What generation modes must be supported?

The same model must support both:

- prompt-only text-to-video
- prompt-plus-images image-to-video

## Q8. How many reference images should be allowed?

Hard maximum of `4` reference images. The UI may clamp earlier for a better experience, but backend validation must enforce the same hard limit.

## Q9. What pricing behavior should the plan preserve?

Pricing must remain correct for `5s`, `10s`, and `15s` durations even when the DB row is unavailable and the system falls back to static metadata.

## Q10. Should v1 use WaveSpeed sync mode?

No. Keep v1 on the existing async queue model: submit, persist provider task metadata, then poll until completion.

## Q11. How should native audio be handled?

Treat native audio as part of the resulting video asset. Do not create a separate audio route or separate library asset in v1.

## Q12. What should happen to pre-existing spec gaps found during review?

They should be closed now in the planning artifacts, especially:

- base URL normalization
- connection-test contract
- pricing fallback
- provider/model metadata contract
- result/recovery mapping
- the no-sync-mode rule
