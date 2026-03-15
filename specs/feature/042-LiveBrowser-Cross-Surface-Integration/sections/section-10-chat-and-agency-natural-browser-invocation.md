# Section 10 - Chat And Agency Natural Browser Invocation

## Goal

Let Chat and Agency launch Browser Sessions directly from conversational intent through a structured, user-confirmed action flow.

## Scope

- Add assistant-proposed Browser Session launch cards or action chips.
- Require explicit user confirmation before creating the Browser Session.
- Automatically persist the resulting Browser Session artifact after launch.
- Track launch kind so telemetry distinguishes direct launches from suggested launches.

## Implementation Notes

- Keep existing toolbar entrypoints as a fallback and power-user shortcut.
- Use a structured action payload instead of parsing free-text assistant output later.
- Prefer minimal first-release launch intents such as:
  - research in browser
  - continue in browser
  - review website manually
- Preserve origin return metadata and conversation continuity.

## Files Likely Touched

- `apps/web/client/src/pages/Chat.tsx`
- `apps/web/client/src/components/chat/ChatView.tsx`
- `apps/web/client/src/pages/AgencyChat.tsx`
- `apps/web/client/src/lib/analytics/browserSessionEvents.ts`

## Tests

- Chat can launch from a suggested action card after user confirmation.
- Agency can launch from a suggested action inside a run-related message.
- Launch analytics capture `direct` versus `suggested` creation paths.
- Artifact persistence still supports reopen behavior.

## Acceptance

- A user can ask for browser work from Chat or Agency and launch the Browser Session from the conversation flow instead of leaving to a toolbar-only path.
