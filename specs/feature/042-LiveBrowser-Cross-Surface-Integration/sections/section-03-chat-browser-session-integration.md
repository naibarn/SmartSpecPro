# Section 03 - Chat Browser Session Integration

## Goal

Make Browser Session a first-class part of the Chat experience so users can move from conversation to browser work and back without context loss.

## Scope

- Add a Browser Session entrypoint in Chat.
- Allow chat threads to display a structured browser-session summary.
- Support reopen behavior from the same conversation.
- Reuse the shared wording and navigation contracts from sections 01 and 02.

## Implementation Notes

- Ship the Chat integration on the existing full-page Browser Session route.
- Entry should include a clear top-level action and a resumable thread-level summary card so users can both start and return to browser work.
- Browser-session summaries should show status and the next required human action in plain language.
- Avoid leaking protocol details into chat history.
- Preserve thread identity when opening and closing the Browser Session workspace.
- Gate Chat entrypoints behind `chatBrowserSessionEntry` for incremental rollout.

## Files Likely Touched

- `apps/web/client/src/pages/Chat.tsx`
- `apps/web/client/src/components/chat/ChatView.tsx`
- related shared Chat artifact or thread state helpers
- `apps/web/client/src/lib/analytics/` for Chat-origin Browser Session analytics events

## Tests

- Open Browser Session from Chat launches the workspace.
- Reopen Browser Session returns to the same session from the same thread.
- Chat displays waiting states such as `Needs Your Input` and `Review Required` clearly.
- When `chatBrowserSessionEntry` is off, Chat falls back cleanly to existing behavior.

## Acceptance

- Chat users can start and resume Browser Session work without leaving the conversation model of the product.
