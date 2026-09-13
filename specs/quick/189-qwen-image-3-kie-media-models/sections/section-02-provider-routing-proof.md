# Section 02: Provider Routing Proof

## Ownership

Conductor-owned files:

- `python-backend/app/llm_proxy/providers/kie_ai_provider.py` only if a declarative contract gap is proven
- `python-backend/tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py` or a focused companion test if coverage is missing

## Work

First run existing declarative Kie routing tests. Prove that no reference keeps the canonical T2I ID, while a non-empty normalized reference list selects the configured I2I ID and sends the prepared URLs under `image_urls`. Also prove the payload contains `image_size` and does not contain the generic `aspect_ratio` default. Do not edit the provider unless the focused test demonstrates that the existing generic path cannot represent Qwen3.

## TDD expectations

Mock Kie HTTP and managed-reference upload/download boundaries. Assert model ID and payload key only; never submit a real task or expose credentials.

## Acceptance checks

- Both Pro and Standard pairs resolve correctly.
- Blank/empty reference values do not silently fall back from an attempted I2I path.
- Existing GPT Image 2, GPT Image 2.5, and unrelated Kie routing tests remain green.

## Risks

Qwen3 uses `image_urls`, unlike GPT Image 2's `input_urls`. The catalog metadata must drive this difference; a model-name conditional would be unnecessary coupling.
