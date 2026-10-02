# Section 05 — Feed Semantics, Material Change and Weather

**Dependencies:** Section 04 (stabilized focus and bounded feed projection), Section 06 (registered source adapters, rights, canonical acquisition and durable jobs), and Section 07 where hydrology observations/time series supply trend facts. **Owner:** conductor for shared enums/contracts and any schema migration; ranking/weather logic may be implemented independently after the canonical contracts are frozen. **Status:** planned.

## Outcome

The adaptive feed explains why an item matters and whether it is an observation, official warning, forecast, derived risk or AI explanation. It ranks by safety and focus relevance, consolidates repeated observations into a stable event thread, and presents weather changes without repetitive or misleading cards. It consumes authorized canonical evidence and coverage; it does not claim provider access, issue official warnings, create a second source/event authority or run acquisition from a request handler.

## Existing and planned code ownership

- Shared contracts: extend the canonical aliases discovered under `packages/shared/src/emergency/` and route contracts in `packages/shared/src/emergencyRouteManifest.ts`. Preserve Spec260 ownership of identity, source/claim verification, public disclosure and freshness semantics. Proposed new focused modules are `packages/shared/src/emergency/feedSemantics.ts` and tests `feedSemantics.test.ts`; use actual repository conventions and avoid parallel enums if canonical aliases already exist.
- Server projection/ranking: create focused `apps/web/server/services/emergencyFeedService.ts` and tests in `apps/web/server/services/__tests__/emergencyFeedService.test.ts`. Wire only through the route contract owned by Section 04 in `apps/web/server/routes/spec260EmergencyEdge.ts`; do not duplicate that section's viewport validation or route manifest decisions.
- Durable thread/revision policy: inspect `apps/web/drizzle/schema.ts`, current Spec260 event/claim/source relations and migration journal before adding persistence. If stable thread/revision/material-change/delivery-decision records are not already represented, propose a single additive schema/migration/journal change to the conductor for serial ownership. Reuse canonical domain refs and outbox/`worker_jobs` for asynchronous recompute; never write a second queue or create event identity parallel to Spec260.
- Weather adapters are implemented/registered in Section 06 ownership, not in the feed query. This section consumes normalized canonical weather observations/forecasts and their provider coverage state. Proposed policy service: `apps/web/server/services/emergencyWeatherFeedService.ts`, sharing ranking/material-change primitives rather than making outbound provider calls.
- Existing UI integration remains in `apps/web/client/src/pages/EmergencyRoutePage.tsx` and new focused child components under `apps/web/client/src/components/emergency/` (for example `EmergencySituationDigest.tsx`, `EmergencyFeedList.tsx`, `EmergencyFeedItem.tsx`). Feed presentation must reuse the accessible map/list shell and route patterns in the current page; Ask AI actions open the existing AI Chat & Feedback panel, never a new Chat surface.
- Localization: `apps/web/client/src/locales/th/emergency.json` and `apps/web/client/src/locales/en/emergency.json`. Tests: `apps/web/client/src/components/emergency/__tests__/EmergencySituationDigest.test.tsx`, `EmergencyFeedItem.test.tsx`, and page/Chat integration tests placed according to current suite conventions.

## Normative feed contracts

The feed projection uses `SituationFeedItem` and canonical references. Its minimum semantic shape is:

```ts
interface SituationFeedItem {
  feedItemId: string;
  canonicalRefs: CanonicalDomainRef[];
  cardType: FeedCardType;
  lane: FeedLane;
  sourceRefs: SourceRef[];
  verificationState: VerificationState;
  freshnessState: FreshnessState;
  factClass: "OBSERVATION" | "FORECAST" | "OFFICIAL_ALERT" | "DERIVED_RISK" | "AI_EXPLANATION";
  spatialRelation: "IN_VIEWPORT" | "AFFECTS_VIEWPORT" | "CRITICAL_OVERRIDE";
  relevanceReasons: FeedRelevanceReason[];
  observedAt?: string;
  publishedAt?: string;
  effectiveTime?: TimeWindow;
  geometryRef?: CanonicalGeometryRef;
  threadRef?: CanonicalDomainRef;
  availableActions: CapabilityActionRef[];
}
```

