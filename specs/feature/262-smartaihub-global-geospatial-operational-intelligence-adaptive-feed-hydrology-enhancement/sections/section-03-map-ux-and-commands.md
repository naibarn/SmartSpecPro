# Section 03 — Map UX, typed commands and coverage presentation

## Goal and boundaries

Build a usable operational map interaction layer on the repaired Spec260 map, with stable typed commands, readable layers/status/coverage, and accessible non-map equivalence. Reuse `/disaster/map`, `EmergencyPublicMap`, `EmergencyRoutePage`, shared route manifest and the existing AI Chat & Feedback / Task Control panel. Map commands update map state only unless an action crosses into existing authorized Task Control or another canonical service. No new route, Map Chat, separate task system, duplicate map/feed source of truth, or unsupported live forecast.

MapLibre stays the renderer. The map must not conceal essential emergency records if basemap or worker fails. Coverage gaps, stale sources and unavailable providers must be distinguished from a genuinely empty query. All displayed features are already audience-filtered server projections; map mode from the client is never authorization.

## Verified ownership paths and existing patterns

- `apps/web/client/src/components/emergency/EmergencyPublicMap.tsx`: MapLibre construction, `NavigationControl`, GeoJSON sources/layers, feature click/popups, status/coverage rendering, map failure fallback. Extend focused controls/state without replacing renderer baseline from section 01.
- `apps/web/client/src/components/emergency/emergencyMapFeatures.ts`: current safe public point/polygon feature projections; reuse/extend only with canonical typed feature refs and public geometry.
- `apps/web/client/src/pages/EmergencyRoutePage.tsx`: existing map/feed route and state owner; keep URL/routing authority canonical.
- `packages/shared/src/emergency/mapContext.ts`: section 02 context contract; section 03 can provide active focus/layers/filter/time state through it.
- `packages/shared/src/emergencyRouteManifest.ts`: `public.map` and dashboard emergency route contracts; no separate menu/URL table.
- `apps/web/client/src/components/guardian/FeedbackButton.tsx`, `apps/web/client/src/components/chat/ChatView.tsx`: Ask AI handoff to existing shared panel; task handoff to existing Task Control.
- Existing SmartAIHub UI uses Tailwind/shadcn patterns. For any Astryx-based UI implementation, use the repository's installed Astryx workflow and existing product tokens/components; preserve Tailwind preflight and do not add the Astryx reset globally. Follow current product spacing, controls and responsive breakpoints rather than inventing a parallel visual system.

## Tests first

Add the following focused tests before implementation, extending existing colocated suites where present:

1. `packages/shared/src/emergency/mapCommands.test.ts` for a new typed command parser/controller contract: `acceptsOnlyKnownCommandsAndStrictPayloads`; `rejectsUnknownKeysAndOutOfRangeViewport`; `rejectsStaleOrWrongRevisionFeatureRef`; `keepsReadOnlyCommandsIdempotent`; `doesNotExecuteMaterialSideEffectWithoutCanonicalApproval`; `returnsAppliedMapRevision`; `closingChatDoesNotResetMapState`; `openingChatDoesNotResetViewportLayersSelectionOrRoute`.
2. `apps/web/client/src/components/emergency/__tests__/EmergencyMapControls.test.tsx` (or established existing control suite): `updatesLayerVisibilityAndFilter`; `showsLegendSourceFreshnessCoverageAndConfidence`; `supportsKeyboardSelectionAndClear`; `offersAccessibleFeatureListWhenMapCannotRender`; `doesNotUseColorAsOnlySeveritySignal`; `showsEmptyCoverageSeparatelyFromNoReturnedItems`.
3. `EmergencyPublicMap.test.tsx` or its established suite: loading, success, partial/truncated, stale, provider error, empty-with-coverage and data-unavailable states; layer toggle and selected-feature state; map/list focus synchronization; map context event includes refs rather than all feature data.
4. `apps/web/client/src/pages/EmergencyRoutePage.test.tsx` (if existing; otherwise create colocated): command actions preserve URL authority and map state; Ask AI uses section 02 existing panel callback; Task Control action hands off existing control flow; unauthorized or invalid ref does not disclose details.
5. `apps/web/client/src/components/guardian/__tests__/FeedbackButton.test.tsx`: retain section 02 coverage for no auto-send, context removal, canonical conversation and model preservation; add focused map-selection action handoff if not already present.
6. Browser interaction evidence: map toolbar keyboard/touch operation; selecting an event and opening detail/action dock; layer workbench shows source/freshness/coverage; timeline/compare is disabled or clearly gated when no validated data exists; Chat opens without resetting map; map-worker/provider fallback preserves list narrative.

