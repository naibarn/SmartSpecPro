# Spec 262 implementation gap review

Date: 2026-10-01 (Asia/Bangkok)

This is a repository-local review record. A passing helper test is not evidence of end-to-end, provider, browser, migration-application, or production behavior. Production Cloudflare/provider verification remains reserved for the final stage as requested.

## Review loop 1 — public place-search ingress

- Evidence: canonical route manifest exposes `public.geo.places.search`; platform edge delegates to the bounded local catalog; endpoint is no-store and tenant/IP rate limited.
- Finding/fix: malformed and repeated optional query parameters could be silently ignored. The route now rejects non-string values with 400; invalid `limit` is rejected rather than defaulted.
- Verification: geographic-search service and route-manifest focused tests passed; covered again in web suite (94 tests).
- State: CLOSED locally. Route behavior behind deployed ingress still awaits final environment verification.

## Review loop 2 — map place-search UI truthfulness

- Evidence: map page mounts `EmergencyPublicSearch`; results are canonical names/jurisdictions and expose no coordinates.
- Finding/fix: users needed a direct discoverable control. Added a localized Thai/English place-search form using Astryx TextInput/Button and an explicit limited-coverage/no-map-pan explanation. Clears stale results on new input/request.
- Verification: UI tests cover successful request path and unavailable state; production build contains `EmergencyPublicSearch` in the generated public map bundle.
- State: CLOSED for supported curated search. Full geocoding, coordinates, and map centering remain unimplemented pending an approved complete gazetteer/provider.

## Review loop 3 — Cloudflare route ownership

- Evidence: Cloudflare proxy enumerates the shared Spec260 route manifest rather than maintaining a separate endpoint list.
- Finding/fix: no per-endpoint Worker executor needed; keep request transport on the canonical platform service.
- Verification: Cloudflare route-manifest/proxy tests passed (50/50); shared route manifest test included in suite.
- State: CLOSED locally; no live tunnel/Cloudflare assertion made.

## Review loop 4 — source acquisition network boundary

- Evidence: transport resolves every initial/redirect host, pins HTTPS lookup to vetted addresses, manually revalidates redirects, caps body and decompression, and does not accept caller headers.
- Finding/fix: malformed non-IP resolver values could pass address classification and fail only at socket connect; IPv4-mapped, NAT64, 6to4, and special/documentation ranges also needed explicit rejection. Resolver now rejects malformed and translation/tunneling addresses. Updated fixtures to use routable public IPs rather than documentation-only ranges and valid timeout/size budgets.
- Verification: latest source policy, transport and registry tests pass (18/18).
- State: CLOSED for local transport tests. Live DNS/TLS/provider tests are deferred to final gate.

## Review loop 5 — source adapter approval registry

- Evidence: Section 06 registry tests imported a missing implementation file.
- Finding/fix: added an allowlisted registry that checks adapter identity, fetch policy, owner/revision/rights/license/attribution/retention, purpose, geography, and optional capability; rejects URL credentials and secret-bearing query parameters.
- Verification: registry tests cover success and deny cases, including stale/revoked policy, unknown source, forbidden scope, endpoint mismatch, duplicate adapter and secret query.
- State: CLOSED as an in-memory contract. It is not yet connected to persisted Spec260 source review records or acquisition jobs.

## Review loop 6 — ambiguous hydro topology identity

- Evidence: hydro graph test demonstrated duplicate source node IDs returned traversable impact relations by selecting the first node.
- Finding/fix: duplicate IDs are now excluded; a duplicated requested source returns `UNKNOWN` with no relations and `DUPLICATE_NODE_ID`.
- Verification: hydro graph tests pass (7/7); shared geospatial suite passes (34/34).
- State: CLOSED locally. No approved production topology pack is present.

## Review loop 7 — hydrology domain contract depth

- Evidence: Section 07 schema/migration existed but canonical shared reading, unit and trend contracts did not.
- Finding/fix: added strict measured/missing observation parsing with separate event/receive/normalize times, exact explicit unit conversions with vertical-datum requirement, and deterministic observation-only window trends that return UNKNOWN for insufficient, stale, future-only or incomparable samples.
- Verification: new hydrology contract/unit/trend tests pass (7/7); overall shared geospatial tests pass (14/14 including graph).
- State: PARTIAL. Database ingestion, immutable capture linkage, source/capture tenant validation, lease fencing, event-time queries and material-change job/outbox remain implementation work.

## Review loop 8 — migrations and retention authority

- Evidence: additive migrations `0378_spec262_hydrology_observation_series.sql` and `0379_spec262_geospatial_watches.sql` are journaled and schema-parity tests pass in the 94-test Web run.
- Finding/fix: no destructive migration was needed in this pass; neither migration was applied to any live database.
- Verification: focused hydrology/watch migration tests passed as part of the Web suite.
- State: CLOSED for local migration shape only. Apply/rollback and data checks remain in final environment gate.

## Review loop 9 — watch lifecycle and delivery

- Evidence: owner/tenant-scoped watch CRUD routes, idempotency receipts, shared bounded parser, and transition evaluator exist.
- Finding: there is no event-driven evaluator joining verified incidents/current hydrology to watches, nor transactional canonical job/outbox delivery with pre-send reauthorization and notification dedupe.
- Action: no delivery workaround was added because direct notification after receipt would lose events on process failure and falsely imply durable guarantees. The correct implementation must reuse the canonical executor/outbox and notification service.
- State: OPEN implementation gap; blocks claiming Section 13 complete.

## Review loop 10 — full-system integration and operating surfaces

- Evidence: offline/privacy/model/provider operational helpers exist; the curated Thai list is intentionally labeled partial; all supported page/API routes share the Spec260 route manifest.
- Findings: source capture/acquisition jobs are not wired; offline cache/device sync, privacy query ledger/federation/retention integration, provider admin controls, approved calibrated model/replay, and cross-section browser acceptance are not end-to-end. Current map can render its basemap but has no complete live emergency overlays without approved published source/event data.
- Verification: latest focused Cloudflare tests 50/50, Web tests 94/94, shared geospatial/manifest tests 41/41; production Vite build completed in 40.74s with sourcemaps disabled for this bounded verification run. The public map JS chunk was ~1.07 MB; the main chunk ~2.89 MB (existing build warning threshold 2 MB).
- State: OPEN. These repository-local integrations must be implemented before Spec 262 can be marked complete; final real Cloudflare/provider/database verification remains a separate final-stage gate.

