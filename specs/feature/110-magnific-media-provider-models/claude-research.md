# Research: Magnific Media Provider And Model Catalog Expansion

Date: 2026-05-06
Planning directory: `specs/feature/110-magnific-media-provider-models`

## Research Decision

Research decision (auto):

- Codebase: yes. This is an existing git repository and the feature must fit the current media provider architecture.
- Web topics: yes. Magnific API endpoint contracts, authentication, polling, temporary URLs, and model input limits are current external dependencies.
- Testing: existing setup. Web tests use Vitest through `npm --prefix apps/web test ...` / `pnpm --dir apps/web test ...`; TypeScript checking uses `npm --prefix apps/web run check`. Python tests use pytest under `python-backend/tests`, with provider tests in `python-backend/tests/unit/llm_proxy/` and media task tests in `python-backend/tests/tasks/`.

SocratiCode status was green before codebase research. SocratiCode narrowed the main implementation surfaces to media provider utilities, provider templates, model seed scripts, static fallback registries, Media Studio dynamic inputs, Python gateway routing, provider adapters, and Celery media task polling.

## Codebase Findings

### Existing provider pattern

SmartSpecPro already treats media provider expansion as a multi-layer contract:

1. Admin provider catalog and connection tests in `apps/web/server/routers/mediaProviders.ts`.
2. Seeded provider rows in `apps/web/scripts/seed-media-providers.ts`.
3. Shared provider/model constants and seed builders in `apps/web/server/services/mediaProviderUtils.ts`.
4. Static DB-unavailable fallback metadata in `apps/web/server/services/modelRegistry.ts` and `apps/web/server/services/mediaGenerationService.ts`.
5. Dynamic model input parsing in `apps/web/client/src/lib/mediaModelInputs.ts` and rendering in `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx`.
6. Runtime provider routing in `python-backend/app/llm_proxy/gateway_unified.py`.
7. Provider-specific HTTP clients in `python-backend/app/llm_proxy/providers/`.
8. Async polling/recovery in `python-backend/app/tasks/media_tasks.py`.

The closest implementation precedent is WaveSpeed. It contributes a provider template, seed rows, static fallback metadata, provider-specific base URL and endpoint validation, a Python provider client, gateway routing, polling recovery, and targeted tests.

### Files likely to change

Web/admin:

- `apps/web/server/services/mediaProviderUtils.ts`
- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/scripts/seed-media-providers.ts`
- `apps/web/scripts/seed-media-models-magnific.ts` (new)
- `apps/web/server/services/modelRegistry.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/mediaModels.ts`

Frontend:

- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx`
- `apps/web/client/src/components/media/ModelInputFieldsPanel.test.tsx`

Python:

- `python-backend/app/llm_proxy/providers/magnific_provider.py` (new)
- `python-backend/app/llm_proxy/providers/__init__.py`
- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/tasks/media_tasks.py`

Tests:

- `apps/web/server/routers/mediaProviders.test.ts`
- `apps/web/scripts/__tests__/seed-media-providers.test.ts`
- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/server/services/mediaGenerationService.test.ts`
- `apps/web/server/services/__tests__/modelRegistry.mapToApiModelId.test.ts`
- `apps/web/server/__tests__/creditReservation.test.ts`
- `apps/web/server/__tests__/creditReconciliation.test.ts`
- `python-backend/tests/unit/llm_proxy/test_magnific_provider.py`
- `python-backend/tests/unit/llm_proxy/test_gateway_unified_magnific.py`
- `python-backend/tests/tasks/test_media_tasks_magnific.py`
- `python-backend/tests/unit/services/test_magnific_ssrf.py`

### Impact notes

`apps/web/server/services/mediaProviderUtils.ts` has a broad blast radius. SocratiCode reported 45 impacted files within two hops, including seed scripts, media routers, static registry, enabled model selection, auto-team media services, and tests. The plan should keep new Magnific helpers additive and avoid changing existing WaveSpeed/ElevenLabs/Kie behavior.

### Architecture constraints from existing code

