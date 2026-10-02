# Section 13 — Watches, API/MCP and existing Chat actions

## Goal and dependencies

Add user-owned area/route/condition watches, permission-scoped API/MCP capabilities, and map/feed handoff into the existing AI Chat & Feedback panel. Spec260 remains sole authority for identity, routes, conversations, Task Control, notifications, audit and durable execution. “Global Mini Chat” means the existing panel’s AI Chat tab. No new chat/thread/composer, duplicate queue or continuous LLM polling. Depends on sections 02, 04–06, 11 and 14.

## Tests first

- Add packages/shared/src/geo/watches.test.ts: bounded geometry/condition validation; owner/tenant; expiry/revocation; deterministic transitions and hysteresis; invalid/stale refs denied; retries cannot duplicate a notification intent.
- Add apps/web/server/services/__tests__/geospatialWatchService.test.ts: authenticated CRUD scope; current authorization/coverage/freshness rechecked at evaluation and delivery; provider outage means unknown/stale, not clear; stable watch+event+revision idempotency; no cross-tenant reads.
- Extend canonical worker/outbox tests: event/subscription/feed refresh preferred over polling; long work admitted atomically through worker_jobs + transactional outbox with lease/fencing/retry/cancel/idempotency; delivery cannot create job truth.
- Extend existing MCP registry/server tests: schema/scope/quota/freshness/provenance/coverage/cost/fallback declared; same policy as first-party; explicit read/write scopes and idempotency; requestedMapMode cannot elevate to responder/command.
- Extend mapContext tests: unknown keys, raw features, invalid bounds and excessive refs rejected; canonical refs only; public-safe projection; removal/one-turn expiry; role/tenant changes invalidate context; no auto-send.
- Extend apps/web/client/src/components/guardian/__tests__/FeedbackButton.test.tsx for acceptance 501–508, 511–512: Ask AI opens existing panel/tab; preserves conversation/draft/model/assistant/skill; opening creates no message/task; context visible/removable and one-turn; Task Control/Feedback remain canonical; failure leaves map intact.
- Extend apps/web/client/src/components/chat/ChatView tests for accessible bounded context and explicit send. Browser E2E proves panel handoff/map state.

## Existing owners and implementation

- apps/web/client/src/components/guardian/FeedbackButton.tsx owns combined AI Chat, Task Control, Send Feedback tabs and normal canonical first-conversation lifecycle.
- apps/web/client/src/components/chat/ChatView.tsx owns composer, model/assistant/skill selection and explicit message submission.
- apps/web/client/src/pages/EmergencyRoutePage.tsx and components/emergency/EmergencyPublicMap.tsx own map/feed actions and state.
- packages/shared/src/emergencyRouteManifest.ts owns routes. packages/shared/src/geo/capabilityResolver.ts, apps/web/server/_core/mcpRegistry.ts and _core/mcpPublicServer.ts own capability/tool policy.
- apps/web/server/routes/spec260EmergencyEdge.ts, shared emergency contracts, existing notification services and canonical worker/outbox services own emergency actions/delivery.
- Inspect actual dirty diffs before touching these shared paths. Potential new files only if absent: packages/shared/src/geo/watches.ts and apps/web/server/services/geospatialWatchService.ts. Extend an existing router rather than add a competing route.

## Implementation sequence

1. Model area, route and condition watch with canonical GeoScope/route refs, normalized bounded geometry, typed threshold/condition, owner/tenant, capabilities, notification preference, revision, state and expiry. Do not auto-save viewport.
2. CRUD requires authenticated identity and owner/tenant/role checks. Normalize geometry, prevent excessive vertices/antimeridian errors and reject arbitrary fetch URLs.
3. Evaluate on domain events/subscriptions/feed refresh or bounded scheduled refresh; require fresh source and coverage. Use hysteresis and material transitions. Unknown/stale data never means safe/no risk.
4. Deliver through existing notification/audit authority; recheck watch, user consent, current authorization and expiry immediately before delivery. Idempotency suppresses duplicate transitions/retries.
5. Long work only enters canonical worker_jobs + transactional outbox with existing lease/fencing/idempotency/retry/cancel; no Watch queue/poller.
6. Extend current capability vocabulary for supported map/feed/coverage/weather/hydrology actions. Declare validated schema, permission, data/source provenance, coverage, freshness, latency/cost, cache and failure behavior. UI/API/MCP share the same domain service/policy. Bound inputs/results; writes require current authorization and established approval/idempotency.
7. Map/feed Ask AI explicitly opens/focuses FeedbackButton on AI Chat. Reuse current conversation, draft, model/assistant/skill choices. Normal first conversation may be created by existing flow; opening does not send/create task.
8. Attach only a bounded MapContextEnvelope: viewport/filter/time and canonical selected refs with short policy-safe summaries. No rendered dataset, provider payload, secrets or exact protected locations. Server derives audience; requestedMapMode is UI-only.
9. Show a localized, accessible removable context indicator. Removal affects only context, not map. On explicit submit backend re-resolves refs and reauthorizes; context is consumed after one user turn, and cleared on panel close/navigation/auth scope change. Never auto-send/re-attach.
10. If bridge is unavailable, keep map/feed usable and preserve state with recoverable status. Task Control and Send Feedback remain existing tabs and actions.

