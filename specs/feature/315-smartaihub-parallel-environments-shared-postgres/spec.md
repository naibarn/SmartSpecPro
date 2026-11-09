---
spec_id: 315
semantic_id: smartaihub.parallel-environments-debian-first
revision: R1.6
date: 2026-11-09
status: PROPOSED_NOT_IMPLEMENTED
title: SmartSIHub Three-Domain Parallel Development, Production-Parity Access and Canonical Core PostgreSQL
---

# SPEC-315 — Three Domains, Debian-first Acceptance and Canonical Core PostgreSQL

> **Current-revision note (R1.6, 2026-11-09):** Earlier proposal text is retained for provenance. The R1.6 owner clarification controls conflicting R1.5 wording about database sharing, data isolation and environment tenants.

## 0. Owner-approved topology

| Deployment target ID | Public host | Purpose | Runtime |
|---|---|---|---|
| `legacy-debian-dev` | `smartaihub.app` | Legacy development and still-active old features during migration | Existing Debian Node/Python, retained original services |
| `modular-debian-dev` | `aimarkethubs.com` | NEW modular platform dev and authenticated browser UAT | Debian local `workerd`/Wrangler + static UI services |
| `modular-cf-staging` | Separate private staging endpoint (actual URL discovered at provisioning) | Cloudflare binding/network/integration proof | Cloudflare Workers |
| `modular-cf-production` | **`smartsihub.com` (confirmed, canonical)** | NEW modular SaaS production, including controlled real-user beta | Cloudflare Workers/Hono + static assets |

**The hostname is neither a permission oracle nor sufficient proof of a deployment environment.** Deployment identity is an explicit signed/verified target record, service identity, release SHA/config and tenant/domain mapping. `NODE_ENV=production` for optimized execution is not authority to deploy to production. `smartaihub.app` remains usable for real legacy users until their modules are individually migrated; changing the target's intended classification must not cause unplanned downtime or grant unsafe access.

## 1. Developer functional parity (critical requirement)

`aimarkethubs.com` MUST expose the same SaaS Core and Module capabilities and the same business policy evaluation as `smartsihub.com` for the **same authorized user/tenant/role/entitlement**. Dev access is restricted to authorized developers; their existing role and applicable permissions are not arbitrarily downgraded because the domain is development. Do not require a separate fake user system, fake credit calculation, extra approval hierarchy or dev-only business-code branch. Both environments use the same PostgreSQL `smartspec` **for Core identity, tenant, wallet/ledger and job-control data**. This does not authorize new Mini App business tables in Core. New Mini Apps use their independent App database even when their authentication and billing API refers back to the canonical Core user and ledger (SPEC-323).

This parity does NOT authorize bypassing tenant isolation, accessing ungranted customer data, producing duplicate charges/jobs, changing production schema automatically, or sending unintended external effects. Real business write flows are allowed only under their genuine tenant-role permissions and transaction controls; test jobs/transactions must have traceable provenance.

## 2. Database single authority and execution fencing

- Canonical PostgreSQL `smartspec` on its existing host. No new identity/ledger DB, no separate dev-only business schema as a precondition to testing.
- Read and write access on `modular-debian-dev` MUST be functionally equivalent to production for the principal's legitimate scopes. Credentials may differ operationally but cannot silently change business logic.
- Database-level privileges and tenant fences still apply. Every call carries verified `userId`, `tenantId`, `environmentTarget`, `requestId` and role authority; administrative actions must be expressly authorized.
- Authoritative writer for each table/command path documented in an ownership matrix. Dual runtime / dual read is permitted; uncoordinated dual write for money, auth, app installs, canonical jobs or external service effects is NOT.
- Use transactional or authoritative read paths for mutable sessions, MFA, financial records, permissions and entitlements; Hyperdrive local mode connects directly and does not reproduce managed pooling/cache.
- SPEC-295 migration authority owns schema changes, drift and backwards compatibility. No auto-DDL on app start, Build, Worker cold-start or regular API call.
- Job and outbox consumers across Debian and Cloudflare must use existing lease/fencing/cancel/idempotency; dispatch ownership is explicit per tenant/job scope, no simultaneous execution by accident.

## 3. Debian runtime development target