Use canonical Spec260/platform types for domain/source/verification/freshness/geometry refs where they exist. Do not treat a stable ID as authorization. Enrich a candidate only after re-resolving its refs in the requesting audience, tenant and purpose scope. The projection must retain per-source provenance, timestamps, uncertainty and coverage state; an opaque combined confidence score is insufficient.

### Ranking and digest

Implement a deterministic, versioned ranking policy using these ordered concerns: safety priority; official authority/verification and source quality; spatial relation and impact relevance; materiality; freshness; operational relevance/user intent; then duplication, staleness and cognitive-load penalties. Sponsorship/payment cannot increase life-safety rank or alter availability truth. A critical authorized warning cannot be suppressed by sponsored content, popularity, freshness ties or digest truncation. Record policy version and reason codes so a result can be replayed and explained.

Provide two linked views:

- **Situation Digest:** concise, configurable 5–10 item summary counts/categories (for example critical changes, rising-water locations, road closures and weather time window), reflecting current focus coverage and refresh time. It is a summary of included authorized items, not an independent source of truth.
- **Full Feed:** bounded continuous ranked cards with pagination/delta updates. Aggregation and duplicate suppression vary with the zoom/focus class from Section 04. Do not create one card for every sensor sample or every syndicated copy.

Ranking must be stable for equal inputs and deterministic across Linux and Cloudflare ingress. New data must not unexpectedly reorder the user's current scroll position; surface a “new items” affordance or update the stable thread in place. Store/replay a policy version and decision reasons for operationally meaningful output.

### Threading, updates and digest lanes

Group material updates under a stable canonical thread (`FeedThread`, revision and material-change/delivery-decision semantics) tied to canonical event/domain refs. Apply update-in-place for ordinary observations; preserve revision history and source evidence. A newly critical threshold crossing may preempt the summary while retaining the same event lineage. Do not let syndicated duplicates multiply priority. Corrections, cancellations, retractions, source-rights expiry, provider backfill and stale transitions must update/invalidate projections deterministically without rewriting original captured evidence.

Support the temporal slots `NOW`, `NEXT_1H`, `NEXT_3H`, `THIS_AFTERNOON`, `THIS_EVENING`, `TONIGHT`, `TOMORROW`, and `LATER`. A scheduled weather brief is user-configurable; default behavior is material-change-driven. Avoid duplicate `TONIGHT` and `THIS_EVENING` items when nothing material changed. Historical backfill cannot appear as a new current emergency just because it was ingested recently.

### Weather/fact semantics

Consume normalized current conditions, hourly outlook, daily/evening/night/tomorrow brief, material forecast changes, and severe official alerts only when the configured source/region has proven coverage and rights. Section 06 owns provider adapters for Google Weather API, national meteorological feeds, WeatherNext-class products and other future sources. WeatherNext-class access is not assumed to be the consumer Weather API and remains capability-gated until supported access and terms are verified. No API credentials, provider requests or raw provider payloads may be exposed to the browser.

Every card has a visible fact-class label and localized source/freshness/explanation. Forecast is never presented as an official warning; observed current conditions are not a forecast; derived risk is labeled with its input/model uncertainty; AI explanation is not evidence or authority. Retain `observed_at`, `published_at`, `fetched_at`/`received_at`, `generated_at`, `valid_from`/`valid_until` and `forecast_for` where applicable. Newly fetched old data remains old. Expired forecast validity, stale observation, provider outage, conflicting authorities, unsupported geography and missing coverage each have distinct state/copy.

Weather materiality policy may open/update one thread for significant change (e.g. threshold crossing or materially changed forecast window), severe warning, coverage loss/recovery or authority correction. Repeated unchanged refreshes must not create a new card. Do not fabricate rainfall, route impact, warning or “no hazard” from a missing provider response. Forecast/derived actions require an explicit capability and freshness/model gate; no automatic operational action based only on a ranked card.

## UI/UX Contract

