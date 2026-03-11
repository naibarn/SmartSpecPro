## Task Summary

Complete the LLM enabled-model separation work so the project does not just hide disabled models in UI lists, but also avoids executing disabled models through server/runtime fallbacks and persisted settings.

## Likely Affected Areas

- `apps/web/server/routers/*` LLM selection and validation paths
- `apps/web/server/services/*` background jobs, gateways, memory summarization
- `apps/web/server/_core/*` legacy API/runtime paths still using hardcoded model fallbacks
- selected client pages that still serialize hidden fallback values into requests

## Constraints

- Preserve existing provider/model routing architecture.
- Do not break admin pages that must still manage disabled mappings.
- Prefer centralized validation/helpers over ad hoc per-route checks where practical.

## Assumptions

- "Enabled" means the model appears in enabled `model_provider_map` rows for enabled providers.
- For runtime execution, if a requested/stored model is disabled, the system should resolve to an enabled default when safe or fail explicitly when that is better than silently using a hidden model.
- This pass should prioritize user-facing and background execution paths over low-signal placeholders/comments/examples.