## Review loop 11 — canonical acquisition path and runtime ownership

- Evidence: read-only trace of `createCanonicalJobInTransaction`, `worker_job_outbox`, server `JobExecutorRegistry`, `POSTGRES_NODE_JOB_TYPES`, Cloudflare proxy composition, source/capture tables and hydrology tables.
- Finding: there is no geo acquisition executor or persistence path connected to those tables. Node-only pinned transport cannot execute inside a Cloudflare Worker, and adding a registry entry alone would not establish Cloudflare parity.
- Decision: keep acquisition on the platform's canonical job runtime; Cloudflare remains ingress/transport. Do not claim a provider job is usable until executor registration, durable capture/observation writes, lease fencing, and transport routing are connected and covered.
- State: OPEN implementation gap; this narrows GAP-3 and keeps it open.

## Review loop 12 — source approval usability

- Evidence: `operations.intel.source.create` creates pending sources with default empty `policyJson`; `operations.intel.source.review` changes lifecycle status but does not persist rights, license, attribution, retention, purpose, or configuration revision. The adapter registry correctly requires those fields before authorizing acquisition. Thailand provider candidates currently have null endpoints and unverified rights/schema/cadence.
- Finding: a source can be marked active for Spec260 evidence workflows, but cannot become an approved automated provider from the existing review API. This is a useful fail-closed boundary, while the missing Section 16 policy editor/review workflow remains a product integration gap.
- Decision: do not treat source status `active` or a registered canonical origin as fetch authority; do not invent licensing or adapter endpoints.
- State: OPEN implementation gap; requires the owned provider-admin workflow and evidence before a real source can activate.

## Review loop 13 — hydrology timestamp normalization

- Compared Section 07's canonical observation contract with the parser and direct regression cases.
- Finding/fix: legal UTC ISO instants with one or two fractional digits were accepted by the lexical contract but rejected by the Date serialization equality check. Normalize accepted precision to three digits and retain rejection of invalid calendar dates.
- Verification: `hydrologyContracts.test.ts` passes with `.1Z` and `.12Z` canonicalized to `.100Z` and `.120Z`.
- State: CLOSED locally.

## Review loop 14 — hydrology trend enum reachability

- Compared the Section 07 advertised trend states against all executable branches and policy validation.
- Finding/fix: slight rise/fall states were declared but unreachable. Added an explicit, strictly ordered `slightDelta` threshold and tests for slight, sustained, and rapid trends in both directions.
- Verification: `hydrologyTrend.test.ts` passes; all production references to `HydroTrendPolicy` were searched and the only policy fixture was updated.
- State: CLOSED locally.

## Review loop 15 — same-scope capability source visibility

- Compared Section 06 source health and Section 08 capability resolution with the resolver's same-scope selection behavior.
- Finding/fix: lexically first manifest alone determined the answer, so a degraded source could hide a healthy sibling and callers could not inspect the other source statuses. Resolver now evaluates every version-compatible source at the selected scope, returns stable per-source status evidence, and chooses a deterministic best status representative.
- Verification: regression checks both selected healthy source and full, sorted source-status list; `geographicCapabilities.test.ts` passes.
- State: CLOSED locally; this remains a static contract and is not connected to live provider health ingestion.

## Review loop 16 — selected map feature to existing Chat

- Compared Section 12 map context handoff with the public map selection flow and existing AI Chat event listener.
- Finding: clicking a map item only pans/zooms; `askAI` always supplies `selectedFeatures: []`. A public opaque reference has no verified type/revision, so fabricating a canonical selected reference would violate the contract.
- Action: the next-turn bounded map summary is now kept separate from the Chat draft, shown for review, attached only when the user sends, and removed on send/remove/panel close. Canonical selected references/revision resolution remain unavailable.
- State: PARTIAL; the draft-preservation/removal lifecycle is closed locally, but selected canonical map/feed references still await the public projection contract.

## Review loop 17 — map command response path

- Compared Section 12 command lifecycle against `parseEmergencyMapCommand` callers and app-level Chat/task integration.
- Finding: commands are locally validated for map layer/focus operations, but there is no response bridge from Chat/skills to the active map that validates map revision and returns an applied/rejected result.
- Action: retain local command guard; do not create an unowned global command channel without a canonical action executor and user confirmation semantics.
- State: OPEN integration gap.

## Review loop 18 — canonical situation feed projection

- Compared Section 09 feed ranking/digest helpers with public route producers and database-backed read models.
- Finding: shared code can rank candidate feed items, but no canonical `SituationFeedItem` projection is produced end-to-end from verified emergency records with provenance and revision-aware freshness.
- Action: recorded as a producer/read-model gap; helper-only tests cannot satisfy feed acceptance.
- State: OPEN integration gap.

## Review loop 19 — weather and environmental capability delivery

- Compared Section 10 capabilities and Section 11 weather brief requirements against provider registries, ingestion executors, and public map layers.
- Finding: the map only renders current situation/facility/alert feeds. No approved weather provider, ingestion-to-capture path, weather brief producer, or live weather layer was found; candidate endpoint, rights, and cadence evidence remain absent.
- Action: do not synthesize weather data or enable an unapproved external source. Keep capability unavailable until an approved source and canonical ingestion path exist.
- State: OPEN provider/data dependency.

## Review loop 20 — refresh job and immutable capture path

- Compared Sections 06–08 refresh, capture, observation, and fencing requirements with canonical worker-job/outbox registration.
- Finding: no `geo.source.refresh` job executor/admission flow persists captures and hydrology observations under a lease fence. Existing transport/registry contracts do not constitute a durable acquisition pipeline.
- Action: retained the canonical `worker_jobs` plus outbox boundary; no direct request-time provider fetch or parallel queue was added.
- State: OPEN blocking implementation gap.

## Review loop 21 — durable watch evaluation and notification

