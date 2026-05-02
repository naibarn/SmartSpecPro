# Feature 108: ElevenLabs ElevenAgents Runtime Integration

Version: 0.1
Date: 2026-05-02
Status: Proposed
Depends-on: deep_plan/feature/099-ElevenLabsDirectProvider, 080-autonomous-team-monitor-and-persistent-role-agents, 083-agent-registry-and-organization-model, 086-agent-policy-guardrails-and-action-mesh, 088-agentops-tracing-evaluation-and-release-gates
Audience: Voice Agents, Chat, Work OS, Team Rooms, Agency Runtime, Skill Registry, Admin UX, Python Backend, Web Frontend, Security, QA

---

## 1. Executive summary

SmartSpecPro is adding direct ElevenLabs media generation for one-shot audio artifacts:

- text-to-speech
- voice changer
- speech-to-text
- sound effects
- voice isolator

ElevenLabs ElevenAgents is a different product capability. It is not a single media model and should not be modeled as a `media_models` row.

ElevenAgents is a realtime/session runtime for conversational voice agents. It combines:

- speech recognition
- LLM reasoning
- text-to-speech
- turn-taking
- interruptions
- tools
- knowledge base
- transcript/conversation analytics

Therefore this feature introduces a first-class **Voice Agent Runtime** integration for ElevenLabs. Skills may launch or route users into this runtime, but skills are not the runtime itself.

The target outcome is:

- users can start an ElevenLabs voice agent session from Chat, Work OS, or Team Rooms
- admins can configure ElevenLabs agent IDs and their SmartSpec permissions
- transcripts and agent events are stored in SmartSpec conversation history
- ElevenLabs tool calls are bridged into SmartSpec actions through an allowlisted policy layer
- the existing one-shot media provider remains separate and unchanged

---

## 2. Current context

### 2.1 Existing SmartSpecPro foundations

The codebase already has several relevant foundations:

- media generation provider/config layers
- skill registry and skill execution modes
- Work OS and team/agency agent concepts
- conversation history and credit ledger
- policy/guardrail specs for action execution
- admin provider configuration surfaces
- media transcript and audio artifact paths from the ElevenLabs direct provider work

### 2.2 Existing ElevenLabs direct media provider work

The direct ElevenLabs provider feature adds first-party one-shot media capabilities. Those models belong in the media pipeline because they have bounded request/response contracts:

- audio artifact output with `resultUrl`
- transcript artifact output with structured `resultData`
- provider health check through `xi-api-key`
- provider config under Admin > Media Providers

ElevenAgents must reuse the configured ElevenLabs credential where appropriate, but it must not be forced into the same media model table.

### 2.3 ElevenLabs platform shape

ElevenLabs documentation describes ElevenAgents as a platform for building, deploying, and monitoring conversational agents. Integration options include React/web SDKs, widgets, WebSocket APIs, mobile SDKs, telephony/SIP/Twilio, tool calling, knowledge base, and analytics.

Key implication: this is a **session + event + tool runtime**, not a media generation endpoint.

---

## 3. Problem statement

SmartSpecPro needs a way to use ElevenLabs voice agents without blurring three separate concepts:

1. **Media generation**
   - one request in, artifact/transcript out
   - stored in media jobs and library

2. **Skills**
   - intent detection and action routing
   - may call media generation, workflow, or agent runtime

3. **Voice agent runtime**
   - realtime session
   - ongoing transcript events
   - tool calls
   - session lifecycle
   - conversational state

If ElevenAgents is added as a media model, it will not fit:

- no stable `resultUrl` contract
- no one-shot generation lifecycle
- session events and transcripts need durable state
- tool calls need policy and authorization
- realtime voice UI needs different frontend plumbing

If ElevenAgents is implemented as a skill only, it will also not fit:

- skills do not own live WebSocket/session lifecycles
- skills do not provide durable transcript/event storage by themselves
- skills do not provide a secure server-tool callback bridge by themselves
- skills cannot represent agent monitoring, retention, analytics, or session handoff cleanly

