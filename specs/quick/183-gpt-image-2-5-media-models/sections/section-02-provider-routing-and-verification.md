# Section 02 — Provider Routing and Verification

## Ownership boundary

Own only focused Python/TypeScript routing tests and any minimal runtime correction required if the existing generic switch cannot satisfy the new catalog configuration. Do not change provider behavior globally unless a failing regression proves it is necessary.

## Target files

- `python-backend/app/llm_proxy/providers/kie_ai_provider.py` only if required by tests
- `python-backend/tests/unit/llm_proxy/test_gpt_image_25_routing.py`
- `python-backend/tests/unit/llm_proxy/test_kie_ai_mode_routing.py` or a focused companion test
- `apps/web/server/services/enabledMediaModelSelection.ts`
- `apps/web/server/services/__tests__/enabledMediaModelSelection.test.ts`
- catalog parity test from Section 01

## TDD expectations

Parameterize Flare and Sunburst:

- no reference images -> exact text-to-image Kie ID and no `input_urls`;
- one reference image -> exact image-to-image Kie ID and `input_urls` array;
- both paths preserve prompt and do not route to another provider.

## Acceptance checks

- Local tests prove the provider payload without external credentials or paid requests.
- Existing GPT Image 2 legacy routing and non-opt-in behavior remain green.
- `git diff --check` passes; focused TypeScript/Python checks are recorded separately.

Implementation result: no provider runtime change was required. The companion routing test covers both GPT Image 2.5 variants and the natural-language model hint test keeps Flare/Sunburst on their unified canonical rows. Focused Python coverage passed 71 tests in the combined relevant files; focused Vitest coverage passed 28 tests across the four relevant files.

## Risks

Kie-hosted reference upload is an existing boundary. Tests should mock it and inspect only the resulting safe URL/payload, never log raw credentials, prompts, or signed tokens.
