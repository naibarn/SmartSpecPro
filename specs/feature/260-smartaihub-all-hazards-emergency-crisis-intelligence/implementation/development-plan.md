# Spec 260 Full-System Development Plan

**Status:** Active implementation; Waves 0–3 are substantially implemented and Waves 4–12 are in progress; no product test suite or Cloudflare environment verification has been performed.  
**Scope:** The complete normative Spec 260 through R1.37, including its later intelligence, mobility, federation, marketplace, sponsorship, and Thai financial-control additions.  
**Delivery rule:** Implement and verify the complete system locally and in CI first. Run real Cloudflare staging/integration verification once, as a final integrated phase after implementation is complete.  
**Runtime direction:** Cloudflare-first production delivery, without a legacy-runtime compatibility path for Spec 260. PostgreSQL/PostGIS remains the authoritative business and geospatial data store; Cloudflare services are used according to the established platform contracts.

## 1. Intent and success criteria

Deliver one all-hazards emergency platform that serves citizens, helpers, responders, command staff, authorities, sponsors, auditors, and external agents through clear public and authenticated routes. It must preserve the Spec 260 domain invariants, keep public and restricted projections separate, and remain useful during degraded connectivity and provider outages.

The implementation is complete when:

1. Every normative Spec 260 capability has an owning module, dependency, acceptance criteria, and test evidence.
2. Public emergency information and anonymous reporting work without forcing account login.
3. Authenticated dashboard routes, sidebar entries, and quick links resolve to implemented pages and enforce server-side permissions.
4. Emergency intake and life-safety actions do not depend on user credits or LLM availability.
5. PostgreSQL/PostGIS owns emergency facts and financial records; `worker_jobs` plus the transactional outbox owns durable background-work state; queues are transport only.
6. Cloudflare Workers, KV, R2, Queues, Durable Objects, and other services are used only for responsibilities assigned by the approved platform architecture. No cache, queue, LLM, map provider, or legacy runtime becomes a second authority.
7. There is no Spec 260 dual-runtime, legacy routing, old-client compatibility, or fallback-to-old-system implementation. Rollback means a prior Cloudflare release/configuration with forward-safe data handling.
8. All code-level, contract, security, accessibility, load, recovery, and end-to-end gates pass before the single final real-Cloudflare verification phase.

## 2. Source-alignment findings and required decisions

### 2.1 Existing implementation state

- The current Spec 260 file is a large, cumulative specification with 340 numbered review passes and addenda through R1.37.
- The existing client router has no emergency product route. The shared menu catalog and dashboard quick actions have no emergency entry. No emergency-specific frontend or server module was found in the targeted source search.
- Spec 260 already proposes `/disaster` public information routes, public/authenticated/verified/operations API classes, Cloudflare Workers/KV/R2 delivery, and PostgreSQL/PostGIS authority.
- R1.37 additionally requires a shared route manifest, precise anonymous report acceptance semantics, R2 media authorization boundaries, reference-only queue publication, explicit retired-system exclusions, and fail-closed Cloudflare binding selection.
- Spec 245 is the platform migration authority and states that production Cloudflare cutover/retirement is not yet verified. Spec 257 is marked planning-only. Neither document proves Cloudflare bindings, service entitlements, or production readiness.

### 2.2 Normative cleanup before implementation

The first implementation wave must reconcile Spec 260 provisions that currently describe backward compatibility, old-client support, legacy migration, mixed-version deployment, compatibility canaries, or fallback to a legacy runtime. Examples include the compatibility language around passes 246–247 and pass 300. Preserve the factual history of those review passes, but add one explicit precedence clause and update current normative language so implementers cannot interpret the old compatibility text as a requirement.

R1.37 is the precedence clause. Preserve the factual history of earlier review passes, but map each remaining phrase to its current interpretation so implementers cannot interpret old compatibility text as a requirement. It must state:

- Spec 260 is a new Cloudflare-first product implementation and does not add adapters, routes, dual reads/writes, compatibility shims, legacy traffic routing, or legacy runtime fallback.
- Existing platform contracts remain authoritative for PostgreSQL/PostGIS, identity/authorization, `worker_jobs`/outbox, credits, audit, media storage, and approved Cloudflare execution.
- Database evolution is forward-only for this product. A deployment rollback may target a previous Cloudflare release only if it can safely read all accepted records; otherwise use a fenced forward fix. Never erase newer emergency or financial facts.
- Active emergency changes use scoped freeze/hold controls where appropriate, but do not reopen the retired runtime as a fallback.
- User consent, offline queued mutation idempotency, schema version rejection, and safe recovery remain product behaviors; they must not become support for an old production system.
- Anonymous report acceptance requires an authoritative PostgreSQL + outbox commit. An account-service outage means login/session/profile/credit degradation, not database loss. If PostgreSQL is unavailable, show an explicit unsubmitted/unavailable state; KV, R2, Queues or browser storage cannot acknowledge acceptance.
- `packages/shared/src/emergencyRouteManifest.ts` is the single route contract consumed by the browser and Spec 260 Worker registration/tests. Worker endpoints delegate identity and authorization to canonical platform contracts.
- Emergency business facts and outbox events commit atomically through canonical admission; outbox messages are reference-only; consumers use fenced `worker_jobs` leases.
- R2 stores bytes only. Canonical media/evidence records own metadata and authorization; private retrieval uses the approved broker; client-controlled object keys and direct public origins are prohibited.
- “Sandbox” means the approved Cloudflare Container runtime only. OpenSandbox, `sandbox_jobs`, Docker/OpenSandbox dispatch, the retired Agency system, `work/request`, `work/requests`, `workpacks/*`, `/workflows`, and the legacy custom workflow engine are prohibited. External authority/partner feeds are distinct from the retired Agency system.
- R1.37 does not change unrelated platform migration state. Spec 260 dispatch fails closed when its Cloudflare binding/adapter is unavailable and never silently selects a different scheduler or `postgres-pull` fallback.
- Forward-only additive, replay-safe schema migrations remain allowed; compatibility reads/writes for obsolete application behavior do not.

### 2.3 Target architecture decision to confirm in Wave 0

Treat “Cloudflare-first” as the production execution and delivery model, not as permission to replace canonical authorities. Use Workers for edge HTTP/API and public projections; KV and CDN only for bounded-stale, non-authoritative data; R2 for private originals and policy-approved derivatives; Queues only behind the canonical outbox/job control plane; Durable Objects only for a proven coordination/realtime need; PostgreSQL/PostGIS for transactional domain state and spatial authority. Use Cloudflare Hyperdrive only where the platform's database connection model requires it. Do not use D1 or Vectorize as substitutes for transactional or spatial authorities.

If Spec 245 changes the exact Cloudflare service placement before implementation begins, update the architecture decision record before Wave 1; do not silently create a parallel implementation architecture inside Spec 260.

## 3. Canonical route and navigation contract

Routes below are the product-facing URL contract. API routes are distinct from page routes. Public routes must not be wrapped in `RequireAuth`; restricted routes must use both client route guards for UX and server-side authorization for enforcement.

| Surface | Canonical route | Audience / behavior |
|---|---|---|
| Public emergency overview | `/disaster` | Anonymous; current public situations, alerts, map entry, reporting and help entry points |
| Public map | `/disaster/map` | Anonymous public-safe projection, list alternative, freshness and source status |
| Public alerts | `/disaster/alerts` | Anonymous published warnings and correction/freshness state |
| Public event detail | `/disaster/events/:publicRef` | Anonymous, strictly public-safe projection; no exact protected location |
| Public facilities/services | `/disaster/facilities` | Anonymous, publishable facilities and capacity classes |
| Emergency report | `/disaster/report` | Anonymous minimum-service report; abuse controls independent of blanket login |
| Public nearby | `/disaster/nearby` | Anonymous approximate-nearby view; precise location is never disclosed by default |
| Public support overview | `/disaster/support` | Public pool projections and transparency only; no victim-level data |
| Public support pool | `/disaster/support/:poolId` | Public purpose, balance/capacity projection, eligibility and support entry |
| Public support funding | `/disaster/support/:poolId/fund` | Public guest funding entry when payment/compliance policy permits; no victim-level data |
| Public verified intelligence | `/disaster/intelligence` | Anonymous verified claims only; current independent-source lineage is rechecked before publication |
| Authenticated emergency workspace | `/dashboard/emergency` | Authenticated user landing with own cases, relevant actions and role-aware navigation |
| My cases | `/dashboard/emergency/cases` | Authenticated, tenant/user-scoped case list |
| Case detail | `/dashboard/emergency/cases/:caseId` | Server-authorized case context, consent, timeline, needs and updates |
| Responder workspace | `/dashboard/emergency/respond` | Verified responder roles only |
| Command center | `/dashboard/emergency/command` | Explicit operations/command permissions only |
| Intelligence review | `/dashboard/emergency/command/intelligence` | Operations plus verifier capability for source activation and claim publication |
| Sponsorship administration | `/dashboard/emergency/sponsorship` | Authorized sponsor/operator scopes; never victim-level access by implication |
| Sponsor/account history | `/dashboard/emergency/support/history` | Authenticated user's own support history and receipts |