## Authorization and safety

Browser host, locale, MCP metadata, mode hint and watch ref confer no authority. Reauthorize each read/action/delayed job/notification. Fail closed for mixed-scope refs, stale actions, expired/revoked watches or incomplete policy. Public Chat context is public-safe. Do not allow arbitrary fetch/upstream writes, unbounded geometry, source prompt injection, AI-authorized actions or notification abuse. Audit consequential changes without logging sensitive geometry/message bodies. Add no persistence table unless current canonical owner cannot store intentional user watches; conductor owns schema/journal integration.

## UI/UX Contract

### Target User / JTBD
Users save a clearly scoped watch and receive non-duplicative updates; map/feed users ask about visible context using the existing shared Chat panel.

### Existing Pattern Reference
Reuse map/feed actions, dashboard watch patterns, notification settings and AI Chat & Feedback panel (FeedbackButton, ChatView, UniversalControlPlanePanel). No new chat/task/feedback route. Follow established components/tokens and read Astryx layout guidance before screen changes.

### Surface Inventory
| Surface | Owner | Requirement |
|---|---|---|
| Map/feed Ask AI | EmergencyPublicMap/EmergencyRoutePage | Explicitly attach typed refs. |
| Chat | FeedbackButton/ChatView | Visible removable one-turn context; preserve canonical state. |
| Task Control/Feedback | Existing panel | Existing auth/approval/idempotency flows unchanged. |
| Saved watches | Existing dashboard/map navigation | Scope, condition, expiry and status clear. |
| API/MCP | Existing capability/MCP registries | Same policy and contracts. |

### Component Map
Map emits action/context; FeedbackButton selects tab; ChatView displays/removes context and uses normal explicit send; server resolves/rechecks refs; watch service evaluates; canonical notification/job/audit services execute. UI owns no policy or job state.

### State Matrix
| State | Expected UI |
|---|---|
| loading | Map/feed usable while panel/watch loads. |
| empty | No saved watch; no implication there are no hazards. |
| error | Recoverable, retain safe form/context. |
| success | Show area/route, condition, expiry and notification state. |
| partial success | Explain coverage/freshness; unsupported condition is disabled, not weakened. |
| disabled | Explain access/capability gate; never stage privileged context. |
| selected | Context/watch scope visibly inspectable and removable/revisable. |
| hover | No essential action is hover-only. |
| focus | Visible keyboard focus across actions, tabs, remove and submit. |

### Responsive Matrix
| Viewport | Expected behavior |
|---|---|
| 390x844 | Existing panel geometry; remove/watch controls reachable. |
| 768x1024 | Tabs, conditions and details readable. |
| 1440x900 | Panel and dashboard fit established patterns. |
| 360x800 | No overflow; touch-sized controls; dialogs scroll. |
| 1024x768 | Composer/action visible or predictably scroll. |
| 1280x800 | No clipped scope/expiry or panel overlap. |

### Accessibility Acceptance
Keyboard map-to-chat flow; close returns focus; watch fields/errors/results are labeled/announced; context/freshness/errors semantic; status not color-only; visible focus and reduced motion.

### Copy Contract
Thai/English existing namespaces. Say context is attached, not sent. Watch text names condition, coverage/freshness, expiry and notification limits. Unknown/stale/unavailable never means safe or no events.

### Browser Evidence Required
At 390x844, 768x1024, 1440x900 plus risky 360x800, 1024x768, 1280x800: prove existing panel/tab and state preservation; no send/task on open; inspect/remove then explicit one-turn send; auth transition rejects stale context; tabs work; Chat failure preserves map; watch create/pause/revoke/notification state; keyboard/AT; no overflow/console errors.

## Completion evidence and gates

Pass focused shared/service/auth/outbox/MCP/RTL tests and browser handoff evidence. Prove idempotent notification transition and same policy for UI/API/MCP. Production channels, source schedules, final Cloudflare verification and unfinished Spec260 auth/executor integration remain explicit gates.