As the first concurrent discovery task (not a build gate), inspect live DNS, cloudflared ingress, original `smartspec-web.service`, `smartspec-dev-web.service`, Node worker, reserved ports, `.env` mapping and current database role behavior. Repository source reveals old `scripts/release-dev-web.sh` and `apps/web/scripts/verifyDevWebConfig.mjs` hardcoding `aimarkethubs.com` to the previous legacy dev service; `apps/web/scripts/devWebDatabase.mjs` currently demands `_dev` DB/role in its development mode. These contracts SHALL be migrated explicitly, not string-replaced blindly or broadly bypassed.

- Existing `smartaihub.app` Linux service remains under its existing verified release controller until an audited role migration can be done without downtime.
- New modular dev uses **separate systemd service(s)** and independent port(s), clean build/artifact directories and route config. Ports and service unit names are selected from real inventory; suggested 3200/3201 are not assumed free.
- `aimarkethubs.com` must serve actual new Modular Core/Shell, not a proxy to old `apps/web` masquerading as acceptance.
- Test Workers with Wrangler local `workerd` on Debian; test static UI via its own development artifact; expose authenticated browser UAT through approved external HTTPS ingress.
- Local Miniflare/workerd is NOT a security sandbox for untrusted customer code; only run trusted first-party sources or use hardened VM isolation.

## 4. Authentication and external integration parity

- Same account/password/MFA and tenant membership across domains; sessions/cookies issued separately per browser origin with correct expiry, CSRF and revocation.
- OAuth redirect URIs, email links, allowed origins, provider webhooks, custom domain mapping and login callbacks are explicit per host. No wildcards for privileged callback redirect.
- Wallet and payment use canonical business rules and actual ledger; test data/transactions are identifiable. If provider sandbox vs live changes the actual money-flow semantics, mark the discrepancy and run an explicitly authorized, bounded validation rather than claiming parity automatically.
- Outbound side effects (social posts, mail to third parties, live payment capture, irreversible vendor purchases) require their normal legitimate authorization and explicit target/audience. Do not add global dev feature blockers that alter role/entitlement results.

## 5. Release path: Debian-first with early deploy for human UAT

`working source -> targeted module build + quick local tests -> Debian workerd/API/browser UAT at aimarkethubs.com -> stable committed SHA -> scoped Cloudflare Worker preview/staging or direct bounded beta deployment -> smartsihub.com restricted real-user beta -> fixes -> audience expansion -> independent module maturity`.

**Debian first** means always exercising the executable slice there before Cloudflare; it does **NOT** mean complete all routes, run every automated suite, obtain ten green badges or keep the Cloudflare website inaccessible until the whole project is finished. Codex is expected to deploy a partially functional but honest beta promptly. User-accessible URL and human feedback are primary product evidence. For essential enabled auth/tenant/payment operations, run narrow smoke/integrity checks first; noncritical deficiencies become issue tickets and are fixed in follow-up deploys.

Cloudflare staging from SPEC-311 was decommissioned 2026-11-01. Do not assume it remains live or silently recreate it. Use a newly scoped minimal preview/beta Worker; standalone Cloudflare staging is useful but **not mandatory as a separate long-lived environment** if the isolated beta deployment itself permits genuine binding/network verification and rollback. Cost/always-on resources should remain minimal.

`DEV_CHECKS`: interactive login, role parity, shared database identity and safe writes, public HTTPS route, separate service restart, a human able to reproduce the feature. `CLOUDFLARE_CHECKS`: exact target, Worker start/route/bindings, actual database connectivity, auth isolation, verifiable origin and rollback version. These are scope-specific observables, not a program-wide acceptance gate. Unknown in unrelated modules does not prevent restricted release of ready slices.

## 6. Deployment authorization

Codex/Runner MAY automatically build, test, restart and deploy the two **authorized Debian development targets** using scoped service privileges and existing release controllers; no repetitive, mistaken production approvals just because one target's domain historically hosted production. Production Cloudflare deployment is an independent exact-artifact release governed by SPEC-295. Do NOT disable legitimate OS/Cloudflare/provider nondelegable boundaries or bypass role/tenant permission checks to make a release pass.

## 7. Failures, recovery and narrowly scoped hard stops

Do not use a global `BLOCKED` state for documentation drift, unavailable optional providers, incomplete module census, polish, estimates, missing full-soak reports or GitHub checks unrelated to the selected module. Continue implementation and real-user tests of unaffected functionality.

