# Section 02 — routing and provider

## Ownership

Own server preflight/client ID gates and Python Kie model resolution/payload behavior. Preserve the existing generic market transport and task polling/callback contract.

## Targets

- `apps/web/server/routers/media.ts`
- `apps/web/client/src/pages/MediaStudio.tsx`
- `python-backend/app/llm_proxy/providers/kie_ai_provider.py`
- focused router/client/provider tests

## TDD expectations

Add exact payload assertions for prompt-only, multimodal, and first/last-frame requests. Add a regression proving both internal IDs enter the same server/client suite paths.

## Acceptance checks

- new model resolves to exact Kie provider ID from config;
- request uses `/api/v1/jobs/createTask` and existing `recordInfo` polling/callback behavior;
- managed character/audio references retain existing tenant/user validation;
- first/last-frame keys are not combined with `image_urls`, `video_list`, `character_ids`, or `audio_ids`;
- old model requests remain byte-compatible.

## Risks

Do not broaden matching to arbitrary display names in server credit/provider gates. Do not add a second provider adapter or bypass durable media result handling.