- Compared Section 13 watch CRUD and pure transition evaluation with canonical event evaluation, durable delivery, deduplication, and pre-send reauthorization.
- Finding: CRUD and transition helpers exist, but no event-driven evaluator/outbox executor joins verified incidents or hydrology observations to watches and durable notification delivery.
- Action: keep watches as configuration only; do not represent them as active alert subscriptions.
- State: OPEN blocking implementation gap.

## Review loop 22 — privacy, offline, administration, and governance integration

- Compared Sections 14–18 policy helpers with caller paths, persistent ledgers, service worker/device sync, provider admin, and approval/replay records.
- Finding: privacy query budgets are caller-fed rather than backed by a durable privacy ledger; offline contracts are not wired to signed cache bytes/device synchronization; provider policy approval UI and kill-switch/cost/lag controls are absent; model/governance helpers have no approved replay/recovery artifacts.
- Action: preserve fail-closed helpers and explicitly keep these end-to-end acceptances open; no mock persistence or permission widening added.
- State: OPEN. These sections cannot be called complete based on contract helpers alone.

## Review loop 23 — capability freshness evidence validity

- Compared Section 08 freshness semantics against edge cases in capability resolution.
- Finding/fix: a non-finite `maxAgeMs` or future `observedAt` could previously pass freshness checks because JavaScript comparisons with `NaN` are false and future timestamps produced a negative age. Reject both as unknown freshness evidence.
- Verification: `geographicCapabilities.test.ts` covers `NaN` age and future observation timestamps; focused shared geospatial tests pass.
- State: CLOSED locally.

## Review loop 24 — R1.8.2 composer draft and one-turn context

- Compared acceptance tests 501–504 and 512 with `FeedbackButton`, `ChatView`, and `MapContextDraft` data flow.
- Finding/fix: map context was injected through `composerPrompt`, replacing an existing composer draft; removing the context also cleared the whole input. Context was reset after send but not on every close path.
- Fix: store the bounded summary as a separate one-turn attachment, display it before send, append it only to an authored message, preserve the draft on attach/remove, and clear it on send, panel close, or navigation. No context-only message is produced for an empty composer.
- Verification: red then green FeedbackButton draft-preservation test; Chat and map-context focused tests pass (19/19 across 4 files).
- State: CLOSED locally for summary context; selected canonical feature refs remain open in loop 16.

## Review loop 25 — R1.8.2 panel tab state retention

- Compared acceptance tests 504–506 with the existing three-tab AI Chat & Feedback panel.
- Finding/fix: selecting Task Control or Send Feedback conditionally unmounted `ChatView`, discarding state held by the composer. Keep the Chat view mounted and hide its section while another tab is active.
- Verification: the same FeedbackButton regression test enters draft text, switches to Task Control, returns, and observes the exact draft preserved.
- State: CLOSED locally for tab switching. Closing the outer dialog follows its normal lifecycle; the one-turn map context is intentionally cleared then.

## Review loop 26 — R1.8.2 shared route authority

- Compared acceptance test 510 with Spec260 route IDs, public `/disaster/map` path, and Cloudflare proxy registration.
- Finding: this slice uses the shared route manifest and Cloudflare delegates to the canonical platform; no second public map route authority was found.
- Verification evidence remains the previously recorded route/proxy suite (50/50); no new path or registry added.
- State: CLOSED locally; deployed ingress behavior remains a final environment gate.

## Review loop 27 — Sections 04–05 viewport-adaptive feed delivery

- Compared the required stabilized viewport, focus lock, bounded cursor/projection, coverage metadata, and digest/full-feed UI against current route IDs and service callers.
- Finding: public map still loads the baseline situation/facility/alert lists; no viewport-adaptive feed endpoint/query projection or paired digest/feed UI exists. The map's current list is not proof of the adaptive feed acceptance.
- Action: keep this gap open; implementing a bounded spatial query requires coordinated shared route, server query/authorization, client state, and paging contract changes.
- State: OPEN cross-section implementation gap.

## Review loop 28 — Section 05 weather facts and material updates

- Compared forecast/observation/official-alert fact separation and material-change threading against feed producers and registered source adapters.
- Finding: deterministic feed helpers exist, but there is no canonical weather observation/forecast producer, approved weather feed, or persisted material-change thread/revision producer.
- Action: do not invent a source, forecast, or rights grant; keep cards unavailable until Section 06 approval/ingestion is integrated.
- State: OPEN source and producer gap.

## Review loop 29 — Sections 06–07 canonical ingestion and hydro persistence

- Compared refresh/capture/observation requirements with migrations `0378`/`0379`, the Node executor registry, and worker-job admission call sites.
- Finding: additive hydro station/observation tables and tenant-bound capture FKs exist, but no geo source refresh executor persists observations under canonical job leases/fencing; table shape alone does not satisfy time-series ingestion.
- Action: preserve the additive migrations and avoid request-time provider fetch or a parallel queue. The missing executor/outbox path is a must-fix implementation gap for completion.
- State: OPEN. Migrations have not been applied to a live database.

## Review loop 30 — Sections 08–11 network impact and source coverage

- Compared hydro graph/capability helpers with regional topology packs, route/corridor/exposure producers, and source health updates.
- Finding: graph traversal and capability resolution have focused contracts, but there is no approved topology pack or durable impact/corridor feed. New resolver regressions pass locally; no live health facts populate it.
- Action: keep the contract improvements, label capability from live integration unavailable, and do not infer downstream flooding from graph connectivity.
- State: PARTIAL contracts; OPEN data and product integration.

## Review loop 31 — Section 13 durable geospatial watch lifecycle

- Compared watch create/update/revoke, transition persistence schema, canonical event evaluation, notification outbox, and reauthorization.
- Finding: owner-scoped CRUD and transition table exist, but there is no event evaluator/delivery executor consuming verified emergency/hydrology changes and settling notifications through canonical durable execution.
- Action: keep watches as saved criteria only; do not present them as live subscriptions.
- State: OPEN canonical worker/notification integration gap.

## Review loop 32 — Sections 14–15 privacy and offline execution

- Compared privacy ledger/federation/retention and offline package byte/signature/device sync requirements with server/client call paths.
- Finding: privacy and offline modules validate contracts/manifests; there is no complete persisted privacy budget/federation ledger or signed byte cache, service-worker package lifecycle, field outbox, and multi-device conflict resolution.
- Action: retain validators and explicit rights restrictions (including no Google tile offline caching); do not claim operational offline mode.
- State: OPEN integration gap.