- Provider names are normalized in both TypeScript and Python. Magnific needs a canonical provider id of `magnific` and aliases for `magnific_api`, `magnific-ai`, and `magnific_ai`.
- Provider base URLs and endpoint paths should be validated. Existing WaveSpeed code is strict about public HTTPS base URLs and relative-only endpoint metadata.
- `configJson.inputFields` is the generic UI contract. It already supports `select`, `text`, `number`, `boolean`, `image_urls`, `video_urls`, `audio_urls`, `library_file`, and `array`.
- Static fallback model metadata matters. If DB metadata is unavailable, media selection, pricing, and request shaping should still work.
- Python gateway routing currently has provider-specific branches for BytePlus, fal.ai, WaveSpeed, ElevenLabs, KNPLabs, UVoice, and Kie. Magnific should follow that pattern rather than becoming a generic Kie fallback.
- Async media tasks can persist provider task ids and submission metadata. WaveSpeed provides the best recovery/polling model.
- SSRF and signed URL safety are already first-class concerns. Magnific reference inputs must reuse or mirror these validators rather than relying only on UI constraints.

## Official Magnific API Findings

Sources used:

- https://docs.magnific.com/llms-full.txt
- https://docs.magnific.com/api-reference/mystic/post-mystic
- https://docs.magnific.com/api-reference/mystic/get-mystic-task
- https://docs.magnific.com/api-reference/remove-background/overview
- https://docs.magnific.com/api-reference/text-to-video/post-veo-3-1
- https://docs.magnific.com/api-reference/video/video-upscaler-precision/overview

Key findings:

- Magnific uses `https://api.magnific.com` and authenticates with the `x-magnific-api-key` header.
- Mystic submit returns a `data.task_id` and status such as `IN_PROGRESS`; Mystic status returns `data.generated[]`, `data.task_id`, and `data.status`.
- Mystic LoRA behavior is conditional. LoRAs are compatible with the default model and no `structure_reference` / `style_reference`. Specific models and references can silently ignore LoRAs. The implementation must warn or prevent misleading combinations.
- Magnific docs emphasize webhooks for production, but the SmartSpecPro phase-one decision is polling. Keep webhook URL injection server-only and do not expose arbitrary user-editable webhook URLs.
- Remove Background is synchronous, accepts `image_url`, supports JPG/PNG up to 20 MB, returns temporary URLs, and requires immediate download/re-hosting.
- Veo 3.1 text-to-video supports prompt and negative prompt up to 20000 chars, durations 4/6/8, resolutions `720p`, `1080p`, and `4k`, aspect ratios `16:9` and `9:16`, `generate_audio`, and `seed`.
- Video Upscaler Precision is async and accepts `video`, `resolution` (`720p`, `1k`, `2k`, `4k`), `fps_boost`, `sharpen`, `smart_grain`, and `strength`. FPS boost ignores strength.
- Magnific docs include many endpoint families beyond this feature. The plan should scope only the requested image, image editing/enhancement, video, and video upscaler models.

## Spec Normalization Decisions

The original `spec.md` is strong but has a few internal conflicts. The deep-plan will use these normalized decisions:

1. `modelFamily` for all Veo 3.1 records is `magnific/veo-3-1`. Generation mode is represented by the concrete `modelId` and `endpoint.submit`, not by changing the family id.
2. Concrete endpoint records are selectable. Family alias rows may exist only as non-selectable compatibility/grouping records.
3. `enabledDefault` must be conservative. Verified low-cost image and sync models may be enabled for admin/beta rollout; video and video-upscaler records should be disabled by default or admin-only until staging smoke tests pass. All estimated pricing rows must carry `pricingStatus: "estimated"`.
4. Mystic `style_lora_id` / `character_lora_id` in the product spec map to Magnific's documented `styling.styles[]`, `styling.characters[]`, and prompt `@character` syntax. The implementation must not send non-documented top-level LoRA ids.
5. Status normalization must accept `CREATED`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `CANCELLED`, `CANCELED`, and common lowercase equivalents used by app/workflow APIs where applicable.

## Risks

- Endpoint response shapes may differ by family. Mitigation: every seed record carries explicit output extractors and provider tests cover representative image, sync, video, and upscaler responses.
- Provider URLs may be temporary. Mitigation: results are always downloaded and re-hosted before any user-visible response.
- Video models can be expensive. Mitigation: conservative default enabled state, duration/resolution pricing reservations, per-user concurrency caps, and rollout gates.
- Broad shared helpers have non-trivial blast radius. Mitigation: isolate Magnific helper additions, keep existing provider behavior unchanged, and run targeted existing provider regression tests.
