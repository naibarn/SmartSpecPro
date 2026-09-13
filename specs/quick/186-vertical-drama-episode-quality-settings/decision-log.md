# Decision Log

## Planning depth

- Chosen depth: standard quick plan.
- Reason: the feature spans schema, tRPC, runtime adapters, and UI, but all affected flows already exist and can be extended through established boundaries.
- Migration risk: nullable/additive only; no data backfill.
- Promotion trigger: if current LLM catalog cannot expose OpenRouter per-model reasoning capabilities without a safe source of truth, keep the existing `supportsThinking` gate and defer only richer effort filtering behind a fail-closed default.

## Key decisions

1. Store separate `generationSettings` on series and episode rows rather than mixing settings into generated artifacts.
2. Snapshot series defaults at episode insertion so old episodes do not follow later default changes.
3. Use model-bound image quality values and omit stale values after model changes.
4. Use OpenRouter's unified `reasoning` object; do not send both `effort` and `max_tokens`.
5. Treat Auto as omission of an episode override, preserving existing skill policy behavior.
6. Save settings without generating or charging credits.