The correct shape is a new Voice Agent Runtime layer with optional skill launchers.

---

## 4. Goals

### 4.1 Product goals

1. Let users start a realtime ElevenLabs voice agent session from Chat.
2. Let Work OS and Team Rooms use ElevenLabs voice agents as user-facing voice workers.
3. Let admins register one or more ElevenLabs agent configurations.
4. Persist transcripts and key session events back into SmartSpec conversation history.
5. Let ElevenLabs agents call approved SmartSpec tools through a policy-controlled bridge.
6. Provide launcher skills so natural-language requests can open the right voice agent.

### 4.2 Architecture goals

1. Add a new `voice_agent` capability layer separate from `media_models`.
2. Reuse the existing ElevenLabs provider credential when possible.
3. Keep agent configuration, session state, transcript events, and tool calls as first-class data.
4. Keep browser realtime transport separate from server-side tool execution.
5. Use SmartSpec policy and tenant boundaries for every tool call.
6. Make the runtime extensible for future non-ElevenLabs voice-agent providers.

### 4.3 UX goals

1. Voice agent sessions should feel native in Chat, not like a detached third-party page.
2. Users should see live transcript progress.
3. Users should know when the agent is listening, speaking, thinking, or running a tool.
4. Users should be able to stop a session immediately.
5. Completed sessions should leave a readable conversation summary and transcript.
6. Admin setup should clearly separate ElevenLabs media models from ElevenLabs voice agents.

### 4.4 Security goals

1. Never expose the ElevenLabs API key to the browser.
2. Never let an ElevenLabs agent call arbitrary SmartSpec APIs.
3. All server tools must be allowlisted per agent config.
4. Tool calls must run under the authenticated SmartSpec user/tenant context.
5. Tool calls must be logged with inputs, outputs, status, latency, and policy decision.
6. Sensitive transcript data must follow retention settings.
7. Agent sessions must be revocable and auditable.

---

## 5. Non-goals

This feature does not aim to:

- replace one-shot ElevenLabs media generation
- add ElevenAgents as a `media_models` row
- move TTS/STT/voice changer into the voice-agent runtime
- implement telephony, SIP, Twilio, or batch outbound calls in the MVP
- sync all SmartSpec knowledge into ElevenLabs knowledge base in the MVP
- give ElevenLabs agents unrestricted tool access
- make all skills voice-agent aware
- replace existing SmartSpec team/agency agent runtime

This feature does aim to:

- add a clean runtime integration point
- make Chat voice sessions viable first
- support launcher skills
- create a future path for Team Rooms, Work OS, and Agency voice workers

---

## 6. Locked decisions

1. **ElevenAgents is a voice-agent runtime, not a media model.**
   - Do not add ElevenAgents to `media_models`.
   - Do not make Media Studio the primary runtime surface.

2. **Skills may launch ElevenAgents but do not own the runtime.**
   - Add thin launcher skills only.
   - Runtime/session management belongs to the voice-agent layer.

3. **Admin configuration owns agent IDs.**
   - Users should not type raw agent IDs into Chat for normal use.
   - Admins map readable SmartSpec agent configs to ElevenLabs agent IDs.

4. **All tools are server-mediated and allowlisted.**
   - ElevenLabs client tools may exist later for UI-only actions, but SmartSpec data/actions must go through server tools.

5. **Transcript persistence is required for MVP.**
   - A voice agent session with no durable transcript is not acceptable.

6. **The existing ElevenLabs media provider key can be reused.**
   - The system may store separate voice-agent config, but it should use the same provider credential by default.

7. **MVP starts with web Chat.**
   - Team Rooms and Agency integration are follow-on phases once Chat session primitives are stable.

---

## 7. Functional requirements

### 7.1 Voice agent provider config

Add a voice-agent provider/config model that can represent ElevenLabs agent runtime settings.

Minimum fields:

