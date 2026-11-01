---
spec_id: 320
semantic_id: smartaihub.public-portfolio-miniapp-service-marketplace
revision: R1.4
status: PROPOSED_ADDITIVE_NOT_IMPLEMENTED
owner: Public Web and Marketplace Product
production_domain: smartsihub.com
---
# SPEC-320 — Rebuilt Public Website, Creator Portfolio, Mini App & Service Marketplace

## 0. Strategic decision
The NEW `smartsihub.com` public website is a **complete greenfield product**, not a port of old marketing pages or a reskin of `apps/web`. It pivots from an agent-directory-first concept to **Mini App-first product and services commerce**. Agents/Skills remain executable capabilities and discoverable supply behind Mini Apps; creator/talent/service businesses are also first-class.

Use Fastwork marketplace mechanisms as product reference only: discover talent/services; creator profile and portfolio; explicit packages, prices and delivery times; order communication; trust, milestones/reviews and user-wallet credit earnings (cash withdrawal is future scope). Do not copy its protected branding/design or claim automatic escrow/regulatory compliance. Third-party payment/marketplace settlement mechanics must follow actual applicable contracts.

## 1. Independent public stack
Use **Astro + TypeScript + Cloudflare adapter** with mostly pre-rendered/static pages, *selective SSR* for live indexable creator/Mini App/service pages and lightweight React islands for interactive search, filters, pricing selectors, demo, checkout initiation and profile editing. Hono Core maintains authoritative auth/billing/commerce APIs. Avoid Next.js as mandatory platform-wide dependency and avoid importing SaaS Shell into public routes. Exact Astro major/version must be tested with Cloudflare deployment rather than uncritically pinned.

Cache public non-personalized HTML/JSON and images using safe purge/invalidation keyed by public listing revision; avoid CDN caching private/tenant pricing, personalized checkout, editable portfolios, or authenticated views. Use R2 direct uploads and optimized media. All public pages should remain useful without JavaScript except genuinely interactive functions.

## 2. Public information architecture
- `/` marketplace-first home: search Mini Apps or creator services, featured use cases, credible examples and published portfolios.
- `/apps` and `/apps/{slug}`: category, demos, capabilities/Skills, deployment modes, price, subscription, verified version, screenshots, publisher/tenant, reviews, install/subscribe/use entry points.
- `/creators/{handle}` or `/@{handle}` canonical verified alias: public bio, verified credentials where applicable, collections, Mini Apps, delivered projects, services, skills, availability, languages and contact policy.
- `/services/{slug}`: outcome-based services (build a Mini App on SmartSIHub; build portable app with source; deployment/consulting/custom workflows) with packages, scope/delivery/revisions, lead/order process.
- `/skills/{slug}` optional public discoverability subject to author permission; Skill execution primarily through Mini App.
- `/studios`, `/collections`, `/categories`, `/tenants/{public-slug}`, editorial help/pricing/terms, order and subscription flows.
- White-label sites and custom domains show an authorized tenant-specific catalog and brand, but preserve canonical app/creator identity and origin-domain policies.

## 3. Portfolio publishing contract
Portfolio is NOT a Mini App source repository. It is a public projection of owned/authorized App/Asset + selected work samples and Service Offers: thumbnail, title, short use case, live demo, metrics only when verifiable, releases, role, publisher, client-permitted case studies, skills used, license, supported platform, terms and published at. Visibility: private/unlisted/public and verified permissions. Safe previews cannot expose data, source code or personal content by default.

Creator portfolio shows their own Mini Apps with one-click link to try/install/subscribe; a user may be Mini App owner, Skill owner, tenant operator, service provider, or collaborator without conflating roles. Portfolio identity uses SPEC-303/304 and app release references; no second ownership DB.

## 4. Marketplace business flows
- Discover & compare Mini Apps by problems solved, use cases, skill capabilities, deployment/hosting option, pay-per-use or subscription price and trust evidence.
- Demo: safe sandbox or read-only guided demo with explicit usage terms; no fake testimonials, installations, or ratings.
- Acquire: subscribe/install/buy credits/commission a service. Clear total price, tax/fees, cancellation/refund, deployment and data ownership before payment.
- Use: human UI or Agent/headless action, with the same price and authorization contract.
- Publish: creator onboarding, ownership/rights, screenshots, service packages, skill dependencies, price plan, verified user-wallet recipient binding and listing visibility.
- Deliver service: order request/scope, messages, quote, milestones, attachments, review, disputes/refunds and canonical wallet-credit earnings; no active cash payout/escrow in the initial release.
- Trust: verified purchasers/users only for eligible reviews, abuse/spam moderation, consent, licensing, version history and transparent promotion labels.