Only the **affected operation** is stopped if: (a) verified wrong-domain/wrong-account/wrong-tenant deployment or lack of real scoped authorization; (b) active users would be cut off without a fallback; (c) cross-tenant data or secrets exposed; (d) unauthorized financial mutation, corrupted Ledger or double settlement; (e) irreversible destructive DB changes or unbounded external side effects. Record precise problem, operator action and adjacent work that remains enabled. For ordinary dev deploy, Codex should recover services and rerun targeted smoke automatically under delegated rights.

## 8. Shared identity vs external financial effects

The Dev and Prod runtimes share users, tenant IDs and the canonical wallet/ledger. **Full functional permission parity** means an existing approved developer can use legitimate Core functions, including real read/write and credit transactions with audit identity, not a fake downgraded tenant. Access to `aimarkethubs.com` is restricted to authorized developers. Account/role/tenant checks are enforced identically at the application layer. Environment alone never manufactures `ADMIN` or unlimited credit.

External irreversible actions (live merchant settlement, posting to external audiences, billable vendor usage, email to third parties) remain real-world side effects even if initiated by a developer. They require the normal user authority plus explicit selected target/recipient, idempotency and a bounded budget. Offer sandbox/test mode as an option where useful, not mandatory alternative business logic. No second ledger, no shadow billing and no automated test that spends money silently.

## 9. Deployment-target reassignment

Do not globally replace `smartaihub.app` strings with `smartsihub.com`: the old host still serves some users and existing callbacks may point there. Read actual Debian/tunnel/DNS systemd service mapping. Reassign only reviewed host/service bindings; keep `smartaihub.app` functioning during coexistence, `aimarkethubs.com` new-platform Debian endpoint, `smartsihub.com` new Cloudflare Production. No forced Host/DNS cutover from legacy is required to allow new-domain beta. Codex has no automatic authority to change DNS or mass-migrate user sessions.

## 10. R0.3 — Database schema identity and performance parity between runtimes

- `aimarkethubs.com` (Debian local workerd) and `smartsihub.com` (Cloudflare Workers) execute the **same newly written Core domain logic and small DB repository adapters** against the **same existing PostgreSQL `smartspec` schema/data**. They do NOT convert SQL schema to D1, alter password hashes, rekey user/tenant records, duplicate Wallet Ledger, import a copy of the legacy database or require a new dev-only DB as a default.
- Select **`pg` (node-postgres)** as primary Worker/Hyperdrive DB driver; use the same typed SQL contract on Debian via direct connection. Runtime transport differs, application business logic does not. Profile `pg` bundle/latency; a replacement driver requires equivalent behavior and a measured justification. Never load the entire legacy Drizzle/ORM schema to support one handler.
- Build a source-controlled **schema-compatibility map** (actual table, read/write fields, constraints/indexes, enum/trigger semantics, tenant filter and original writer) from catalog readback. First vertical slice uses original existing tables, not proposed substitute tables. ZERO DDL is the default; new metadata is separate optional additive migration through canonical authority if absolutely required.
- Keep a cache-disabled Hyperdrive configuration for all authentication, revocation, membership, entitlement, financial balance and read-after-write operations. Only use cached reads after explicitly classifying them stale-tolerant, and re-evaluate summed origin connection pools; use prepared/parameterized SQL and bounded connection counts.
- Record p50/p95/p99 database/endpoint latency, SQL query count and DB round trips under the *same controlled user journey* on Debian and Cloudflare; report network placement, cold/warm behavior and connection usage. The Cloudflare result may differ from local workerd even with identical business logic. Do not assert parity based solely on unit tests.
- Restrict general developer access to the new development hostname while enforcing the **actual same user/tenant rights** in Core. Source DB is shared and may contain live users, so avoid irreversible external effects and double writers; this is about data correctness, not a dev-only reduced permission system.

## 11. R0.5 — Same job contract across Debian and Cloudflare

`aimarkethubs.com` exercises the identical canonical PostgreSQL `worker_jobs`, outbox, ownership, lease and budget contracts as `smartsihub.com`; it MAY use direct DB claim + local Rust/Python executor without buying Cloudflare Queue usage before launch. Production can enable a scoped Cloudflare Queue transport per workload. Both sides require mutually exclusive eligible execution ownership by job/environment/tenant and robust lease fencing, duplicate handling and one settlement. A native Rust executor on existing Debian is a **hybrid production dependency** if still used by production; disclose it and test failure, do not describe it as Cloudflare-only or automatically migrate services. Credentials for any HTTP Pull Queue are scoped and separate per environment; no shared production-consumer token in dev. See SPEC-318.


