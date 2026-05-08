# section-02-schema-contracts

## Goal

Add the persistent data model and shared TypeScript/Zod contracts for the
voice-agent runtime.

## Depends On

- section-01-provider-research

## Files Owned

- `apps/web/drizzle/schema.ts`
- Migration file under the repository's existing Drizzle migrations directory
- `apps/web/drizzle/schema.test.ts` or focused schema test file
- `apps/web/shared/voiceAgents.ts`
- `apps/web/shared/__tests__/voiceAgents.test.ts`

## Data Model Work

Add enums:

- `voice_agent_provider`
- `voice_agent_surface`
- `voice_agent_connection_type`
- `voice_agent_session_status`
- `voice_agent_billing_status`
- `voice_agent_event_source`
- `voice_agent_redaction_status`
- `voice_agent_tool_call_status`

Extend existing credit source type with `voice_agent`.

Add tables:

- `voice_agent_configs`
- `voice_agent_sessions`
- `voice_agent_events`
- `voice_agent_tool_calls`

Follow schema details from `claude-spec.md` and `spec.md`. Keep all changes
additive. Do not alter `media_models` or existing ElevenLabs media provider
models.

## Shared Contract Work

Create `apps/web/shared/voiceAgents.ts` with Zod schemas and inferred types for:

- surface, provider, connection type, session status, billing status
- config create/update input
- admin list/session detail DTOs
- session create/connection material/stop input
- client event input
- tool callback payload/result
- `chat.create_message` tool input/result

Contract rules:

- No raw API key field is accepted.
- `VoiceAgentConnectionMaterial` requires exactly one of `conversationToken` or
  `signedUrl`.
- `chat.create_message` input rejects extra fields and caps message length.
- Enum values match Drizzle enum values.

## TDD

Write tests before implementation:

- Schema tests verify all new tables expose required columns.
- Schema tests verify indexes and partial unique constraints for provider event
  and idempotency IDs where practical.
- Contract tests validate happy path and rejection path for every public DTO.
- Contract tests verify `voice_agent` is accepted as a credit source type.

## Acceptance

- Schema compiles.
- Shared contracts compile.
- Schema/contract tests fail before implementation and pass after implementation.
- No existing media provider/model contracts are changed.

## Handoff to Later Sections

Sections 03-06 must import shared types from `apps/web/shared/voiceAgents.ts`
instead of redefining payload shapes.
