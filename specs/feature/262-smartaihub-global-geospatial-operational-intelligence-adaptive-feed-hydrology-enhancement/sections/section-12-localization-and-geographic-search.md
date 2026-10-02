# Section 12 — Localization and geographic search

## Goal and dependencies

Deliver Thai/English UI whose language is independent of geography; preserve immutable source text and translation provenance; resolve multilingual aliases to stable canonical places. Reuse existing i18n and geo capability authorities. No second locale store, LLM-minted canonical names, or implication that locale equals jurisdiction. Depends on sections 02, 04–05, 11 and 16. Spec260 route, identity, disclosure and unfinished APIs remain canonical dependency gates.

## Tests first

- Extend apps/web/client/src/i18n/__tests__/localeParity.test.ts and localeFiles.test.ts: Thai (th) and English (en) parity for emergency map/feed/alerts/details/weather/hydrology/routes/services/reports/Chat/Task Control/notifications/share; missing keys use configured fallback and remain detectable.
- Add/extend EmergencyRoutePage localization RTL tests: locale switch preserves route, viewport, zoom, selected canonical area/incident, feed focus and current action; locale does not change geography or audience.
- Add packages/shared/src/geo/geoNames.test.ts: Thai/English aliases for Ayutthaya/พระนครศรีอยุธยา, Pasak Jolasid Dam/เขื่อนป่าสักชลสิทธิ์ and Suvarnabhumi Airport/ท่าอากาศยานสุวรรณภูมิ resolve to stable canonical IDs; Unicode/Thai spacing/case normalization, bounded query, ambiguous candidates, unknown locale and jurisdiction/type hints.
- Add apps/web/server/services/__tests__/geographicSearchService.test.ts: authorization, query/result bounds, capability/coverage/rights gating, canonical reference preservation, provenance, partial/unavailable result states, fixture-only upstream.
- Test LocalizedContent validation: immutable original reference, target translation text reference, OFFICIAL/REVIEWED/MACHINE method, timestamp and optional translator/model reference; machine text never silently alters numbers, emergency numbers, addresses, units or named entities.
- UI tests cover keyboard, screen-reader labels, loading/empty/ambiguous/partial/unavailable and locale switch preserving selection.

## Existing owners and implementation

- Existing i18n owner: apps/web/client/src/i18n/{index,config,namespaces,loader,languageDetector,useScopedTranslation,useLanguageSync}. Reuse current displayLocale/user preference behavior and supported-language types.
- Existing translation API: apps/web/server/routers/translation.ts. Reuse its provider authorization/quota; do not translate in map render path.
- Existing public map: apps/web/client/src/pages/EmergencyRoutePage.tsx and components/emergency/EmergencyPublicMap.tsx. Preserve route/selection/query state; route authority remains packages/shared/src/emergencyRouteManifest.ts.
- Existing geo provider/capability owners: packages/shared/src/geo/{capabilityResolver,providerResolver}. Search current dirty changes and types before adding packages/shared/src/geo/geoNames.ts or apps/web/server/services/geographicSearchService.ts.
- If durable aliases/localized names are required, use the canonical place/source authority and additive migration only when current config/entities cannot represent it; schema and journal integration is conductor-owned. Provider names are untrusted versioned evidence, not identity.

Implementation steps:
1. Resolve locale through existing i18n. Public emergency routes work logged out. Keep UI locale, jurisdiction, timezone, units, emergency-number policy and source language separate.
2. Validate LocalizedContent; original evidence is never overwritten. Material machine translations are visibly marked and original is viewable only where authorized.
3. Canonical GeoName has stable canonicalId/name, localized names and locale aliases. Matching may suggest new aliases for review but cannot mint or overwrite canonical identity. Ambiguity returns candidates, never silent first match.
4. Geographic search uses existing geo.places.search capability; bound query/results/timeouts and resolve coverage, source rights and audience on server. Return canonical refs, attribution/freshness and explicit partial/unavailable status. Locale changes never trigger geocoding.
5. Localize existing map/feed/service/report surfaces and retain map state. Emergency numbers and units derive from jurisdiction policy, never UI locale.
6. Test provider adapters with fixtures; no live API dependency in CI. Do not persist raw viewport search history by default.

