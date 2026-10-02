# Section 02 — Trusted platform routing and existing Chat context

## Goal and boundaries

Establish one server-derived deployment capability contract for Linux/tunnel and Cloudflare ingress, then add a typed, privacy-safe bridge from the existing emergency map into the existing **AI Chat & Feedback** panel. Preserve Spec260 as sole authority for routes, identity, authorization, public/operations disclosure, audit, conversation and Task Control. No new Chat page, map-specific conversation, route registry, platform selection from browser hostname/user agent, or duplicate job authority.

Cloudflare presently proxies canonical platform APIs to Linux. Automatic detection means resolve the deployment mode from trusted server configuration plus validated runtime bindings and fail closed when configuration conflicts or is insufficient. Do not guess the execution mode from the incoming hostname or expose secrets/bindings in a client response. Both ingress paths must use the same application and route contracts.

## Verified integration paths

- `packages/shared/src/emergencyRouteManifest.ts`: `SPEC260_PAGE_ROUTES`, `SPEC260_API_ROUTES`, `getSpec260PagePath`, `getSpec260ApiPath`, and route matching helpers are canonical. Extend only when a real route is needed; do not create another registry.
- `apps/cloudflare/src/spec260RouteRegistration.ts` / `apps/cloudflare/src/spec260PlatformProxy.ts`: route registration and proxy to the private platform origin; preserve bounds, original request metadata, identity headers and non-recursive private-origin validation.
- `apps/web/server/services/appRuntimeConfig.ts` and `apps/web/server/services/managedRuntimeDeploymentContracts.ts`: inspect current runtime configuration/deployment contract before creating a resolver. Add `apps/web/server/services/platformRuntimeCapabilities.ts` only if no current server-only module owns the required distinction. Export a small typed resolver (`resolvePlatformRuntimeCapabilities`) with explicit `linux-platform` / `cloudflare-ingress` ingress mode and capabilities; it must validate trusted config/binding combination and return a typed unavailable/conflict result rather than permissive defaults. It must not claim Cloudflare executes the DB/auth/outbox control plane.
- `apps/web/client/src/components/guardian/FeedbackButton.tsx`: existing `FeedbackButton` owns AI Chat, Task Control, and Send Feedback tabs; `ensureChatConversation`, `handleOpenTaskPrompt`, and `ChatView` already preserve canonical chat/task lifecycle. Map context must be optional, one-turn scoped, visible and removable.
- `apps/web/client/src/components/chat/ChatView.tsx`: canonical composer view, currently accepts `conversationId`, `density`, `composerPrompt`, and shared controls. Extend with a typed context prop only if needed; do not create another composer or auto-submit the context.
- `apps/web/client/src/pages/EmergencyRoutePage.tsx` and `apps/web/client/src/components/emergency/EmergencyPublicMap.tsx`: provide the selected public-map refs/viewport/layers/filters via a deliberate “Ask AI” or map action.

## Tests first

1. New `apps/web/server/services/__tests__/platformRuntimeCapabilities.test.ts` (or the existing colocated contract suite if one is found): `resolvesTrustedLinuxTunnelMode`; `resolvesCloudflareIngressOnlyWithValidatedBindings`; `rejectsMissingOrConflictingRuntimeConfiguration`; `ignoresIncomingHostAndUserAgentForMode`; `doesNotAdvertiseCloudflareAsCanonicalDbAuthOrOutboxOwner`; `doesNotExposeSecretsInCapabilityProjection`.
2. `packages/shared/src/emergencyRouteManifest.test.ts`: both Linux route registration and Cloudflare registration resolve the same route id/path/method/access/cache contract; invalid route IDs remain rejected; no duplicate map/chat route authority is introduced.
3. `apps/cloudflare/src/spec260RouteRegistration.test.ts` and `apps/cloudflare/src/spec260PlatformProxy.test.ts` (or existing exact proxy test path): canonical route delegates to private platform; wrong/public/recursive origin and missing binding fail closed; secret token never reaches client; request identity and authorization headers remain governed by the proxy contract.
4. `apps/web/client/src/components/guardian/__tests__/FeedbackButton.test.tsx`: `opensExistingChatWithMapContextWithoutAutoSending`; `keepsExistingConversationAndModelSelections`; `showsAndRemovesMapContextBeforeSend`; `mapContextExpiresAfterOneTurn`; `taskControlAndFeedbackTabsRemainCanonical`; `unauthenticatedChatUsesExistingAccessFlow`; context refs are not submitted after tenant/role/scope changes without server reauthorization.
5. `apps/web/client/src/components/chat/ChatView.test.tsx` (or existing suite): accessible context pill/summary is visible to assistive tech; removing clears only attached map context and not map selection; no context serialization exceeds bounded safe refs; normal message send is the only operation that dispatches context.

## Contracts and implementation steps

### Platform capabilities

