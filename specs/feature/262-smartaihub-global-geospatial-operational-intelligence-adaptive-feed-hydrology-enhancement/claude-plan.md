# Spec 262 implementation plan

Date: 2026-10-01. This is an implementation blueprint; section files are the step-by-step source of truth. Inputs are `spec.md`, `claude-spec.md`, `claude-research.md`, and `claude-interview.md`.

## Architecture decisions

- Preserve Spec260 ownership for all emergency identity, routes, permissions, public/operations disclosure, audit, canonical source/claim and execution contracts.
- Add shared types and pure functions first, then DB schema/migrations, services/adapters, API projections, UI, operations and conformance. Migrations are owned by the conductor because `drizzle/schema.ts`, SQL migration and journal must move atomically and worktree is already dirty.
- Use the shared route manifest for page/API links. Derive deployment capabilities server-side via an explicit runtime capability resolver (trusted configuration plus validated bindings); both Linux and Cloudflare ingress call the same application contracts. Do not infer execution mode from hostname or user agent, and do not bypass the private platform origin from Cloudflare.
- Reuse current MapLibre/provider resolver; fix the observed worker boot and production asset regression first. Keep map renderer status separate from provider credentials, API transport and data availability.
- Use one typed normalized feed projection over canonical domain references, not a new source-of-truth event table. Add a durable projection only if query load/retention requires it and the migration documents ownership and rebuild semantics.
- Reuse existing source/capture/claim records for provenance and review; add provider registry/versioned source contracts and observation/time-series entities only where no canonical Spec260 record fits.
- Model external acquisition as registered provider adapters with explicit rights, capability, expected heartbeat, bounded response, schema version, source clock/CRS/unit normalization and fixture-driven contract tests. Acquisition uses `worker_jobs` plus transactional outbox; no requests in UI render path.
- Keep public, signed-in and operations data projections separated at the server. Reauthorize every saved ref, watch, Chat action and delayed job at use time.
- Use deterministic evidence-backed impact outputs first. Forecast, propagation probabilities and recommendations remain capability gated until model registry, calibration/backtesting and uncertainty criteria pass.
- Use focused Vitest/server/UI tests and browser evidence. Never run repository `npm run typecheck`. No production deployment, migration application, secret changes or Cloudflare account actions in the local implementation phase.

## Dependency graph / waves

1. **Repair baseline and shared contracts** (sections 01–03): map worker/runtime route and renderer regression, platform mode contract, route/chat/context/UI foundations.
2. **Feed core** (sections 04–06): normalized feed, viewport focus/ranking, provider/source acquisition safety and canonical durable jobs.
3. **Hydrology domain** (sections 07–10): observations/time series/trends, network and physical impact, Thailand pack, floods/compound hazards/transport/water-quality extensions.
4. **Global capabilities and actions** (sections 11–14): region registry/coverage, multilingual geography, watches/skills/MCP/chat actions, privacy/federation/deletion/legal hold.
5. **Field and operator readiness** (sections 15–17): offline/accessibility/device sync, admin/rights/cost/observability, model governance/replay/retention/recovery/release gates.
6. **Integrated evidence** (section 18): map/feed/chat/task workflows, security tests, acceptance tests 1–513 and scenarios A–AR; distinguish local proof from final external gates.

Parallel writers may work only on independent section-owned paths after shared contracts and migration decisions are frozen. The conductor integrates shared DB/API/type changes serially and resolves all cross-section reviews.

## Traceability matrix

| Plan section | Spec coverage |
|---|---|
| 01 Baseline map/provider and Spec260 integration | 0–6, 46 phase A, R1.8.1, user reported worker/asset failures |
| 02 Trusted platform/runtime and route/context contracts | 2–5, 8, 13, 38, 41, 46, R1.8.1–2 |
| 03 Map UX, commands, layers and coverage presentation | 7–8, 30, 35, 41, R1.1-20/21, R1.2 passes 6/13/14/18, R1.7 pass 71, R1.8.4 |
| 04 Spatial focus and adaptive feed retrieval | 9–13, 29, 43.1, R1.1-12/13, R1.2 pass 5, R1.3 passes 13/16, R1.7 passes 61/64 |
| 05 Feed rank/digest, situation/weather and explanation | 10–15, 29, 35, 39–40, R1.1-16, R1.3 pass 18, R1.7 pass 71 |
| 06 Source/provider acquisition and durable processing | R1.1-2/23B, R1.2 pass 7, R1.4 passes 33/35, R1.5 passes 37–39/49, R1.6 passes 50/56/57/59, R1.7 pass 68 |
| 07 Canonical hydro observations, time series, trends and quality | 16–18, R1.1-15/18, R1.2 pass 3, R1.4 passes 25/28/30, R1.5 pass 48, R1.6 passes 51–53, R1.7 passes 62–63 |
| 08 Hydro network, relevance, propagation and corridor | 19–22, R1.1-4/5/13/23A/23C/23D/23F, R1.2 passes 1–2/11, R1.3 passes 15/20/22, R1.4 passes 26–27, R1.5 pass 42, R1.7 pass 63 |
| 09 Thailand deep intelligence provider pack | 23–25, R1.1-3/6–11/23, R1.2 passes 1–3, R1.4 passes 25–27, R1.5 pass 43, R1.6 passes 50–52, scenarios A–C/G/S–U/AE–AG |
| 10 Compound flood, defenses, routes, water quality and exposure | 21–24, R1.1-5–11/23C–F, R1.2 passes 2/9, R1.3 pass 15, R1.4 passes 26/31, R1.5 passes 40/43, R1.7 pass 63 |
| 11 Global/regional capability registry and coverage-adaptive product | 26–30, R1.1-14, R1.2 passes 4/9, R1.3 passes 16/19/23, R1.4 passes 33/36/45, R1.5 passes 37/45, R1.7 passes 66 |
| 12 Localization, translation, geographic names and services | 31–34, R1.1-23, R1.2 passes 4/6/9, R1.3 pass 21, R1.5 pass 44 |
| 13 Watches, skill-first API/MCP and existing Chat/Task Control actions | 5–6, 13, 35–38, R1.2 pass 5, R1.3 passes 13/24, R1.7 passes 64/70, R1.8.2–4 |
| 14 Authorization, privacy, federation, retention conflict and exercise isolation | 8, 41, R1.2 passes 7/9, R1.3 passes 22–24, R1.4 passes 32/36, R1.5 passes 45/46, R1.6 passes 57, R1.7 passes 66/69/72 |
| 15 Offline field use, device sync and accessible map equivalence | R1.2 pass 6, R1.3 pass 16, R1.6 pass 54, R1.7 passes 65/70/71, scenario L/AH/AN/AP |
| 16 Provider/admin configuration, licensing, cost and observability | 42–45, R1.1-19/23B, R1.2 pass 10, R1.4 pass 33, R1.5 pass 47, R1.6 passes 56–58, R1.7 pass 68 |
| 17 Model governance, event replay, retention, recovery and release lifecycle | 17–18, 39–40, 43–44, R1.1-17/18, R1.2 passes 8/10/11/12, R1.3 passes 14/24, R1.4 passes 28/29/35, R1.5 passes 38/41/48, R1.6 passes 55/59/60, R1.7 passes 67–68/72 |
| 18 Acceptance/conformance/E2E and rollout evidence | 47–50, acceptance tests 1–513, scenarios A–AR, every revised Definition of Done, R1.8.5–6 |

