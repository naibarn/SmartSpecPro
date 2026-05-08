# Feature 108 Implementation Plan: ElevenLabs ElevenAgents Runtime Integration

## 1. Summary

Build a Chat-first ElevenLabs ElevenAgents runtime in `apps/web`. The feature
adds tenant-scoped admin configuration, SmartSpec-owned session state,
connection material for the ElevenLabs React SDK, final transcript persistence,
server-mediated `chat.create_message` tool callbacks, and voice-agent credit
accounting.

The plan deliberately keeps ElevenAgents separate from one-shot media models.
The existing ElevenLabs media provider credential is reused, but voice-agent
configuration, sessions, events, and tool calls are first-class runtime data.

## 2. Architecture Overview

### 2.1 Runtime boundaries

MVP components:

- Drizzle schema and migration in `apps/web/drizzle/schema.ts` and migration
  files.
- Shared contracts in `apps/web/shared/voiceAgents.ts`.
- Backend services under `apps/web/server/services/voiceAgents/`.
- tRPC router in `apps/web/server/routers/voiceAgents.ts`.
- Public callback route in
  `apps/web/server/routes/voiceAgentsElevenLabsCallback.ts`.
- Router registration in `apps/web/server/routers.ts` and
  `apps/web/server/_core/index.ts`.
- Chat UI components under `apps/web/client/src/components/chat/voice/`.
- Optional admin page/components under the existing admin/provider settings
  navigation.

Out of scope for MVP:

- `python-backend` runtime ownership.
- Team Room, Work OS, and Agency active integration.
- Non-chat tool bridge classes.
- ElevenLabs knowledge base sync.

### 2.2 End-to-end data flow

Admin config flow:

1. Admin creates an ElevenLabs voice-agent config through `voiceAgents.admin`.
2. The service validates tenant, provider credential availability, agent ID,
   allowed surfaces, allowed tools, and server location.
3. Config is stored in `voice_agent_configs`.
4. Config testing calls the ElevenLabs provider client using the existing
   encrypted ElevenLabs media provider credential and stores sanitized results.

Chat session flow:

1. User opens Chat and lists enabled configs for surface `chat`.
2. User starts a session with `voiceAgents.createSession`.
3. Service creates `voice_agent_sessions` in `created` state and reserves
   minimum credits with source `voice_agent`.
4. User requests `voiceAgents.getConnectionMaterial`.
5. Provider client requests a WebRTC conversation token from ElevenLabs.
6. Frontend starts `@elevenlabs/react` with `conversationToken`.
7. SDK callbacks update SmartSpec event/session state via
   `voiceAgents.ingestClientEvent`.
8. Stop or disconnect moves the session toward a terminal state.
9. Post-call webhook or provider polling reconciles final transcript, provider
   duration/cost, and final billing.

Tool callback flow:

1. ElevenLabs webhook tool posts to
   `POST /api/voice-agents/elevenlabs/tool-callback`.
2. Public route captures raw body, validates signature/timestamp, and applies
   request size limits.
3. Service resolves SmartSpec session by session ID/provider conversation ID.
4. Service validates tenant, user, surface, agent config, tool allowlist, and
   input schema.
5. Service persists `voice_agent_tool_calls` before execution.
6. `chat.create_message` delegates to existing chat services.
7. Service persists sanitized result and returns a compact response to
   ElevenLabs.

## 3. External API Research Spike

The first implementation section is a short research spike. It must verify:

- Current `@elevenlabs/react` package version and supported props/hooks.
- Exact `conversationToken` request/response shape.
- Whether `startSession` returns provider conversation ID consistently.
- Exact post-call webhook signature header and payload shape available to the
  workspace/agent.
- Whether webhook tools can include SmartSpec session metadata and an
  idempotency/provider tool-call ID.
- Whether `include_conversation_id=true` is still available for the signed URL
  fallback.
- Whether final transcript reconciliation should use post-call webhook,
  provider polling, or both. Record the decision as
  `reconciliation_transport = post_call_webhook | provider_polling | both` in
  the provider verification notes.

If WebRTC token mode cannot meet final transcript correlation, callback
authentication, stop/cancel reflection, or provider conversation ID correlation,
the implementer must switch the transport section to WebSocket signed URL before
building UI. A SmartSpec server relay remains fallback only.