- `id`
- `tenantId`
- `provider`: `elevenlabs`
- `displayName`
- `description`
- `elevenlabsAgentId`
- `credentialProviderName`: default `elevenlabs`
- `isEnabled`
- `allowedSurfaces`: `chat`, `work_os`, `team_room`, `agency`
- `allowedTools`
- `defaultLanguage`
- `voiceMode`
- `retentionPolicy`
- `metadata`
- `createdAt`
- `updatedAt`

Requirements:

1. Agent config must be tenant-scoped.
2. Agent config must validate that the ElevenLabs provider is configured.
3. Agent config must not store raw API keys.
4. Agent config must support multiple ElevenLabs agent IDs per tenant.
5. Agent config must support disabling without deleting historical sessions.

### 7.2 Session lifecycle

Add voice-agent session records.

Minimum fields:

- `id`
- `tenantId`
- `userId`
- `conversationId`
- `agentConfigId`
- `provider`
- `providerConversationId`
- `status`: `created`, `connecting`, `active`, `ended`, `failed`, `cancelled`
- `startedAt`
- `endedAt`
- `lastEventAt`
- `errorMessage`
- `metadata`

Requirements:

1. Starting a session creates a SmartSpec session record before connecting to ElevenLabs.
2. Session start must verify user authorization for the target surface.
3. Session status must update on connect, disconnect, failure, and cancellation.
4. Session stop must be idempotent.
5. Failed sessions must preserve a sanitized error message.
6. The browser should not need the ElevenLabs API key to start or run a session.

### 7.3 Frontend Chat voice UI

Add a Chat voice-agent panel or mode.

Required states:

- idle
- connecting
- listening
- speaking
- thinking/tool-running
- muted
- ended
- error

Requirements:

1. User can choose an enabled voice agent config.
2. User can start and stop a session.
3. UI shows live transcript events.
4. UI shows tool-running indicators when available.
5. UI handles microphone permission errors.
6. UI supports mute/unmute.
7. UI records final transcript into conversation history.
8. UI must not block normal text chat.

### 7.4 Transport and session token

The runtime should support one of two implementation modes:

1. **Preferred for MVP: signed/session token bridge**
   - backend creates/authorizes a session
   - frontend receives only short-lived connection/session material
   - frontend connects with ElevenLabs React SDK/widget/WebSocket as appropriate

2. **Fallback: server WebSocket relay**
   - backend owns the ElevenLabs WebSocket
   - frontend connects to SmartSpec WebSocket
   - more control, more server complexity

MVP should prefer the official browser integration path if it can satisfy:

- no API key exposure
- transcript event capture
- tool call mediation
- stop/cancel control
- tenant/user authorization

If any of those are not satisfied, use a SmartSpec server relay.

### 7.5 Transcript and event persistence

Add voice-agent event storage.

Event types:

- `session.created`
- `session.connected`
- `user.transcript.partial`
- `user.transcript.final`
- `agent.transcript.partial`
- `agent.transcript.final`
- `agent.audio.started`
- `agent.audio.ended`
- `tool.call.started`
- `tool.call.completed`
- `tool.call.failed`
- `session.ended`
- `session.failed`

Requirements:

1. Store normalized event records with sequence numbers.
2. Store partial events only if needed for recovery/debug; final transcript events are required.
3. Append final transcript messages into SmartSpec conversation history.
4. Preserve speaker/source: `user`, `agent`, `tool`, `system`.
5. Support transcript export in admin/session detail.
6. Redact configured sensitive values from tool logs and transcript snapshots where policy requires it.

### 7.6 SmartSpec server tool bridge

Add a server-side tool bridge for ElevenLabs tool calls.

Initial tool classes:

- `chat.create_message`
- `media.create_job`
- `library.search`
- `workflow.start`
- `task.create`
- `case.update_note`

Requirements:

1. Tools must be registered in a central allowlist.
2. Each agent config chooses which tools are enabled.
3. Each tool call validates:
   - tenant
   - user
   - surface
   - agent config
   - input schema
   - policy guardrails
