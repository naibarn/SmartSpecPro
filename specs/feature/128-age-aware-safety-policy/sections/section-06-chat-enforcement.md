# section-06-chat-enforcement

## Goal

Enforce age-aware safety policy for all chat paths before model invocation and after model output, including streaming responses. Policy context must be passed to the model/provider safely without exposing unnecessary personal data.

## Depends On

- `section-01-policy-foundation`
- `section-03-security-pin-tokens`
- `section-04-admin-policy-audit-flags`

## Files In Scope

- Chat/LLM routes such as `apps/web/server/_core/llmRoutes.ts`.
- Routed LLM handler code such as `apps/web/server/services/llmRoutesHandler.ts`.
- OpenAI-compatible or Responses routes such as `apps/web/server/_core/responsesRoutes.ts` when they accept chat-like generation.
- Python streaming endpoint and service such as `python-backend/app/api/llm_v1.py` and `python-backend/app/services/streaming_service.py`.
- Skill/chat execution paths that can send prompts.
- New chat safety enforcer service and tests.

## Test First

Add tests for:

- Blocked user prompt never reaches the LLM provider.
- Prompt is evaluated with user age band, jurisdiction, surface, action, tenant/domain policy, and protected-surface token where applicable.
- Provider prompt receives only minimal policy instruction: age band and allowed content boundaries, not DOB.
- Streaming output can be stopped, transformed, or replaced with a safe refusal if output policy fails.
- `llmRoutes.ts`, `llmRoutesHandler.ts`, `/api/llm/stream`, OpenAI-compatible endpoints, and `chat.executeSkill` all call the same enforcer.
- Protected-surface unlock tokens are read through the shared tRPC/Express extractor and are not confused with Private Vault tokens.
- Audit records contain reason codes without storing full sensitive prompt/output by default.
- Temporary PIN unlock changes effective access only for allowed scopes and expires correctly.

## Implementation Requirements

- Create a single chat enforcement entry point, for example `ageSafeChatEnforcer.evaluateRequest` and `evaluateOutput`.
- Enforce preflight before credit consumption where possible.
- For streaming, evaluate provider chunks or completed buffers according to existing architecture. If chunk-level moderation is impractical, buffer until a safe threshold and fail closed for high-risk categories.
- When the routed handler returns SSE, do not write child/unknown-band upstream tokens to `res` before the output policy can block/repair/refuse.
- Add policy context to system/developer prompt instructions in a compact, provider-agnostic form.
- Treat prompt-injected attempts to override age policy as blocked or ignored by the server-side enforcer.
- Keep existing chat APIs and response shapes stable except for structured safety block responses.

## Integration Notes

- If Python streaming receives policy context from Node, sign or otherwise trust only server-originated policy envelopes.
- Do not duplicate policy logic in Python; Python should enforce the provided envelope and call back only through approved internal paths if deeper evaluation is needed.
- Existing moderation/provider tooling can be used as an adapter under the central policy decision.

## Verification

- `cd apps/web && pnpm test -- chatSafety`
- `cd apps/web && pnpm test -- llmRoutes`
- Python tests if present: `cd python-backend && pytest`

## Handoff

All chat execution paths must fail closed to child-safe policy when profile or policy context is missing.
