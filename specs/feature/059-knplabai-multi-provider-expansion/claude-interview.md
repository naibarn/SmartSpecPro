# KNPLabs Expansion Interview Notes

No direct user interview was run in this session because the planning environment did not expose the task-list interview step. The decisions below are the assumptions I am carrying into the plan, based on the spec and research.

## Assumed Decisions

### 1. Provider key naming

- Use `knplabai` as the normalized provider key in DB records and code.
- Keep the display name as `KNPLabs AI`.

Reasoning: the domain and base URL both use `knplabai`, and the repo already normalizes provider identifiers into short lowercase keys like `kie_ai`, `fal_ai`, and `byteplus_modelark`.

### 2. LLM routing strategy

- Keep LLM chat completions on the existing web-side OpenAI-compatible routing path.
- Do not introduce a separate chat transport just for KNPLabs.

Reasoning: the official landing page confirms OpenAI compatibility, and the current `llmRouter.ts` already supports providers with OpenAI-style `/v1/chat/completions` endpoints.

### 3. Media/TTS/embeddings strategy

- Add a KNPLabs-specific provider class on the Python side for image, video, TTS, and embeddings.
- Keep KNPLabs separate from the existing Kie.ai/fal.ai/BytePlus/UVoice branches.

Reasoning: KNPLabs combines several media families into one gateway, but the codebase already has separate media provider branches and recovery logic. Adding a new branch is lower-risk than reshaping the existing providers.

### 4. TTS and embeddings scope

- Add KNPLabs support explicitly.
- Do not turn KNPLabs into an implicit fallback inside the generic embedding service.

Reasoning: the existing embedding service already has a stable default path. KNPLabs should be opt-in so the pgvector and embedding flow do not change silently for current users.

### 5. Default enablement

- Seed all new KNPLabs models with `isEnabled = false`.
- Let admins enable only the models they actually want to expose.

Reasoning: this matches the repo’s current rollout pattern for provider catalogs and reduces the blast radius of a large model batch.

