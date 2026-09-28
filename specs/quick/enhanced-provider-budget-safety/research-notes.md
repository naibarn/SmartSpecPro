# Research notes

## Discovery

- SocratiCode transport is unavailable; targeted `rg`, source reads, local SDK
  introspection, and focused tests are the fallback.
- `openai_runner.py` calls `Runner.run` without `ModelSettings`.
- Agents SDK maps `ModelSettings.max_tokens` to Responses
  `max_output_tokens`; the current value is `None`.
- `AgentRuntimeConfig` has aggregate budgets but no per-request output ceiling.
- `AgentFactory` creates the structured `StageOutputEnvelope` but does not set
  model settings.
- `verticalDramaEpisodes.ts` resolves a `ProviderCandidate` containing
  `providerModelId` and `apiStyle`, but the Enhanced authoring snapshot and
  bridge environment currently use only logical model id, key, and base URL.
- Bridge stderr is truncated and passed through as the error message; the
  router classifier returns that message unchanged.
- Credit deduction occurs after `invokeEnhancedVideoDirectorBridge` succeeds.

## Relevant tests

- Python `tests/test_agent_runtime_v11.py` covers the Agent factory and bridge
  contract but not model settings or provider transport.
- TypeScript `verticalDramaEnhancedVideoPrompt.test.ts` covers readiness,
  bridge result validation, and semantic contracts but not bridge failure
  sanitization.

## Risk

The output cap must be large enough for visual observation JSON but small enough
to avoid provider reserve failures. An 8,192-token per-stage default is bounded,
well above the expected envelope size, and can be raised through the runtime
config only within a validated ceiling.
