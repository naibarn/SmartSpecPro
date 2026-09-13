# Section 03 — Runtime Adapters

## Ownership

Image request quality forwarding and LLM skill reasoning forwarding.

## Target files

- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- `apps/web/server/services/verticalDramaStoryBible.ts`
- `apps/web/server/services/verticalDramaLlmModelPolicy.ts`
- `apps/web/server/_core/llmRoutes.ts` only if the existing passthrough contract needs a narrow fix
- focused runtime tests

## Requirements

- Image: add quality to explicit `extraParams` only when the selected catalog model supports it.
- LLM: OpenRouter explicit effort becomes one `reasoning` object with `exclude: true`.
- Do not send both `reasoning.effort` and `reasoning.max_tokens`.
- Do not duplicate legacy `enableThinking` fields when episode override is explicit.
- Auto preserves existing skill policy behavior.
- Capture the effective setting in existing run/request metadata where safe.