## 5. Marketplace monetization & white label
Pay-per-skill-use and Mini App per-month subscription are first-class and may coexist in a catalog as distinct offers. Headless usage must obey the same entitlements. **A Mini App subscription covers only Skills written specifically and exclusively for that Mini App** (`APP_EXCLUSIVE_SKILL` per SPEC-321). All central/Marketplace/other-App/third-party/shared Skills remain **charged in credits per distinct invocation**, including those called indirectly from an exclusive Skill; they are never covered by subscription. Show a two-column offer comparison: **Included App-only Skills** versus **Pay-per-use Shared Skills** with per-call price/quote or price calculator. Subscription checkout, App detail and in-App usage must show the distinction before charge. Reclassification of a Skill from exclusive to shared requires updated policy terms and per-call consent before new debit; headless API returns price/authorization-required status instead of silently charging. Disclose other approved provider add-on charges per SPEC-321.

Tenant infra may be owned by the platform or BYOC Cloudflare account. Tenant, Mini App, Skill and Platform roles may refer to the same party; settlement must preserve role attribution and consolidate by actual beneficiary per SPEC-321/303. Listing and custom-domain identity do not imply rights to hidden tenant apps or wallet credits.

## 6. Search, SEO, performance, privacy
Indexable SSR HTML for dynamically added creator and Mini App pages; meaningful canonical/alternate URLs, sitemap index, robots/noindex for private/unlisted, structured `ProfilePage` / `SoftwareApplication` / `Offer` only when actual properties and reviews exist, locales Thai/English, image alt text, metadata and clean internal linking. Avoid indexable duplicate tenant domains without canonical policy. Use server-side search indexing with authorized visibility, safe pagination, stable filtering, and cached public read model; no cross-tenant secret leakage in index.

Performance goals (advisory): public LCP p75 <=2.5s on representative mobile, INP p75 <=200ms, CLS <=0.1, non-interactive pages minimal JS, CDN/cache hit ratio measured; never claim pass without field/baseline measurements.

## 7. Real UI quality program
Begin with 5 human-usable end-to-end flows: creator publishes profile; creator links Mini App; visitor finds demo; buyer selects metered offer; buyer subscribes and accesses App-exclusive Skills without per-use charging, while shared Skill calls display and charge credits independently. Produce desktop+mobile annotated designs, Storybook components, Playwright snapshots and browser UAT. Design original high-quality editorial marketplace, not a stock AI-gradient landing template. Keep SaaS Console separate; incremental routes may go live ahead of full marketplace completion.

## 8. Existing spec coexistence
SPEC-263 remains historical guidance for content/brand/journeys, but its earlier marketing-first implementation and Astryx assumptions are NOT binding on the clean-room public website. SPEC-270/287 continue as design-governance and generation authorities, not a requirement to reuse Legacy UI. SPEC-261/273/303/304/293 remain authorities for portable app, source, data, identity, rights and domain routing. SPEC-207/280/321 govern payment/pricing. SPEC-318 governs jobs. This spec never creates a new wallet/ledger, proprietary Skill registry or parallel release controller.

## 9. Incremental milestones
W1 Astro static marketplace landing + creators/apps route placeholders with real data contracts on Debian.
W2 Public profile publishing + creator-owned app gallery.
W3 App listing/search/detail/demo and pricing offer display.
W4 Metered skill use and subscriptions integrated with central wallet/entitlements.
W5 Service order flow and independent Cloudflare publication. Human UAT may occur at every useful slice; no full-product global gate.

## R0.8 Marketplace finance UX and affiliate policy

Mini App / Skill creator earnings from the four recognized revenue roles are **added as credits to the verified recipient user account**, with source and role history visible in Creator Earnings. Affiliate/Referral appears as a **separate one-time promotional credit award** (qualifying event required), never a recurring slice of Mini App / Skill usage revenue. No cash withdrawal is enabled in launch; any legacy references to `payout profile`, `release/payout`, `cashout`, `withdraw` are forward-looking concepts, not required current flows. If shown, label as unavailable/future rather than an active CTA. Subscription inclusions still cover only newly authored App-exclusive Skills; shared Skills charge per distinct call.


---

## R0.9 — Agentic Payments / Platform Subscription / PAYG integration

