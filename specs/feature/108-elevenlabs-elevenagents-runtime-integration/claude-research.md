# Feature 108 Research: ElevenLabs ElevenAgents Runtime Integration

Research date: 2026-05-06
Planning directory: `specs/feature/108-elevenlabs-elevenagents-runtime-integration`

## Research Decision

Codebase research: yes.
Reason: SmartSpecPro is an existing monorepo with established patterns for
Drizzle schemas, tRPC routers, public Express routes, provider configuration,
credit accounting, chat persistence, and webhook ingestion.

Web research: yes.
Reason: the feature depends on current ElevenLabs ElevenAgents APIs, including
React SDK, WebRTC conversation tokens, WebSocket signed URLs, post-call webhooks,
conversation detail reconciliation, and retention behavior.

Testing research: yes.
Reason: implementation will touch TypeScript backend services, Drizzle schema,
public HTTP routes, React UI, and provider API clients.

SocratiCode status: `codebase_status` succeeded and reported a green index, but
`codebase_search` later failed with a closed transport. Research therefore used
targeted shell search and narrow file reads as fallback.

## Codebase Findings

### Repository shape

Relevant web app code lives under `apps/web`.

- tRPC routers are in `apps/web/server/routers/`.
- Public Express routes are in `apps/web/server/routes/` and registered in
  `apps/web/server/_core/index.ts`.
- Shared DB schema is in `apps/web/drizzle/schema.ts`.
- Frontend React pages/components are in `apps/web/client/src/`.
- Unit tests are colocated under `apps/web/server/routers/__tests__/`,
  `apps/web/server/routes/__tests__/`, `apps/web/server/services/__tests__/`,
  `apps/web/server/__tests__/`, and component/lib test files under
  `apps/web/client/src/**`.

### Public route and webhook patterns

`apps/web/server/_core/index.ts` registers public webhook and public API routes.
It also contains CSRF bypass logic for provider webhooks. New provider callback
routes must be registered before CSRF-protected state-changing route handling,
and must perform their own provider-specific authentication.

Existing public webhook patterns include:

- `/api/webhooks` via `createWebhookRouter`.
- `/api/webhooks/trigger` with a `1mb` JSON limit.
- `/webhooks/...` channel callbacks with raw body capture for HMAC-capable
  adapters.
- `/v1/media` public media routes.

The Feature 108 spec correctly locks the MVP callback owner to
`apps/web/server` so the callback can share TypeScript services, transactions,
credit settlement, and chat persistence instead of duplicating policy logic in
`python-backend`.

### Drizzle schema patterns

Relevant tables in `apps/web/drizzle/schema.ts`:

- `creditTransactions` has `idempotencyKey`, trace ID, conversation ID, source
  type, and a partial unique index for non-null idempotency keys.
- `conversations` has `tenantId`, `userId`, `source`, and message counters.
- `messages` stores conversation messages and supports attachments, credits,
  and role-based records.
- `mediaProviders` stores encrypted provider API keys, `hasApiKey`, test
  results, callback URLs, and JSON config.
- `mediaCallbackEvents` is a useful pattern for durable provider callback event
  logging, idempotent processing, retry scheduling, and DLQ support.
- `webhookEvents` is a useful payment webhook pattern with provider event
  uniqueness and signature validation metadata.

Plan implication: define first-class `voice_agent_*` tables near the media and
conversation schema area, with enum definitions and partial unique indexes where
provider IDs or callback IDs may be nullable.

### Credit and billing patterns

`apps/web/server/services/creditService.ts` uses atomic SQL updates and
idempotency keys. `deductCredits` checks Redis for idempotency, falls back to DB
unique constraints, and writes `creditTransactions`.

Plan implication: the MVP can implement a reservation as a normal credit
deduction with `sourceType = voice_agent` after extending the credit source enum.
Settlement/refund should use an idempotency key per session transition. The plan
should avoid inventing a separate ledger unless implementation proves existing
transactions cannot represent reservation, settlement, and release.

### Chat persistence patterns

`apps/web/server/routers/chat.ts` imports chat service functions such as
`createMessage`, `getMessages`, `updateConversationCredits`, and conversation
lookup helpers. It is the correct integration boundary for final transcript
messages and `chat.create_message` tool execution.

Plan implication: add a dedicated `voiceAgentService` that calls existing chat
service functions rather than writing ad hoc message rows from the route handler.

### Provider configuration patterns

`apps/web/server/routers/mediaProviders.ts` and `mediaProviders` schema model
how provider credentials are stored without exposing API keys. Feature 108 should
reuse the configured ElevenLabs media provider credential by provider name while
keeping voice-agent config in its own table.

### Frontend patterns

`apps/web/client/src/pages/MediaStudio.tsx`, `apps/web/client/src/components/chat/ChatView.tsx`,
and existing i18n files are likely frontend touchpoints. Feature 108 should add
a focused voice agent panel/component rather than folding runtime state into the
general media model UI.

