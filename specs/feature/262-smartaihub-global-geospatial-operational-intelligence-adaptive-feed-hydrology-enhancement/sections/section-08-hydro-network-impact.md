# Section 08 — Hydro Network, Relevance, Propagation and Corridor

**Status:** planned. **Dependencies:** Section 07 canonical stations, observations, quality and trends; Section 06 approved source/capture contracts and `worker_jobs` + transactional outbox; Section 02 canonical geospatial refs and authorization. Section 09 supplies the Thailand topology/provider pack; Sections 10, 11, 14 and 17 consume compound exposure, coverage, disclosure and replay contracts. **Ownership:** new graph/impact algorithms and their focused service files only. Shared public contracts and all Drizzle schema/SQL/journal edits are conductor-serial owned. No production migration or deployment in this section.

## Outcome and boundaries

Represent basin-first water topology independently of administrative borders, then produce bounded, revisioned and explainable upstream/downstream relevance and potential impact corridors. A structural connection may yield `POTENTIAL_DOWNSTREAM_IMPACT`; it cannot establish flood depth, certain arrival, observed impact or damage. Static geometry, time-varying flow direction and hydraulic operation state are separate inputs. Unknown state is not normal/closed/open. Province boundaries are presentation boundaries only; traversal follows graph connectivity across them.

Spec260 remains authoritative for emergency identity, source/capture/claim provenance, route IDs, permissions, audit and public/operations disclosure. Reuse its source and immutable capture records and canonical geographic/domain references. Do not create a second incident/event identity, route authority, claim authority, queue or job state. Keep exact private exposure geometry out of public projections and prevent repeated corridor queries from reconstructing protected endpoints.

## Tests first

Add deterministic tests before graph or projection behavior. Use fixed graph/source revisions, explicit units/time zones and fixture-only observations.

1. `packages/shared/src/geospatial/hydroNetwork.test.ts` (new): basin/sub-basin graph contracts; valid/invalid node and directed edge types; coordinate/CRS/geometry validation; duplicate and conflicting provider entity bindings; static geometry remains stable when a canal's flow direction reverses; closed gate isolates operational traversal while static topology remains intact; cross-province traversal; cycle handling; missing links, unknown direction and disconnected graphs return explicit unknown/partial results.
2. `packages/shared/src/geospatial/hydroImpact.test.ts` (new): relevant upstream/downstream path selection, source/target revision binding, `AFFECTS_VIEWPORT` relation, antimeridian and corridor geometry behavior, graph version invalidation, maximum depth/node/edge/time budget, deterministic ordering, and a huge/invalid branch cannot poison unrelated valid viewport results. Prove no path means no inferred connection; structural propagation never emits precise depth or guaranteed arrival.
3. `packages/shared/src/geospatial/hydroCorridor.test.ts` (new): topology-following corridor differs from circular radius; preserve source segment and downstream segment refs; use allowed geodesic/geometry helpers; invalid geometry fails closed for that feature; confidence/quality/uncertainty and source/topology revision survive output; planned release, observed release and measured discharge remain distinct.
4. `apps/web/server/services/__tests__/hydroNetworkService.test.ts` and `hydroImpactProjection.test.ts` (new): tenant/source ownership, graph revision and observation provenance checks; bounded indexed candidate selection; cross-province traversal; fail-safe on stale or missing topology; transaction/idempotency/fencing for asynchronous recompute; policy reauthorization before publishing; no public exact protected endpoint and no unauthorized exposure, even across repeated/differenced queries.
5. Extend or add migration tests only with the conductor-owned additive schema change: tenant-safe composite references, source/capture keys, revisions and query indexes. Do not implement schema/journal edits in parallel or apply migrations to production.

Trace acceptance coverage includes cross-province graph path, upstream event outside viewport, canal flow reversal, gate isolation, topology revision invalidation, invalid-geometry isolation, uncertain corridor and no false damage claims. Section 18 owns integrated end-to-end evidence.

