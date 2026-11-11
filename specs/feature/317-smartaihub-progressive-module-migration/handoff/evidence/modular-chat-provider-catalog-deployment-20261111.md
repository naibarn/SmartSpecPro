# Modular Chat provider/model catalog — 2026-11-11

## Legacy source and safe shared-data path

- Legacy Chat's provider/model catalog is assembled from enabled rows in `llm_providers` and `model_provider_map`; provider API keys remain server-side. The Legacy Auto flag is `chatAutoModelSelection`, enabled by default in `apps/web/shared/featureFlags.ts`.
- The configured development database currently exposes 38 enabled model mappings across 2 providers through the new Modular catalog view: Kie AI (10) and OpenRouter (28).
- Migration `apps/web/drizzle/0422_modular_chat_llm_model_catalog.sql` creates `public.modular_chat_llm_model_catalog` as a safe projection. It includes display/model metadata and Auto eligibility only; it omits API keys, base URLs, and provider request configuration. The `modular_core_auth_dev` role can query this view but cannot SELECT `llm_providers` or `model_provider_map` directly.
- The migration runner applied migration 0422 to the development `smartspec` database. A role-scoped query returned `38 models / 2 providers; auto=true`; checks for direct SELECT on both source tables returned false.

## Implemented UI/API slice

- `GET /v1/core/chat-models` returns the catalog only for a valid Core session. The Hono Chat Worker exposes it at `GET /api/chat/v1/models` after tenant identity validation.
- The Chat composer now offers global Auto, provider-specific Auto, and explicit models from the safe catalog. The user choice is held per signed-in user and selected workspace in session storage. No credentials are sent to the browser.
- Package-scoped tests passed before integration: Core auth/repository and Chat API/UI focused suites; Core and Chat typechecks passed. Exact-source Core, Shell, and Chat builds plus Wrangler dry-runs passed at `smartaihub-platform/main@03f450112b61efcec8c14004f7495076aae79035`.
- The built Chat entry asset returned 200 from the deployed local Workerd route and contains the `AI LLM model` selector and Auto option.

## Development deployment

- Target: `modular-debian-dev`, `https://aimarkethubs.com`, Debian systemd with local Workerd, shared development database `smartspec`.
- Release: `/home/dev/modular-development-releases/modular-debian-dev-03f450112b61efcec8c14004f7495076aae79035-chat-model-selector-r2`.
- The first candidate was automatically rolled back at its health check because the packaged release omitted package-local pnpm dependency links. The corrected artifact ran `pnpm install --frozen-lockfile` inside the release, rebuilt all three independently buildable packages, and then passed the release controller.
- `modular_debian_dev_release.py` returned `DEPLOYED_AND_VERIFIED` at `2026-11-11T08:23:40Z`. Core, Chat, Shell, module manifest, and Chat entry probes returned 200; unauthenticated Chat session returned 401; public root/login, Chat health, and manifest probes returned 200. The legacy rollback service on port 3100 remains recorded by the controller.
- `smartaihub.app` was not changed. Production `smartsihub.com` remains inactive and was not deployed.

## Remaining gap

The catalog and Auto choices are now visible and selectable, but the selected value is not yet consumed by a Chat generation route. Chat message sending remains disabled until a tenant-scoped persistence adapter and server-side provider execution path are verified and integrated. The Auto option is therefore a UI selection at this checkpoint, not a claim of live model routing. Authenticated browser click-through and desktop/tablet/mobile visual UAT remain open.
