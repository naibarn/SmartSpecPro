# Request

## Task summary

Audit and repair every user-facing image, video, and audio model-selection
path so models belonging to disabled media providers are not offered. Keep
disabled rows visible in Admin for management. Ensure stale persisted choices
fail closed at generation time.

## Repository context

- Workspace: `/home/dev/projects/SmartSpecPro`
- Primary backend catalog: `apps/web/server/routers/mediaModels.ts`
- Shared model registry: `apps/web/server/services/modelRegistry.ts`
- Provider admin router: `apps/web/server/routers/mediaProviders.ts`
- Existing direct generation gate:
  `apps/web/server/services/enabledMediaModelSelection.ts`
- Existing client catalog consumers use both `mediaModels.list` and
  `media.getModels`; recommended image/video/audio endpoints use the model
  registry.

## Constraints

- Preserve unrelated dirty-worktree changes.
- Do not delete or mutate model rows when a provider is disabled.
- Do not change Admin catalog visibility or readiness diagnostics.
- Keep provider-name comparison consistent with
  `normalizeMediaProviderName`.
- Do not claim production/browser/provider verification from local tests.

## Approved design

Use a provider-aware catalog contract in the registry and public model list,
invalidate the registry cache after provider mutations, and prevent a
successful DB load with no eligible models from falling back to static models.
Apply the same behavior to image, video, and audio.