## Review loop 33 — Sections 16–18 governance and release evidence

- Compared provider policy editing/kill-switch/cost-lag controls, approved model/replay/recovery gates, and R1.8.5 integrated release criteria with actual UI, producers, and CI/browser evidence.
- Finding: helper contracts and prior focused suites do not provide the full provider-admin workflow, calibrated/replayable model deployment, 513 acceptance runs, integrated scenarios AQ–AR browser proof, or final Cloudflare/provider/database evidence.
- Action: retain these as completion gates and distinguish missing local implementation from explicitly final external verification.
- State: OPEN; Spec 262 remains incomplete.

## Review loop 34 — Section 01 MapLibre worker production artifact

- Compared the worker loading acceptance path with the production Vite output and the emitted EmergencyPublicMap chunk.
- Finding: the build emitted `maplibre-gl-worker-Ceb832pW.js`, and the emergency map chunk references it. The dedicated worker-asset checker passed against the build output.
- Verification: production Vite build completed to `/tmp/spec262-audit-20261001`; checker reported one emergency map chunk referencing the emitted worker. This proves asset emission/reference integrity only.
- Residual: no browser session proved deployed response URL/MIME, worker startup, map canvas, or overlay rendering. Cloudflare and browser acceptance remain final gates.
- State: CLOSED for local build artifact/reference criterion; OPEN for browser/runtime evidence.

## Review loop 35 — R1.8.4 anonymous Chat access boundary

- Compared Scenario AR with the actual `chat.createConversation` route and public AI Chat panel.
- Finding/fix: conversation creation is a protected procedure, but the shared panel attempted to create a conversation for users whose auth query returned no user. It showed an API error instead of the existing sign-in access flow.
- Fix: anonymous visitors get a localized sign-in gate; conversation creation waits for auth restoration and runs only for an authenticated user.
- Verification: anonymous panel test asserts no conversation mutation; authenticated panel test still creates through the existing mutation.
- State: CLOSED locally.

## Review loop 36 — Auth restoration race and guest fallback

- Compared initial/loading/authenticated/anonymous states so a pending session lookup cannot flash a guest gate or issue a protected mutation.
- Finding/fix: the panel now displays a concise loading state and creates the canonical conversation after an authenticated session resolves.
- Failure handling: effect-triggered mutation rejections are consumed so the existing mutation error/retry UI remains the visible recovery path instead of an unhandled promise rejection.
- Verification: regression test holds auth loading, asserts zero creation calls, then resolves to a user and observes exactly one canonical create call.
- State: CLOSED locally.

## Review loop 37 — Task Control exposure to anonymous visitors

- Compared R1.8.2 canonical Task Control ownership with the public panel tabs.
- Finding/fix: Task Control was visible to guests despite requiring the authenticated canonical control plane. Hide the tab for guests and guard the selector; authenticated users retain the existing tab and component.
- Verification: anonymous tab-visibility assertion and authenticated same-panel Task Control test pass.
- State: CLOSED locally.

## Review loop 38 — Public media generation shortcuts

- Compared the supplied panel image and public guest state with the Generate Image/Video/Audio quick-action strip.
- Finding/fix: generation shortcuts are available only inside authenticated `ChatView`; guests receive the access gate without mounting that workspace.
- Verification: guest regression test confirms ChatView and image/video actions are absent; existing authenticated Chat test still renders ChatView.
- State: CLOSED locally for guest UI exposure.

## Review loop 39 — Model/provider selection and runtime options

- Compared guest UI against model/provider picker, local/cloud runtime controls, and assistant/skill selectors in ChatView.
- Finding: these controls are part of the authenticated workspace and are not mounted for guests; this removes unneeded public choices without changing logged-in capabilities.
- Verification: guest gate replaces ChatView; authenticated behavior test continues to receive the same component/props.
- State: CLOSED locally for anonymous presentation; server auth remains the enforcement boundary.

## Review loop 40 — Attachment, library, voice, and slash-command options

- Compared the guest-facing composer against file uploads, library picker, microphone, hands-free voice, and slash skill controls.
- Finding: none are useful to an unauthenticated public visitor before Chat access; all remain unavailable behind the sign-in gate.
- Verification: the guest view exposes no Chat composer; the public feedback flow remains separate and available.
- State: CLOSED locally for anonymous presentation.

## Review loop 41 — Keep public Send Feedback usable

- Compared removal of advanced Chat tabs with the existing public feedback path.
- Finding/fix: trimming the guest panel must not remove its useful public feedback action. Keep AI Chat and Send Feedback as the two guest tabs; retain authenticated Task Control as the third tab.
- Verification: existing anonymous normal-feedback submission tests pass with the guest panel behavior.
- State: CLOSED locally.

## Review loop 42 — Anonymous map Ask AI context handling

- Compared R1.8.2/Scenario AR requirements with the emergency-map event listener.
- Finding/fix: never retain the event's context summary when no authenticated user is present or session restoration is pending. The guest sees the same sign-in gate and the public map remains independent.
- Verification: regression dispatches map Ask AI while anonymous and asserts no summary appears and no conversation mutation occurs.
- State: CLOSED locally.

## Review loop 43 — Preserve authenticated Chat and context behavior

- Compared R1.8.2 authenticated shared-panel behavior, existing conversation creation, removable one-turn context, and Task Control handoff after introducing the guest gate.
- Finding: gate is isolated to users without a resolved authenticated principal; existing authenticated component lifecycle remains intact.
- Verification: four focused frontend test files pass, including draft retention, map context removal, authenticated Task Control, and canonical Chat creation (21/21 total).
- State: CLOSED locally.

## Review loop 44 — Localization, responsive navigation, and accessible controls

- Compared new guest copy and two-tab guest navigation with TH/EN resources, existing dialog/tab semantics, and narrow-width layout.
- Finding/fix: guest gate copy is now in both locales; two tabs fit the existing responsive grid; sign-in remains a labeled button in the established OAuth flow; the anonymous panel uses a compact modal instead of the full-screen authenticated workspace frame.
- Verification: focused component tests pass and locale JSON is included in the repo's standard resources. No browser screenshot/device pass was run.
- State: PARTIAL; guest UI and localization checks are closed locally, browser visual/OAuth redirect acceptance remains outstanding.