### Testing patterns

TypeScript tests use the web app test setup under `apps/web` with colocated
`.test.ts` and `.test.tsx` files. Existing command examples in repo instructions
and Orchestra references use:

- `cd apps/web && pnpm check`
- `cd apps/web && pnpm test`

For this feature, narrow tests should include:

- Drizzle schema tests for new tables/enums/indexes.
- Service tests for session lifecycle, connection material, idempotency, and
  credit reservation settlement.
- Route tests for public callback HMAC/replay/size handling.
- Router tests for admin and user tRPC procedures.
- Component tests for Chat voice UI states.
- Regression tests proving existing ElevenLabs media provider routing still
  uses media models and media jobs.

## Web Research Findings

Sources checked:

- ElevenLabs React SDK: https://elevenlabs.io/docs/eleven-agents/libraries/react
- Signed URL API: https://elevenlabs.io/docs/api-reference/conversations/get-signed-url
- WebRTC conversation token API: https://elevenlabs.io/docs/api-reference/conversations/get-webrtc-token
- Post-call webhooks: https://elevenlabs.io/docs/eleven-agents/workflows/post-call-webhooks
- Conversation detail API: https://elevenlabs.io/docs/conversational-ai/api-reference/conversations/get-conversation/~explorer
- Retention docs: https://elevenlabs.io/docs/eleven-agents/customization/privacy/retention
- Tools help article: https://help.elevenlabs.io/hc/en-us/articles/34669011018257-How-do-I-use-tools-with-ElevenAgents

### React SDK and connection material

The React SDK supports `ConversationProvider`, granular hooks such as
`useConversationControls`, `useConversationStatus`, `useConversationInput`, and
`useConversationMode`, and session start options including `agentId`,
`signedUrl`, or `conversationToken`. Voice conversations use WebRTC by default,
while text-only conversations use WebSocket by default. The SDK exposes status,
speaking/listening, mute state, message callbacks, error callbacks, and
conversation ID return values.

Plan implication: the Chat UI should wrap a focused subtree in
`ConversationProvider` and use granular hooks to minimize re-rendering. The
backend should return `conversationToken` for the MVP WebRTC flow and persist the
provider conversation ID returned by `startSession`.

### Signed URL and WebRTC token APIs

The signed URL API supports `agent_id`, optional `include_conversation_id`,
optional `branch_id`, and optional `environment`. The WebRTC conversation token
API supports `agent_id`, optional `participant_name`, optional `branch_id`, and
optional `environment`.

Plan implication: the shared connection material DTO needs branch/environment
fields and different provider request builders for WebRTC token vs WebSocket
signed URL fallback.

### Post-call transcript durability

Post-call transcription webhooks include conversation data, transcript, analysis
results, metadata, timestamps, and cost-related fields. Conversation detail APIs
can retrieve conversation status, transcript, metadata, audio flags, user ID,
branch/version, analysis, and initiation client data.

Plan implication: browser SDK callbacks should be treated as realtime best
effort. Durable final transcript and usage reconciliation should come from
post-call webhooks first and provider polling second.

### Tools

ElevenAgents supports Client Tools, Webhooks, and System Tools. Client Tools run
in the browser/device and are suitable for UI-local behavior. Webhook tools
connect the agent to external APIs and are the right fit for SmartSpec server
actions.

Plan implication: `chat.create_message` must be a webhook/server tool. Client
tools must be restricted to local UI-only actions and must never mutate
SmartSpec data directly.

### Retention

ElevenLabs retention docs state that default retention exists at the provider
level and can be configured. SmartSpec must not assume provider retention is the
same as tenant retention.

Plan implication: SmartSpec should persist final transcript messages according
to tenant/agent policy and store enough provider metadata to audit applied
retention settings.

## Recommended Technical Decisions

1. Use TypeScript-only MVP ownership for session, callback, and tool bridge.
2. Add a new `voiceAgentsRouter` under `apps/web/server/routers/voiceAgents.ts`.
3. Add public callback route under `apps/web/server/routes/voiceAgentsElevenLabsCallback.ts`.
4. Add service modules under `apps/web/server/services/voiceAgents/`.
5. Keep provider API calls isolated in `elevenLabsVoiceAgentProvider.ts`.
6. Add Drizzle schema in `apps/web/drizzle/schema.ts` plus migration SQL.
7. Add a Chat UI component under `apps/web/client/src/components/chat/voice/`.
8. Use `@elevenlabs/react` only in the frontend section and guard it behind
   lazy import/feature flag if bundle risk appears during implementation.
9. Reuse credit idempotency and chat services rather than creating duplicate
   ledgers or message writers.
10. Add a short research spike as section 01 to verify the provider SDK/API
    assumptions before writing production code.
