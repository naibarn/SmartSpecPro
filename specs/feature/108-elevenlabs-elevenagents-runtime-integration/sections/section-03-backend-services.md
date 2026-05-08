# section-03-backend-services

## Goal

Implement the TypeScript backend services that own provider interaction, config,
session lifecycle, event persistence, transcript reconciliation, tool bridge
policy, and billing.

## Depends On

- section-02-schema-contracts

## Files Owned

Create files under `apps/web/server/services/voiceAgents/`:

- `elevenLabsVoiceAgentProvider.ts`
- `voiceAgentConfigService.ts`
- `voiceAgentSessionService.ts`
- `voiceAgentEventService.ts`
- `voiceAgentToolBridgeService.ts`
- `voiceAgentReconciliationService.ts`
- `voiceAgentBillingService.ts`
- `voiceAgentRedaction.ts`
- `voiceAgentSecurity.ts`
- `index.ts`

Tests under:

- `apps/web/server/services/__tests__/elevenLabsVoiceAgentProvider.test.ts`
- `apps/web/server/services/__tests__/voiceAgentConfigService.test.ts`
- `apps/web/server/services/__tests__/voiceAgentSessionService.test.ts`
- `apps/web/server/services/__tests__/voiceAgentEventService.test.ts`
- `apps/web/server/services/__tests__/voiceAgentToolBridgeService.test.ts`
- `apps/web/server/services/__tests__/voiceAgentBillingService.test.ts`

## Service Responsibilities

### Provider client

- Load existing ElevenLabs media provider credential.
- Request WebRTC conversation token.
- Request WebSocket signed URL fallback.
- Fetch conversation detail for reconciliation.
- Normalize provider errors to sanitized code/message/retryable.

### Config service

- Create/update/list/enable/disable configs.
- Validate credential exists.
- Apply defaults for surface, tool allowlist, server location, and retention.
- Preserve historical sessions when config is disabled.
- Audit config changes.

### Session service

- Create sessions idempotently.
- Reserve credits before connection material.
- Produce WebRTC token connection material.
- Update provider conversation ID after frontend reports SDK start result.
- Stop sessions idempotently.
- Move terminal states exactly once.

### Event and transcript service

- Ingest SDK events.
- Sequence events.
- Store final transcript messages into conversation history.
- Deduplicate final transcript writes.
- Store partial events only if configured for debug/recovery.

### Tool bridge service

- Validate callback signature/timestamp/replay.
- Resolve tenant/user/session/config/surface binding.
- Validate tool allowlist and schema.
- Persist tool call before execution.
- Execute `chat.create_message` through existing chat service.
- Persist sanitized result/error.

### Billing service

- Reserve minimum credits with idempotency.
- Settle against provider duration/cost when available.
- Release unused credits on early failure/cancel.
- Prevent duplicate settlement/release.

## TDD

Write service tests before implementation:

- Provider success/error normalization.
- Missing credential rejection.
- Config defaulting and tenant scoping.
- Session idempotency.
- Connection material expiry.
- Stop idempotency.
- Transcript dedupe.
- Reconciliation success/failure.
- Tool callback allow/deny/replay.
- Billing reserve/settle/release exactly once.

## Acceptance

- Services expose clear functions consumed by router and callback route.
- No service returns raw API keys.
- Services use shared contracts from `apps/web/shared/voiceAgents.ts`.
- Existing chat and credit services are reused instead of duplicating logic.
