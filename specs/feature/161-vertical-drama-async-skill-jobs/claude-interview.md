# Interview transcript

## User decision

The user approved the proposed design and requested all applicable Drama Series LLM/skill flows be made background/async to reduce timeout. The user explicitly requires real LLM/skill execution, no mock/fallback in production paths, complete credit transactions for every real run, exact selected-model propagation, refresh-safe results, and automatic repair when generated story data or dialogue is incomplete.

## Implementation interpretation

- Scope includes every browser-facing LLM mutation in the Drama Series workflow, not only the originally observed prompt expansion endpoint.
- Existing async queues remain the canonical implementation where they already cover the flow.
- Pure database operations and already-asynchronous media provider jobs are not needlessly reworked.
- Provider-boundary mocks are allowed only in tests that prove the HTTP request is decoupled from provider latency.