## 4. Data Model

### 4.1 Enums

Add enums:

- `voice_agent_provider`: `elevenlabs`
- `voice_agent_surface`: `chat`, `work_os`, `team_room`, `agency`
- `voice_agent_connection_type`: `webrtc_token`, `websocket_signed_url`,
  `server_relay`
- `voice_agent_session_status`: `created`, `connecting`, `active`, `ended`,
  `failed`, `cancelled`
- `voice_agent_billing_status`: `reserved`, `settled`, `released`, `failed`
- `voice_agent_event_source`: `user`, `agent`, `tool`, `system`
- `voice_agent_redaction_status`: `not_required`, `redacted`, `failed`
- `voice_agent_tool_call_status`: `received`, `denied`, `queued`, `running`,
  `completed`, `failed`

Extend the existing credit source enum to include `voice_agent`.

### 4.2 Tables

`voice_agent_configs` stores tenant-scoped mapping from SmartSpec configs to
ElevenLabs agent IDs. It includes provider, external agent ID, optional branch,
environment, credential provider name, enabled state, allowed surfaces/tools,
default language, server location, retention policy, config JSON, creator and
updater IDs, timestamps, and indexes described in the spec.

`voice_agent_sessions` stores SmartSpec session state. It includes tenant, user,
conversation, config, provider, provider conversation ID, surface, connection
type, connection expiry, billing status, credit reservation transaction ID,
status, timestamps, sanitized error data, and metadata JSON.

`voice_agent_events` stores normalized SDK/webhook/provider events with stable
sequence numbers, optional provider event IDs, source, text, payload JSON,
redaction status, optional linked conversation message ID, and received time.

`voice_agent_tool_calls` stores every received/denied/queued/running/completed
or failed tool callback, including provider tool-call ID, idempotency key,
input/output JSON, policy decision JSON, sanitized errors, and timing.

### 4.3 Migration strategy

This is additive. No existing tables are dropped or rewritten. The migration
must:

- Create enums first.
- Create tables with foreign keys and indexes.
- Add `voice_agent` to the credit source type safely.
- Avoid modifying existing media provider rows.
- Include rollback notes if the repository migration convention supports them.

## 5. Shared Contracts

Create `apps/web/shared/voiceAgents.ts` for DTOs and Zod schemas shared by
frontend, router tests, and services.

Contracts:

- `VoiceAgentSurface`
- `VoiceAgentConnectionType`
- `VoiceAgentSessionStatus`
- `VoiceAgentBillingStatus`
- `VoiceAgentConfigCreateInput`
- `VoiceAgentConfigUpdateInput`
- `VoiceAgentConnectionMaterial`
- `VoiceAgentClientEventInput`
- `VoiceAgentToolCallbackPayload`
- `VoiceAgentToolCallbackResult`
- `ChatCreateMessageToolInput`

`VoiceAgentConnectionMaterial` contains:

- `smartSpecSessionId`
- `provider`
- `connectionType`
- `conversationToken` or `signedUrl`
- `expiresAt`
- optional `providerConversationId`
- `serverLocation`
- `environment`
- optional `branchId`

The tool callback payload matches the spec and validates `chat.create_message`
input exactly.

## 6. Backend Services

### 6.1 Provider client

Create `apps/web/server/services/voiceAgents/elevenLabsVoiceAgentProvider.ts`.

Responsibilities:

- Load the existing ElevenLabs media provider credential.
- Request WebRTC conversation token.
- Request WebSocket signed URL fallback.
- Fetch conversation details for reconciliation.
- Normalize provider errors into sanitized `{ code, message, retryable }`.
- Never return raw API keys or provider stack traces.

### 6.2 Config service

Create `voiceAgentConfigService.ts`.

Responsibilities:

- CRUD for `voice_agent_configs`.
- Validate tenant ownership.
- Validate credential provider exists and has API key.
- Enforce default allowed surface `chat`.
- Enforce MVP allowed tool default `chat.create_message`.
- Apply server location default from tenant settings, then `us`.
- Audit config changes.

### 6.3 Session service

Create `voiceAgentSessionService.ts`.

Responsibilities:

- List enabled configs for current user/surface.
- Create session idempotently by `(tenantId, userId, idempotencyKey)`.
- Reserve credits before provider connection material.
- Produce connection material and set `connecting`.
- Update provider conversation ID after SDK start.
- Stop session idempotently.
- Mark terminal state and settle/release/fail reservation exactly once.
- Store sanitized provider/session errors.

### 6.4 Event and transcript service

Create `voiceAgentEventService.ts`.

Responsibilities:

- Ingest SDK events.
- Assign stable per-session sequence numbers.
- Store partial events only when needed for debug/recovery.
- Persist final user/agent transcript turns into conversation history.
- Deduplicate conversation writes by `(sessionId, eventType, providerEventId or
  sequence)`.
- Mark `transcript_pending` if reconciliation fails.

### 6.5 Tool bridge service

Create `voiceAgentToolBridgeService.ts`.

Responsibilities:

- Validate callback signature/timestamp/replay.
- Resolve SmartSpec session and provider conversation binding.
- Validate tool allowlist and input schema.
- Persist tool call before execution.
- Execute `chat.create_message` through existing chat services.
- Persist sanitized result/error.
- Return compact sanitized result to ElevenLabs.

### 6.6 Reconciliation service

Create `voiceAgentReconciliationService.ts`.

Responsibilities:

- Process post-call payloads and provider polling results.
- Normalize provider transcript, metadata, duration, cost, analysis summary, and
  status.
- Reconcile missing final transcript messages.
- Settle/release/fail credit reservation.
- Update session metadata and admin-visible error state.

## 7. API Layer

### 7.1 tRPC router

Create `apps/web/server/routers/voiceAgents.ts` and register it in
`apps/web/server/routers.ts`.

Admin procedures:

- `voiceAgents.admin.listConfigs`
- `voiceAgents.admin.createConfig`
- `voiceAgents.admin.updateConfig`
- `voiceAgents.admin.setConfigEnabled`
- `voiceAgents.admin.testConfig`
- `voiceAgents.admin.listSessions`
- `voiceAgents.admin.getSession`
- `voiceAgents.admin.getTranscript`
- `voiceAgents.admin.getToolCalls`

User procedures:

- `voiceAgents.listEnabled`
- `voiceAgents.createSession`
- `voiceAgents.getConnectionMaterial`
- `voiceAgents.stopSession`
- `voiceAgents.ingestClientEvent`

Router must use existing protected/admin procedure patterns. Every query and
mutation must enforce tenant scope.

### 7.2 Public callback route

Create `apps/web/server/routes/voiceAgentsElevenLabsCallback.ts` and register it
in `apps/web/server/_core/index.ts`.

Route:

- `POST /api/voice-agents/elevenlabs/tool-callback`
- `POST /api/voice-agents/elevenlabs/post-call` if Section 01 chooses
  `post_call_webhook` or `both` for transcript reconciliation

Registration must occur in the provider webhook area before CSRF rejection
affects external provider POSTs. Use a JSON body limit no larger than `1mb`
unless the research spike proves a smaller limit is sufficient.

The route must capture raw body if required for signature validation. If
ElevenLabs signature validation uses canonical JSON instead of raw bytes,
document that in the service and tests.

If Section 01 chooses `provider_polling`, Section 03 must own the polling
trigger/retry budget and Section 06 must verify sessions become
`transcript_pending` after exhausted retries.

## 8. Credit and Billing

MVP uses per-minute reservation.

Implementation approach:

- Reserve minimum session credits by calling existing credit service deduction
  with source type `voice_agent`.
- Store the reservation transaction ID in `voice_agent_sessions`.
- Use deterministic idempotency keys:
  - `voice-agent:reserve:{sessionId}`
  - `voice-agent:settle:{sessionId}`
  - `voice-agent:release:{sessionId}`
- On terminal state, settle/release/fail exactly once.
- Store provider duration/cost in session metadata when available.
- Show estimated vs provider-reconciled usage in admin session detail.

If existing credit service lacks a direct "release" helper for reservations,
implement release as `addCredits` with a linked reference to the reservation
transaction and idempotency key.

## 9. Frontend UI

### 9.1 Chat voice panel

Add a focused voice-agent component under
`apps/web/client/src/components/chat/voice/`.

Suggested components:

