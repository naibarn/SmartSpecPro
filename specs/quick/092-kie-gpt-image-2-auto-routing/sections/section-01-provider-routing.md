# Section 01 - Provider Routing

## Ownership

- `python-backend/app/llm_proxy/providers/kie_ai_provider.py`
- `python-backend/tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py`

## Work

Write failing tests, then add a pure reference-aware resolver used only by
`KieAIProvider.generate_image()`. Select the variant only when references are
non-empty and the config declares it.

## Acceptance

- opt-in model switches with references;
- opt-in model does not switch without references;
- non-opt-in model does not switch;
- configured reference input still becomes `input_urls`.

## Risk

Do not change video/audio resolution or generic alias fallback.
