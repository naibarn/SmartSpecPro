## Request

Create a feature spec under `specs/feature` that extends the existing admin LLM provider work so `admin/llm-providers` can support Kie.ai for chat-oriented APIs.

The spec must build on the existing feature-spec patterns already used in this repository, especially the multi-provider and admin catalog work, and must cover the Kie.ai model pages provided by the requester:

- `https://docs.kie.ai/market/chat/gpt-5-4`
- `https://docs.kie.ai/market/claude/claude-haiku-4-5`
- `https://docs.kie.ai/market/claude/claude-opus-4-6`
- `https://docs.kie.ai/market/claude/claude-sonnet-4-6`
- `https://docs.kie.ai/market/claude/claude-opus-4-5`
- `https://docs.kie.ai/market/claude/claude-sonnet-4-5`
- `https://docs.kie.ai/market/codex/gpt-codex`
- `https://docs.kie.ai/market/gemini/gemini-3-flash`
- `https://docs.kie.ai/market/gemini/gemini-3-pro`
- `https://docs.kie.ai/market/gemini/gemini-3-1-pro`

## Repo-grounded assumptions

- The existing admin LLM provider work lives in `apps/web/server/routers/llmProviders.ts`, `apps/web/server/routers/multiProvider.ts`, `apps/web/client/src/components/admin/MultiProviderAdmin.tsx`, and `apps/web/server/_core/llmRoutes.ts`.
- The current system already supports mixed `apiStyle` values in `model_provider_map`, but the provider catalog defaults `apiStyle` by provider name and cannot currently represent one provider with multiple API styles in its unmapped catalog rows.
- The repository already contains Kie.ai media-provider support under `mediaProviders`, so this feature should align naming and operational expectations where practical.

## Non-goals

- No Python media-provider changes.
- No pricing scrape automation from Kie.ai.
- No attempt to generalize Kie.ai into a universal marketplace abstraction for arbitrary future model families beyond the documented Kie chat models in scope.
