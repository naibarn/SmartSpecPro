# KNPLabs Expansion Research

## Research Decision

Auto decision:

- Codebase research: yes. This is an existing git repository with active Python and TypeScript application code, provider registries, admin UI, and test suites.
- Web research: yes. The spec references KNPLabs API docs and specific API families that need official contract confirmation.
- Testing: existing codebase. Use `pytest` for Python and `vitest` for TypeScript, following the repo’s current patterns.

## Codebase Research

### LLM routing already uses a DB-backed provider map

The web backend routes chat traffic through `apps/web/server/services/llmRouter.ts`. It resolves providers from `modelProviderMap`, checks provider health, and builds the final upstream URL with `resolveChatUrl()`. That matters for KNPLabs because the service is OpenAI-compatible, so chat routing should fit the existing OpenAI-style path rather than requiring a new transport layer.

Relevant files:
- `apps/web/server/services/llmRouter.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/scripts/seed-opencode-zen-all-models.ts`

### Media routing already has a provider abstraction

The media path is split between the TypeScript media router and the Python gateway:

- `apps/web/server/routers/media.ts` resolves media models, provider names, and default models.
- `python-backend/app/llm_proxy/gateway_unified.py` routes image/video/audio requests to Kie.ai, fal.ai, BytePlus, or UVoice.
- `python-backend/app/services/media_provider_service.py` loads encrypted provider keys from `media_providers`.

The existing design is already multi-provider, so KNPLabs should be added as another provider branch instead of replacing existing media providers.

Relevant files:
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/mediaProviders.ts`
- `apps/web/server/services/mediaGenerationService.ts`
- `python-backend/app/llm_proxy/gateway_unified.py`
- `python-backend/app/services/media_provider_service.py`

### The repo already has strong security patterns for media providers

The fal.ai provider is the best local template for KNPLabs security behavior. It already demonstrates:

- allowlisted model IDs
- request-id validation
- prompt sanitization
- response size caps
- `follow_redirects=False`
- explicit cleanup via `aclose()`

Relevant files:
- `python-backend/app/llm_proxy/providers/fal_ai_provider.py`
- `python-backend/tests/unit/services/test_fal_ai_provider.py`
- `python-backend/tests/unit/services/test_fal_ai_celery_polling.py`

### TTS and embeddings already exist, but not for KNPLabs

The Python backend already exposes:

- `POST /api/internal/tts` in `python-backend/app/api/stt.py`
- `POST /api/internal/embeddings` in `python-backend/app/api/internal_embeddings.py`

At the moment, TTS supports OpenAI and ElevenLabs only, and embeddings only use `OpenAIEmbedding`. That means KNPLabs should be added as an explicit opt-in path, not as an implicit fallback inside the generic embedding service.

Relevant files:
- `python-backend/app/api/stt.py`
- `python-backend/app/api/internal_embeddings.py`
- `python-backend/app/services/embedding_service.py`

### Testing setup

Python tests follow `pytest` conventions from `python-backend/pyproject.toml` and `python-backend/tests/conftest.py`.
TypeScript tests follow `vitest` from `apps/web/package.json`.

Useful existing test shapes:
- `python-backend/tests/unit/services/test_fal_ai_provider.py`
- `python-backend/tests/unit/services/test_fal_ai_celery_polling.py`
- `apps/web/server/routers/__tests__/mediaModels.readiness.test.ts`
- `apps/web/server/routers/__tests__/mediaModels.runtimeCounters.test.ts`
- `apps/web/server/services/llmRouter.test.ts`
- `apps/web/server/seed.test.ts`

## Web Research

### Official KNPLabs landing page findings

Source: `https://api.knplabai.com/`

The public landing page confirms:

- the service is OpenAI-compatible
- the base URL for the quick start is `https://api.knplabai.com/ai/v1`
- the catalog covers GPT, Claude, Gemini, Grok, DeepSeek, MiniMax, Qwen, KIMI, and MiMo
- the site advertises image, video, TTS, and embeddings under a single gateway

The docs page itself was not crawlable in the browser tool, so the plan should treat the landing page plus quick-start snippet as the official web confirmation available in this session.

### Implications for implementation

- Chat completions can use the existing OpenAI-compatible route in the web backend.
- Media/TTS/embeddings should use a KNPLabs-specific provider class on the Python side.
- The provider base URL should default to `https://api.knplabai.com/ai/v1`.

## Testing Approach

Use the repository’s existing stack:

- Python: `pytest`
- TypeScript: `vitest`

Follow the existing fixture and mocking style rather than introducing a new test harness.