## Review loop 45 — Section 13 antimeridian geometry

- Compared the bounded area-watch parser with the section's antimeridian rejection requirement.
- Finding/fix: a ring from longitude `179` to `-179` was accepted as a polygon spanning nearly the globe. Added a parser rejection for any adjacent longitude jump greater than 180 degrees; this stays fail-closed until dateline splitting is explicitly supported.
- Verification: added a regression test, observed it fail before the parser change, then passed the focused watch/route tests (4/4).
- State: CLOSED locally.

## Review loop 46 — Section 13 geometry bounds and expiry

- Compared polygon closure/vertex/ring bounds, coordinate limits, expiry limit, and notification choice bounds against the stored-watch contract.
- Finding: existing parser enforces closed rings, at most 500 positions, coordinate bounds, strict shape keys, a 366-day maximum lifetime, and bounded unique transition types. The new dateline case closes a distinct missing bound.
- Verification: shared parser tests and route-contract tests pass (4/4).
- State: CLOSED locally for parser bounds; geographic self-intersection validation remains a producer/geometry-engine concern and is not silently inferred.

## Review loop 47 — Section 13 owner-scoped CRUD

- Compared the route manifest and `spec260EmergencyEdge.ts` watch handlers with authenticated access, tenant/owner predicates, request limits, and revision conflict behavior.
- Finding: CRUD goes through Spec260's authenticated routes; reads and writes bind tenant and owner, require idempotency keys, rate-limit, and use optimistic revision checks. No duplicate route authority was added.
- State: CLOSED for local route wiring; database-backed route integration and live auth behavior remain unproven.

## Review loop 48 — Section 13 durable evaluation and delivery

- Compared `evaluateGeospatialWatchTransition`, transition receipt schema, and watch CRUD with the required event-triggered evaluator, pre-delivery reauthorization, and canonical notification outbox.
- Finding: pure transition intent and idempotency key plus receipt storage exist, but no evaluator consumes verified incident/hydrology events and delivers notifications through the canonical outbox.
- Action: retain the gap; do not label saved watches as live subscriptions or add a competing queue.
- State: OPEN blocking implementation gap.

## Review loop 49 — Section 06 bounded source transport

- Compared `geoSources/fetchPolicy.ts` and `fetch.ts` with HTTPS/allowlist/DNS pinning, redirect revalidation, private-address rejection, byte/time limits, and diagnostic redaction.
- Finding: fixture tests cover the source transport boundary and reject unsafe destinations, redirects, oversize responses, invalid policy and secret-bearing diagnostics.
- Verification: existing fetch policy/transport fixture suites are present; no live upstream was contacted.
- State: CLOSED for local transport contracts; runtime acquisition wiring remains open.

## Review loop 50 — Section 06 versioned normalization contract

- Compared `geoSources/contracts.ts` and `normalize.ts` with strict schema versioning, bounded records, CRS/time/unit validation, content hash, attribution and extension policy.
- Finding: deterministic contract and normalization helpers reject malformed records and caller-provided audience authority; helper coverage does not itself persist a capture.
- State: PARTIAL; persistence/lease integration is open.

## Review loop 51 — Section 06 approval and source registry

- Compared the registry's owner, rights, license, attribution, allowed-purpose, retention, geography and capability checks with Section 06's active approval policy.
- Finding: registry resolution fails closed against revisioned policy; Thailand definitions remain candidate-only with unverified endpoints, cadence and rights. No source can safely be enabled from current evidence.
- Action: preserve the no-network default and require approved source evidence before acquisition.
- State: PARTIAL contracts; OPEN approved-source onboarding and runtime policy storage.

## Review loop 52 — Section 06/07 durable refresh and fenced persistence

- Compared existing `worker_jobs` executor registrations and additive `0378` hydro observation storage with the required single transactional job/outbox, leased refresh, immutable capture and stale-fence rejection.
- Finding: the schema and canonical job platform exist, but no `geo.source.refresh` admission/executor connects them or persists observations with lease fencing.
- Action: preserve this as GAP-3 and inspect the exact canonical executor/admission seam before adding the smallest safe integration. Do not fetch in public request paths or invent a provider.
- State: OPEN blocking implementation gap.

## Review loop 53 — Section 07 fact quality and provenance

- Compared hydrology contract/unit/trend helpers and `0378` tables with raw-versus-normalized units, source/capture ownership, freshness, late/corrected samples and append-only lineage.
- Finding: contracts and migration provide partial shape/tenant capture linkage; service-level idempotent correction, late-data handling, quality quarantine, recomputation and stale-lease tests are not present because ingestion is not wired.
- State: PARTIAL schema/helpers; OPEN service integration and migration application.

## Review loop 54 — Section 18 integrated acceptance boundary

- Compared the implementation evidence accumulated in this pass with complete Section 262 end-to-end and release acceptance.
- Finding: this pass proves one geometry regression repair plus local route/parser tests only. Sections 04–18 still have documented integration gaps, and no browser, live-provider, database-application or Cloudflare production proof was run.
- State: OPEN; Spec 262 remains incomplete.

## Review loop 55 — canonical source refresh admission

- Evidence: no typed bounded job builder existed between source approval and the durable control plane.
- Fix: added a `geo.source.refresh` builder and a transaction-port function calling `createCanonicalJobInTransaction`. It binds an active row to a valid rights policy and exact adapter configuration revision; input excludes URLs, credentials and caller cursors.
- Verification: `acquisitionJob.test.ts` passes 7/7, including inactive/unknown/stale-rights/stale-revision denials and stable idempotency.
- State: PARTIAL. No route/scheduler caller, executor registration, capture persistence or observation writer exists yet.

## Review loop 56 — same-scope provider status coverage

- Evidence: resolver returns all compatible source statuses and chooses a deterministic representative; a degraded source cannot disappear from the status list.
- Verification: multi-provider healthy/degraded regression in `geographicCapabilities.test.ts`; covered in 56 passing tests.
- State: CLOSED locally; no live provider health evidence.

