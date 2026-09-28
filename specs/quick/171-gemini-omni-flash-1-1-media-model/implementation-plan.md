# Implementation plan

## Objective

Expose `Gemini Omni 1.1 Flash` as an independently selectable Kie.ai video model and make its request validation, provider ID, reference modes, pricing, and async result path correct.

## Affected files

- `apps/web/shared/geminiOmni.ts`: shared model IDs, predicate, first/last-frame validation and extra-param projection.
- `apps/web/server/services/modelRegistry.ts`: static fallback catalog row and capability metadata.
- `apps/web/server/services/mediaGenerationService.ts`: media-generation fallback catalog row and pricing/field parity.
- `apps/web/scripts/seed-media-models-kie-ai.ts`: DB seed row with exact provider model ID and documented fields/pricing.
- `apps/web/server/routers/media.ts`: server preflight recognizes both model IDs and forwards first/last-frame values.
- `apps/web/client/src/pages/MediaStudio.tsx`: model selection, retry, Gemini suite, and status/QA predicates recognize both IDs without changing old behavior.
- `python-backend/app/llm_proxy/providers/kie_ai_provider.py`: fallback aliases for legacy/internal names; preserve config-driven exact ID precedence.
- focused tests beside the affected shared/server/Python modules.

## Implementation approach

1. Add tests for the new internal/provider IDs and first/last-frame contract before changing implementation.
2. Add shared constants/predicate and extend validation with safe optional frame URLs, including pair/mutual-exclusion rules.
3. Add a catalog row in all three catalog boundaries. Use provider-documented resolution spelling (`360p`, `720p`, `1080p`, `4k`) and a model-specific pricing matrix. Keep the existing row byte-compatible.
4. Replace only exact Gemini Omni ID gates with the shared predicate. Do not broaden generic model matching by display name in security/credit paths.
5. Ensure server/client extra-param projection includes frame fields only when valid and preserves existing managed references.
6. Add exact Python provider payload tests for prompt-only, image/reference, and first/last-frame requests; verify `model` is `google/gemini-omni-flash-1-1`.
7. Run focused TypeScript/Python tests, formatting/diff checks, and targeted typecheck. If environment credentials are present, run a bounded live smoke and record task/result evidence; otherwise record the missing external boundary.

## Risks and mitigations

- Catalog duplication can drift: add parity assertions for provider ID, supported values, and input field keys.
- Existing code keys on one ID: centralize the predicate and test generation plus retry paths.
- First/last-frame can be mixed with references incorrectly: validate before credit reservation and add negative tests.
- Kie pricing may change: keep pricing in seed/catalog data, document source date, and do not reuse the old matrix silently.
- Provider availability/account quota cannot be proven locally: separate local contract proof from credential-gated live smoke.

## Acceptance criteria

1. The new model is listed as a separate enabled video catalog row with exact `kieModelId: google/gemini-omni-flash-1-1`.
2. Prompt-only and multimodal reference payloads use the generic Kie market endpoint and exact provider model.
3. Valid first/last-frame requests send the documented keys; invalid/mixed requests fail before provider/credit work.
4. Both old and new model IDs enter the Gemini Omni suite/preflight paths; old model behavior remains intact.
5. Focused tests pass after the final edit and no changed file has a stale gate.
6. Live provider smoke is either passed with task/result evidence or explicitly marked unavailable; it is never implied by unit tests.

## Rollout

Run the seed/upsert script in the target environment after code deployment, confirm provider API key and pricing configuration, then run one low-cost prompt-only and one reference smoke. Roll back by disabling/removing only the new catalog row; old tasks and old row remain independent.