4. Tool calls must be persisted before execution.
5. Tool results must be summarized before returning to ElevenLabs.
6. Long-running tools should return an accepted/queued response and stream completion back to SmartSpec, not block the voice session indefinitely.
7. Tool calls must never leak internal stack traces or secrets to ElevenLabs.

### 7.7 Launcher skills

Add thin skills only after the runtime can start sessions.

Candidate skills:

- `elevenlabs-voice-agent`
- `voice-agent-meeting-intake`
- `voice-agent-sales-intake`
- `voice-agent-support`
- `voice-agent-creative-brief`

Skill behavior:

1. Detect user intent for a voice session.
2. Pick an enabled `voice_agent_config`.
3. Create a SmartSpec voice-agent session.
4. Return session launch metadata to the UI.
5. Do not call ElevenLabs directly.
6. Do not perform realtime transport itself.

### 7.8 Admin UX

Admin should provide:

- list voice agent configs
- create/edit ElevenLabs agent mapping
- enable/disable
- configure allowed surfaces
- configure allowed tools
- test connection/config
- view recent sessions
- inspect session transcript and tool calls

Requirements:

1. Admin page must clearly distinguish media providers from voice agents.
2. Test connection must verify configured provider key and agent ID.
3. Admin must see whether provider key is missing.
4. Admin must see tool allowlist warnings.
5. Admin must be able to disable an agent immediately.

### 7.9 Work OS, Team Room, and Agency follow-on hooks

MVP does not need full Team/Agency execution, but data and service boundaries must not block it.

Follow-on hooks:

- `surface = team_room`
- `surface = agency`
- attach voice session to role agent
- hand transcript summary into team run context
- create tasks/cases from voice conversation
- voice worker can ask a human for clarification

---

## 8. Data model requirements

### 8.1 New tables

Proposed tables:

- `voice_agent_configs`
- `voice_agent_sessions`
- `voice_agent_events`
- `voice_agent_tool_calls`

### 8.2 `voice_agent_configs`

Required columns:

- `id`
- `tenant_id`
- `provider`
- `display_name`
- `description`
- `external_agent_id`
- `credential_provider_name`
- `is_enabled`
- `allowed_surfaces`
- `allowed_tools`
- `default_language`
- `retention_policy`
- `config_json`
- `created_by`
- `created_at`
- `updated_at`

Indexes:

- `(tenant_id, provider)`
- `(tenant_id, is_enabled)`
- `(tenant_id, external_agent_id)`

### 8.3 `voice_agent_sessions`

Required columns:

- `id`
- `tenant_id`
- `user_id`
- `conversation_id`
- `agent_config_id`
- `provider`
- `provider_conversation_id`
- `surface`
- `status`
- `started_at`
- `ended_at`
- `last_event_at`
- `error_message`
- `metadata_json`
- `created_at`
- `updated_at`

Indexes:

- `(tenant_id, user_id, created_at)`
- `(tenant_id, conversation_id, created_at)`
- `(agent_config_id, created_at)`
- `(status, last_event_at)`

### 8.4 `voice_agent_events`

Required columns:

- `id`
- `tenant_id`
- `session_id`
- `sequence`
- `event_type`
- `source`
- `text`
- `payload_json`
- `received_at`

Indexes:

- `(session_id, sequence)`
- `(tenant_id, received_at)`
- `(session_id, event_type)`

### 8.5 `voice_agent_tool_calls`

Required columns:

- `id`
- `tenant_id`
- `session_id`
- `tool_name`
- `status`
- `input_json`
- `output_json`
- `policy_decision_json`
- `error_message`
- `started_at`
- `completed_at`

Indexes:

- `(session_id, started_at)`
- `(tenant_id, tool_name, started_at)`
- `(status, started_at)`

---

## 9. API requirements

### 9.1 Admin APIs

Add endpoints/procedures for:

- list voice agent configs
- create config
- update config
- enable/disable config
- test config
- list sessions
- get session detail
- get session transcript
- get session tool calls

### 9.2 User/session APIs

Add endpoints/procedures for:

- list enabled configs for current user/surface
- create session
- get session connection material
- stop session
- append/ingest event
- receive tool callback