## Authorization and safety

Public output is a public-safe canonical projection. Signed-in/operations output derives from principal, tenant and purpose server-side. Locale, alias and requestedMapMode cannot elevate access. Reauthorize refs before details, Chat context or actions. Do not log precise viewport histories or build permanent anonymous location profiles. Preserve license/source provenance. Region policy carries authority classes, emergency numbers, timezone, unit, residency, transfer, redistribution, retention and disclaimers; support future RTL.

## UI/UX Contract

### Target User / JTBD
Residents/responders switch interface language or search a familiar place name and need the same canonical place, map state and safety facts. Success is alias resolution or clear disambiguation with source and coverage context.

### Existing Pattern Reference
Reuse current public language switch, i18n hooks/namespaces, map search/toolbar and result list. Inspect component/design conventions before UI changes; no new page frame or locale store.

### Surface Inventory
| Surface | Owner | Requirement |
|---|---|---|
| Public /disaster/map | EmergencyRoutePage, EmergencyPublicMap | Locale switch and localized map/feed without resetting state. |
| Place search | Existing map search + bounded service | Alias matching, jurisdiction/type, disambiguation and coverage state. |
| Feed/details/services | Existing Spec260 components/namespaces | Localized labels/time/units and source/translation affordance. |
| Chat | Existing FeedbackButton/ChatView | Reuse panel and localized context; no new Chat. |

### Component Map
Page owns route/map state; i18n hook owns locale; search UI owns query/focus; shared geo-name contract owns normalization; server service owns access/provider/coverage; translation router owns translation policy.

### State Matrix
| State | Expected UI |
|---|---|
| loading | Localized progress; preserve map and selection. |
| empty | No matching place in configured coverage; never imply no incident. |
| error | Recoverable search/provider error; map/list remain usable. |
| success | Canonical name, jurisdiction/type, source and freshness. |
| partial success | Label limited coverage; only show authorized results. |
| disabled | Explain search unavailable for region; no fabricated data. |
| selected | Canonical selection persists across locale switch. |
| hover | No essential action is hover-only. |
| focus | Visible focus among query, results, locale and clear actions. |

### Responsive Matrix
| Viewport | Expected behavior |
|---|---|
| 390x844 | Results wrap; keyboard does not cover controls. |
| 768x1024 | Map and candidate list remain usable. |
| 1440x900 | Search and source-language details fit. |
| 360x800 | No horizontal overflow; touch targets usable. |
| 1024x768 | Results scroll predictably; emergency status visible. |
| 1280x800 | Controls remain consistently placed. |

### Accessibility Acceptance
Keyboard search/selection; stable focus on locale change; semantic labels announce candidates, ambiguity, loading and translation method; no color-only state; screen-reader names include place and jurisdiction; honor reduced motion.

### Copy Contract
Use Thai/English namespaces. Distinguish source original, official/reviewed and machine translation. Clearly state source jurisdiction and coverage. Never silently alter addresses, emergency numbers, units, named entities or numeric thresholds.

### Browser Evidence Required
At 390x844, 768x1024 and 1440x900; add 360x800, 1024x768, 1280x800 when risky. Verify anonymous TH/EN switch preserves route/viewport/zoom/selection/feed focus; alias and ambiguous search; original/translation control; keyboard/AT; partial/unavailable coverage; no overflow/console errors.

## Completion evidence and gates

Focused shared, locale parity, service and UI tests plus local browser evidence and reviewed alias fixtures. Region registry records actual source authority, rights and locale coverage. Provider credentials/terms and reviewed life-safety terminology remain external onboarding gates, not assumed passes.