1. Inspect current app runtime configuration and deployment binding validation. Keep resolver server-only and pure where possible: inputs are validated deployment configuration/binding facts, not `Host`, `Origin`, browser storage or user agent. Return declared ingress mode, canonical platform ownership and only operational capabilities that are actually validated. Explicitly distinguish “Cloudflare ingress” from “Cloudflare executor”; preserve canonical Linux platform service for auth, tenant, DB, audit and `worker_jobs` + outbox admission.
2. Test valid Linux/tunnel and Cloudflare ingress configurations, absent/contradictory values and untrusted request headers. No secret or binding name/value may be serialized to public UI.
3. Ensure route handling for both ingress modes calls the same route manifest contract. Reject unknown/disallowed paths/methods and do not bypass private platform origin checks.

### Map-to-chat context

4. Add a shared typed contract in `packages/shared/src/emergency/mapContext.ts` (or the established shared emergency context module if one is found). `MapContextEnvelope` should represent `surface: "emergency_map"`; bounded viewport (normalized bounds/center/zoom and optional bearing/pitch); canonical typed selected feature references and revisions; active layer IDs/filter state; temporal mode/time window; optional authorized selected geometry, route or journey ref; UI-only `requestedMapMode`; and a small visible summary. Use existing `BBox`, `LatLng`, `GeoJSON`, domain-ref, freshness and verification types where present. Reject unknown keys, invalid coordinates/zoom/time windows, overlong arrays/text and raw feature payloads.
5. Context is references/summaries only, never all rendered features or credentials. Public map context uses approved public geometry/projections; exact restricted locations, other-tenant IDs, private operation fields, and aggregate differencing data are forbidden. `requestedMapMode` is not authority. The server derives effective audience from authenticated principal, tenant and purpose; reauthorize each selected ref and action at use time. On auth/scope change, stale refs are removed or explicitly rejected rather than queued.
6. Pass context into `FeedbackButton` when the map user selects Ask AI. Opening the existing AI Chat tab can create its first canonical conversation only through its established normal lifecycle. Do not create a hidden conversation or send a user turn automatically. Show a concise removable map-context summary/pill before the user submits; context is consumed for at most the intended next user turn and then expires. Removing it must not alter map viewport/layers/selection.
7. Reuse `ChatView` composer and existing model/assistant/skill selections. An Ask AI action opens/focuses the existing combined panel and selects AI Chat; existing Task Control and Send Feedback tabs continue to function unchanged. Any task action uses existing Task Control permission/approval flow and canonical durable job control plane.

## Dependencies and gates

- Requires section 01's map renderer/provider state separation and tested canonical route behavior.
- Section 03 may consume the shared context types and callbacks once stable; sections 04–14 may add typed refs/filters later without changing audience authority.
- A real deployed Linux/tunnel vs Cloudflare configuration check requires environment access and is final external evidence. Local contract tests cannot prove actual production bindings or current tunnel health.

## Safety/review criteria

- Independent security review of browser-controlled mode, audience and context refs; deny by default on identity/tenant/purpose mismatch, expired/revoked ref, schema failure or missing capability.
- Confirm chat stores/forwards only user-visible, bounded context; no hidden prompt, auto-send, new conversation authority or unintended turn carry-over.
- Confirm clear/removal and one-turn expiration work across close/reopen; map state and the user’s normal model/assistant choice remain intact.
- Confirm `worker_jobs` plus transactional outbox remains the only canonical long-running work admission route; Cloudflare remains a transport/approved executor boundary only.
- Review dirty source diffs before editing; no broad staging/reset/stash or unrelated changes.

## UI/UX Contract

### Target User / JTBD
- Role: public resident or responder using authorized public-map context; authenticated user opening shared Chat; operator only through existing authorized operational projection.
- Goal: ask a question about what is visibly selected on the map without repeating location, while understanding and controlling what context accompanies the next message.
- Entry point: explicit Ask AI action on the existing map/feed object or the existing AI Chat & Feedback panel.
- Success outcome: same existing chat/session and preferences open with a visible, removable, correctly scoped context summary; nothing is sent until the user submits.

