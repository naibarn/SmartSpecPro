# Feature 108 TDD Plan

This document mirrors `claude-plan.md`. Each section lists tests to write before
implementation.

## 1. External API Research Spike

Tests are not required for the spike itself, but the spike must produce fixtures
or documented sample payloads for:

- WebRTC conversation token response.
- WebSocket signed URL response with conversation ID where available.
- React SDK session start return value.
- Post-call transcription webhook payload.
- Conversation detail API payload.
- Tool callback payload/signature headers.
- Reconciliation transport decision:
  `post_call_webhook`, `provider_polling`, or `both`.

## 2. Data Model

Write schema tests in `apps/web/drizzle/schema.test.ts` or a focused
`voiceAgents.schema.test.ts`:

- Test `voice_agent_configs` exposes required columns, indexes, and defaultable
  fields.
- Test `voice_agent_sessions` exposes lifecycle, connection, billing, and error
  columns.
- Test `voice_agent_events` exposes sequence/provider ID uniqueness fields.
- Test `voice_agent_tool_calls` exposes provider tool-call ID and idempotency
  fields.
- Test the credit source enum includes `voice_agent`.

Migration tests/checks:

- Test migration creates enums before tables.
- Test migration is additive and does not alter `media_models`.
- Test nullable unique indexes allow multiple null provider IDs but dedupe known
  provider IDs.

## 3. Shared Contracts

Write tests in `apps/web/shared/__tests__/voiceAgents.test.ts`:

- Validate create/update config DTOs reject raw API key fields.
- Validate connection material requires exactly one of `conversationToken` or
  `signedUrl`.
- Validate tool callback payload requires session ID, provider conversation ID,
  provider tool-call ID, tool name, input, and timestamp.
- Validate `chat.create_message` rejects additional properties and overlong
  messages.
- Validate enum values match Drizzle enum values.

## 4. Backend Services

Provider client tests in
`apps/web/server/services/__tests__/elevenLabsVoiceAgentProvider.test.ts`:

- Requests conversation token without exposing API key.
- Requests signed URL fallback with branch/environment fields.
- Normalizes non-2xx provider errors to sanitized errors.
- Fetches conversation detail and normalizes transcript/metadata.

Config service tests:

- Create config rejects missing ElevenLabs provider credential.
- Create config defaults allowed surface to `chat`.
- Create config defaults server location from tenant setting, then `us`.
- Disable config prevents new sessions but preserves historical sessions.
- Test config stores sanitized success/failure.

Session service tests:

- Create session inserts `created` before provider connection material.
- Create session is idempotent by `(tenantId, userId, idempotencyKey)`.
- Connection material sets `connecting` and expires within 5 minutes.
- Stop is idempotent.
- Provider failure stores sanitized error and `failed`.
- Tenant isolation rejects another tenant's config/session.
- Credit reservation settles/releases/fails once.

Event/reconciliation tests:

- SDK final user/agent events append conversation messages once.
- Partial transcript events do not spam conversation history.
- Post-call webhook/polling reconciles missing final transcript.
- Failed reconciliation sets `transcript_pending`.
- Provider metadata updates duration/cost fields.

Tool bridge tests:

- Unknown tool rejected.
- Tool not allowlisted rejected.
- Invalid input rejected.
- Unsigned/stale callback rejected.
- Replayed provider tool-call ID does not execute twice.
- `chat.create_message` executes under user/tenant context.
- Sanitized result excludes stack traces/secrets.

## 5. API Layer

tRPC router tests in `apps/web/server/routers/__tests__/voiceAgents.test.ts`:

- Admin list/create/update/setEnabled/test config enforce admin permission.
- User list/create/getConnection/stop/ingest enforce authentication and tenant.
- Errors use sanitized code/message/retryable where provider-facing.
- Cursor/limit session list behaves predictably.

Public route tests in
`apps/web/server/routes/__tests__/voiceAgentsElevenLabsCallback.test.ts`:

- Route accepts valid signed payload.
- Route rejects invalid signature.
- Route rejects stale timestamp.
- Route rejects oversized body.
- Route returns 2xx after persisting denied/failed states.
- Route delegates to TypeScript service rather than duplicating policy.

If Section 01 chooses post-call webhook reconciliation, add route tests for
`POST /api/voice-agents/elevenlabs/post-call`:

- Route accepts valid signed post-call transcript payload.
- Route rejects invalid/stale/oversized payloads.
- Route delegates to reconciliation service.

If Section 01 chooses polling-only reconciliation, add service/job tests for the
retry budget and `transcript_pending` terminal fallback.

## 6. Credit and Billing

Tests in `apps/web/server/services/__tests__/voiceAgentBilling.test.ts`:

- Reserve uses source type `voice_agent`.
- Reserve idempotency key prevents duplicate deductions.
- Release credits exactly once.
- Settlement records provider duration/cost metadata.
- Terminal failure releases unused reservation.
- Admin session detail shows estimated and reconciled usage.

## 7. Frontend UI

Component tests under `apps/web/client/src/components/chat/voice/__tests__/`:

- Voice panel renders start control when configs exist.
- Empty state renders when no configs exist.
- Microphone permission failure shows recoverable guidance.
- Start obtains connection material before SDK start.
- Browser never receives API key.
- SDK status maps to connecting/listening/speaking/ended/error states.
- Stop calls SDK endSession and `voiceAgents.stopSession`.
- Tool-running indicator renders from tool events.
- SDK dependency import is resolved by `pnpm check`; if an adapter is used, the
  adapter maps SDK status/mode callbacks into stable UI state.

Chat integration tests:

- Text chat remains usable while voice panel is open.
- Final transcript messages appear after reconciliation.

## 8. Admin UI

Component/router tests:

- Admin page clearly separates voice-agent configs from media providers.
- Admin route/nav entry renders only when `voiceAgents` tenant feature flag is
  enabled.
- Missing ElevenLabs provider key shows setup action.
- Test config result displays sanitized success/failure.
- Allowed tools control defaults to `chat.create_message`.
- Recent session detail renders transcript and tool calls with redacted payloads.

## 9. Security and Regression Gates

Security tests:

- No API key in connection material, logs, client payloads, or callback response.
- Provider conversation ID cannot bind to a different tenant/user/session.
- Raw debug payloads are redacted by default.
- Callback route is CSRF-exempt only because provider signature validation is
  enforced.

Regression tests:

- Existing Media Studio ElevenLabs TTS still creates a media job.
- Existing ElevenLabs STT media job still creates transcript artifact.
- Existing WaveSpeed audio model routing remains unchanged.
- Existing skill execution modes are not reclassified as voice-agent runtime.
- `voiceAgents` tenant feature flag fails closed for admin visibility, Chat
  panel visibility, and tool bridge execution.

Quality commands:

- `cd apps/web && pnpm check`
- `cd apps/web && pnpm test -- --runInBand` or the repository's narrow Vitest
  equivalent for touched test files
