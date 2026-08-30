# Research notes

## External provider

- Kie model page: https://kie.ai/gemini-omni-1-1-flash?model=google%2Fgemini-omni-flash-1-1
- Kie API docs: https://docs.kie.ai/market/google/gemini-omni-flash-1-1
- The docs require model `google/gemini-omni-flash-1-1` on `POST /api/v1/jobs/createTask`.
- Supported inputs include `image_urls`, `first_frame_url`, `last_frame_url`, `audio_ids`, `video_list`, `character_ids`, `duration`, `aspect_ratio`, `seed`, and `resolution`.
- Resolution values are `360p`, `720p`, `1080p`, `4k`; duration is `4/6/8/10`; source-video max is 30 seconds with a max 10-second trim; total reference quota is 7 units.
- First frame is mutually exclusive with the multimodal reference fields; last frame requires first frame.

## Repository

- `apps/web/server/services/modelRegistry.ts` contains the static fallback catalog and currently maps `gemini-omni-video` to `gemini-omni-video`.
- `apps/web/server/services/mediaGenerationService.ts` contains a second static fallback catalog used by media generation.
- `apps/web/scripts/seed-media-models-kie-ai.ts` is the DB seed/upsert source and already has a Gemini Omni input/pricing definition.
- `apps/web/shared/geminiOmni.ts` owns shared validation and provider extra-param construction, but currently has no first/last-frame fields and only one model constant.
- `apps/web/server/routers/media.ts` gates Gemini Omni preflight on the old internal ID only.
- `apps/web/client/src/pages/MediaStudio.tsx` uses the old ID in generation, retry, model-selection, and QA paths.
- `python-backend/app/llm_proxy/providers/kie_ai_provider.py` already honors `configJson.kieModelId` and uses the generic market create/status path; the fallback alias map lacks the new alias.
- Existing tests cover old Gemini Omni catalog parity and exact `video_list` payload construction.

## Discovery limitation

SocratiCode MCP was unavailable in this session. Targeted `rg` and bounded file reads were used instead; no broad unrelated refactor is planned.
