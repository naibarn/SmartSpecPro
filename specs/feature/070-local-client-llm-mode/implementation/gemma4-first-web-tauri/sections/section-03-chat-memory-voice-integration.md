# Section 03: Chat, Memory, and Voice Integration

## Ownership

- provider-selectable mic integration
- local Gemma 4 runtime routing into the existing chat pipeline
- memory/context compaction usage of Gemma 4 local runtime
- truthful runtime metadata and fallback handling

## Target files

- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/client/src/hooks/usePushToTalk.ts`
- `apps/web/client/src/features/local-ai/voice/chatMicProvider.ts`
- `apps/web/client/src/features/local-ai/voice/voiceCommandRouter.ts`
- `apps/web/server/services/localAiRuntimeRouter.ts`
- `apps/web/server/services/localAiRuntimeMetadata.ts`
- `apps/web/server/services/memoryService.ts`
- `apps/web/server/_core/llmRoutes.ts`
- `apps/web/server/routers/chat.ts`

## Implementation approach

1. Keep one chat system.
2. Let `legacy_stt`, `gemma4_local`, and `auto` decide only how text enters the existing chat flow.
3. Route local Gemma 4 tasks to:
   - short general chat
   - summarization
   - context compaction
   - short dictation
   - short voice command
4. Use local Gemma 4 for memory/context artifact optimization, not for rewriting control-plane text.
5. Keep runtime badges durable as `Hybrid` or `Cloud` only.
6. Keep unknown voice intents as normal chat text.

## TDD expectations

- Add tests proving mic-derived text and typed text converge on the same chat save path.
- Add tests proving local memory compaction is advisory and server-validated before persistence.
- Add tests proving explicit `gemma4_local` does not silently hit third-party STT.
- Add tests proving allowlisted navigation remains the only direct client action.

## Acceptance checks

- chat works identically for unsupported devices
- supported devices can route bounded Gemma 4 local tasks without a second conversation path
- memory compaction can use local runtime without altering orchestration inputs
- runtime metadata stays server-authoritative

## Risks and coordination

- Do not let this section invent new native runtime behavior; consume section 01/02 surfaces only.
- Do not let this section broaden into skill execution policy; section 04 owns Tauri local-skill boundaries.
