# Research Notes

## Codebase scan

- Chat page chrome lives in `apps/web/client/src/pages/Chat.tsx`.
- Core chat interaction and empty state live in `apps/web/client/src/components/chat/ChatView.tsx`.
- Browser Session help already exists in `apps/web/client/src/components/browser-session/BrowserSessionHelpDialog.tsx`.
- Skill discovery UX in chat currently uses:
  - `/` slash command menu in `apps/web/client/src/components/chat/SlashCommandMenu.tsx`
  - conversation-level skill settings in `apps/web/client/src/components/chat/settings/SkillSettings.tsx`
- Memory UI is in `apps/web/client/src/components/chat/MemoryPanel.tsx`.
- Media generation quick actions are embedded in `ChatView.tsx` input toolbar.

## Agency / Agency Swarm status

- Dedicated Agency surface exists at `/agencies/:id` via `apps/web/client/src/pages/AgencyChat.tsx`.
- Agency availability is feature-gated server-side with `AGENCY_SWARM_ENABLED`.
- Browser Session is already integrated with Agency UI behind `agencyBrowserSessionUi`.
- No direct Chat launcher or handoff into Agency Swarm was found in `Chat.tsx` or `components/chat/*`.

## Product implication

- Chat Help can truthfully describe Agency Swarm as an adjacent workspace that exists today.
- It should also explicitly say direct Chat-to-Agency escalation/handoff is not yet available from the Chat screen.
- Because the user asked for a plan if missing, quick planning artifacts should capture the handoff follow-up.
