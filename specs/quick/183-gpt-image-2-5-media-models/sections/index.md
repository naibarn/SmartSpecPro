<!-- PROJECT_CONFIG
runtime: node22-pnpm-and-python312-venv
test_command: cd apps/web && pnpm exec vitest run server/services/__tests__/gptImage25MediaModels.test.ts server/services/__tests__/enabledMediaModelSelection.test.ts && cd ../../python-backend && DEBUG=false .venv/bin/pytest -q --no-cov tests/unit/llm_proxy/test_gpt_image_25_routing.py tests/unit/llm_proxy/test_kie_ai_provider_model_resolution.py tests/unit/llm_proxy/test_kie_ai_mode_routing.py
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-catalog-and-migration
section-02-provider-routing-and-verification
END_MANIFEST -->
