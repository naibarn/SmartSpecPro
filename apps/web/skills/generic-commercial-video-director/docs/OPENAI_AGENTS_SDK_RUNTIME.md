# OpenAI Agents SDK Runtime — v11

SmartAIHub Core is the authoritative workflow and side-effect owner. OpenAI Agents SDK is used only for bounded specialist reasoning with structured outputs.

## Runtime contract

- SDK range: `openai-agents>=0.22.0,<0.23`.
- Every specialist returns `StageOutputEnvelope` and a canonical stage payload.
- Stage payloads are JSON-Schema validated before persistence.
- Sessions are optional history; SmartAIHub DB + durable run checkpoint is canonical state.
- Tools exposed to Agents are read-only/bounded.
- Paid generation, credit deduction, publish and delete remain Controller-owned.
- Every referenced asset is re-authorized before Agent output becomes canonical.
- Token usage includes failed schema-repair attempts.
- Paid provider plans should be hash-bound to approval/idempotency.

See `docs/USER_GUIDE_TH.md` section 37 for the full Thai production guide.
