# Provider API Verification

Date checked: 2026-05-07

## Sources

- React SDK:
  https://elevenlabs.io/docs/eleven-agents/libraries/react
- WebRTC conversation token:
  https://elevenlabs.io/docs/conversational-ai/api-reference/conversations/get-webrtc-token
- Signed URL / agent authentication:
  https://elevenlabs.io/docs/conversational-ai/customization/authentication
- Conversation details:
  https://elevenlabs.io/docs/conversational-ai/api-reference/conversations/get-conversation
- Post-call webhooks:
  https://elevenlabs.io/docs/conversational-ai/workflows/post-call-webhooks
- Post-call webhook payload structure:
  https://elevenlabs.io/docs/conversational-ai/customization/personalization/post-call-webhooks

## Verified Decisions

`reconciliation_transport = both`

Use post-call transcription webhooks as the primary final transcript path and
provider conversation polling as the fallback/recovery path. Post-call webhooks
carry full transcript data after a call ends, while the conversation details API
can retrieve final conversation status and transcript by provider conversation
ID.

Primary connection mode remains `webrtc_token`.

`@elevenlabs/react` supports `useConversation` and `startSession` with
`conversationToken`, `signedUrl`, or `agentId`. Documentation states
`startSession` resolves to a globally unique conversation ID, which is enough to
bind SmartSpec sessions to provider conversations after SDK start.

## API Shapes

### WebRTC token

Endpoint:

- `GET /v1/convai/conversation/token`

Headers:

- `xi-api-key`

Query:

- `agent_id`
- optional `participant_name`

Response:

- `{ "token": "..." }`

SmartSpec must expose the token to the browser only as short-lived connection
material. The ElevenLabs API key remains server-only.

### Signed URL fallback

Endpoint:

- `GET /v1/convai/conversation/get-signed-url`

Response:

- `{ "signed_url": "wss://..." }`

Signed URL remains fallback only when WebRTC token mode cannot satisfy
correlation or workspace constraints.

### Conversation details

Endpoint:

- `GET /v1/convai/conversations/:conversation_id`

Response includes:

- `agent_id`
- `conversation_id`
- `status`
- `transcript`
- `metadata`
- audio flags
- optional `analysis`
- optional initiation data

Use this API for reconciliation polling and admin detail refreshes.

### Post-call webhook

Post-call webhooks support HMAC authentication through the
`ElevenLabs-Signature` header. The header format is `t=timestamp,v0=hash`, and
the hash is the hex SHA-256 HMAC of `timestamp.request_body`.

Transcription webhook payloads use:

- `type = post_call_transcription`
- `event_timestamp`
- `data.agent_id`
- `data.conversation_id`
- `data.status`
- `data.user_id`
- `data.transcript`
- `data.metadata`
- optional `data.analysis`
- optional audio flags

## Implementation Notes

- Capture raw body for HMAC validation on both tool callback and post-call
  routes unless Section 04 proves canonical JSON validation is sufficient.
- Bind any provider conversation ID to SmartSpec session, tenant, user, surface,
  and agent config before trusting transcript or tool data.
- Treat browser SDK events as realtime hints. Final transcript persistence must
  be reconciled from post-call webhook or provider polling.
- Fixtures in this directory are sanitized examples, not complete provider
  schemas. Parsers must allow unknown extra fields.