---

## R0.6 Addendum — Credit conversion across shared DB and public domains (2026-11-01)

- `aimarkethubs.com` Developers use same effective role, tenant, entitlement and **versioned new-unit wallet** rules as `smartsihub.com`; host identity alone does not change user economic value. Historical credit ledger rows are immutable; SPEC-321 owns conversion policy, SPEC-207 remains writer.
- Old `smartaihub.app` writer and new Core cannot simultaneously treat the same physical numeric credit balance as 1000-credits/USD vs 10000-credits/USD. Coordinate a version-aware adapter or controlled financial transition with no old/new double writer. Scope of monetary safety may be temporarily held without stopping all UI and non-money changes.


---

## R0.9 — Agentic Payments / Platform Subscription / PAYG integration

Shared canonical PostgreSQL `smartspec` stores identity, credit balances, monthly Platform plan grant event IDs, per-App subscription rights, agent spend authority references, reservations, limit/debt projections, invoicing and immutable receipts under existing SPEC-207; any new tables must be justified by catalog readback and additive migrations. Dev `aimarkethubs.com` retains production-equivalent authorized business capabilities with Dev-only audience; exercise money flows with explicit dev accounts and legitimate scoped payment providers, not guessed live charges. Old/new writers must understand the same `CREDIT_UNIT_VERSION=2` before any concurrent financial mutation. `smartsihub.com` is definitive production target.

## R1.0 — Clarification of shared PostgreSQL scope
The phrase “shared PostgreSQL” in the earlier draft refers solely to one canonical Core control plane accessible from the 3 authorized runtime environments, **NOT** a shared application-data database for new Mini Apps. Existing Legacy-derived App tables MAY continue in `smartspec` under an explicit Legacy Shared-DB Exception registry tied to exact App IDs and tables. Every new persistent Mini App chooses independent D1 or PostgreSQL ownership/deployment, including BYOC or self-hosting. Backend calls to Core for identity, jobs and metering do not mean business data is stored in Core. Never give an external App direct Core DB credentials.


## R1.1 — Owner-directed autonomous bootstrap and priority order (2026-11-01)

**Normative owner directive:** ALL development of the new SmartSIHub platform SHALL be initiated, orchestrated, observed and accepted through the *currently running* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator facilities, using their existing SPEC-224 Job/Run, Runner, Workspace, Harness and deployment authorities. `smartaihub.app` is the **temporary development control plane**, not the new SaaS Core implementation or the new production domain. This rule applies to source changes, builds, tests, release requests, UAT and repair work; executors may run CLI internally as delegated tools. An emergency out-of-band repair is permitted ONLY when the old UI/control path is nonfunctional; reconcile its exact SHA/Run/receipts back into the canonical record as soon as recovery permits. Never claim that a task was executed through the UI unless actual Run evidence confirms it.

The priority order is fixed for planning: **P0 legacy autonomous-system repair/proof → P1 fresh lightweight Core/Shell → P2 Chat → P3 Autonomous Mini App Creator → P4 new Autonomous Implements → P5 selective autonomy handover → P6 Public Portfolio/Marketplace → P7 other modules**. Thin dependencies (login, job contracts, SDK, billing read-only, public designs) MAY be built in parallel; this is an execution priority, not a global blocking gate. No new Core/Mini App is allowed to write business data into canonical `smartspec` other than the existing narrowly registered Legacy module data exception under SPEC-323.

