# section-02-personal-chat-lock

## Objective

Make personal chat a first-class, visibly locked mode in chat and prevent project retargeting on the server.

## Scope

This section owns the chat entry point, personal lock enforcement, and the UI affordances that make the scope obvious.

## Files to Change

- `apps/web/server/routers/chat.ts`
- `apps/web/server/services/chatService.ts`
- `apps/web/client/src/components/chat/CreationMenu.tsx`
- `apps/web/client/src/components/chat/ChatSidebar.tsx`
- `apps/web/client/src/components/chat/ChatView.tsx`

## Implementation Notes

- Add a personal-only creation path that always creates `projectId = "personal"`.
- Keep the title and initial state clear so the chat is visually distinct from work chats.
- Reject any attempt to retarget an existing personal conversation to another project.
- Reject any attempt to convert a work conversation into personal by updating `projectId`.
- Preserve the existing project-scoped memory behavior so personal chats share personal context across sessions.
- Add a badge or lock icon in the sidebar and chat header so the user can tell which scope is active.
- Hide or disable the project selector when the active conversation is personal.
- Keep the server as the source of truth; the UI lock is only a convenience layer.

## Data Rules

- A personal conversation must always have an authenticated owner.
- A personal conversation must never share its project scope with work chats.

## Validation

- Router tests should prove personal conversations can be created and cannot be retargeted.
- UI tests should prove the personal entry point, badge, and selector lock all render correctly.