## Review loop 57 — hydrology timestamp fractions

- Evidence: parser canonicalizes `.1Z`, `.12Z` and `.123Z` to milliseconds while rejecting impossible timestamps.
- Verification: `hydrologyContracts.test.ts` passed in the 56-test suite.
- State: CLOSED locally; durable ingestion is still open.

## Review loop 58 — hydrology slight trends

- Evidence: `slightDelta` makes declared slight-rise/fall trend states reachable.
- Verification: `hydrologyTrend.test.ts` passed in the 56-test suite.
- State: CLOSED locally; calibration and live gauge evidence remain external.

## Review loop 59 — public map privacy filtering

- Evidence: shared sensitivity/audience policy has no public serving-path consumer; map/list/search routes can include snapped location or geometry without an explicit disclosure decision.
- Fix: public viewport/search/list projections already route point and alert geometry through the privacy policy. Extracted the pure policy resolver/projections to `spec262PublicSpatialProjection.ts` so the regression suite no longer imports the full Express/Drizzle route bundle.
- Verification: privacy projection tests cover missing/sensitive classes, deterministic generalization, protected polygons and stricter inherited policy; 2 files/7 tests pass.
- State: CLOSED for public map/list/search response serialization in `spec260EmergencyEdge.ts`; privacy ledger/federation-wide disclosure remains outside this route-level fix.

## Review loop 60 — offline runtime owner

- Evidence: offline package and access contracts validate metadata but have no retrieval/cache/signature/rights consumer or map data-through state.
- Action: keep offline package use unavailable until the existing PWA cache owner is wired to signed/hash/rights validation and accessible offline freshness UI.
- State: OPEN implementation gap.

## Review loop 61 — model governance enforcement

- Evidence: governance/replay helpers have no non-test consumer and no canonical job/output gate revalidating the immutable approved model manifest.
- Action: do not allow model-derived safety projections until a `worker_jobs` execution/publication boundary enforces approval, revision and replay provenance.
- State: OPEN implementation gap.

## Review loop 62 — map-to-chat selected references

- Evidence: public projections do not expose authoritative numeric revisions and the current handoff event contains only formatted prompt text.
- Action: do not invent revision values; add canonical references and forward the validated envelope through the existing Chat surface before enabling selected-feature handoff.
- State: OPEN implementation gap.

## Review loop 63 — source-to-observation durable pipeline

- Evidence: admission is now partially implemented, but no registered executor, private capture writer or lease-fenced hydro observation writer is present.
- Action: continue through the platform worker and tenant-scoped append-only tables; keep unqualified source adapters disabled.
- State: OPEN implementation gap.

## Review loop 64 — integrated release proof

- Evidence: local focused tests do not prove browser, OAuth, live provider/quota, database migration application, Cloudflare tunnel bindings, calibrated safety data or rollback/recovery behavior.
- Action: keep final verification open and report local proof separately from operator/provider gates.
- State: OPEN external/integrated gate.

## Review loop 65 — Section 07 observation provenance schema parity

- Evidence: the original hydro table lacked raw/normalized pairs, receive/normalize clocks, explicit freshness, stable provider item identity, correction lineage, and source-consistent station/capture foreign keys.
- Fix: added additive migration `0380_spec262_hydrology_observation_provenance.sql`; legacy rows backfill clocks from `createdAt` and values from the prior value/unit pair while marking that fallback in provenance. Missing measurements can now remain null without turning into zero. Revision identity and tenant/source-scoped lineage are constrained.
- Verification: migration parity/order and shared contract/admission suites passed (3 files, 11 tests); `git diff --check` passed. No database migration was applied.
- State: CLOSED for schema shape/parity locally; durable ingestion/writer, runtime migration application, correction semantics and lease fencing remain OPEN under GAP-3.

## Review loop 66 — Drizzle snapshot lineage blocks migration validation

- Evidence: `drizzle-kit check --config drizzle.config.ts` stopped because tracked snapshot `0146` and `0147` shared the same snapshot ID, while the untracked `0148` snapshot pointed to that duplicated ID.
- Fix: changed only `0147.id`, `0147.prevId`, and `0148.prevId` to restore the linear `0146 -> 0147 -> 0148` chain. Parsed payload comparison confirms no schema snapshot content changed.
- Verification: `npx drizzle-kit check --config drizzle.config.ts` reports `Everything's fine`; focused migration/contract/admission tests pass 3 files / 11 tests; `git diff --check` passes. No database migration was applied.
- State: CLOSED for local snapshot-chain validation; historical snapshot generation provenance is not independently established.

## Review loop 67 — apply and verify the remaining Spec 262 schema migration

- Evidence: the `apps/web/.env` development database ledger contained migrations 0378 and 0379; 0380 was the only unmatched Spec262 migration. The root `.env` points at a remote database and was not used.
- Preflight: ran all statements from 0380 in a PostgreSQL transaction and rolled it back successfully before applying.
- Apply: `npm run db:migrate` from `apps/web` reported migrations applied successfully. Post-apply ledger contains the exact 0380 SQL hash once; all hydrology observations have required source/provenance clocks, and the database reports zero legacy-backfill rows (no existing observations required fallback provenance).
- Verification: related migration/contract/admission tests pass 5 files / 15 tests; `drizzle-kit check` and scoped `git diff --check` pass.
- State: CLOSED for local development schema migration. Production database migration remains unverified and unapplied.

## Review loop 68 — event and case detail payloads disappear in the route renderer

- Evidence: public situation detail and authenticated case detail endpoints return `{ item }`; the shared loader projected `item` only for support pools, then the route renderer received an empty list for valid event/case responses.
- Fix: extracted `selectEmergencyRouteItems` and preserve the item for public event, support detail, and dashboard case route IDs.
- Verification: regression test first failed because the missing selector module was absent; after implementation, the detail/list projection tests passed. Emergency route/search focused suite: 3 files, 9 tests passed.
- State: CLOSED locally for payload selection; live route/API data remains unverified.

## Review loop 69 — empty public lists render navigation cards without explaining their state