### 9.3 Tool callback API

The tool callback endpoint must:

1. Authenticate the callback or validate signed call metadata.
2. Resolve the SmartSpec voice session.
3. Validate the requested tool is allowed.
4. Validate input against the tool schema.
5. Execute with user/tenant context.
6. Persist the tool call result.
7. Return a sanitized response to ElevenLabs.

---

## 10. UX requirements

### 10.1 Chat voice agent entrypoint

Chat should expose a compact voice-agent entrypoint:

- button or menu item
- selected agent display
- start/stop
- live transcript drawer/panel
- tool activity strip
- session summary after completion

### 10.2 Admin voice agents page

Admin page should include:

- configured agents table
- provider status indicator
- agent ID field
- surface allowlist controls
- tool allowlist controls
- test button
- recent sessions link

### 10.3 Empty states

1. If no ElevenLabs provider key exists:
   - show setup message linking to Media Providers.
2. If no voice agent config exists:
   - show create-config empty state.
3. If user lacks permission:
   - hide or disable start action with concise reason.
4. If microphone permission fails:
   - show recoverable browser permission guidance.

---

## 11. Security and privacy requirements

1. API keys must remain server-only.
2. Session connection material must be short-lived.
3. Tool callbacks must be authenticated.
4. Tool input/output logs must be redacted for secrets.
5. Transcript storage must respect tenant retention policy.
6. Admins must be able to disable an agent immediately.
7. Agent config changes must be auditable.
8. User consent state should be explicit before starting microphone capture.
9. Browser microphone state must be visible.
10. Tool execution must use SmartSpec permission checks, not ElevenLabs trust alone.

---

## 12. Observability requirements

Metrics:

- session start count
- session success/failure count
- average session duration
- transcript event count
- tool call count
- tool call success/failure
- average tool latency
- reconnect count
- provider error count

Logs:

- session lifecycle
- sanitized provider errors
- tool policy decisions
- tool execution result status
- transcript persistence errors

Admin/ops views:

- recent sessions
- failed sessions
- failed tool calls
- event timeline
- transcript viewer

---

## 13. Credit and billing requirements

MVP may use a conservative session-based credit estimate until provider usage details are available.

Requirements:

1. Voice agent sessions must be credit-metered separately from media audio jobs.
2. Credit transaction source should be `voice_agent` or equivalent.
3. Tool-triggered media/workflow jobs should reserve/deduct their own credits separately.
4. Session start should fail early if the user has insufficient credits for the minimum session reserve.
5. On early failure, unused reserved credits should be released/refunded using existing credit patterns.
6. Usage metadata should store provider session duration and known provider usage fields when available.

---

## 14. Rollout plan

### Phase 1: Runtime foundation

- Add data model.
- Add admin config.
- Add provider key reuse.
- Add session create/stop APIs.
- Add basic Chat voice panel.
- Persist transcript events.

### Phase 2: Tool bridge

- Add tool registry.
- Add signed/authenticated callback endpoint.
- Add allowlist policy.
- Add first safe tools:
  - create chat message
  - create media job
  - search library
  - create task

### Phase 3: Launcher skills

- Add `elevenlabs-voice-agent` skill.
- Add use-case-specific launcher skills.
- Route natural-language requests to session start.

### Phase 4: Team Rooms and Work OS

- Attach sessions to team room contexts.
- Convert transcript summary into tasks/cases.
- Let role agents request live voice clarification.

### Phase 5: Agency voice workers

- Register ElevenLabs voice agent configs as agency-capable workers.
- Add handoff boundaries.
- Add agentops/evaluation views.

---

## 15. Acceptance criteria

