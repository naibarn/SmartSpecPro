# section-01-provider-research

## Goal

Verify the current ElevenLabs ElevenAgents SDK/API assumptions before building
production code. This section intentionally writes little product code. It
produces evidence, fixtures, and small provider-client contract notes that later
sections use.

## Inputs

- `specs/feature/108-elevenlabs-elevenagents-runtime-integration/spec.md`
- `claude-research.md`
- ElevenLabs docs for React SDK, WebRTC conversation token, signed URL,
  post-call webhooks, conversation details, and retention.

## Files Owned

- `specs/feature/108-elevenlabs-elevenagents-runtime-integration/research/`
- `apps/web/server/services/voiceAgents/__fixtures__/`
- `apps/web/client/src/components/chat/voice/__fixtures__/` if frontend SDK
  fixture data is needed

Do not edit schema, router, or UI implementation files in this section except
for adding fixture directories if needed.

## Tasks

1. Confirm the package and import shape for `@elevenlabs/react`.
   - Verify `ConversationProvider`.
   - Verify granular hooks: controls, status, input, mode.
   - Verify `startSession` accepts `conversationToken`.
   - Verify `startSession` returns provider conversation ID or equivalent.

2. Confirm backend provider API shapes.
   - WebRTC token endpoint request and response.
   - WebSocket signed URL request and response.
   - Signed URL `include_conversation_id`, `branch_id`, and `environment`.
   - Conversation detail endpoint.

3. Confirm post-call and webhook tool behavior.
   - Signature/header shape.
   - Timestamp field.
   - Provider conversation ID field.
   - Tool-call ID field.
   - Transcript and metadata fields.
   - Usage/cost/duration fields.

4. Create sanitized fixtures.
   - `webrtc-token.success.json`
   - `signed-url.success.json`
   - `conversation-detail.done.json`
   - `post-call-transcription.success.json`
   - `tool-callback.chat-create-message.json`
   - `provider-error.sanitized.json`

5. Document findings.
   - Write `research/provider-api-verification.md`.
   - Include source URLs, dates checked, and any divergence from the spec.
   - Record `reconciliation_transport = post_call_webhook | provider_polling |
     both` after verifying post-call webhook support and provider polling
     feasibility.
   - If WebRTC token mode is blocked, explicitly mark fallback promotion to
     WebSocket signed URL before later sections proceed.

## TDD

No production tests are required before this research spike, but fixture
validity checks should be simple and mechanical:

- Fixture JSON parses.
- Fixture payloads do not contain real API keys, tenant IDs, user emails, or raw
  secrets.
- Fixture names match what later tests reference.

## Acceptance

- Provider API assumptions are verified or fallback promotion is documented.
- Reconciliation transport is explicitly chosen for later sections.
- Fixtures exist and are sanitized.
- Later sections can implement against concrete payload shapes without guessing.

## Notes for Later Sections

Later sections must treat this section's fixtures as representative examples,
not as the only valid provider payload shape. Provider-facing parsing must remain
forward-compatible with extra fields.
