# Section 02 — canonical thread/message runtime

## Deliverable

Implement the assistant-ui External Store adapter over current ChatWorkspace state and current Core APIs. Synchronize `conversationId` and runtime `threadId`; map canonical message IDs and keep sender, content, attachments, blocks, model and usage metadata. Delegate new turns to existing upload/turn/job-polling helpers and reconcile completed messages from Core.

## Owned paths

- `smartaihub-platform/modules/chat/src/ui/ChatWorkspace.tsx`
- `smartaihub-platform/modules/chat/src/ui/api.ts` only if a narrow typed adapter is needed
- New runtime adapter/store files under `modules/chat/src/ui/`

## Acceptance

- New conversation and selected history entry map to one existing Core conversation ID.
- Thread switching and history hydration preserve stable message IDs and do not leak draft/message state across tenants/workspaces.
- Submit/retry keeps existing idempotency keys, attachments, workspace headers, queue job polling and canonical message reconciliation.
- Mount, refresh and reconnect never dispatch a new turn automatically.
- A UI display stop is never mapped to worker job cancellation.

## Prerequisites and gaps

Core has no authenticated active-job-by-conversation read endpoint. Do not store an authoritative job ID in localStorage or invent reconnect behavior. Preserve no-redispatch and document active-job recovery as open until Core exposes an authorized lookup.
