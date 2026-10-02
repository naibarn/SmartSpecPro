# Section 15 — Offline field use, accessible map equivalence and device sync

## Goal and boundaries

Make essential authorized map/feed information usable in low-bandwidth/offline field conditions and provide nonvisual access equivalent to critical spatial content. Reuse the existing client/server sync and offline storage patterns when they exist; do not create a second authority for emergency reports, chats, watches or tasks. Depends on sections 03–04, 11 and 14.

## Tests first

- Extend emergency-map component tests for keyboard-only operation, focus return, visible focus, screen-reader summary, non-color severity/freshness, bounded visible marker count, accessible ordered list equivalent and MapLibre-unavailable fallback.
- Add package/unit tests for offline package manifest integrity/signature/version, region/expiry/license allowlist, byte/item caps, interrupted download resume and tamper rejection.
- Add sync tests for queued offline user report/watch mutations: idempotent replay, same-owner authorization recheck, revision conflict resolution, revocation, deletion/hold policy and safe partial recovery; stale device credentials cannot upload or receive restricted refs.
- Verify online/offline/low-bandwidth transitions never indicate current data past its `dataThrough` timestamp and never claim “no incident” when a provider is absent.

## Implementation boundaries

- Keep map rendering in `EmergencyPublicMap` and accessible map controls/list in its established page/component ownership. Reuse existing `EmergencyRoutePage` and standard SmartAIHub UI/i18n; do not add a separate map route.
- Reuse browser service-worker/PWA/cache mechanisms already present. Create only a manifest and bounded package retrieval adapter; each data/tile layer opts in only where provider license/rights allow. Google Map Tiles stay excluded from persistent/offline packages.
- Store offline changes as pending, user-authored actions with canonical references and client idempotency keys. On reconnect, send through existing Spec260 public/auth endpoints and existing auth/idempotency/audit behavior; do not trust device timestamps or cached role claims.
- Sync watches/spatial settings by explicit user opt-in and versioned server revision; transient viewport stays device-local by default unless the user saves a watch/area. Concurrent edits return a conflict with safe reconciliation instead of last-write-wins silently.
- A revoked device loses access to protected state. Deletion and legal hold follow section 14 retention rules. Offline evidence receives a visible data-through time and provenance state.
- Add a text-first alternative for critical markers, route hazards, distances/directions, station trends and unavailable layers. Summaries use canonical geometry and facts and disclose approximate/generalized geometry; they do not infer exact arrival times.

## Dependencies / ownership

Section 14 owns authorization/disclosure/deletion/legal hold; section 11 owns available region/layer capability; section 06 owns source rights; section 03 owns map state/visual controls. Persisted offline package policy or shared schema changes are conductor-serial migration work; no migration should be added merely for transient viewport state.

## UI/UX Contract

### Target User / JTBD
- Role: responder/resident in low-connectivity field conditions, including users who cannot interpret a visual map.
- Goal: obtain the latest eligible safety information and understand route/area relevance while offline or using assistive technology.
- Entry point: existing `/disaster/map` and its existing list/feed; device offline state.
- Success outcome: critical facts remain reachable with honest freshness/coverage and a keyboard/screen-reader equivalent.

### Existing Pattern Reference
- Searched: `rg -n "offline|serviceWorker|aria-live|screen reader|EmergencyPublicMap" apps/web/client/src`.
- Found: existing `EmergencyPublicMap`, `EmergencyRoutePage` list/feed and product PWA/cache patterns (verify exact cache owner before changing it).
- Decision: reuse existing page/list and PWA owner; diverge only to add a dedicated text narrative for spatial equivalence because a map canvas alone cannot express the same facts nonvisually.

### Surface Inventory
| Surface | File/route | Change |
|---|---|---|
| Emergency map | `EmergencyPublicMap.tsx` | Offline/low-bandwidth state and accessible summary controls |
| Existing list/feed | `EmergencyRoutePage.tsx` and feed components | Keep critical items available without map |
| PWA/offline layer | existing service-worker/cache owner to identify | Add rights-aware manifest, data-through marker and bounded resume |

### Component Map
| Component | File | Owns | Consumes |
|---|---|---|---|
| Map accessibility summary | existing emergency map/page component | Focusable ordered equivalent to important in-viewport items | Authorized generalized geometry and severity/freshness |
| Offline package controller | established PWA owner (identify before creating) | Manifest/version/expiry/cache state | Approved region/layer package refs and rights |

### State Matrix
| State | Expected UI | Verification |
|---|---|---|
| loading | Shows saved package/data-through and loading state | Component test |
| empty | Explains no eligible items for current coverage; does not imply no event | Component test |
| error | Shows unavailable/stale layer and retry; retains already authorized list | Offline/error test |
| success | Shows current map/list with source/freshness | Browser |
| partial success | Shows layers that are offline-available vs omitted by rights | License fixture |
| disabled | Unsupported package action is disabled with reason | RTL |
| hover/focus/selected | All controls are keyboard reachable and selected state announced | A11y test |

### Responsive Matrix
| Viewport | Expected behavior | Evidence |
|---|---|---|
| mobile 390x844 | Text list first under low bandwidth; map controls reachable | Browser |
| tablet 768x1024 | Map and accessible list share predictable scroll/focus | Browser |
| desktop 1440x900 | Map/list alternatives visible without duplicating items | Browser |
| small-mobile 360x800 | No horizontal overflow; reachable emergency details | Browser |
| laptop 1024x768 | Dense controls stay in viewport or scroll safely | Browser |
| wide-desktop 1280x800 | Status and attribution do not cover critical data | Browser |

### Accessibility Acceptance
- Keyboard path: map/list toggle → critical item list → item details/action; map controls have semantic names and predictable focus.
- Focus visibility: visible focus survives online/offline state changes and panel transitions.
- Labels/semantics: live status announces only material connectivity changes; severity/freshness has text/icon beyond color; spatial narrative states distance, direction and approximation.
- Contrast: use established tokens and contrast policy.
- Reduced motion: no essential movement; respect reduced motion.

### Copy Contract
- Calm bilingual Thai/English; label “ข้อมูล ณ เวลา / Data through”; report unavailable/offline coverage separately; explain when a layer is omitted due to rights.
- Never present cached data as current or translate zero records into “no event.”
- Localize all status/control text through emergency translation namespaces.

### Browser Evidence Required
- At mobile/tablet/desktop, simulate offline/slow connection, reload saved package, expired/tampered package, forbidden Google cache and MapLibre failure; inspect screen-reader order, keyboard focus and data-through time.

## Completion evidence

Focused offline manifest/sync/accessibility tests pass; offline package refuses unlicensed content, remains bounded and tamper-safe; browser demonstrates critical map data/list remains usable with honest timestamp and nonvisual equivalent. Real device/browser/network testing is a final gate.