- Evidence: when the public alerts, facilities, support, claims, or overview API returned a valid empty list, the page omitted content explaining that there were no published records. The generic cross-route grid then showed only route titles and an “Open” action. Nearby also had no result state after location lookup.
- Fix: use Astryx `EmptyState` for successful zero-result public views, localized in Thai and English, with a map or overview next step. Generic route cards are now limited to the emergency dashboard; the public hub retains its task-oriented action panel.
- Verification: locales parse as JSON; Astryx component and layout guidance reviewed; focused route/search suite passes 9/9; production Vite client build passed to `/tmp/smartspec-emergency-ui-build-20261001` (14,500 modules). Browser visual rendering and deployment were not verified.
- State: CLOSED locally for the identified public empty-state/navigation gap; wider emergency dashboard UI consistency remains open.

## Review loop 70 — emergency search loses facility and alert context

- Evidence: situation results linked to their detail record, but facility and alert results linked to generic collection pages; the searched item was not preserved.
- Fix: facility/alert results now link to the map with their title carried as a query parameter, and the map search input restores that term on arrival. No location is fabricated because the search API does not provide map coordinates for these result types.
- Verification: added a regression assertion and observed the old `/disaster/facilities` destination fail against the expected contextual map URL; after the change, emergency route/search suite passes 3 files / 10 tests. Production Vite client build passes (14,500 modules; 47.98s) to `/home/dev/.cache/smartspec-emergency-ui-build-20261001`; the emitted MapLibre worker verification also passes. Two earlier default-heap/temp-directory build attempts failed; the successful run used 8 GiB Node heap and workspace cache storage. No browser/deployment verification.
- State: CLOSED locally for search navigation context; place lookup still intentionally does not pan the map because its curated result contract has no coordinates.

## Review loop 71 — map query parameters did not execute a contextual search

- Evidence: the public search result URL included `?q=...`, but the map search component initialized its input only once and had no subscription to Wouter search changes. Clicking an item while already on `/disaster/map` changed the URL without issuing a new API request (reproduced by a failing focused test).
- Fix: subscribe to Wouter `useSearch`, synchronize the query input on navigation, execute a fresh public search when a valid `q` arrives, and abort superseded/unmounted requests. Refactored result rows and search input to Astryx `List`/`ListItem`/`TextInput` primitives.
- Verification: the RED test observed no second request after navigation; GREEN test verifies query restoration and request to `/api/public/emergency/search?q=...`. Five focused files pass (15/15).
- State: CLOSED locally; browser/deployed routing remains unverified.

## Review loop 72 — public map selection and emergency discovery gaps

- Evidence: list selection only moved the map camera and did not persist a selected record; clicking a marker only opened a popup. Ask AI always received an empty `selectedFeatures` list. The public overview did not link to claims/intelligence; nearby had no explicit first-run instructions or direct alternatives on denied location; contribution form rendered without confirming a loaded support pool.
- Fix: persist list/marker selection, show a selected-record summary and clear action, and include a selected Chat reference only when the API payload supplies a valid canonical public ref plus real positive revision. Explicitly state when a revision is missing rather than fabricating it. Add overview discovery for public claims, nearby first-run/denied next steps, and gate contribution inputs on a loaded non-empty pool response.
- Verification: `toMapContextReference` tests cover a valid reference and missing/invalid revisions. Five focused public map/entry/route files pass (15/15); Thai/English locale JSON parses; production client build completed (14,500 modules; 49.64 s) and emitted MapLibre worker reference verification passes. Browser/deployed behavior remains unverified.
- State: PARTIAL. Local map selection/discovery states are implemented. Loop 62 remains OPEN because current public API projections do not expose authoritative numeric revisions, so selected-feature Chat context is intentionally not sent for those items. Browser visual and deployed API evidence also remain open.

## Review loop 73 — polygon-only alerts were absent from the accessible map list

- Evidence: `EmergencyMapWorkspace` previously filtered selectable items by point location only, while public alert areas can be polygons without a point. They rendered on the map but were not keyboard selectable.
- Fix: include only valid normalized public alert geometry in the accessible selection list; selection can show the record without inventing a center point.
- Verification: added valid polygon, malformed polygon, and missing-location assertions. Focused public map/route suite passes 16/16; production Vite build passes and MapLibre worker asset checker confirms the referenced worker.
- State: CLOSED locally; browser keyboard verification remains open.

## Review loop 74 — query navigation and public item context

- Evidence: facility/alert query links now enter the map search via Wouter `useSearch`; automatic search is covered by a same-route memory-router test. Coordinates are absent from those search result shapes, so no camera focus is asserted.
- Verification: test asserts restored query and a second public search API request; 16/16 focused tests pass.
- State: CLOSED for query restoration/search execution; pan-to-record remains correctly unavailable without coordinates.

## Review loop 75 — selected-feature Chat reference authority

- Evidence: public situation/facility/alert projections in `spec260EmergencyEdge.ts` expose `publicRef` but not a numeric canonical `revision`; the current schemas likewise do not define revisions for those public entity rows. `mapContext.ts` rejects revision values below 1.
- Action: preserve fail-closed reference creation and visible explanation; do not derive revisions from timestamps or fabricate them. Add a canonical revision contract to the owning API/schema before selected-feature references can be sent.
- State: OPEN; same underlying contract gap as loop 62.

## Review loop 76 — map source freshness and coverage presentation

- Evidence: `EmergencyPublicMap` distinguishes current, stale, unavailable, and truncated responses and separately uses the list fallback; its status banner has no trustworthy source name or source-specific updated timestamp.
- Action: do not label any data live or invent a source timestamp. A source-attribution/freshness panel requires the geo feed response contract to return provenance and as-of metadata per source.
- State: OPEN integration gap pending the feed/source sections.

## Review loop 77 — map provider and data fallback behavior

- Evidence: provider configuration errors and renderer failures call `loadFallback`; the list loader distinguishes all-source failure from fresh result and preserves prior results as stale. The map worker asset checker found the emitted worker linked from an emergency map chunk.
- State: PARTIAL; local build and worker-bundle reference are verified, while actual browser Worker startup, Cloudflare tunnel endpoints, and provider requests are not.

## Review loop 78 — operational controls versus implemented controls