### Navigation requirements

- Public `Navbar` gains a clearly named “Emergency / ภัยฉุกเฉิน” entry to `/disaster`; the emergency overview links to the public map, alerts, report, facilities and support routes.
- The shared menu catalog adds one role-neutral `emergency` main item to `/dashboard/emergency`. Role-specific child navigation is rendered only when server-provided capabilities permit it.
- Dashboard quick actions add an “Emergency” shortcut pointing to exactly `/dashboard/emergency`. Do not duplicate routes or link to a placeholder page.
- Responsive emergency navigation exposes Map, Nearby, Alerts, Report, My Case/Cases, and Help/Assist according to the Spec 260 role/projection rules.
- All deep links, notification links, and public event references resolve through the same canonical route table. Authorization decisions remain server-side and do not change based on the entry path.
- Add route inventory tests for every route above, role-denial tests for restricted routes, and navigation tests proving public links do not redirect to login.

### API projection boundary

Use an explicit Cloudflare Worker API namespace such as `/api/public/emergency/*`, `/api/auth/emergency/*`, `/api/verified/emergency/*`, and `/api/operations/emergency/*`. Final path registration must be recorded once in the route manifest and tested against the deployed Worker router. Public APIs return public DTOs only, receive independent abuse/rate controls, and never accept client flags to request a restricted projection. Restricted responses use private/no-store semantics and server authorization.

## 4. Development sequence and exit gates

Each wave has a defined verification suite, but at the user's direction all implementation test suites are authored during development and executed together only after Wave 13 implementation is complete. Real Cloudflare environment verification remains deferred to Wave 14. Static source review may catch and close obvious blockers in the meantime; no test pass is claimed before the final integrated run.

### Wave 0 — Scope, spec consistency, ownership, and architecture records

**Work:** Normalize Spec 260's compatibility language under R1.37; map every normative section/pass and acceptance scenario to a feature/module; resolve conflicts with Specs 186/195, 214/215, 229, 231/232, 242, 245, 251, and 257; record service ownership, data authority, the shared `packages/shared/src/emergencyRouteManifest.ts`, public/private DTO boundary, atomic report/outbox commit, R2 media boundary, retired-system exclusions, and no-legacy rollback semantics. Include the R1.33–R1.37 marketplace, Thai financial-control, and Cloudflare/no-legacy additions.

**Exit:** No unresolved duplicate authority; every section/pass is mapped or explicitly deferred; Worker and browser consume the same route manifest; anonymous success requires an authoritative database transaction; media/job ownership and binding failure behavior are explicit; source spec and implementation plan agree.

### Wave 1 — Shared contracts and safety kernel

**Work:** Define versioned hazard taxonomy; event/incident/situation/need/task/resource/team/person/location/message/evidence/consent/disclosure/verification/sponsor/financial contracts; state machines; provenance and freshness; tenant and jurisdiction boundaries; audit envelope; idempotency; policy evaluation interfaces; capability-based authorization; public/restricted projection DTOs; the shared route manifest and API authorization classes.

**Verification:** Schema/contract tests, state transition/property tests, tenant-isolation negatives, permission matrix negatives, immutable audit/replay tests, and cross-module type compatibility. No production resources or live credentials.

**Exit:** All downstream modules consume shared contracts; critical transitions are append-audited and deterministic; test corpus proves public projection cannot contain restricted fields.

### Wave 2 — Persistence, identity linkage, and durable execution

