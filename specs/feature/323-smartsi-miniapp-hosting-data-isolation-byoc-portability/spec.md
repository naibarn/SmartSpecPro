---
spec_id: 323
semantic_id: smartsi.miniapp-hosting-data-isolation-byoc-portability
revision: R1.4
date: 2026-11-01
status: OWNER_CONFIRMED_DRAFT_NOT_IMPLEMENTED
production_domain: smartsihub.com
authority: SPEC-261 portable-app; SPEC-273 data portability; SPEC-288 Resource Fabric; SPEC-304 routing; SPEC-295 deployment
---
# SPEC-323 — Mini App Hosting, Isolated Data Plane, BYOC & Self-hosted Portability

## 0. Binding owner decision
**No new persistent Mini App may place its business/domain tables inside the legacy PostgreSQL `smartspec` Core database.** `smartspec` is preserved for newly rewritten SaaS Core *control-plane* records and explicitly inventoried pre-existing business data of modules/Mini Apps migrated from the Legacy system. **A new stateless Mini App requires no database.** A new stateful Mini App receives a dedicated, independently owned logical database (default one D1 database per Mini App), never merely a `tenant_id` column in Core. An external customer-owned DB is first-class. No new separate identity, credit ledger, payment authority or global job authority is created.

The owner of an App who created it may independently host/deploy on the platform domain, a verified custom domain, their own Cloudflare account, a managed alternative account, or their own server. Hosting domain, runtime/account, database provider/account, App ownership and paid-commerce/identity authority are **orthogonal dimensions**. This contract extends (does not overwrite) SPEC-261, SPEC-273, SPEC-288, SPEC-293, SPEC-295, SPEC-304 and SPEC-312–322.

## 1. Data ownership matrix (normative)
| Data | Canonical authority/location | May be in new App DB? |
|---|---|---|
| Users, passwords, identity/MFA, tenant membership, global entitlement | Existing Core `smartspec` | Only locally necessary scoped references, never new authoritative identities |
| Canonical credits/wallet, platform subscriptions, Mini App sale/subscription rights, revenue shares, agent mandates | Existing Core `smartspec` / SPEC-207/280 | No duplicate economic authority |
| Canonical paid `worker_jobs`, outbox, lease and job settlement | Core `smartspec` / SPEC-318 | Local detail/checkpoints permitted with correlation; not competing paid-job ledger |
| App identity, listing, owner, release, domain aliases, database binding *metadata* | Core `smartspec` / SPEC-261/303/304 | App may cache non-authoritative projections |
| New Mini App orders/customers/custom domain records/business docs/vertical app tables | Dedicated App database outside Core | YES, app-owned only |
| Pre-existing Legacy-derived business tables already in `smartspec` | Temporarily `smartspec` **only under registered per-App legacy exception** | Optional later portable migration |
| Mini App files/assets/indexes | App-owned object/vector storage or scoped approved storage | Separate namespace, scoped resource grants |

Core itself may need additive catalog/binding metadata tables after real schema discovery, but this is **not** permission to add greenfield Mini App domain tables. Avoid raw Core SQL from an external App; use narrow authorized HTTPS APIs for identity, commerce and jobs.

## 2. Hosting and database modes are independently selectable
1. **Managed on main domain**: `smartsihub.com/apps/{publicAppId}` listing/launcher and scoped App runtime on the platform's infrastructure. App may use a dedicated D1 managed under a *Mini App resource pool/account separate from Core*; no DB sharing with Core. An untrusted App uses isolated browser origin even when navigated via main-domain listing.
2. **Managed with custom domain**: owner verifies domain, then App route/release binds to its independent Worker/backend and App database; stable App ID, products, installs and credits remain in Core.
3. **Customer BYOC Cloudflare**: owner authorizes a distinct Cloudflare account, with its own Worker, optional R2/Queues and **its own D1**. SmartSIHub stores limited binding metadata and credential references, not owner private account master credentials. Cross-account Mini App invokes Core through authenticated API, not assumed D1/service binding or raw SQL.
4. **Managed PostgreSQL for Mini Apps**: platform owns a *separate* managed PostgreSQL account/cluster/resource group, different from Core. Each new App has its **dedicated logical database** or stronger isolation as contracted. Distinct DB roles/credentials and budgets; never add these tables to `smartspec`.
5. **Customer BYODB PostgreSQL**: owner brings their own PostgreSQL account/cluster and retains data control. Scoped grants only for that App.
6. **Owner VPS/on-prem/self-hosting**: owner may deploy their own release/Source + use their own compatible database (SQLite/PostgreSQL/other allowed by SPEC-273), without platform deployment credentials, preserving lawful portability. Central SmartSIHub identity/commerce APIs apply only while using SmartSIHub accounts and paid marketplace features.
7. **Stateless App**: no business database; host/deploy freedoms remain.

A Mini App may attach multiple stores for legitimate needs but its primary persistent business database MUST be independently scoped. One App's managed database MUST NOT be silently reused for another. Cloudflare account count and DB account count do not imply single physical server per App; logical isolation and scoped roles are the minimum.