### Existing Pattern Reference
- Searched (rg query used): `EmergencyPublicMap|FeedbackButton|ChatView|composerPrompt|ensureChatConversation` under `apps/web/client/src`.
- Found pattern(s): `apps/web/client/src/components/guardian/FeedbackButton.tsx` owns AI Chat / Task Control / Send Feedback and uses `ensureChatConversation`, `handleOpenTaskPrompt`, `ChatView`; `apps/web/client/src/components/chat/ChatView.tsx` owns the composer; `apps/web/client/src/components/emergency/EmergencyPublicMap.tsx` renders map and status.
- Decision: reuse.
- Reason: shared conversation, model choice, permissions and Task Control already exist and are canonical; a map chat would split session and approval ownership.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Public emergency map | `/disaster/map`, `apps/web/client/src/pages/EmergencyRoutePage.tsx` | Supply typed context from explicit map action; no new route. |
| AI Chat & Feedback panel | `apps/web/client/src/components/guardian/FeedbackButton.tsx` | Accept optional map context; visible removable context; preserve existing tabs. |
| Chat composer | `apps/web/client/src/components/chat/ChatView.tsx` | Render bounded context summary and attach it only on explicit submit. |
| Shared map context contract | `packages/shared/src/emergency/mapContext.ts` | Typed envelope/parser or validator, bounded and authority-neutral. |
| Existing route contract | `packages/shared/src/emergencyRouteManifest.ts` | Extend only if a canonical route is actually needed; no duplicate route. |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| `FeedbackButton` | `apps/web/client/src/components/guardian/FeedbackButton.tsx` | Existing combined panel, active tab, canonical conversation lifecycle | Optional `MapContextEnvelope`, existing auth and chat state |
| `ChatView` | `apps/web/client/src/components/chat/ChatView.tsx` | Composer, explicit send, visible context affordance | Existing conversation/model state and optional bounded context |
| Map context producer | `EmergencyRoutePage.tsx` / `EmergencyPublicMap.tsx` | Selection/viewport refs and explicit Ask AI event | Canonical shared context types; public projection |
| Platform resolver | `apps/web/server/services/platformRuntimeCapabilities.ts` if needed | Trusted ingress/capability classification | Validated server config and binding facts |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Existing Chat loading state; map context summary is present only once validated. | Component test and browser handoff. |
| empty | No map selection: explain that only visible area/active filters will be attached, with remove/clear available. | RTL and keyboard test. |
| error | Invalid/stale/unauthorized context is dropped with clear localized explanation; never expose raw refs or silently broaden audience. | Validator and auth-scope tests. |
| success | Existing AI Chat tab shows removable context pill/summary; user submits message explicitly. | RTL + browser proof. |
| partial success | Some selected refs no longer resolve: show the surviving authorized subset and a “context updated” explanation, or reject whole envelope when mixed scope is unsafe. | Mixed-ref authorization tests. |
| disabled | Existing access/entitlement flow controls Chat; no protected context is queued for later. | Signed-out/role tests. |
| selected | Context chip is visibly selected and announced; removing it does not deselect/zoom map. | Keyboard/AT component test. |
| hover | Existing button/chip affordance only; no hover-only actions. | Pointer + keyboard visual review. |
| focus | Strong visible focus on Ask AI, remove-context and send controls; logical focus remains in panel after open. | Keyboard/browser evidence. |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Existing panel occupies its established mobile geometry; context summary wraps/clamps safely, remove button remains reachable, map remains intact behind panel. | Browser screenshot + keyboard/touch. |
| tablet 768x1024 | Panel/chat and map transition using existing breakpoints; no clipped context controls. | Browser screenshot. |
| desktop 1440x900 | Reuse existing combined panel layout; context summary fits without displacing composer or tabs. | Browser screenshot. |
| small-mobile 360x800 (extended if risky) | Wrap labels; no horizontal overflow; remove action has touch-sized target. | Browser overflow/touch check. |
| laptop 1024x768 (extended if risky) | Panel opens within viewport; composer and tab controls remain visible or scroll predictably. | Browser screenshot. |
| wide-desktop 1280x800 (extended if risky) | No oversized map-context area or panel overflow. | Browser screenshot. |

### Accessibility Acceptance
- Keyboard path: Tab to map Ask AI action → open panel → navigate tabs/context remove → composer → explicit send; Escape/close returns focus to invoking control when possible.
- Focus visibility: focus is visible on action, tabs, remove control and composer; opening panel moves focus according to existing accessible dialog behavior.
- Labels/semantics: announce “Map context attached” and its bounded summary; remove button has a descriptive label; no reliance on color alone.
- Contrast: meet established product contrast/token policy for pill, status and focus state.
- Reduced motion: no required animation; honor reduced-motion preference for panel transitions.

### Copy Contract
- Tone: calm, factual and explicit that map context is attached but not sent until submit.
- Primary language(s): Thai and English, using existing localization namespaces.
- Required labels: “บริบทจากแผนที่ / Map context”; “นำบริบทออก / Remove context”; “ส่งข้อความเพื่อถาม / Send a message to ask”.
- Validation/error copy: explain that a selected item changed permission or expired and must be selected again; never reveal protected details.
- Empty/loading/success copy: no selection means viewport context; loading announces preparation; success says context attached, not delivered.
- Localization/fallback notes: use established Thai/English keys; do not hardcode UI strings if the owning component already has i18n.

### Browser Evidence Required
- Follow `/home/dev/.codex/skills/orchestra/references/ui-browser-verification.md`.
- At required viewports 390x844, 768x1024, 1440x900 verify map → Ask AI → existing panel; context pill visibility/removal; same conversation/model; no auto-send; explicit submit; one-turn expiry; auth transition rejection; map viewport/layers unchanged; Task Control and Send Feedback remain usable; no horizontal overflow or console errors.

## Completion evidence

- Platform mode resolver and both ingress contract tests pass; security review proves browser headers cannot choose privileged mode/audience.
- Chat bridge and component tests prove context appears, is removable and bounded, expires correctly and is only sent on explicit user submit.
- Browser screenshots/evidence follow the UI contract. Real deployment mode/binding state remains a separate final gate.