- Integrate digest and feed into the existing EmergencyRoutePage map experience and map/list surface; preserve viewport, selected feature, route state and scroll on refresh. The public page stays usable if the map renderer/provider is unavailable; a feed failure must not remove the map.
- Use a clear hierarchy: safety-critical official warning first; digest counts/time range; feed card title; fact class + severity/relevance; area/effective window; freshness/source/verification; uncertainty/coverage; then permitted actions. Severity and fact class cannot rely on color alone.
- Cards update in place with a concise revision summary and expandable source/time details. Show why an outside-viewport item is relevant (“upstream impact”, “approaching weather”, “alert scope intersects area”), and do not imply guaranteed downstream flooding from structural connectivity alone.
- Every empty state names data coverage and focus (“No matching items in available coverage for this area”), not “safe/no incidents.” Partial, stale, unavailable, conflicting and truncated states are distinct and actionable where safe.
- Layout targets 390x844, 768x1024 and 1440x900, with risk checks at 360x800, 1024x768 and 1280x800. Mobile prioritizes a compact digest and scrollable list; controls must not cover map zoom/location controls. Desktop may show map plus feed without turning each dense row into nested cards. Preserve compact high-stress readability and existing SmartAIHub visual tokens.
- Keyboard users can traverse filters, card actions, expansion and map/list focus in a predictable order. Announce material updates with a restrained semantic live region; do not announce every sample. Include a nonvisual text equivalent for spatial relation and source/freshness. Respect reduced motion and Thai/English parity.
- Ask AI opens the existing **AI Chat & Feedback** panel on AI Chat and attaches only the selected feed item's authorized canonical refs plus bounded focus context. It preserves the current chat/session and selections, is removable, and sends nothing until the user submits. Task Control and Send Feedback remain their existing tabs and authorities.

## Tests first

1. **Ranking contract tests:** deterministic ordering for fixed inputs; life-safety alert cannot be demoted by sponsorship; relevance tie-breaks; materiality and user-intent reasons; duplicate/syndicated suppression; stale penalty; digest budget; stable pagination/order; policy-version replay.
2. **Thread/material-change tests:** repeated unchanged samples update no new thread/card; threshold crossing updates one stable thread; critical escalation preempts digest; historical backfill does not look new; correction/retraction/cancellation updates dependent cards; stable idempotency under duplicate ingestion; authority conflict remains explicit.
3. **Fact/time/freshness tests:** observation vs forecast vs official alert vs derived risk vs AI explanation label mapping; newly fetched old observation stays old; expired validity and missing timestamps become unknown/stale; severity never inferred from unsupported facts; unknown/partial coverage cannot become “no events”; freshness gate denies unsafe action.
4. **Weather policy tests:** provider coverage/rights/capability gates; hourly/daily/evening window classification; no repeat card for unchanged forecast; changed forecast updates thread; duplicate evening/tonight slots coalesce; warning and forecast stay separate; provider outage/schema drift yields partial/unavailable coverage rather than fabricated values; unsupported WeatherNext access remains disabled.
5. **Security/projection tests:** public vs authenticated/operations projection separation; no private geometry, reporter/responder location, unreviewed claim or raw provider secret leaks; reauthorization of canonical refs/actions; cursor/policy revision binding; tenant/federation boundaries; do not trust client audience/fact class/freshness/rank.
6. **UI and Chat tests:** bilingual classes/source/freshness/coverage text; accessible digest/card hierarchy; update-in-place without scroll jump; mobile and desktop responsive states; map offline leaves text feed; feed offline leaves map; Ask AI reuses the AI Chat & Feedback panel without auto-submit or duplicate thread; Task Control/Feedback remain intact.
7. **Durability tests if storage is needed:** migration journal parity, tenant/RLS access, thread revision immutability, idempotent outbox enqueue, lease/fencing, retry/cancel/replay and rebuild from canonical source evidence. Keep migration tests conductor-owned.

## Implementation sequence

