# Feature 108 Synthesized Spec: ElevenLabs ElevenAgents Runtime Integration

## Objective

Add a first-class ElevenLabs ElevenAgents voice-agent runtime to SmartSpecPro.
This runtime is separate from one-shot media generation and is not represented
as a `media_models` row. It lets authenticated users start a live voice-agent
session from Chat, lets admins configure tenant-scoped ElevenLabs agent IDs, and
persists final transcripts, session lifecycle, tool calls, credit records, and
audit data in SmartSpec.

## MVP Scope

In scope for MVP:

- Admin voice-agent config management for ElevenLabs.
- Reuse of the existing ElevenLabs media provider credential without storing raw
  API keys in voice-agent config.
- Chat-only voice-agent start/stop UI.
- Primary WebRTC connection material via ElevenLabs conversation token.
- Secondary WebSocket signed URL fallback only if WebRTC cannot satisfy hard
  blockers found in the research spike.
- SmartSpec session records, event records, and tool-call records.
- Final transcript persistence into SmartSpec conversation history.
- Post-call webhook or provider polling reconciliation after session end.
- Server-mediated `chat.create_message` webhook tool bridge.
- Per-minute credit reservation with provider metadata reconciliation when
  available.
- Regression protection for existing ElevenLabs media models and media jobs.

Deferred beyond MVP:

- Team Room, Work OS, and Agency runtime consumers.
- Media, library, workflow, task, and case tool bridge classes.
- ElevenLabs knowledge base sync from SmartSpec library.
- Telephony, SIP, Twilio, and batch outbound calls.

## Locked Decisions

- MVP owner for callback and tool routes is `apps/web/server`, not
  `python-backend`.
- Public callback route: `POST /api/voice-agents/elevenlabs/tool-callback`.
- Primary frontend SDK: `@elevenlabs/react`.
- Connection material must never include the ElevenLabs API key.
- Final transcripts are persisted by default under `retention_policy`.
- Data residency defaults to tenant setting, then `us` for MVP.
- First allowlisted tool is `chat.create_message`.
- Client tools are UI-only and cannot mutate SmartSpec data directly.
- Provider post-call data is authoritative for final transcript/usage
  reconciliation when available.

## Functional Requirements

1. Admins can list, create, update, enable/disable, test, and inspect
   ElevenLabs voice-agent configs.
2. Configs are tenant-scoped and can map multiple ElevenLabs agent IDs per
   tenant.
3. Users can list enabled configs for `chat`, create a session, request
   connection material, stop a session, and ingest client events.
4. Session lifecycle must move through `created`, `connecting`, `active`,
   terminal `ended`/`failed`/`cancelled`, with sanitized error codes/messages.
5. Session start creates SmartSpec state before provider connection material is
   requested.
6. Browser SDK callbacks are stored as realtime best-effort events.
7. Final transcript messages are appended to SmartSpec conversation history
   idempotently.
8. Tool callbacks validate signature, timestamp, session binding, allowlist,
   schema, tenant, user, surface, agent config, and policy guardrails.
9. Duplicate tool callbacks must not execute twice.
10. Credit reservation must settle/release/fail exactly once per terminal
    session state.

## Data Requirements

Add four tables:

- `voice_agent_configs`
- `voice_agent_sessions`
- `voice_agent_events`
- `voice_agent_tool_calls`

Add enums for provider, surface, connection type, session status, billing
status, event source, redaction status, and tool-call status.

Extend credit source type to support `voice_agent`.

## API Requirements

Authenticated tRPC router:

- `voiceAgents.admin.listConfigs`
- `voiceAgents.admin.createConfig`
- `voiceAgents.admin.updateConfig`
- `voiceAgents.admin.setConfigEnabled`
- `voiceAgents.admin.testConfig`
- `voiceAgents.admin.listSessions`
- `voiceAgents.admin.getSession`
- `voiceAgents.admin.getTranscript`
- `voiceAgents.admin.getToolCalls`
- `voiceAgents.listEnabled`
- `voiceAgents.createSession`
- `voiceAgents.getConnectionMaterial`
- `voiceAgents.stopSession`
- `voiceAgents.ingestClientEvent`

Public HTTP route:

- `POST /api/voice-agents/elevenlabs/tool-callback`

Provider client methods:

- Get WebRTC conversation token.
- Get WebSocket signed URL fallback.
- Fetch conversation details for reconciliation.
- Normalize provider errors.

## UX Requirements

Chat UI must expose a compact voice-agent entrypoint and panel with:

- Config selection.
- Start/stop.
- Connecting, listening, speaking, muted, tool-running, ended, and error states.
- Microphone permission handling.
- Live transcript display.
- No blocking of normal text chat.

Admin UI must separate voice agents from media providers and show:

- Voice-agent config CRUD.
- Provider key missing state.
- Test config result.
- Allowed surface/tool controls.
- Recent sessions, transcript, tool calls, and failure information.

## Security Requirements

- API keys remain server-only.
- Connection material expires within five minutes or provider shortest TTL.
- Callback validation uses HMAC/signature or equivalent signed metadata.
- Replay protection uses provider tool-call IDs, timestamp tolerance, and
  idempotency keys.
- Provider conversation IDs are trusted only after matching tenant, user,
  session, surface, and agent config.
- Request body size limits apply to event ingestion and callbacks.
- Raw provider payloads are redacted before admin display.
- Tool execution uses SmartSpec permission checks, not ElevenLabs trust alone.

## Acceptance Criteria

1. Admin can create/test/disable an ElevenLabs voice-agent config without raw
   API key exposure.
2. User can start and stop a Chat voice-agent session.
3. Browser receives connection material but never the API key.
4. Session lifecycle and final transcript are persisted.
5. Transcript appears in SmartSpec conversation history.
6. `chat.create_message` callbacks validate policy and do not execute twice.
7. Provider/session errors are sanitized.
8. Voice-agent credits are separate from one-shot media jobs.
9. Existing ElevenLabs media TTS/STT and other audio provider routing remain
   unchanged.
10. Unit, integration, and UI tests for the feature pass.