## UI/UX contract summary

Detailed section-level contract is in sections 01, 03–05, 09, 11–13 and 15.
- Target users: public residents/responders reading authorized public status; signed-in users exploring maps and existing Chat; operations users monitoring sources, coverage and validated impacts.
- Reuse references: `/disaster/map`, `EmergencyPublicMap`, `EmergencyRoutePage`, `FeedbackButton`/`ChatView`, existing admin settings and dashboard patterns.
- Surfaces: existing public map/feed; existing Chat & Feedback overlay; existing dashboard/admin areas through registered route/menu; no duplicate Chat route.
- States: loading, empty-with-coverage, success, partial, stale, provider unavailable, data unavailable, unauthorized/sensitive, offline/sync conflict, disabled/unvalidated.
- Viewports: mobile 390x844, tablet 768x1024, desktop 1440x900; include 360x800, 1024x768 and 1280x800 where dense panels, sidebars or maps pose risk.
- Accessibility: keyboard map alternatives, focus order, visible labels, semantic live status, reduced motion, nonvisual spatial list/narrative and color-independent severity/freshness.
- Visual direction: follow current SmartAIHub/ Astryx tokens and established MapLibre controls; compact but high-stress legible status hierarchy; no unapproved raw palette values.
- Copy: Thai and English; explain coverage limits, data class, freshness, source and uncertainty; never imply zero events from empty/unavailable data.
- Browser proof must verify generated map worker and assets, public API/tile requests, attribution, features, fallback/recovery, Chat handoff without auto-send and responsive/accessibility states.

## Data and migration strategy

Inspect all existing schema and dirty diffs before migration. Reuse source/capture/claim where applicable. If new persistence is essential, add one additive migration at a time, update Drizzle schema and journal consistently, include RLS/tenant and retention semantics, indexes/partitioning and bounded rollback/restore notes. Deploy expand → backfill/rebuild → read path → contract only after external owner gate. Local test DB/application is not production migration evidence.

## Risk register

| Risk | Control |
|---|---|
| Spec260 remains in implementation and shared files are already dirty | Read exact diffs before editing; freeze shared contracts first; never reset/stash/stage broadly |
| Huge cumulative scope | Traceability manifest and incremental feature gates; section-by-section checks and gap loops |
| Provider source drift, license/quotas | Versioned fixture contract, expected cadence/rights registry, canary and explicit unavailable state |
| Worker fails despite valid provider config | Separate build asset/map boot tests from backend provider connection tests |
| Hydrology false precision | Deterministic baseline, quality/provenance, uncertainty propagation and model registry/backtesting gates |
| Public map disclosure/reconstruction | Audience-specific projection, geometry generalization, authorization re-check and differencing tests |
| Cloudflare/Linux split-brain | Trusted server capability resolver and shared route/API contracts; no duplicate domain executor |
| Broken migration/index journal | Conductor-owned schema edits and focused migration ordering checks |
| Tests or browser lack real provider/Cloudflare credentials | Mock/local proofs plus a final explicit production gate; never convert missing evidence into PASS |

## Section completion protocol

For each section: write a failing focused test first where practical; inspect only its declared paths and current diffs; implement; run relevant tests; perform completeness and safety review; update the section status/evidence and progress ledger; run a read-only cross-section review; fix actionable findings. Do not commit because the active worktree contains unrelated and user-owned changes; report this as a safety decision. No production deployment or real secret/account mutation is authorized by this implementation request.

## Traceability sources

`claude-requirement-traceability.md` maps all 496 spec Markdown headings and scenarios A–AR to section files. `claude-acceptance-traceability.md` maps the 513 active acceptance tests 1–513 to an implementation section and verification evidence type. These are exhaustive mappings after semantic review. Section 18 owns only integrated scenario ID 60 and versioned conformance corpus ID 436 as primary acceptance assertions; every other ID maps to its domain implementation section while retaining integrated evidence requirements.
