# SPEC-308 notification attention authority decision — 2026-10-10

## Finding

SPEC-308 §6.2 says that successful JSON parsing of the existing notification SSE payload is not authorization. Current `GlobalAlerts.tsx` uses a user-wide stream and user-wide notification queries; it does not prove the active tenant for the row, and the SSE row lacks a monotonic occurrence identifier for grouped notifications. A repeated parent row ID or occurrence count cannot establish a distinct grouped revision. The current tenant-specific mascot preference key does not make those notification rows tenant-scoped.

## Implementation

- Kept the existing SSE connection, count/reminder invalidations, dropdown refresh behavior, and job-completion toast.
- Removed SSE-to-Bell animation and SSE-to-mascot-arrival dispatch.
- Kept the baseline event for reducer readiness but publish an empty signal set. Existing query data cannot create attention while tenant ownership/revision proof is absent.
- Kept the existing Bell, unread badge, notification actions, mascot, demo/onboarding hint, Chat, and Feedback surfaces.
- Updated the isolated browser assertions to expect no decorative response to unverified SSE. These assertions have not been run yet, per the requested consolidated verification round.

## Authority needed to re-enable live cosmetic arrivals

Feature-049 notification owner must confirm one of:

1. existing inbox/stream semantics are tenant-scoped and expose an authorized monotonic occurrence revision for grouped notifications; or
2. an existing authorized query exposes the same proof without adding a second notification query/transport for SPEC-308.

Until then, keep live decorative Bell/mascot attention static. No new API, query, backend path, or permission was added. This is a source-level fail-closed implementation decision, not live acceptance evidence.

## Evidence boundary

Independent read-only security review found no remaining SSE/query path in `GlobalAlerts.tsx`, `FeedbackButton.tsx`, `assistantMascotEvents.ts`, or `notificationAttention.ts` that creates cosmetic attention after this change. Same-origin scripts can dispatch the existing custom event interface; therefore it remains UI-only and must never carry private notification data. A future trusted arrival producer must be connected to the Feature-049 authorization contract.

Current source commit at time of note: `cfaf435a87f528ca3360a4be99405641b8059ccf`; the uncommitted changes in this note's parent checkpoint are pending FAST GATE and exact-source consolidated verification.

Other independent implementation gaps closed in the same continuation: the Settings description now documents current-browser/device-only preference storage in English and Thai, and `loadAssistantMascotPreferences` rejects serialized strings longer than 2,048 code units before parsing. A focused oversize-value test was added as source only and remains unrun.