## Typed map command contract

Implement a strict allow-listed union, preferably in `packages/shared/src/emergency/mapCommands.ts`, with runtime parsing (Zod or the established shared validator) and an applied map revision in every result. Initial command family:

- `map.focus`, `map.fit_bounds`, `map.select`, `map.clear_selection`
- `map.layer.show`, `map.layer.hide`, `map.layer.configure`
- `map.filter.set`, `map.filter.clear`
- `map.area.select`, `map.area.clear`
- `map.route.show`, `map.route.compare`, `map.route.clear`
- `map.journey.follow`, `map.journey.stop_follow`
- `map.timeline.set`, `map.timeline.play`
- `map.draw.start`, `map.draw.commit`, `map.draw.cancel`
- `map.view.save`, `map.view.restore`
- `map.compare.open`, `map.compare.close`
- `map.feed.sync_focus`, `map.feed.lock_focus`, `map.feed.unlock_focus`

Every payload is strict and bounded: validated geographic coordinates/bounds, finite zoom, enum layer/filter/time values, bounded arrays and canonical domain refs with ID/revision. Unknown command/field, malformed geometry, old revision or unresolved reference fails safely with stable error code. Read-only viewport/layer/select commands can apply immediately; any command that creates a task, publishes/updates an incident, sends a notification or otherwise has material side effects must hand off to canonical authorization/approval and durable job controls. The UI command result identifies applied map revision/state. Replay must be idempotent where applicable.

Command handling must not reset map state when Chat opens/closes. Conversational commands are interpreted through the existing Chat/skill/API path and then validated by the same typed command controller; no ad hoc free-form SQL/API dispatch.

## Implementation sequence

1. Freeze section 01 renderer/provider states and section 02 shared focus/context contract. Inspect current feature/layer and page state before adding a controller.
2. Implement and test strict command and map-state contracts first. Keep parsing/validation pure where possible. Add explicit policy hook for action risk; route external/material changes to existing server/Task Control contracts rather than mutating client map state as a substitute.
3. Add compact operational toolbar for direct manipulation: My Location (only with permission), Select, Draw Area, Measure, Layers, Time, Route, Compare, Basemap mode and 3D only when current provider/data capability supports it. Keep unsupported controls disabled with reason; do not advertise nonfunctional actions.
4. Add context action dock for the selected object. Example incident actions: Ask AI, Route Around, Track, Report Update, Create Task, Share. Gate each item by role, record type and capability. Ask AI opens the existing panel with visible removable context; Create Task uses existing Task Control and its authorization/approval checks.
5. Add layer workbench with visibility, opacity, legend, data source, freshness, coverage, confidence/verification where relevant, time mode and provider/cost state when material. Use stable reason codes and factual labels; distinguish observed, official warning, forecast and inference.
6. Add coverage presentation per product area (map, weather, alerts, routes, local emergency, local news, hydrology, community): Available / Partial / Limited / Not connected plus as-of time and source where known. “Not connected” or “unknown coverage” is not “no events.” When no records return, show the query area and coverage state.
7. Provide feature list/narrative synchronized with map selection for keyboard/screen-reader users and map renderer failure. Provide visible severity/freshness text and icons; color may supplement only. Preserve attribution and source details.
8. Add compare/timeline state only where validated data exists. Compare views need same-area/time labels and clear observed-vs-forecast fact class. If no supported history/model is available, give an explicit unavailable/disabled reason, not a decorative fake comparison.
9. Wire typed focus state into section 02 MapContextEnvelope. Keep selection refs and summaries bounded; never serialize all rendered features. The context is UI input only; server authorization rechecks each ref/action.
10. Complete responsive, accessibility and browser interaction proof. Record any unavailable browser/provider environment as an evidence gate, not a pass.

## UI/UX Contract

### Target User / JTBD
- Role: public resident/responder looking at disclosed emergency information; authenticated map user comparing visible context; authorized operator using operational layers.
- Goal: quickly orient, see what data exists and its freshness/coverage, select a feature, filter/time-scope it and take the right next action without losing map context.
- Entry point: existing `/disaster/map` public route and existing registered emergency/dashboard routes for authorized views.
- Success outcome: map has clear toolbar/layers/selection, matching accessible list and truthful coverage states; a supported action preserves state and opens its canonical flow.