- `VoiceAgentPanel.tsx`
- `VoiceAgentControls.tsx`
- `VoiceAgentTranscript.tsx`
- `VoiceAgentStatus.tsx`
- `useVoiceAgentSession.ts`

Dependency ownership:

- If `@elevenlabs/react` is not already installed, Section 05 owns updating
  `apps/web/package.json` and the repository lockfile.
- Section 05 must verify `pnpm check` resolves the SDK import. If Section 01
  finds the SDK shape is incompatible, add a small local adapter wrapper before
  wiring UI components.

The Chat UI should mount this as a compact panel or mode inside the existing
Chat surface. It must not block normal text chat.

Use `@elevenlabs/react`:

- Wrap the voice panel subtree in `ConversationProvider`.
- Use granular hooks for controls, status, input, and mode.
- Request microphone permission only after explaining the action and after user
  intent to start.
- Send SDK callbacks to `voiceAgents.ingestClientEvent`.
- Persist provider conversation ID returned by `startSession`.
- Stop button calls SDK `endSession` and `voiceAgents.stopSession`.

### 9.2 Admin UI

Add admin UI in the existing admin/provider settings area as a distinct Voice
Agents surface. Start with a focused admin component/page and route/nav
integration following local Admin patterns. Keep it visually separate from
one-shot media providers.

Admin UI must support:

- List configs.
- Create/edit mapping to ElevenLabs agent ID.
- Enable/disable.
- Configure allowed surfaces and tools.
- Test config.
- View recent sessions.
- Inspect transcript and tool calls with redacted payloads.

## 10. Observability and Audit

Add logs and metrics for:

- Session created/connecting/active/ended/failed/cancelled.
- Provider token request success/failure.
- SDK event ingestion failures.
- Post-call reconciliation success/failure.
- Tool callback allowed/denied/completed/failed.
- Credit reservation settlement/release/failure.

Use existing audit logger patterns for security-relevant events. Never log raw
provider API keys, raw callback secrets, or unredacted tool payloads.

## 11. Security and Privacy

Security gates are mandatory before implementation completion because the
feature adds a public provider callback, new tRPC procedures, credit handling,
and transcript persistence.

Key controls:

- HMAC/signature or provider equivalent validation.
- Timestamp tolerance.
- Replay protection by provider tool-call ID and idempotency key.
- Tenant/user/session/surface/config binding for provider conversation IDs.
- Request body size limit.
- Redaction before admin display.
- Admin-only raw debug access, if raw payload retention exists.
- No browser API key exposure.

## 12. Rollout

Use the existing tenant feature flag system with a concrete `voiceAgents` flag.
The flag should fail closed for:

- Admin voice-agent config visibility.
- Chat voice panel visibility.
- Tool bridge execution.

Roll out in this order:

1. Hidden admin/config and service tests.
2. Internal tenant Chat voice panel.
3. Transcript reconciliation in shadow/admin-only mode.
4. `chat.create_message` tool bridge.
5. Launcher skill.
6. Follow-on Team Room/Work OS hooks.

## 13. Risks and Mitigations

Risk: provider API shape differs from docs or workspace settings.
Mitigation: research spike first, provider client isolation, fallback transport.

Risk: duplicate callbacks create duplicate messages or double charges.
Mitigation: unique provider IDs, idempotency keys, and service-level idempotent
conversation writes.

Risk: transcript data violates tenant retention expectations.
Mitigation: explicit `retention_policy`, final transcript default, admin
controls, redacted admin views.

Risk: callback bypasses CSRF but has weak provider auth.
Mitigation: provider-specific signature/timestamp validation and security tests.

Risk: bundle/performance impact from `@elevenlabs/react`.
Mitigation: contained component, consider lazy import, granular hooks.

## 14. Definition of Done

- New planning research spike is completed and documented.
- Drizzle schema, migration, and schema tests exist.
- tRPC router and services pass unit/integration tests.
- Public callback route validates signature/replay and passes route tests.
- Chat UI can start/stop a session using WebRTC token connection material.
- Final transcripts reconcile into conversation history.
- `chat.create_message` executes only when allowlisted and idempotent.
- Credit reservation settles/releases exactly once.
- Existing one-shot ElevenLabs media paths still pass regression tests.
- `cd apps/web && pnpm check` and relevant `pnpm test` suites pass.
