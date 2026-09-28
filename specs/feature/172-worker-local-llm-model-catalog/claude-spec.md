# Synthesized Specification — Feature 172

Feature 172 adds configurable Worker-backed Local LLM models to SmartAIHub. A
Worker owner can configure multiple local provider profiles and multiple models per
profile in the Worker App. Safe inventory metadata is projected to Cloud as stable
`worker_app` model references. Every LLM model selector uses one actor-aware catalog.

The owner can keep the Worker private or select Groups created by that owner in the
same Tenant. Active members of selected Groups can see and invoke enabled models.
Tenant-wide sharing is not allowed for Local LLM v1. Cloud validates actor, tenant,
Group membership, model status, Worker readiness, and feature flags before creating
an `llm_invoke` job. A selected Worker model is pinned to its Worker and never falls
back silently to a Cloud provider.

The Worker keeps endpoint and credential data locally, uses the existing OS keyring
pattern, discovers or manually registers models, and calls Ollama/vLLM/LM Studio/
llama.cpp/LocalAI through an OpenAI-compatible adapter baseline with capability
probing. The Worker receives an authoritative `localModelId -> modelRef` mapping,
validates model/provider/revision binding, executes through a bounded local queue,
and reports normalized completion/stream events through the existing control plane.

The implementation must preserve existing local-client Local AI behavior, global LLM
provider behavior, media model catalogs, legacy Worker jobs, credit idempotency,
audit, cancellation, lease, and retry semantics. It must add durable inventory
revision/idempotency, actor-aware catalog integration, server-owned sharing policy,
atomic stream-event deduplication, bounded payload/retention controls, and tests for
authorization races, replay, cancellation, no-double-inference retry, and secret
redaction.

All source requirements, data shapes, acceptance criteria, research links, and
rollout constraints are defined in `spec.md`; this file is the implementation
planning synthesis used by deep-plan.