The development loop SHALL be: **Goal entered on old website → durable Run and owned Debian workspace → implement/test/build → real `aimarkethubs.com` UAT → scoped `smartsihub.com` Cloudflare beta when appropriate → user feedback → automatic child repair/continue**. A defect in the existing control plane becomes an **in-scope bootstrap repair task** for the affected operation, not a reason to abandon the migration or create another approval system. Preserve task identity, source SHA, logs and work artifacts through restart/disconnect; no silent success claims. The new autonomous implementer becomes the primary authority only after it has completed real development tasks and recovery/rollback tests; user-visible traffic switches selectively, with the old tool retained as fallback until stable. See SPEC-324 and [roadmap](../../../docs/smartsihub-r1.4/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

The legacy website `smartaihub.app` is the *active administrative development entry point*. `aimarkethubs.com` serves the new Debian development application and human UAT; `smartsihub.com` is the confirmed new Cloudflare production domain. Do not redirect the administrator's development control UI to the new domain before the P5 autonomous handover. Keep old and new backends operational concurrently, with exact deploy-target identity, bounded credentials, and independent systemd/Worker restarts.

---

## R1.4 — Cross-SPEC owner reconciliation and execution contract (2026-11-01)

> **Historical R1.4 provenance:** retained as the 2026-11-01 proposal record. For conflicting current requirements, R1.5 controls; see [R1.5 owner-decision precedence](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md).

> **Historical R1.4 cross-spec review (2026-11-01):** This was the controlling addendum for the R1.4 proposal. It remains historical provenance; current conflicts follow R1.5 and the [R1.5 owner-decision register](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md). Earlier sections remain for context and are not deployment or implementation evidence.


### R1.4 shared invariants (normative)

1. **Identity and domains.** `smartsihub.com` is the confirmed Cloudflare **production** hostname; `aimarkethubs.com` is the Debian-first new-platform development + real-human UAT; `smartaihub.app` is the still-running legacy system AND the sole initial user-facing development-command center, to be retired as a controller only after proven selective handover. Hostname, `NODE_ENV`, public link or site labels MUST NOT be used as substitute for verified runtime target, role or payment authority.
2. **No parallel financial or job authority.** PostgreSQL `smartspec` continues to own canonical identity, tenancy, wallet/credits, subscriptions, marketplace/app IDs, and `worker_jobs`; registered **legacy-migrated data** may stay there. New stateful Mini App business data MUST use an app-specific store outside Core; stateless Apps need none. Rust, TypeScript, Mini App, Browser and external Agent MUST access central financial/job effects through the versioned authorized contracts, not invent private settlement or job ledgers.
3. **Technical baseline.** Fresh minimal **TypeScript/Hono Core Workers**, **React/TypeScript fixed shell + optional OpenUI interactive renderers**, **Astro public marketplace** built from scratch, **Rust-native long-running supervisor** and TypeScript Queue transports. Never convert/copy the legacy server wholesale or require Rust/Wasm in every Core API. Optimize JS/asset/bundle size and queries using measurements, without blocking unrelated UAT on advisory targets.
4. **User-centric autonomy.** P0 repairs and exercises existing `smartaihub.app` Autonomous Implements / Creator; P1 new Core; P2 Chat; P3 Mini App Creator; P4 new Autonomous Implements; P5 selected authority handover; P6 portfolio/public marketplace; P7 remaining modules. Priorities allow parallel safe preparation, never global step-by-step approval loops. Scope only actual unauthorized data/finance, wrong-target deployments, unsafe effects or unavailable nondelegable authority.
5. **Chat-first, always-on when truly hosted.** Human Chat is the front door; direct HTTPS/MCP enables Agent use without UI. Dynamic inline diagrams/interactive forms/OpenUI and artifact/browser side-panels render one canonical action/run identity. `worker_jobs` persists independently of user browser sessions, but **do not claim cloud 24/7 persistence** for a job whose only authorized executor is an offline user device.
6. **Browser and Computer Use.** SPEC-208 remains authoritative: deterministic eligible-route policy then optional Clef bounded decision; direct API/MCP first, Chromium/Playwright dependable pilot, **Moli explicitly unqualified for production pending isolation/security evidence**, Kitesurf only supported beta profiles, Windows/Linux desktop via approved Runner. Browser snapshots/session state are not durable Job authority. WebMCP browser tools are optional early-preview projections, not a headless server API or permission escalator.
7. **Economic and commercial identity.** 1 USD = 10,000 **new** credits; preserve old purchased/earned value by atomic denomination-versioned x10 migration for old units, avoid historical ledger rewrite and mixed unit writers. Only four revenue roles (Platform, Tenant Infra, Mini App, Skill) credit verified owner user wallets. One-time referral bonus is Platform-funded, not a fifth share. SmartSIHub **platform** subscription (monthly credits) is distinct from Mini App subscription (only new **exclusive** in-app Skills included); all shared/external Skills charged per distinct invocation. Pay-as-you-go reserve/actual settle/unused release and per-class overdraft default **zero** unless authorized. Users must have a SmartSIHub account; paid platform subscription is not universally mandatory.
8. **Cross-provider portability and idempotency.** Core remains PostgreSQL; independent new Mini Apps use app-owned **D1** / independent PostgreSQL or self-hosted storage under **BYOC** or managed deployment. **Idempotency** is required for job admission, shared Skill usage, credit reservation/settlement, subscription grants, referral bonuses and replayed webhooks; this is a business-effect invariant rather than a new global approval gate.
9. **Visual product contract.** Include Light, Dark, and Balance theme tokens and three **reference** mockups. Public Website link appears when available; Admin/Back Office is capability-gated and hidden for ordinary users. These concept pictures are non-executable, illustrative screens: never fake percentages, status or receipts as real run telemetry. No generated UI may invent a valid payment, deploy, DB or browser action without typed server-side registration and authorization.

### SPEC-315 targeted closure

**Environment and data scope:** Keep three host purposes explicit, test developer parity on Debian without granting blanket cross-tenant data powers. Shared `smartspec` permission parity follows authenticated principal/tenant and financial policy, not a new `_dev` identity or fake wallet. Control live external effects and double charges with scoped effect IDs; legacy real users stay online. Cloudflare preview is an optional small target and must not be an always-running costly prerequisite.

---

## R1.5 — Environment, database and device separation (2026-11-02)

Use the registered target IDs as distinct identities: legacy-debian-dev is smartaihub.app on the existing Debian service; modular-debian-dev is aimarkethubs.com and is currently prepared but unavailable while the healthy port-3100 service remains; modular-cloudflare-prod is smartsihub.com and is registered but not activated. Never infer application, runtime, database, privilege or deployment authority from a hostname, NODE_ENV, DNS proxy or account membership.

New development, preview/staging and production use separate Cloudflare identities, Worker bindings, deployment credentials, secrets, database identities/roles, encryption keys and audit partitions. New production data is strongly isolated from Legacy and development. The current deployment-target map names smartspec for the modular production database contract; that mapping is not evidence of a live database or shared credential. Before future production provisioning, verify and reconcile the target map to an isolated production database authority. If Legacy continuity is required, specify and audit a narrow bridge; do not dual-write or copy credentials.

Preview/test principals and data cannot reach production financial effects, tenant secrets, device grants or real external purchases. Device enrollment is environment-bound and cannot be replayed across dev, preview and production. See SPEC-325 and the [R1.5 owner-decision register](../../../docs/architecture/R1.5-OWNER-DECISION-PRECEDENCE.md).

Sign and verify Runner endpoint configuration and bind it to an explicit environment and approved hostname. A development device key, session, job envelope, KMS identity or update channel cannot authenticate in production. Production activation remains unavailable until target-map, database authority, Cloudflare account and release identity have been independently verified.

## R1.6 — Shared canonical database with environment-tenant isolation (2026-11-09)

`smartaihub.app`, `aimarkethubs.com` and `smartsihub.com` MUST use the same canonical PostgreSQL `smartspec` database/schema and existing Core identity, customer tenant, entitlement, ledger and job authority. The Modular Core MUST remain compatible with existing Legacy account and data contracts. Implementations MUST NOT create per-environment user/ledger/job copies or a second financial/job writer. New Mini App business data MUST remain outside Core under SPEC-323.

The three hostnames MUST keep distinct runtime/target identities. `aimarkethubs.com` MUST bind to a modular development/test environment tenant and `smartsihub.com` MUST bind to a separate modular production environment tenant; preserve the existing Legacy application context on `smartaihub.app`. Customer tenant IDs and canonical user accounts MUST remain shared according to existing membership and authorization. Environment separation scopes test records, credentials and effects; it MUST NOT be implemented as a separate PostgreSQL database. Each runtime MUST use a separate least-privilege connection credential and deployment identity despite connecting to the same database. The DB credential or hostname MUST NOT grant cross-tenant access.

Before enabling a write path, implementations MUST map the exact existing tables, fields, tenant filters, triggers and authorized writer from live schema evidence. Zero DDL remains the default; shared effects MUST be idempotent and preserve current Legacy users and data. The registered target map remains the routing authority: `aimarkethubs.com` is not available until its replacement is healthy, and `smartsihub.com` remains inactive until its separate production release authority is provisioned.

Acceptance MUST prove the hostname-to-environment-tenant mapping, successful reuse of an existing user and authorized customer data, and denial of dev-to-production effects using the actual scoped credentials/policies. Schema evidence MUST identify every shared table and writer used by the first Core slice; no schema change is permitted without a separately approved migration requirement.