1. Inspect existing shared aliases, Spec260 event/source/capture/claim schema, event hashes, freshness rules, review states and dirty diffs. Freeze `factClass`, card/lane/reason and thread reference types with Sections 02/04/06/07; do not create duplicate enums or event identities.
2. Write pure ranking, digest grouping, material-change comparison, fact-class and freshness projection tests. Implement the deterministic versioned policy and reason codes in the shared/service layer. Keep source collection outside this code path.
3. Implement feed service projection over authorized canonical refs. Ensure query limits and policy filter happen after mandatory authorization/eligibility, and avoid unbounded LLM calls or whole-history scans. Bind cursors/projection to audience, focus, filters and policy version.
4. Add or extend persistence only where needed for durable thread revision, material-change and delivery decision semantics. The conductor owns Drizzle schema, a single additive migration and migration journal. Preserve canonical evidence immutability; document rebuild/backfill, retention and rollback. All long-running recompute enters `worker_jobs` plus transactional outbox with idempotency and fencing.
5. Implement weather feed policy over Section 06 canonical observations/forecasts; provider integrations are not called from React or synchronous page render. Keep unsupported regions/providers as explicit gaps.
6. Integrate digest/cards/locales into the existing page. Build card actions from server-issued capability refs and reauthorize when invoked. Wire Ask AI through the shared AI Chat & Feedback bridge; no separate chat route/session/task flow.
7. Run focused shared/server/UI/migration tests and build assets. Capture local browser evidence for official warning vs forecast, material change thread update, stale/partial/outage states, digest behavior, focus relevance, accessibility and responsive layout. Compare the same deterministic fixtures through Linux and Cloudflare ingress contracts.

## Safety, privacy and operational controls

- Policy inputs and output are versioned/auditable; preserve source claim/review status and do not elevate unreviewed news/community content into official warning.
- Freshness is data-class/use-case-specific. A card may remain visible as stale for situational awareness, but unsafe actions are disabled/denied under the canonical freshness gate.
- Source rights, attribution, quota, authority, correction and retention come from provider/source registry contracts. Rights expiry removes the affected display/action capability while preserving lawful evidence according to retention policy.
- No feed ranking, digest, weather service or Chat handoff bypasses tenant/jurisdiction authorization, geometry disclosure, federation grants, exercise isolation or Spec260 audit controls.
- New records are source-backed projections, never a replacement source of truth. Zero items means only zero eligible results in known coverage, never the absence of incidents.

## Exit evidence and gates

Complete when the local deterministic suite proves ranking, digest, threading, weather facts/freshness, stale action denial, coverage truth, projection privacy, UI/Chat reuse and resilience/degraded states; focused builds and browser evidence show results without map/feed coupling failures. Any real provider access, production API terms/quotas, calibrated forecast validation, production migration and Cloudflare deployment remain external gates; mark them explicitly with owner/reason and do not infer PASS from fixtures, billing setup, or an API-key connectivity test.


### Target User / JTBD
People tracking an emergency need a stable, ranked, time-aware digest that explains why each item matters and whether it is an observation, forecast, official alert or derived estimate.

### Surface Inventory
Existing emergency map/list digest and cards, item detail/authorized actions, and existing AI Chat & Feedback handoff.

### Component Map
Reuse the Section 04 feed surfaces and canonical Chat bridge. Ranking/thread services provide reason-coded projections; UI does not invent authority, severity, freshness or relevance.

### State Matrix
Current, revised, stale, expired, conflicting, partial coverage, provider unavailable, empty-with-coverage and loading states are distinct; preserve source and effective times.

### Responsive Matrix
Meet 390x844, 768x1024, 1440x900; compact high-stress reading on mobile and map/feed coexistence on desktop without nested-card density.

### Accessibility Acceptance
Keyboard-accessible card expansion/actions; semantic fact class and severity text; restrained live updates; source/freshness text equivalent; Thai/English parity and reduced motion.

### Copy Contract
Clearly label observed, forecast, official warning, derived risk and AI explanation. Missing or old data never becomes a current warning or “no hazard.”

### Browser Evidence Required
Prove official warning precedence, stable in-place revision, unchanged-sample dedupe, stale/partial/outage display, authorized Chat context with no auto-send, and mobile/desktop layout.