**Work:** PostgreSQL/PostGIS schema and additive forward migrations; indexes and tenant scoping; consent/disclosure records; canonical media/evidence object references; emergency credit/financial references; atomic outbox admission through `worker_jobs`; reference-only queue envelopes; idempotent consumers and fencing; recovery/reconciliation jobs.

**Verification:** Migration replay on disposable local DB, PostGIS query/constraint tests, duplicate-delivery and lease/fencing tests, outbox atomicity, restart/reconciliation, and fault-injection tests. Keep all provider operations mocked or local.

**Exit:** One authoritative record per business effect; jobs cannot run without canonical admission; data survives worker restart and replay.

### Wave 3 — Cloudflare application skeleton and route foundation (code only)

**Work:** Implement Spec 260 Cloudflare Worker endpoint registration from `packages/shared/src/emergencyRouteManifest.ts`, API middleware delegating to canonical identity/authz contracts, public cache policy declarations, private no-store enforcement, structured redacted observability, explicit Cloudflare binding policy that fails closed, environment binding schemas, and deployment configuration templates. Establish frontend routes, bilingual navigation, public site entry, dashboard entry, sidebar menu and quick link from that same manifest. Build functional loading/error/offline/denied/unsubmitted states.

**Verification:** Worker unit tests with binding fakes, one shared route manifest coverage across browser and Worker, no legacy import/path/fallback/dual-write checks, binding-unavailable fail-closed checks, cache-header tests, anonymous accepted-vs-unsubmitted checks, R2 access policy checks, client route/render tests, permission tests, link target tests and build/static analysis. Do not run `wrangler deploy`, account probes, resource provisioning or Cloudflare canaries.

**Exit:** Every agreed URL renders the right implemented page or an intentional permission/empty state; no navigation item points to an absent route; public entry remains anonymous during auth-service failure.

### Wave 4 — Citizen emergency intake and public information

**Work:** Anonymous and authenticated report intake, SOS, chat/voice intake, approximate/manual location, evidence upload initiation, temporary case continuity and claim flow, public warnings/event/facilities/nearby projections, public report abuse controls, case updates, no-credit emergency path, SEO/indexability and public accessibility.

**Verification:** Full intake API/UI integration tests against local services; auth-outage simulations; anonymous-to-account provenance tests; exact-location leakage negatives; upload quarantine/privacy tests; accessibility and keyboard tests.

**Exit:** Public emergency information and minimum reporting work without login, LLM, geocoder or user credit; user receives a durable case reference and next step.

### Wave 5 — Geospatial intelligence and map experience

**Work:** MapLibre client; PostGIS viewport/nearby/search; public vs operational projections; privacy geometry; freshness; source attribution; clustering/LOD; public-safe media; basemap adapter; offline map/status contracts; alert polygons; accessible list/map parity; route/accessibility overlays.

**Verification:** Spatial query fixtures, privacy geometry boundary tests, stale/conflicting feed scenarios, map component tests, viewport cost budgets using local instrumentation, mobile/responsive/accessibility checks, degraded/offline replay.

**Exit:** Every map function has a list equivalent; cached state is visibly stale; absence of a marker is not represented as proof of safety.

### Wave 6 — Case intelligence, shared context, triage, and safety protocols

**Work:** Temporal facts and provenance; Case Brief; duplicate-question guard; needs and revisions; deterministic triage rules; AI extraction/summaries as advisory; reassessment; protocol packs for all hazards; special medical/security/civil/crowd cases; no-response behavior; misinformation and verification queues.

**Verification:** Golden scenario tests, stale fact and update-delta tests, prompt-injection/source-provenance tests, no-opaque-AI-decision negatives, sensitive safety protocol tests, LLM/provider outage tests.

**Exit:** Raw evidence remains preserved; AI cannot independently deny or dispatch high-risk response; stale facts trigger reassessment rather than false closure.

### Wave 7 — Response operations, teams, resources, and command center

**Work:** Task offer/claim/assignment/activity/dependency; partial fulfillment; multi-team concurrency; organization and capability model; resource inventory/commitment/delivery; handoff; responder workspace; command center queues, map, audit and exception tools; strict operator scopes.

**Verification:** Concurrency/race tests, partial/disputed completion tests, command authorization negatives, task fencing/idempotency tests, audit reconstruction and operator usability/accessibility checks.

