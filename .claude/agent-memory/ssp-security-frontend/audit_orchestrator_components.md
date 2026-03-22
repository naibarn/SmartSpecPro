---
name: audit_orchestrator_components
description: 2026-03-18 frontend security and quality audit of TeamRoomView, RunMonitorPanel, and useRunStream (Virtual AI Office Orchestrator feature)
type: project
---

Audit of orchestrator UI components on branch codex/feature-044-multimodal-chat-memory.

**Date:** 2026-03-18
**Files audited:**
- apps/web/client/src/components/orchestrator/TeamRoomView.tsx
- apps/web/client/src/components/orchestrator/RunMonitorPanel.tsx
- apps/web/client/src/hooks/useRunStream.ts
- apps/web/client/src/components/chat/ThreadRouter.tsx (consumer)
- apps/web/client/src/App.tsx (route registry)

## Confirmed Findings

### HIGH — Unguarded authenticated routes for orchestrator-adjacent pages
- `apps/web/client/src/App.tsx:298–310` — `/chat`, `/agencies`, `/agencies/:id`, `/agencies/:id/edit`, `/workflows`, `/workflows/editor`, `/workflows/editor/:id`, `/webhook-triggers` are all plain `<Route>` with no auth guard. These are authenticated features (they call tRPC procedures that require a session) but have no route-level redirect to /login. The orchestrator's TeamRoomView is rendered from the `/chat` route via ThreadRouter. An unauthenticated user can reach the room view HTML shell; their SSE connection will fail server-side but the UI shell loads.

### HIGH — SSE stream opens without Last-Event-ID header; reconnect loses events
- `apps/web/client/src/hooks/useRunStream.ts:48–49` — The URL `/api/orchestrator/stream/${streamType}/${streamId}` is constructed without appending `?lastEventId=...`. The `lastEventIdRef` is tracked in state (line 37, 59) but never used when building the reconnect URL. On every reconnect after a drop, all events that occurred during the outage are silently lost. This is also a security-adjacent integrity gap: a paused run that resumes during a brief disconnect will have missing control events (pause/resume) in the client timeline.

### MEDIUM — `(event.data as any)` type coercion allows prototype pollution path
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx:194` — `(event.data as any)?.content`
- `apps/web/client/src/components/orchestrator/RunMonitorPanel.tsx:53` — `(event.data as any)?.tokenUsage`
The `data` field is typed as `Record<string, unknown>` on the interface but cast to `any` at the call sites. If the SSE payload were crafted with a `__proto__` or `constructor` key, the optional-chain access still resolves but downstream numeric/string consumers could receive unexpected types. Recommend narrow runtime checks (e.g., `typeof event.data.content === "string"`) rather than `as any`.

### MEDIUM — No EventSource credential mode; cross-origin cookies not sent
- `apps/web/client/src/hooks/useRunStream.ts:49` — `new EventSource(url)` without `{ withCredentials: true }`. The stream endpoint is on the same origin (`/api/...`) so cookies are sent by default in same-origin mode. However, if the app is ever served behind a CDN that changes the effective origin, or the SSE endpoint is moved to a separate subdomain (which is a common scaling step), session cookies would silently stop being sent and every stream would fail authentication with no client-visible error. Document the requirement or explicitly set `withCredentials: true`.

### MEDIUM — No ARIA roles or labels on interactive run-control buttons
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx:133–143` — Pause and Stop buttons have `title=` attributes but no `aria-label` and no `type="button"` attribute. Inside a form context these would submit. No `aria-disabled` when the run is not active.
- `apps/web/client/src/components/orchestrator/RunMonitorPanel.tsx:157–174` — Same pattern: Pause, Stop, Resume buttons lack `aria-label`, `type="button"`, and `aria-disabled`.

### MEDIUM — Message content rendered as raw text but actor/visibility metadata is unescaped in JSX
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx:181–191` — `event.actorId.slice(0,12)` and `event.visibility` are rendered directly in JSX text nodes (safe: React auto-escapes). However `event.eventType` at line 99 feeds the filter condition `e.eventType.includes("summary")` — a crafted `eventType` like `summary<img onerror=...>` would only trigger if rendered in a `dangerouslySetInnerHTML` context, which it is not here. No immediate XSS, but note the actor fields come from SSE data and are fully attacker-controlled if the SSE endpoint is not properly authenticated server-side.

### LOW — Unbounded event accumulation with only a soft cap
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx:71` — `prev.slice(-199)` caps the in-memory event list at 200.
- `apps/web/client/src/components/orchestrator/RunMonitorPanel.tsx:46` — same cap.
Both are reasonable for short runs, but a long-running orchestration producing >200 events/minute will permanently discard older events that are still referenced by the timeline. The `agentStats` Map in RunMonitorPanel (line 40) has no cap at all: it grows by one entry per unique `actorId` seen. For a large team this is bounded by `agents.length` (passed as prop), but if the server sends events for agents not in the prop array, the Map grows unboundedly.

### LOW — No error boundary around either orchestrator component
- Neither `TeamRoomView` nor `RunMonitorPanel` is wrapped in a React error boundary at the component or parent level. A single malformed SSE event that causes a render exception (e.g., `new Date(event.ts)` on a non-date string throwing in older Safari) will unmount the entire panel tree with no recovery UI.

## Why:
- TeamRoomView and RunMonitorPanel are new components introduced for the Virtual AI Office Orchestrator. They were not in scope for the earlier feature-044 audit.
- The SSE hook (useRunStream) is also new to this branch.

## How to apply:
- Flag SSE credential mode and Last-Event-ID gap on any future PR touching useRunStream.
- Flag the unguarded /chat and /agencies routes if auth-required features are added to those pages.
- Flag missing aria-label / type="button" pattern on any new run-control button.