## 3. Binding contracts and ownership
Each `appId` + `deploymentId` + environment records: `hostMode` (PLATFORM_ROOT | MANAGED_CUSTOM_DOMAIN | BYOC_CLOUDFLARE | SELF_HOSTED), `domainBindings`, `runtimeProvider`, `runtimeAccountRef`, `appDataProvider` (NONE | D1 | POSTGRESQL | PORTABLE_OTHER), `databaseOwner` (PLATFORM_MANAGED | TENANT_MANAGED | USER_OWNED), `databaseAccountRef`, `databaseResourceRef`, `databaseLogicalName`, `dataLocation`, `appDataSchemaVersion`, `secretRef`, `coreApiAudience`, `originPolicy`, `portabilityProfile`, `migrationState`. No passwords/tokens/private app data in public registries. Changes must be versioned; grants must be revocable without deleting App identity.

App business SQL is executed via App-local DB adapter, constrained to that App. Platform Core SDK is a separate contract for identity, pricing/reservation/settlement, entitlements, subscriptions and canonical paid job intake/status. The App server receives only user- and deployment-scoped signed context (tenant, app, payer, permissions, expiresAt). For BYOC/self-hosted callers, use short-lived audience-bound tokens/verified signatures and revocation; no direct access to Core PostgreSQL. An App cannot impersonate a different App or tenant by editing its host or DB URL.

## 4. BYOC permissions and source/ownership portability
The App creator/owner controls its separate source repo and deployment channel per SPEC-293. Provisioning of platform-managed resources is via existing SPEC-288 Resource Fabric; an owner-owned Cloudflare or DB connection is limited to explicit scopes and cannot inherit SmartSIHub admin privileges. Creation, deployment, migration and deletion in owner accounts require actual delegated account rights; no pretense that central platform owns those resources. Provide export of app source, manifest, DB schema/data and public asset references subject to rights and user privacy; keep platform privileged secrets and third-party licensed Skill internals excluded. External deployment must not require import of `apps/web`, old ORM, or the full SaaS Core.

## 5. Portable DB upgrades and relocation (no magical live conversion)
Support `D1 -> managed PostgreSQL`, `D1 -> owner PostgreSQL`, `platform D1 -> BYOC D1`, `managed PostgreSQL -> BYODB`, and `managed -> self-hosted` transitions. Each is an explicit versioned App data migration: source inventory, export/transform of SQL dialect/constraints/types (SQLite != PostgreSQL), snapshot, controlled write pause or change capture, bounded replay, compare counts/digests, transaction/cutover ownership, switch binding, rollback window and retained backup. Preserve canonical `appId`, installation/reviews/offer/portfolio/settlement associations, and app data subject to owner permissions. Never silently clone live tenant data into another account or drop old source on deploy.

## 6. Cloudflare/runtime correctness
- D1 is SQLite-semantic, not PostgreSQL-compatible SQL; provider upgrades require schema translation. Use D1 binding only within compatible Worker/account resources. Cross-account access to Core and App Services goes through signed HTTPS/approved APIs, not an assumed direct cross-account D1 binding.
- Custom Domain Worker requires domain/zone authority and valid ownership proof; `smartsihub.com` app listing/launcher does not imply any third-party domain can be configured automatically.
- Static and CPU-light app routes on Workers by default. Native or long-running computation uses approved per-task executors and canonical `worker_jobs` without putting a long-lived job inside a Worker request.
- No core auth cookies or global secrets in untrusted App JS. Isolation via dedicated app origin and host-only Core cookie; authenticated launch exchanges short-lived scoped context rather than sharing privileged Core session.
- Respect data residency, provider account billing, storage, egress, backup, export and restore limits. Report costs and quota for App-owned resources, not as Core costs silently.

## 7. Implementation freedom: early UAT without new global gates
Build working slices in parallel: (A) Mini App manifest + no-DB App, (B) per-App platform D1 pilot, (C) custom domain + install/portfolio, (D) BYOC Cloudflare D1, (E) independent PostgreSQL, (F) owner server, (G) App-local migration UI. Tests/receipts are *evidence*, not serial global approvals. Stop only the specific unsafe operation (wrong-account deployment, cross-App DB access, unauthorized Core billing, data loss without rollback, wrong-tenant/secret exposure). Show host/DB ownership in UI and Agent API; do not block other App launches because optional providers are unimplemented.

## 8. Concrete acceptance cases
1. New App A on `smartsihub.com` has its own D1 and cannot read App B's D1 or `smartspec` business data.
2. App B with owner's custom domain uses the same App identity, separate D1 and shared Core login/credits APIs.
3. App C in customer Cloudflare account can run and access only its owner D1; its identity/charges remain canonical in Core.
4. App D upgrades D1 to an independently owned PostgreSQL DB without changing public App ID, subscription rights or portfolio link; SQL migration/data parity is tested, not assumed.
5. App E is self-hosted and runs from its owned source with own DB; SmartSIHub agent/credit API still works when authorized, without central OS credentials.
6. Legacy App F alone reads its explicitly listed old business tables in `smartspec`; creating a new App G fails any attempt to create a new business table in Core.
7. Public app listing and deep link remain stable when owner changes hosting account/domain, and untrusted UI cannot access Core Admin cookies.
8. A cloned App has a new `appId` and its own DB; copying private data is a separate authorized operation, not a default.
9. Parallel deploy of App H does not restart Core/App A/B, move their databases, or invoke a paid infrastructure resource unnecessarily.
10. Agent headless invocation works on BYOC/self-hosted App via authenticated API + canonical job/credit authority, with no direct Core SQL.

