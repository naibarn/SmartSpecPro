# Implementation Plan

## Objective

Add a top-level Help experience for Chat that explains the full Chat surface, not only Browser Session, and document the missing direct Agency Swarm handoff from Chat.

## Affected areas

- `apps/web/client/src/pages/Chat.tsx`
- `apps/web/client/src/components/chat/ChatView.tsx` if needed for discoverability
- new reusable Chat help dialog component under `components/chat`
- Chat page tests
- quick planning docs for Agency handoff

## Approach

1. Create a reusable `ChatHelpDialog` with English documentation.
2. Add a visible `Help` button in the Chat page chrome.
3. Cover:
   - normal chat usage
   - slash commands and skill settings
   - image/video/audio generation
   - memory
   - Browser Session linkage
   - Agency Swarm current state
4. Add a “Current status” note clarifying that Agency Swarm exists as a dedicated workspace, but direct Chat handoff is not yet implemented.
5. Add tests for dialog content and Chat surface visibility.
6. Record a concrete follow-up plan for Chat-to-Agency handoff.

## Risks

- Help content drifting from runtime behavior.
  - Mitigation: keep it tied only to features visible in current code.
- Confusion between Browser Session help and general Chat help.
  - Mitigation: keep them separate and scoped.

## Acceptance criteria

- A Help button is visible on the Chat page independent of Browser Session.
- The Help dialog includes all requested topics.
- The dialog accurately reflects current Agency Swarm availability.
- Tests pass.