1. Admin can create an ElevenLabs voice agent config without storing a raw API key.
2. Admin can test an agent config and receive a clear success/failure state.
3. A user can start a Chat voice-agent session from an enabled config.
4. The browser never receives the ElevenLabs API key.
5. Session lifecycle is persisted as `created -> active -> ended` or failed/cancelled.
6. Final user and agent transcript messages are persisted.
7. Transcript messages appear in SmartSpec conversation history.
8. User can stop a session and the stop action is idempotent.
9. Tool calls are rejected when not allowlisted.
10. Allowed tool calls are persisted with policy decision and sanitized result.
11. Provider/session errors do not leak secrets.
12. Voice-agent credits are tracked separately from one-shot media audio jobs.
13. Existing ElevenLabs media models continue to work unchanged.
14. Launcher skills create sessions but do not call ElevenLabs directly.
15. Relevant unit, integration, and UI tests pass.

---

## 16. TDD plan

### 16.1 Data and admin tests

1. Config create rejects missing ElevenLabs provider key.
2. Config create validates external agent ID is present.
3. Config update preserves historical sessions.
4. Config disable prevents new sessions.
5. Admin test config redacts provider errors.

### 16.2 Session tests

1. Creating a session stores `created` status before provider connection.
2. Successful connection updates status to `active`.
3. Stop session updates status to `ended`.
4. Stop session is idempotent.
5. Provider failure stores sanitized error and `failed` status.
6. User cannot start a session for another tenant's config.

### 16.3 Transcript tests

1. Final user transcript event creates/stores a conversation message.
2. Final agent transcript event creates/stores a conversation message.
3. Partial transcript events do not spam conversation history.
4. Event sequence order is stable.
5. Transcript export returns ordered final transcript.

### 16.4 Tool bridge tests

1. Unknown tool call is rejected.
2. Tool not allowed for agent config is rejected.
3. Invalid tool input is rejected.
4. Allowed tool executes under user/tenant context.
5. Tool output is sanitized before returning to ElevenLabs.
6. Long-running tool returns queued/accepted result.
7. Failed tool call persists status and sanitized error.

### 16.5 Frontend tests

1. Chat shows voice-agent start control when configs exist.
2. Chat empty state appears when no configs exist.
3. Microphone permission failure shows recoverable error.
4. Live transcript panel renders user and agent messages.
5. Stop button disables after session ends.
6. Tool-running indicator appears for tool events.

### 16.6 Regression tests

1. Existing Media Studio ElevenLabs TTS still creates media job.
2. Existing ElevenLabs speech-to-text media job still creates transcript artifact.
3. Existing WaveSpeed audio models still route to WaveSpeed.
4. Existing skill execution modes are not reclassified as voice-agent runtime unless explicitly configured.

---

## 17. Open questions

1. Which ElevenLabs integration mode should be primary for MVP: React SDK/widget/session-token path or SmartSpec WebSocket relay?
2. Does ElevenLabs expose the exact transcript/tool events needed through the preferred browser SDK path, or do we need server relay for complete persistence?
3. What is the minimum billing model: per-minute reserve, session start fee, or provider-usage reconciliation?
4. Should session transcripts be persisted by default for every tenant, or controlled by per-agent retention policy?
5. Which SmartSpec tools should be enabled in the first allowlist?
6. Should Team Room support wait until Chat voice sessions are stable, or should the data model include team room binding from day one?
7. Should ElevenLabs knowledge base be managed externally in ElevenLabs first, or synced from SmartSpec library later?

---

## 18. Recommended implementation order

1. Research exact ElevenLabs browser/session-token/tool callback APIs.
2. Finalize transport decision.
3. Add DB schema and admin config.
4. Add provider config test endpoint.
5. Add session create/stop backend service.
6. Add transcript event ingestion and conversation-history persistence.
7. Add Chat voice session UI.
8. Add tool bridge with one low-risk tool.
9. Add launcher skill.
10. Add Team Room/Work OS hooks.

---

## 19. Definition of done

This feature is done when:

- ElevenLabs voice-agent configs can be managed by admins
- a user can start and stop a Chat voice session
- transcript events persist into SmartSpec history
- at least one allowlisted SmartSpec server tool can be called safely
- all provider errors are sanitized
- voice-agent sessions have distinct credit/audit records
- existing one-shot ElevenLabs media generation remains separate and passing regression tests