## 9. Authority and historical SPEC conflict reconciliation
- SPEC-273 remains **portable app data contract** and catalog of allowed providers; this narrower owner product rule is an additive deployment-policy specialization. Its earlier “one App one DB is not mandatory” must not override this owner's **new persistent Mini App DB isolation from Core**. New stateless Apps still need no DB.
- SPEC-288 Resource Fabric remains provisioning/controller; SPEC-323 does not create a second resource provisioner or enforce Cloudflare D1 universally.
- SPEC-261 portable package and SPEC-304 stable identity/routing remain authoritative; old references to `smartaihub.app` product route are legacy aliases, while `smartsihub.com` is the confirmed new marketplace production target.
- SPEC-295 is release authority; SPEC-311 legacy worker-native full migration remains separate from launching the greenfield platform.
- SPEC-207/280/321/322 govern credit/payer/creator economics and subscriptions across all hosting modes; no new App-local wallet or revenue ledger.


## R1.1 — Owner-directed autonomous bootstrap and priority order (2026-11-01)

**Normative owner directive:** ALL development of the new SmartSIHub platform SHALL be initiated, orchestrated, observed and accepted through the *currently running* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator facilities, using their existing SPEC-224 Job/Run, Runner, Workspace, Harness and deployment authorities. `smartaihub.app` is the **temporary development control plane**, not the new SaaS Core implementation or the new production domain. This rule applies to source changes, builds, tests, release requests, UAT and repair work; executors may run CLI internally as delegated tools. An emergency out-of-band repair is permitted ONLY when the old UI/control path is nonfunctional; reconcile its exact SHA/Run/receipts back into the canonical record as soon as recovery permits. Never claim that a task was executed through the UI unless actual Run evidence confirms it.

The priority order is fixed for planning: **P0 legacy autonomous-system repair/proof → P1 fresh lightweight Core/Shell → P2 Chat → P3 Autonomous Mini App Creator → P4 new Autonomous Implements → P5 selective autonomy handover → P6 Public Portfolio/Marketplace → P7 other modules**. Thin dependencies (login, job contracts, SDK, billing read-only, public designs) MAY be built in parallel; this is an execution priority, not a global blocking gate. No new Core/Mini App is allowed to write business data into canonical `smartspec` other than the existing narrowly registered Legacy module data exception under SPEC-323.

The development loop SHALL be: **Goal entered on old website → durable Run and owned Debian workspace → implement/test/build → real `aimarkethubs.com` UAT → scoped `smartsihub.com` Cloudflare beta when appropriate → user feedback → automatic child repair/continue**. A defect in the existing control plane becomes an **in-scope bootstrap repair task** for the affected operation, not a reason to abandon the migration or create another approval system. Preserve task identity, source SHA, logs and work artifacts through restart/disconnect; no silent success claims. The new autonomous implementer becomes the primary authority only after it has completed real development tasks and recovery/rollback tests; user-visible traffic switches selectively, with the old tool retained as fallback until stable. See SPEC-324 and [roadmap](../../../docs/smartsihub-r1.4/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

P3 Mini App Creator first produces a true new App with its own resource binding and isolated D1 or independent PostgreSQL data plane. It is built via the legacy `smartaihub.app` Autonomous Mini App Creator until P5, then a new Creator. Self-hosting, BYOC, app-owned repository and database relocation remain subsequent per-app features, not prerequisites to exposing the first working app for UAT.

---

## R1.4 — Cross-SPEC owner reconciliation and execution contract (2026-11-01)

> **R1.4 authoritative cross-spec review (2026-11-01):** This section is the controlling addendum for SPEC-312–324. When an earlier R0.x/R1.x addendum, specimen YAML, screenshot, or old SPEC conflicts with the latest owner decisions, follow this revision's [Cross-SPEC precedence and owner decisions](../../../docs/architecture/R1.4-OWNER-DECISION-PRECEDENCE.md). Historical sections remain for context; none may silently reintroduce a global gate. All changes in this artifact are proposals, not deployed code or official GitHub changes.


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

### SPEC-323 targeted closure

**Data ownership:** For new stateful Mini Apps use isolated D1 or independent PostgreSQL account/database, BYOC Cloudflare owner account or self-hosted DB. New app business tables in `smartspec` are prohibited; legacy-only exception needs table/App provenance. AppID/rights/listings/entitlements/credits/jobs stay core-owned through Core API while app data resides separately. D1→PostgreSQL requires schema translation, consistency/export/import/verification with rollback; no automatic connection-string swap. User-owned server/DB must operate within scoped API grants without Core credentials.