## Contracts and implementation paths

Create pure contracts/algorithms in `packages/shared/src/geospatial/`:

- `hydroNetwork.ts`: versioned `HydroNode`, `HydroEdge`, basin/sub-basin refs, static topology revision, time-bounded `FlowDirectionState`, `HydraulicOperationState`, source bindings, confidence and geometry provenance. Keep administrative geography metadata separate from hydrologic connectivity. Distinguish directed river flow, reversible canal flow and diversion/controlled links.
- `hydroImpact.ts`: bounded deterministic graph traversal and `ImpactRelation` projection with explicit `UPSTREAM_WATER_IMPACT` / `DOWNSTREAM_WATER_IMPACT`, reason codes, effective window, confidence/quality, source refs and topology/operation revisions. Return partial/unknown with reason when graph budget, validity or data freshness prevents a complete result.
- `hydroCorridor.ts`: topology- and terrain-informed potential corridor geometry, bounded by a named policy/model revision. Return `IN_POTENTIAL_IMPACT_CORRIDOR`, `OBSERVED_AFFECTED` and `CONFIRMED_DAMAGED` as distinct states; this section can produce only the first without independently verified downstream evidence.
- Export through `packages/shared/src/geospatial/index.ts` (create only if the package's existing export convention requires it); reuse canonical geo contracts and antimeridian-aware helpers from Sections 02/04 instead of a second geometry implementation.

Implement bounded persistence/query/recompute in `apps/web/server/services/hydroNetworkService.ts`, `hydroImpactService.ts` and `hydroCorridorService.ts` (new). Use reviewed topology/provider revisions and Section 07 station/observation contracts; tenant scope, authorization and source/capture checks must be enforced on every query. Candidate DB tables, schema definitions, migrations, journal, shared DB/API contracts and route manifest changes are serial conductor ownership; a section implementer must provide the minimal schema proposal/references but not edit those shared files. The conductor must recheck all dirty diffs and Spec260 composite keys before choosing storage.

If recompute exceeds synchronous budget, enqueue one typed, bounded task through `createCanonicalJobInTransaction` in `apps/web/server/services/jobControlPlane.ts` and the existing `worker_jobs` + outbox/executor registry. Job input contains only approved tenant/entity/source/topology/policy revisions and idempotency key, never raw URLs or credentials. Writes and publication must verify lease/fencing and current rights/revisions. Do not put graph execution in Cloudflare Workers; Cloudflare and Linux/tunnel are ingress/transport to the canonical platform API and same data contracts.

Do not expose an arbitrary graph/corridor route. If existing `public.map.list` at `packages/shared/src/emergencyRouteManifest.ts` cannot carry a compatible additive public projection, propose a manifest-owned route and server authorization contract for conductor review. Public output must be generalized by Spec260 policy before clipping/intersection; requested map audience is never authority. Include response limits, anti-enumeration/differencing budgets, stale graph status and attribution.

## Data and safety constraints

- Preserve immutable source/capture and revision lineage for every graph edge, observation and operation state. Reconciliation/split/merge must preserve upstream IDs and allow correction without rewriting prior evidence.
- Physical topology, current effective direction, planned operation, observed operation and official instruction are separate typed facts with their own valid times and source refs. Planned dam release must never become observed discharge.
- P0 structural connectivity may identify a potential downstream path. P1/P2 arrival/level ranges require a validated model, applicable basin/horizon envelope, uncertainty and Section 17 governance; until then omit quantitative outputs.
- Missing underground drains, culverts, gates or terrain coverage is a visible limitation, never evidence that drainage is adequate. Unknown graph coverage cannot be interpreted as no downstream impact.
- Graph work is bounded by request limits and spatial indexes. Invalid upstream records are isolated; they cannot make unrelated valid data fail. Invalidate derived products when a topology/operation revision changes; replay via the canonical job plane.
- Public exposure/corridor geometry uses Spec260 disclosure/generalization. Never expose protected facility endpoints or fine-grained household geometry; prevent differencing through repeated overlapping queries.

## UI/UX Contract

### Target User / JTBD
Authorized public users and emergency operators need this section’s bounded capability through the existing map/feed and approved operator surfaces.

### Surface Inventory

| Surface | Existing integration | Section 08 behavior |
|---|---|---|
| Public emergency map/feed | `/disaster/map`, `EmergencyRoutePage`, `EmergencyPublicMap` | Render only authorized potential corridor/relevance overlays and link them to feed items; no new route. |
| Existing AI Chat & Feedback | `FeedbackButton` / canonical `ChatView` | Downstream section may provide a removable, scoped entity context; this section does not create chat controls or send automatically. |
| Operations/admin | Existing Spec260 source/review surface | Display topology/source revision and reconciliation status only through the owning authorized surface; admin UI ownership is Section 16. |

### Component Map

| Component/service | Ownership |
|---|---|
| `hydroNetwork.ts`, `hydroImpact.ts`, `hydroCorridor.ts` | Shared graph, relation and corridor contracts/pure algorithms. |
| `hydroNetworkService.ts`, `hydroImpactService.ts`, `hydroCorridorService.ts` | Server-side bounded query, revision validation and audience-specific projection. |
| Existing map/feed layers | Consume safe projections; component changes belong to the map/feed owner and must be separately coordinated. |

### State Matrix

| State | Required presentation |
|---|---|
| Loading | Keep base map and existing feed usable; show topology/impact calculation separately. |
| Complete | Label `potential impact` and show source, observation freshness, topology revision and uncertainty. |
| Partial/unknown | Explain missing graph segment/flow state or budget limit; do not say no impact. |
| Stale/unavailable | Retain last safe revision with age/status; disable any dependent action that requires current data. |
| Observed/confirmed | Only show if a separately authorized, provenance-bearing source asserts that exact fact; never promote a potential corridor by UI inference. |
| Unauthorized/sensitive | Omit geometry/details and provide a generic safe explanation. |

### Responsive Matrix

| Viewport | Required behavior |
|---|---|
| 390x844 mobile | Corridor and feed detail are readable without covering essential map controls; provide list/text fallback. |
| 768x1024 tablet | Selected impact details fit a sheet/split panel without clipping map status. |
| 1440x900 desktop | Corridor/source legend and map selection remain readable together. |
| 360x800, 1024x768, 1280x800 | Check overflow, panel scroll ownership and controls as extended risk sizes. |

### Accessibility Acceptance

- Provide a synchronized keyboard-operable spatial list equivalent; map color/shape alone cannot convey potential versus observed/confirmed state.
- Name corridor/source/freshness/revision controls and announce state changes with restrained live regions; maintain visible focus and restore focus when details close.
- Keep map navigation optional; no canvas focus trap. Respect reduced motion for map camera changes.

### Copy Contract

- Thai and English labels distinguish “potential downstream impact”, observed flooding and confirmed damage.
- State source, last observation time, topology/data coverage and uncertainty in plain language. Say “not enough connected data” when graph coverage is incomplete; never say “safe” or “no impact” from missing data.
- Planned release, measured flow, official warning and model estimate use distinct fact-class labels.

### Browser Evidence Required

Section 18 browser pass verifies a source-backed cross-province corridor, selection/list sync, partial/stale graph state, no false depth/arrival, a denied protected geometry and map/list fallback at mobile/tablet/desktop sizes. Local unit/route tests are not browser or production evidence.

## Exit evidence and external gates

Complete when focused tests prove graph direction/reversal, cross-border/province connectivity, budget/cycle behavior, revision invalidation, corridor-vs-radius, source lineage, stale/fenced-write rejection and disclosure/differencing protection. Record exact commands/results and changed files in the implementation ledger. Live authoritative topology, calibrated impact/arrival model, provider rights, production migration and public operational approval remain separate gates; no local structural graph pass certifies a flood forecast or life-safety recommendation.