### Existing Pattern Reference
- Searched (rg query used): `EmergencyPublicMap|EmergencyRoutePage|MapOperationalToolbar|NavigationControl|FeedbackButton|ChatView` in `apps/web/client/src` and Spec 262 UI headings.
- Found pattern(s): `apps/web/client/src/components/emergency/EmergencyPublicMap.tsx` already creates MapLibre and basic zoom/control/feature-popup/status states; `EmergencyRoutePage.tsx` owns emergency public map page; `FeedbackButton.tsx`/`ChatView.tsx` is the existing global combined panel; shared `emergencyRouteManifest.ts` owns route resolution.
- Decision: reuse and extend.
- Reason: preserve renderer, route, chat, auth and emergency-data conventions. Add only missing typed controls/workbench/narrative; no separate application shell or map route.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Public map | `/disaster/map`, `apps/web/client/src/pages/EmergencyRoutePage.tsx` | Integrate controls, focus/filter/coverage and existing list; keep route identity. |
| Map renderer | `apps/web/client/src/components/emergency/EmergencyPublicMap.tsx` | Add supported toolbar/control hooks, selection sync and truthful states. |
| Feature projection | `apps/web/client/src/components/emergency/emergencyMapFeatures.ts` | Reuse safe public projections; only add canonical public refs/metadata. |
| Shared command contract | `packages/shared/src/emergency/mapCommands.ts` | Strict allow-listed command union/parser and stable result/error/revision. |
| Layer/coverage workbench | Add focused component under `apps/web/client/src/components/emergency/` | Legend, visibility, source, freshness, coverage, confidence and capability gating. |
| Accessible spatial list | Existing map page/list or focused emergency component | Keyboard/nonvisual equivalent synchronized with current selection. |
| Shared Chat handoff | Existing `FeedbackButton` and `ChatView` | Explicit Ask AI with section 02 bounded context; no independent panel. |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| `EmergencyPublicMap` | `apps/web/client/src/components/emergency/EmergencyPublicMap.tsx` | MapLibre lifecycle, visible layers/features, map-error/status integration | Authorized map/feed projections; typed controller callbacks |
| `EmergencyRoutePage` | `apps/web/client/src/pages/EmergencyRoutePage.tsx` | Route/page state and canonical navigation | Focus/selection/filter state, route manifest |
| `MapCommandController` | Add to `apps/web/client/src/components/emergency/` or existing map controller module | Validate/apply UI-only commands and applied revision | Shared `mapCommands` parser and current map state |
| `OperationalLayerWorkbench` | Add focused emergency component | Layer controls, legend, source/freshness/coverage/confidence | Layer capability/data metadata |
| `MapContextActionDock` | Add focused emergency component | Context actions scoped to object and role | Canonical refs, authorized capabilities, section 02 callback |
| Accessible spatial list | Existing map page or focused emergency component | Non-map navigation/selection and map-unavailable equivalent | Same bounded authorized items and focus state |
| `FeedbackButton` / `ChatView` | Existing files | Existing AI Chat and Task Control flows | Optional typed context from section 02 |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Stable map frame/skeleton; announce map data and coverage loading separately. | Component + browser test. |
| empty | Map remains usable; explain query area and coverage; “no data returned” must not mean no incidents. | Fixture with known coverage and zero items. |
| error | Map worker/provider/API failure shows clear status and list/text fallback; feature actions unavailable only as needed. | Worker/provider/API failure browser cases. |
| success | Controls reflect actual active layers/time/filters; feature list and map selection synchronize. | RTL/browser selection tests. |
| partial success | Show coverage/source gaps and stale/partial labels; do not discard successful sources. | Multi-source partial fixture. |
| disabled | Unsupported layer/action is disabled with reason and remains absent from execution. | Capability and role tests. |
| selected | Selected feature appears in map and accessible list; action dock only shows authorized actions. | Keyboard/authorization tests. |
| hover | Tooltip is supplementary; all actions exist on focus/touch. | Pointer/keyboard review. |
| focus | Toolbar and layers have visible focus; list and map focus remain synchronized without trapping focus. | Keyboard/browser/AT evidence. |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Toolbar becomes compact, touch-accessible controls; layer/context dock opens as sheet; map and list remain reachable. | Screenshot and touch/keyboard proof. |
| tablet 768x1024 | Controls and detail/list use responsive split or sheet without covering critical map status. | Screenshot + overflow check. |
| desktop 1440x900 | Toolbar and layer workbench have stable hierarchy; map retains useful viewport; selected detail is not obscured. | Screenshot + interaction proof. |
| small-mobile 360x800 (extended if risky) | No horizontal overflow; controls wrap/scroll intentionally; labels are not clipped. | Browser overflow/tap-target check. |
| laptop 1024x768 (extended if risky) | Side panel and map share space without hiding controls/status; scroll ownership is clear. | Screenshot + panel interaction. |
| wide-desktop 1280x800 (extended if risky) | Dense layer/coverage information remains scannable; map/list are not stretched beyond usable scale. | Screenshot + visual review. |