**Exit:** Teams can work independent needs simultaneously; provider completion is distinct from citizen verification; unauthorized users cannot enumerate cases or exact locations.

### Wave 8 — Communication, alerts, and cross-device/offline operation

**Work:** Emergency Case Chat; contact graph; channel capability/failover; acknowledgements; CAP-compatible alerts; subscriber lifecycle; deduplication/bundling; deep links; low-power mode; offline mutation queue; conflict resolution; responsive PWA navigation and notification center.

**Verification:** Retry/duplicate/late-ack tests, notification privacy tests, critical correction delivery tests, offline replay/idempotency, stale-link authorization, assistive technology and device capability matrix.

**Exit:** Communication failure is visible and recoverable; delivery does not imply acknowledgement; offline actions reconcile without duplicate effects or history rewriting.

### Wave 9 — Mutual aid, federation, and external capability interoperability

**Work:** Opt-in helper discovery; privacy-preserving proximity; eligibility and safety envelopes; task-specific disclosure grants; external agency/federation contracts; MCP/API capability discovery; revocation and jurisdiction boundaries; trust registry and capability provenance.

**Verification:** No unsafe dispatch negatives; grant expiry/revocation tests; federation tenant isolation and authority boundaries; external schema validation; cross-jurisdiction policy tests; no repeated coarse-query location reconstruction.

**Exit:** Helpers receive only minimum necessary context; external parties do not inherit dispatch authority; revoked federation access stops future reads.

### Wave 10 — Evidence-grounded intelligence, news watch, and anticipatory operations

**Work:** Feed/source registry; retrieval and ingestion; deduplication and claim graph; authenticity/independence; verification and human review; publication/correction/retraction; forecasting; route-risk and resource-demand briefs; scheduled/event-triggered research through Skills and canonical background jobs; cost budgets.

**Verification:** Source authenticity fixtures, cross-language provenance tests, prompt-injection and synthetic-media tests, publication threshold and correction propagation tests, retrieval outage and budget exhaustion behavior, no duplicate job/charge tests.

**Exit:** Public claims are evidence-grounded, freshness-labelled and correctable; unverified claims are never upgraded by mirrored copies; critical emergency intake is isolated from research surge.

### Wave 11 — Sponsorship, economic controls, marketplace, and Thai finance/tax

**Work:** Sponsor pools and restricted purposes; eligibility and credit allocation; reservations/metering/settlement; emergency credit path; sponsor transparency projections; public support and user receipt/history routes; local emergency service marketplace, provider trust/quotes/bookings/disputes; FinancialEvent and balanced journal projections; PromptPay/cash reconciliation; VAT/e-tax/WHT lifecycle; advances/expenses/assets; close, retention and AuditPackage.

**Verification:** Credit conservation, no personal-wallet miscredit, restricted-fund enforcement, balanced accounting, duplicate/ambiguous payment handling, payout segregation-of-duties, tax-policy effective dating, financial retention/masking, close exception and audit reproducibility tests.

**Exit:** Money movement and sponsor restrictions reconcile; emergency eligibility never depends on user balance; accounting corrections preserve original evidence; finance/audit access does not imply victim access.

### Wave 12 — Security, privacy, resilience, and operational completeness

**Work:** Threat model and abuse review; data minimization; consent/disclosure audit; service quotas and backpressure; surge modes; disaster recovery; restore reconciliation; retention/deletion/legal hold; observability budgets; SLOs/runbooks; operator break-glass; accessibility and multi-tenant review; cost model; incident response.

**Verification:** Cross-module adversarial tests, authorization and data-leak regression suite, load/surge tests, chaos/fault injection, backup/restore drills, RPO/RTO evidence from reproducible non-production infrastructure, accessibility audit and operational tabletop simulation.

**Exit:** All Spec 260 Definition of Done criteria and later acceptance additions have linked evidence; unresolved gaps are explicitly classified and block release when life-safety, privacy, financial integrity, or tenant isolation is involved.

### Wave 13 — Complete-system local/CI integration and release candidate

**Work:** Exercise the mandatory end-to-end scenarios in one release candidate: zero-credit trapped patient; tell-once multi-team handoff; partial help; stale water report; unverified collapse; personal-security report; crowd safety without profiling; low battery; no response; consent-bounded helper; private original/public derivative; concurrent teams; duplicate reports; disputed delivery; LLM outage; cross-jurisdiction flood; source correction; sponsored restricted funds; PromptPay ambiguity; and Thai month/period close.