Public Marketplace differentiates: (A) register a free/paid SmartSIHub user account, (B) optionally purchase SmartSIHub Platform Subscription with monthly credits, (C) subscribe to a specific Mini App for its original App-exclusive Skills, and (D) buy Shared Skills using prepaid/monthly-plan credits or permitted PAYG. Never market Mini App plans as free access to Marketplace Skills, or Platform plan as an automatic license to App-exclusive Skills. Account-linked headless Agents may buy/use within mandate; public storefront discovery can remain anonymous. Display class-based PAYG and payment-method availability accurately.

## R1.0 — Listing surface does not dictate Mini App hosting/data location
A public Mini App listing points to one stable `appId`, optional primary `smartsihub.com` presentation URL, custom domains and selected release/deployment channels. The owner may publish from a managed Cloudflare account, personal Cloudflare account or self-hosted server with app-owned data. Portfolio and marketplace reviews/install identity survive host, Cloudflare account and DB-provider changes. Public cards show verified developer-controlled hosting mode and data-control disclosure where relevant, but never show DB credentials or imply SmartSIHub owns customer data.


## R1.1 — Owner-directed autonomous bootstrap and priority order (2026-11-01)

**Normative owner directive:** ALL development of the new SmartSIHub platform SHALL be initiated, orchestrated, observed and accepted through the *currently running* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator facilities, using their existing SPEC-224 Job/Run, Runner, Workspace, Harness and deployment authorities. `smartaihub.app` is the **temporary development control plane**, not the new SaaS Core implementation or the new production domain. This rule applies to source changes, builds, tests, release requests, UAT and repair work; executors may run CLI internally as delegated tools. An emergency out-of-band repair is permitted ONLY when the old UI/control path is nonfunctional; reconcile its exact SHA/Run/receipts back into the canonical record as soon as recovery permits. Never claim that a task was executed through the UI unless actual Run evidence confirms it.

The priority order is fixed for planning: **P0 legacy autonomous-system repair/proof → P1 fresh lightweight Core/Shell → P2 Chat → P3 Autonomous Mini App Creator → P4 new Autonomous Implements → P5 selective autonomy handover → P6 Public Portfolio/Marketplace → P7 other modules**. Thin dependencies (login, job contracts, SDK, billing read-only, public designs) MAY be built in parallel; this is an execution priority, not a global blocking gate. No new Core/Mini App is allowed to write business data into canonical `smartspec` other than the existing narrowly registered Legacy module data exception under SPEC-323.

The development loop SHALL be: **Goal entered on old website → durable Run and owned Debian workspace → implement/test/build → real `aimarkethubs.com` UAT → scoped `smartsihub.com` Cloudflare beta when appropriate → user feedback → automatic child repair/continue**. A defect in the existing control plane becomes an **in-scope bootstrap repair task** for the affected operation, not a reason to abandon the migration or create another approval system. Preserve task identity, source SHA, logs and work artifacts through restart/disconnect; no silent success claims. The new autonomous implementer becomes the primary authority only after it has completed real development tasks and recovery/rollback tests; user-visible traffic switches selectively, with the old tool retained as fallback until stable. See SPEC-324 and [roadmap](../../../docs/smartsihub-r1.4/ROADMAP-AUTONOMOUS-IMPLEMENTATION.md).

Public Astro website, Creator Portfolio and Marketplace are **P6 primary delivery** (parallel visual exploration permitted earlier), after a working Chat, Creator and at least one new autonomous development flow. Public launch is incremental and not a prerequisite to functional Core/Chat/Creator or autonomous self-hosting. Portfolio/Mini App assets remain stable across hosting, account and database moves.


## R1.2 — Public site / Browser interactive boundary

Public Marketplace remains Astro SEO-first; use interactive React islands only where necessary. Public Website links in Core are visible to ordinary authenticated users, but Back Office links only appear for authorized administrators; Core API independently checks actual authority. An Agent Browser can open public Mini App portfolios and listing pages but must not assume access to private customer/admin routes. Opening a public URL in user's own browser is distinct from handing over a remote Agent Browser session.

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

### SPEC-320 targeted closure

**Marketplace UX policy:** Build public Astro site new, portfolio of creator-owned Apps, skill/service listings and paid Mini App offers; do not keep a legacy marketing/homepage implementation. Support creator publication, reviews and app ownership rights without exposing tenant/private portfolio data. Platform subscription and Mini App subscription have distinct price descriptions; exclusive Skill coverage must be explained, shared Skill credit pricing disclosed. Public URL navigation follows verified host; role-authorized admin link is in core only.