### Accessibility Acceptance
- Keyboard path: map toolbar → layer/filter/time controls → feature list → feature detail/action dock → Ask AI or canonical Task Control. Provide non-map list navigation for map canvas operations.
- Focus visibility: all controls show visible focus; opening/closing drawers restores focus; map canvas does not trap tab navigation.
- Labels/semantics: descriptive names for controls, layers, zoom, selected feature and coverage; live regions announce loading, selection and stale/unavailable changes without excessive repetition.
- Contrast: severity, freshness, observed/forecast and availability labels must remain distinguishable without color; follow existing token/contrast policy.
- Reduced motion: avoid animated map camera changes unless user-triggered; honor reduced-motion and provide stable alternative state updates.

### Copy Contract
- Tone: concise, calm, factual, non-alarmist; make uncertainty and source limits explicit.
- Primary language(s): Thai and English.
- Required labels: Select, Draw Area, Measure, Layers, Time, Route, Compare, Basemap; source, last updated, coverage, confidence/verification; “No data returned for this coverage” distinct from “No events.”
- Validation/error copy: invalid/stale selection, unsupported provider/layer, permission denied, map unavailable and incomplete coverage each get distinct explanation and next step.
- Empty/loading/success copy: indicate loading, returned-empty-with-coverage, partial coverage, stale source and fully available data separately.
- Localization/fallback notes: use existing emergency i18n namespace and established fallback; no raw untranslated command IDs in UI.

### Browser Evidence Required
- Follow `/home/dev/.codex/skills/orchestra/references/ui-browser-verification.md`.
- Verify map worker/tiles/attribution and interactive controls at 390x844, 768x1024, 1440x900; extended 360x800, 1024x768, 1280x800 due map/drawer density.
- Capture loading, empty-with-coverage, partial, stale, provider error, map-worker error fallback, selected feature, disabled capability, keyboard/list equivalent and layer workbench states.
- Verify selection/list synchronization, no feature/Chat state loss when panel opens/closes, Ask AI no-auto-send handoff, Task Control authorization, no color-only status, and no console/network errors beyond intentionally simulated failures.

## Dependencies and gates

- Requires section 01 baseline map worker/provider reliability and section 02 platform/route/context contracts.
- Feed, weather, hydro and regional capability sections supply richer source/layer metadata later; initially render only actual supported data. Keep unavailable layers disabled and report why.
- Offline/low-bandwidth equivalence is completed in section 15; section 03 must expose current no-data/error accessible list fallback, not implement offline package persistence.
- Model/forecast comparisons remain gated by section 17 validation. Do not invent forecast values or operational recommendations.

## Safety and review criteria

- Parse every command with strict schema and bounds; validate canonical ID, current revision, current tenant/audience and permission again at server action time.
- Never trust requested map mode or client-provided “verified”/freshness status. Render only server-approved projections.
- Read-only commands may act locally; external/material side effects must use canonical authorization, confirmation/approval, audit and `worker_jobs` + outbox controls.
- Do not expose restricted exact location in public map, list, Chat context or aggregate coverage. Avoid geometry differencing and full-feature dumps.
- Google basemap tile policy, attribution, no tile caching/offline mirroring, renderer/provider/data-health distinction remain intact.
- Follow Astryx v0.6.3 project instructions if an implementation uses Astryx: inspect component/docs APIs before composing UI, no raw `div`/`span` layout, no hardcoded values, no global reset. Review actual dirty worktree diffs before touching owned code.

## Completion evidence

- Strict command parser/state tests and component/accessibility tests pass; UI states show accurate source, freshness, coverage and enabled capabilities.
- Browser evidence demonstrates working toolbar, layers, selection, accessible list, truthful empty/partial/stale/error states, and existing Chat/Task Control handoff at required and extended viewports.
- Worker/renderer issues are evidenced in section 01; section 03 reports its own map UX evidence and does not mislabel provider credentials as rendering proof.