- Evidence: current public workspace implements location/alert-area layer toggles, visible counts, feature selection, and existing Chat handoff. Section 03 additionally plans filter, time, route, compare and a data/legend workbench, which have no truthful provider/feed capability contract here.
- Action: keep unsupported controls absent instead of presenting decorative buttons; finish after the source, route and validated temporal capabilities are integrated.
- State: OPEN partial implementation; capability-backed toolbar/workbench remains.

## Review loop 79 — public spatial privacy and Chat payload bounds

- Evidence: map features project allowlisted title/ref/status/freshness and public geometry; the selected Chat envelope contains viewport/layer/count summaries and a single canonical selected reference only when valid. It does not serialize full feature properties or raw geometry.
- State: CLOSED for this UI payload boundary; underlying server authorization remains authoritative and is rechecked outside the browser.

## Review loop 80 — anonymous Ask AI handoff uses the existing Chat surface

- Evidence: `FeedbackButton` listens to the established map event, opens the existing panel, and stages context only for an authenticated, restored session. Guest UI uses the sign-in gate, with no conversation creation or anonymous context staging.
- State: CLOSED locally for reuse of the existing chat/auth boundary; OAuth/browser route restoration and deployed behavior remain unverified.

## Review loop 81 — nearby first-run and permission-denied paths

- Evidence: the public nearby route has an explicit approximate-location notice and first-run guidance; after a failed/declined geolocation request it links to map and facility browsing. Successful coordinates are rounded before the nearby API query.
- State: CLOSED locally; browser permission prompt behavior remains unverified.

## Review loop 82 — support funding safety and public claims discoverability

- Evidence: contribution form now renders only after the detail load succeeds with a returned pool item; a successful missing-pool response shows an unavailable state and no payment form. The overview exposes the existing public claims route.
- State: CLOSED locally; external payment-provider and deployed route behavior remain unverified.

## Review loop 83 — source freshness could be asserted as current past its stale window

- Evidence: a focused regression test supplied a source record observed ten minutes before `acquiredAt` while the contract's `staleAfterSeconds` was 120; the binding still labeled it `current` (RED observed).
- Fix: derive stale status from trusted contract acquisition time and per-contract stale window; future-dated observations are conservatively `unknown`, and other binding quality classifications remain intact.
- Verification: focused refresh pipeline suite passes 10/10 after the fix.
- State: CLOSED locally for this data-integrity gap.

## Review loop 84 — verify pipeline trust boundary and operational integration seam

- Evidence: reviewed raw-byte hash verification before writes, immutable exact-byte capture, repeated active-source/policy/configuration/adapter checks, canonical lease assertions, explicit station/metric binding, shared unit conversion, required water-level vertical datum, and idempotent observation ports. Focused suite exercises tampering, replay, revision correction, policy revocation, unit conversion, missing datum, and stale labeling.
- Verification: six geo-source test files pass 37/37; `git diff --check` passes on pipeline paths.
- Residual integration finding: this pipeline remains port-based and is not registered as a canonical worker executor; no approved adapter/source with verified endpoint, license, attribution, freshness, and cadence is active, and there are no concrete object-store/Drizzle ports. Registering an executor without those dependencies would accept durable work that cannot run safely.
- State: pipeline contract locally verified; GAP-3 remains OPEN pending qualified source approval and concrete fenced persistence/worker integration.

## Review loop 85 — durable capture/hydrology persistence adapter

- Evidence: the prior pipeline depended on abstract capture and hydro ports; none implemented the current `emergency_intel_captures`, `emergency_hydro_stations`, `emergency_hydro_observations`, or private storage contracts.
- Fix: added a tenant/source-scoped Drizzle persistence adapter. Captures persist a nullable object reference first, conditionally write exact SHA-256-verified bytes, then link the private key so retries can heal interrupted writes. Stations are insert-only; observation writes validate scoped station/capture, preserve raw/normalized values and clocks, and fail closed on either uniqueness conflict unless the revision/hash match.
- Verification: geo-source suites pass 58/58 before the storage collision hardening; adapter-specific writer also reports 14/14 with refresh-pipeline tests.
- State: CLOSED for local persistence-port behavior; GAP-3 remains OPEN because no canonical executor/admission caller uses these ports, no approved source is active, and no deployed DB/storage verification occurred.

## Review loop 86 — conditional storage collision could buffer unbounded bytes

- Evidence: S3/R2 collision handling used `transformToByteArray()` before checking the 10 MiB cap; local collision handling used `readFile()` without bounding a preexisting target.
- Fix: reject declared oversized S3/R2 objects before reading and stream async-iterable bodies with a hard byte cap; non-iterable fallback requires a bounded declared length. Local collisions use an opened file handle and bounded reads, including a growth check.
- Verification: `cd apps/web && npm run test -- server/__tests__/r2-storage-abstraction.test.ts server/services/geoSources` passes 11 files/72 tests; scoped `git diff --check` passes.
- State: CLOSED locally; object-provider/account and deployed-storage behavior remain external gates.

## Review loop 87 — do not register an inert refresh worker

- Evidence: `geo.source.refresh` has a bounded transactional admission builder and pipeline/persistence ports, but `feature186JobTypes.ts` and `jobExecutorRegistry.ts` have no canonical executor; the Thailand catalog is unverified and no active approved provider is configured.
- Decision: do not add a handler that permanently fails or accept jobs without qualified transport/binding/policy dependencies. That would turn a code-level absence into misleading durable work and could retry work that cannot legally or technically run.
- State: GAP-3 OPEN pending a source rights/configuration authority, approved active adapter and real canonical worker composition.

## Review loop 88 — station reference could silently point at changed geometry

- Evidence: station persistence correctly had no update path, but an existing tenant/source/stationRef returned success without comparing its stored WGS84 point to the incoming point.
- Fix: station identity reads now include stored coordinates; matching points compare at the schema's six-decimal precision. A changed point fails with `GEO_PERSISTENCE_STATION_GEOMETRY_CONFLICT` for existing and concurrent insert races instead of silently attaching observations to a stale location.
- Verification: geo-source + storage suites pass 11 files/72 tests; the persistence regression exercises the coordinate conflict; `git diff --check` is run on all owned paths below.
- State: CLOSED locally. A true station move still requires a canonical provider revision/version contract before it can be represented.
