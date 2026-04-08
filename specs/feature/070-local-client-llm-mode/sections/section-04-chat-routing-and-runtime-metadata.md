# Section 04: Chat Routing, Memory, and Runtime Metadata

## Purpose

Integrate Local AI decisions into the existing chat flow while keeping SmartSpecPro backend authoritative for runtime labels, fallback reasons, and persisted message metadata.

## Ownership

- conversation-level Local AI override mutation
- runtime router integration with chat
- chat memory/context and compaction integration
- server-authored runtime metadata validator
- durable runtime badges and retry-with-cloud behavior
- provider-selectable chat mic integration

## Target files

- `apps/web/server/routers/chat.ts`
- `apps/web/server/routers/memory.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/services/localAiRuntimeRouter.ts`
- `apps/web/server/services/localAiRuntimeMetadata.ts`
- `apps/web/server/services/chatModelSelection.ts`
- `apps/web/server/services/voiceActionResolver.ts`
- `apps/web/server/services/memoryService.ts`
- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/client/src/components/chat/MemoryPanel.tsx`
- `apps/web/client/src/hooks/usePushToTalk.ts`
- `apps/web/client/src/features/local-ai/voice/chatMicProvider.ts`
- `apps/web/client/src/features/local-ai/voice/voiceCommandRouter.ts`
- `apps/web/client/src/features/local-ai/voice/voiceActionRegistry.ts`
- `apps/web/client/src/pages/Chat.tsx`

## Implementation notes

1. Add a dedicated mutation for `conversations.skillSettings.localAiConversation`.
   - Validate only the namespaced `localAiConversation` payload.
   - Merge additively with existing `llmSelection` and other `skillSettings`.
   - Reuse existing conversation membership checks.

2. Introduce a server-side runtime router helper that combines:
   - tenant policy
   - synced user preferences
   - conversation override
   - capability result
   - catalog availability
   - task class
   - runtime health and fallback state

3. The router must support these outcomes:
   - route cloud directly
   - accept hybrid-local contribution before canonical server completion
   - reject a `local_only` request without breaking the conversation page

4. Add a server-owned runtime metadata validator shared by both:
   - streaming SSE save flow in `llmRoutes.ts`
   - non-streaming or explicit assistant-save flows in `chat.ts`

5. The validator must enforce:
   - v1 durable `source` values are only `hybrid` or `cloud`
   - `Local` is not persisted for the current canonical chat path
   - client advisory provider/model data is overwritten with server-resolved values
   - malformed advisory metadata is ignored in favor of cloud-safe defaults
   - `tokenSavedEstimate` remains informational only

6. Update chat UI rendering so badges come from persisted server-owned metadata.
   The chat surface should support:
   - `Hybrid`
   - `Cloud`
   - `Retry with Cloud`
   - conversation-scoped disable-local or prefer-local controls

7. Keep the current chat behavior intact when Local AI is absent.
   Existing clients that know nothing about local metadata must still work.

8. Integrate with the existing memory pipeline rather than bypassing it.
   Cover:
   - `memory.getChatContext`
   - `buildChatContext`
   - `contextToMessages`
   - `processConversationMemory`
   - `compactConversation`
   - `memoryMode`
   - the existing `ChatView` context fetch before submit

9. Local memory work must be additive.
   - On supported devices, local execution may help with interactive summarization, compaction, or fact extraction.
   - Background or unsupported-device paths must continue using the existing server summarization and memory-maintenance behavior.
   - Anything persisted into summaries or entity memory remains server-validated.
   - Manual Memory Panel actions must remain available even when the local runtime never starts.
   - API/widget/channel/background callers must continue to use the existing canonical server path with no new local-runtime dependency.

10. Integrate voice input as an alternate chat entry path, not as a second chat system.
   - The existing chat mic should support `legacy_stt`, `gemma4_local`, and `auto`.
   - In v1 chat, `legacy_stt` should wrap the current `usePushToTalk` composer path rather than the separate realtime `useVoiceChat` session flow.
   - Short dictation should become ordinary composer text.
   - Short voice commands may resolve into either composer text or a small allowlisted action intent such as opening `/chat`, `/teams`, or `/notifications`.
   - Any reminder, notification, OCR/workflow action, or other existing write action still goes through the existing server mutation and confirmation flow after transcription.
   - Unknown or unsupported actions should fall back to normal chat text rather than speculative direct execution.
   - Unsupported or failed local voice paths must fall back cleanly or leave typed chat unaffected.
   - Explicit `gemma4_local` mode must not silently send audio to third-party STT providers.
   - The existing realtime `useVoiceChat` / `VoiceChat` stack is not the canonical chat-composer mic path for this rollout unless a later phase explicitly merges it.

## TDD expectations

- Start with failing tests for conversation override merge semantics.
- Add tests that prove streaming and non-streaming assistant save paths persist the same runtime metadata shape.
- Add negative tests showing a client cannot persist `source = "local"` in v1.
- Add UI tests proving badges survive reload from stored message metadata.
- Add memory-route tests proving `getChatContext`, `processMemory`, and `compactConversation` remain functional when Local AI is unavailable.
- Add tests proving chat still fetches and applies canonical memory context when local assist is enabled but unavailable.
- Add tests proving mic-derived text uses the same save/send pipeline as typed text and does not invent a second persistence path.

## Acceptance checks

- Conversation-level Local AI overrides persist without clobbering other `skillSettings`.
- Runtime badges after reload come from server-authored metadata, not transient client state.
- `Retry with Cloud` is available for hybrid-local answers.
- `local_only` request failure affects only that request and preserves the surrounding conversation state.
- Legacy cloud-only chat requests still pass without sending Local AI metadata.
- Memory compaction and context assembly remain available on unsupported devices through the existing server path.
- Memory Panel actions and manual compaction remain usable without local runtime readiness.
- Chat v1 `legacy_stt` mode reuses the existing push-to-talk mic path rather than the separate realtime voice-session stack.
- Unknown or unsupported voice actions fall back to normal chat text instead of speculative direct actions.

## Coordination notes

- Consume the contracts from sections 01 and 03 exactly as named.
- Section 05 and section 06 will supply browser/Tauri advisory runtime details; this section decides what becomes authoritative.
- Section 08 extends the same runtime vocabulary into Team Room and workflow surfaces.
- Section 09 owns the final regression suite around these save flows.