**Verification:** Complete automated suite, database migration/replay, browser E2E on test fixtures, API contract suite, security/privacy suite, accessibility/responsive suite, load/chaos/recovery suite, and release artifact/config lint. All integration dependencies are faked, local, or disposable; no Cloudflare account/environment access is used.

**Exit:** One immutable release candidate and evidence manifest are ready. All requirements are traced to code and tests; no placeholder routes, unresolved failing gates, TODO-only modules, or unowned external bindings remain.

### Wave 14 — Final real-Cloudflare integrated verification and launch decision

This is the first and only planned phase that uses a real Cloudflare environment. Run only after Wave 13 passes and the release candidate is frozen.

**Sequence:**

1. Provision isolated non-production Cloudflare resources from reviewed configuration and least-privilege credentials; verify Workers, routes/domains, KV, R2, Queues, Durable Objects only if selected, Hyperdrive/database connectivity, logging, secrets, WAF/rate controls, and cache rules.
2. Deploy the full integrated release candidate once to staging; run public anonymous route smoke, auth/role routes, API projections, map reads, upload/private-media access, durable job/outbox and queue delivery, realtime/alerts, credit/sponsor restrictions, and full cross-module scenarios.
3. Exercise real Cloudflare failure/degradation controls, logs/alerts, rollback to a prior Cloudflare release, and forward-safe reconciliation. No legacy runtime fallback is allowed.
4. Fix failures in code/config, return to local/CI evidence for affected changes, freeze a new release candidate, then rerun the complete final Cloudflare verification—not a sequence of piecemeal early canaries.
5. Make a separate production go/no-go decision after staging evidence, credentials/entitlement, budget, legal/privacy approval, runbooks, support coverage, and rollback evidence are signed off. Production rollout is not implied by successful staging.

**Exit:** Final report proves each real Cloudflare binding and end-to-end responsibility, records exact release/config revision, evidence time and environment, and explicitly separates staging proof from production proof. Production remains “unverified” until production evidence exists.

## 5. Test and evidence policy

### During implementation

- Author focused tests for every contract, state machine, authorization boundary, projection, concurrency rule, retry, and failure mode alongside its owning code; do not execute product test suites until Wave 13 implementation is complete.
- Provide deterministic service/binding fakes and disposable local fixtures so the final local/CI pass does not need account access or deployments.
- During implementation, review route/data flow and diffs statically, resolve visible blockers, and keep a checklist of the test commands/evidence to run once at the end. Do not claim test evidence before that final pass.
- Never use a passing mock suite to claim real Cloudflare provider behavior.
- Keep source tests for no-legacy behavior: no old runtime router, old service imports, compatibility shim, dual-write, or fallback branch is introduced for Spec 260.

### Deferred until Wave 14

- Real Cloudflare resource provisioning, credential probes, deployment, binding validation, provider connectivity, traffic/canary, and live observability checks.
- Real WAF/rate/cache behavior, Queues/DO behavior, real R2 permissions, Hyperdrive connectivity, domain routing, and production-region behavior.
- Production claims, live-user behavior, and external provider/agency interoperability.

## 6. Dependency graph and critical path

```text
Wave 0 scope + platform contracts
  → Wave 1 domain/security contracts
  → Wave 2 persistence + durable job admission
  → Wave 3 Worker/router + frontend route foundation
  → Waves 4–8 citizen, map, case, operations, communications
  → Wave 9 mutual aid/federation
  → Wave 10 intelligence
  → Wave 11 finance/marketplace
  → Wave 12 cross-cutting hardening (continues throughout, closes here)
  → Wave 13 full local/CI release candidate
  → Wave 14 one integrated Cloudflare staging verification
  → separately authorized production rollout and final production evidence
```

Waves may be internally split into independently reviewable implementation sections after Wave 0 locks the contracts. Do not parallelize work that writes shared schemas, route manifests, accounting authorities, or permissions until those contracts have one named owner and stable interfaces.

## 7. Traceability and required implementation artifacts

Before code starts, create a section index with one implementation section per bounded workstream and a requirement trace matrix covering:

- Spec 260 sections 1–37: domain kernel, initial M0–M8, and initial acceptance/DoD;
- sections 48–93: map/geospatial architecture and map gates;
- sections 94–176: progressive public access, responsive experience, surge architecture and intelligence;
- sections 177 onward through R1.37: evidence, federation, mobility, compatibility cleanup, sponsor economics, news integrity, marketplace, Thai financial controls, and Cloudflare/no-legacy boundaries.

Each section must state: requirements covered; owned paths/symbols to discover; dependencies; data/API/UI contracts; RED/GREEN test cases; security/privacy negatives; observability/failure behavior; local verification commands; explicit “real Cloudflare verification deferred to Wave 14” note; and a definition of done. The R1.37 suite must prove shared route registration, no legacy imports/routes/fallback/dual writes, transactional anonymous acceptance, reference-only job publication, R2 metadata/access boundaries, and fail-closed Cloudflare bindings.

## 8. Risks and blockers

1. **Specification breadth:** Spec 260 has expanded far beyond its title. Wave 0 must treat every normative addition as in-scope or record a precise product deferral; otherwise “complete” is ambiguous.
2. **Conflict with migration specs:** Spec 245/257 contain staged migration and legacy-continuity language. Spec 260 must consume their canonical service contracts without importing legacy compatibility into the new product. Platform-wide cutover remains governed by Spec 245.
3. **No existing feature implementation:** Route/link changes cannot be delivered alone as a working feature. The route foundation is Wave 3 and must ship with real pages and API ownership in dependent waves.
4. **Cloudflare account constraints are intentionally late:** service plan, quotas, entitlements, and bindings are not yet real-environment verified. The final gate may reveal service limits that require architecture changes; those return to code/design and then restart the final integrated gate.
5. **Legal and operational dependencies:** Emergency dispatch, communications, privacy, public warnings, donations, marketplace payouts, Thai tax and WHT require named policy/legal owners before production launch.
6. **No production safety proof from code tests:** Local/CI evidence cannot certify service entitlement, real emergency authority data, live delivery, operational staffing, or production readiness.

## 9. Planning evidence and references

- Spec 260 source: `spec.md`, especially §§35–37, §§48–80, §§94–120, §§153–176, later domain additions, and R1.37.
- Spec 245: `specs/feature/245-Full-System Cloudflare Migration Master Plan/spec.md` — Cloudflare-first target and platform migration authority; its deployment/live status is explicitly not certified.
- Spec 257: `specs/feature/257-cloudflare-admin-control-plane-and-redisless-readiness/spec.md` — planning-only Cloudflare control plane and queue/cache convergence boundaries.
- Current route sources inspected: `apps/web/client/src/App.tsx`, `apps/web/client/src/pages/Dashboard.tsx`, `packages/shared/src/constants/menu.ts`, `apps/web/client/src/pages/Home.tsx`.
- Cloudflare Hyperdrive connection limits: https://developers.cloudflare.com/hyperdrive/platform/limits/
- Cloudflare Queues at-least-once delivery and idempotency guidance: https://developers.cloudflare.com/queues/reference/delivery-guarantees/
- Durable Objects coordination and realtime capabilities: https://developers.cloudflare.com/durable-objects/
- Durable Objects alarms retry semantics: https://developers.cloudflare.com/durable-objects/api/alarms/
- Workers observability configuration: https://developers.cloudflare.com/workers/observability/logs/workers-logs/

## 10. Review checklist

- [x] Public and authenticated routes are distinct and have explicit permissions.
- [x] Dashboard sidebar and quick-link destinations are specified and identical.
- [x] Legacy compatibility/fallback conflicts are called out as Wave 0 work.
- [x] Canonical PostgreSQL/PostGIS and `worker_jobs` authorities are preserved.
- [x] Cloudflare provider verification is deferred to the final integrated phase.
- [x] R1.37 review findings are addressed in route, anonymous-intake, queue, media, retired-system and binding-policy boundaries.
- [x] Local/CI tests continue during development, without claiming provider proof.
- [x] Production approval is separate from successful staging verification.
- [ ] Product/legal owners confirm emergency service authority and finance/tax policy before production.
- [ ] Wave 0 requirement trace matrix and bounded section plans are generated before implementation.
