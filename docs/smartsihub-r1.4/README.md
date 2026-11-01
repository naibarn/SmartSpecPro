# SmartSIHub Modular SaaS — R1.4 Ten-Pass Cross-SPEC Audit & Reconciliation

**2026-11-01 · R1.4 DRAFT / LOCAL ARTIFACT · NOT PUSHED / NOT IMPLEMENTED / NOT DEPLOYED**

**Owner's new binding sequencing decision:** All development is initiated and controlled through the *existing* `https://smartaihub.app` Autonomous Implements / Autonomous Mini App Creator. New app code and UAT live on Debian `https://aimarkethubs.com`; Cloudflare new production is the confirmed `https://smartsihub.com`. First repair/verify the old autonomous development path, then build **Core → Chat → Mini App Creator → New Autonomous Implements → selective control-plane switch → Public Marketplace → remaining modules**. The platform uses its current development product to build its successor (dogfooding). A fault in the old builder becomes an immediate scoped repair task, with automatic resumption of the original new-platform Goal.


## R1.4 controlling review and mockups

- [Ten-round evidence-based audit](../spec-reviews/smartsihub-r1.4/R1.4-TEN-PASS-GAP-AUDIT.md) — exact scope, before/after gaps, checks, status and residual unknowns.
- [Owner-decision precedence / conflict matrix](../architecture/R1.4-OWNER-DECISION-PRECEDENCE.md) — resolves old addenda versus current decisions.
- [Three-theme mockups and theme contract](../architecture/R1.4-THREE-THEME-MOCKUPS.md) — real bundled Light/Dark/Balance reference PNGs.
- [Universal headless Action and Job effect contract](../architecture/R1.4-HEADLESS-ACTION-AND-JOB-EFFECT-CONTRACT.md) — OpenUI/WebMCP/API/MCP + ledger and jobs.
- The latest **R1.4 sections** appended to SPEC-312–324 supersede contradictory historical draft sections. Old review files are preserved as history, not renamed to imply fresh review.

**Start here:**
- [Execution roadmap](ROADMAP-AUTONOMOUS-IMPLEMENTATION.md) — P0–P7 deliverables and actual UAT examples.
- [SPEC-324](../../specs/feature/324-smartsi-autonomous-bootstrap-self-hosting-and-handover/spec.md) — live `smartaihub.app` authority, failure repair and safe handover.
- [Paste into existing autonomous UI](CODEX-MISSION-BOOTSTRAP.md) — mission directive.
- [ADR](../architecture/AUTONOMOUS-BOOTSTRAP-AND-HANDOVER-ADR.md) — control-plane and runtime separation.
- [Work packages](WORK-PACKAGES.md) — priority order and scoped delivery.

The previous R1.0 architecture, credits, Rust jobs, agent payments, Mini App data isolation, WebMCP, portfolio and independent workers remain in force; see below. No new global development gates.

---

# SmartSIHub Modular SaaS — R1.0 Mini App Hosting + Isolated Data, BYOC, Self-hosting

**2026-11-01 · DRAFT / LOCAL OUTPUT · NOT PUSHED / NOT IMPLEMENTED / NOT DEPLOYED**

Owner-confirmed production domain **smartsihub.com**. `aimarkethubs.com` = Debian new Modular development with production-equivalent authorized user roles/credits; `smartaihub.app` = legacy Debian site under progressive migration, protect remaining live users. `smartsihub.com` is new Worker-native production, module by module.

## New business/architecture decisions
- **Mini App + Creator Portfolio + Service Marketplace first**, agents/Skills as composable, paid execution capability.
- **Fresh public website**: Astro + Cloudflare selective SSR/prerender + React islands, **not a conversion** of legacy `apps/web` marketing stack.
- **New SaaS Shell**: React/Vite/Tailwind/accessible primitives, small independent bundles; brand-specific design tokens/profile under old SPEC-270/287 authority, never default AI slop templates.
- **Agent-ready without browser**: core typed Action contracts used by UI, headless HTTPS, existing MCP server and browser-only early-preview WebMCP. Browser WebMCP is NOT the headless solution.
- **Revenue**: exactly four canonical revenue roles (Platform Core, Tenant Infra, Mini App Owner, Skill Owner), each earning **credits credited to its verified user wallet** through the existing ledger. Affiliate/Referral is a **one-time Platform-funded credit bonus**, never a fifth revenue share. No universal split percentage until agreed.
- **Two offer modes**: a Skill invoked from a Mini App is pay-per-use by default unless it is a newly authored, exclusive Skill belonging to that exact Mini App and is explicitly included in its subscription. Shared/Marketplace/Core/other-App Skills **always generate a separate per-call credit charge** (once per distinct logical invocation), even inside a subscribed Mini App; do not hide shared usage in a subscription royalty pool.
- **Credit V2**: owner-set **1 USD = 10,000 new credits** versus 1 USD = 1,000 old; preserve balance value: old credit x10 and old nominal prices x10 unless independent repricing is explicitly chosen. Coordinate old+new writers against shared database and preserve immutable historical ledger. DO NOT silently flip rate at presentation layer.
- **Background reliability**: Rust supervisor/TypeScript Workers, canonical `worker_jobs`, never duplicate settlement; no new ledger.

## Specs
| Spec | Scope |
|---|---|
| 312 | Modular program strategy, inventory, early UAT |
| 313 | Rebuilt Core + identity, tenancy, finance facade |
| 314 | Independent Module SDK/runtime, APIs, UI |
| 315 | Three domains, Debian-first, shared PostgreSQL |
| 316 | GitHub, independent CI/build/deploy |
| 317 | Copy/isolate/modernize modules, greenfield public exception |
| 318 | Rust-first durable jobs, TS Queue adapters |
| **319** | **New modern UI, design system, headless Action APIs, browser WebMCP** |
| **320** | **New public Astro website, creator portfolio, Mini App & services marketplace** |
| **321** | **Credit V2, distinct subscriptions, 4-role wallet-credit earnings, referral bonus and legacy compatibility** |
| **322** | **Agent-native multi-provider payments, platform monthly credits, prepaid/auto top-up, bounded postpaid PAYG** |

## Important companion docs
- [Legacy spec crosswalk](../spec-reviews/smartsihub-r1.4/LEGACY-SPEC-UI-COMMERCE-CROSSWALK.md)
- [R0.6 Gap Review](../spec-reviews/smartsihub-r1.4/R0.6-GAP-AND-REVIEW.md)
- [UI and WebMCP ADR](../architecture/SMARTSIHUB-UI-WEBMCP-STACK-ADR.md)
- [Marketplace Economy ADR](../architecture/MARKETPLACE-ECONOMY-ADR.md)
- [Codex mission](CODEX-MISSION-M0.md)
- [Work packages](WORK-PACKAGES.md)
- Prior R0.5 ADRs and background-spec files remain present.

## No global gates
Implement → Debian user UAT → scoped Cloudflare beta → improve. Inventory and visual checks run concurrently, not as blanket blockers. Block only the unsafe affected operation (cross-tenant, misrouted deploy, possible funds/data corruption, unauthorized irreversible side effects). Price/credit transition must not be released with incompatible writers.

## Authority boundaries
SPEC-207 money writer/ledger, SPEC-280 capability commerce/pricing, SPEC-303 seller/rights bindings, SPEC-256 capabilities, SPEC-199/248 MCP, SPEC-270/287 design and UI governance, SPEC-261/304 app identity, SPEC-224/278/318 jobs, SPEC-295 deployments. No competing implementations.

## Scope limitation
307 feature-folder entries were listed on GitHub; relevant historical specs were reviewed deeply. No claim all 307 full texts were read or updated. Source audit of credit code established real migration hotspots, not verified live database denominations. Revalidate canonical slot 319-321 and current deployment configuration before Git integration.

## R0.7 binding correction — Mini App Subscription

Subscription coverage is **NOT** a wildcard over the Skills an App happens to call. Only an App-exclusive Skill created new for its canonical `appId` is included. Nested/shared use is metered independently. `SPEC-321` is the definitive eligibility and per-invocation billing contract; SPEC-318/320 and marketplace/worker docs consume it. No new Job Ledger or wallet system.

## R0.8 binding owner decision — credit-first creator income

The first version **does not distribute money externally**. Revenue allocations on accepted Skill usage and recognized Mini App subscription periods credit the verified Platform, Tenant, Mini App and Skill Owner **user accounts** by adding credits via the canonical SPEC-207 ledger. Affiliate/Referral credits are a single promotional reward per qualified referred user, outside the four-role revenue split and funded from Platform marketing allocation. Cash withdrawal is an explicit **future phase** to design (minimum payout amount, eligible earned credits, identity, FX, fees and tax). Purchased, earned and promotional credits remain source-categorized in immutable transaction history even if UI shows one spendable balance.

- [Credit-first revenue + one-time referral ADR](../architecture/CREDIT-FIRST-REVENUE-REFERRAL-ADR.md)
- [R0.8 finance policy correction](../spec-reviews/smartsihub-r1.4/R0.8-CREDIT-FIRST-REFERRAL-CORRECTION.md)

R0.7 and earlier review reports are historical provenance, not controlling live policy where they conflict with R0.8. Everything here remains a DRAFT; code/database/payment production state has not been modified by this artifact.

## R0.9 binding owner decision — Agent payments and distinct platform subscriptions

- SmartSIHub account registration is mandatory before accessing any Mini App. The **SmartSIHub Platform Subscription** gives configurable monthly credits on verified paid periods and is independent of each `MINIAPP_SUBSCRIPTION`. Paid platform subscription is optional for free-platform users unless a Mini App offer says otherwise.
- Native, account-bound Agents can quote/reserve/run/pay with scoped delegated authority through headless HTTPS/MCP, without opening the UI; payment methods that require PSP user challenge provide a clear resumable handoff.
- Prepaid/Auto top-up, recurring platform plan credits and class-bounded postpaid PAYG share the existing ledger. PAYG: estimate+buffer hold → actual usage debit → unused release → configurable collection. Negative credit limit defaults to **zero** until explicit verified class/payment contract. No spent credits beyond `-classLimit`.
- Multiple protocol adapters are optional: ACP, UCP/AP2, x402, tokenized Visa/Mastercard/Stripe, existing Beam/PromptPay. Their public specs do not prove live account eligibility.
- Four creator roles get spendable earned credits only from funded/recognized Skill/ Mini App revenue; postpaid debt produces pending attribution until collected. Referral once-only and no cash withdrawals stay unchanged.

- [SPEC-322 Agentic Payments](../../specs/feature/322-smartsi-agentic-payments-platform-subscriptions-payg/spec.md)
- [Agentic Payments ADR](../architecture/AGENTIC-PAYMENTS-AND-CREDIT-FLOW-ADR.md)
- [Provider compatibility matrix](../architecture/AGENT-PAYMENT-ADAPTER-MATRIX.md)
- [R0.9 Gap Audit](../spec-reviews/smartsihub-r1.4/R0.9-AGENTIC-PAYMENTS-GAP-AUDIT.md)
- [Default-deny example policy](../templates/smartsihub-r1.4/agent-credit-policy.example.yaml)

## R1.0 binding owner decision — New Mini App data must be separate from Core

- Core PostgreSQL `smartspec`: original identity, user/tenant, App registry, wallet, billing, subscriptions, canonical jobs and clearly inventoried Legacy-migrated business data only.
- **NEW Mini App** with persistent domain data: own dedicated database OUTSIDE `smartspec`, default managed D1 per App in a resource pool separate from Core, or owner Cloudflare D1, independently managed PostgreSQL (not Core account), owner PostgreSQL, owner/self-hosted DB. Stateless Apps require no DB.
- Hosting selectable independently: launch/list on `smartsihub.com`, managed verified custom domain, user BYOC Cloudflare account, user-owned VPS/server. App owner can export/migrate app data/source. Identity/App ID, financial ledger and canonical paid job state stay in Core while using platform commerce.
- Legacy shared-db exception is explicit existing table+App mapping; no new app business tables in Core. Core-to-external apps uses scoped authenticated API, never direct DB access.
- [SPEC-323](../../specs/feature/323-smartsi-miniapp-hosting-data-isolation-byoc-portability/spec.md), [ADR](../architecture/MINIAPP-HOSTING-DATA-ISOLATION-ADR.md), [R1.0 review](../spec-reviews/smartsihub-r1.4/R1.0-MINIAPP-HOSTING-DATA-POLICY-REVIEW.md), [deployment manifest](../templates/smartsihub-r1.4/miniapp-deployment.example.yaml).

This R1.0 document update is not an implementation or production DB change.


## R1.2 — Chat-native Interactive Workspace / Browser Provider (2026-11-01)

New approved experience: chat messages can render live diagrams, code/YAML with copy/expand, interactive questions, forms, charts and live job cards. Persistent Artifacts display inline summaries and open in a right panel or detached window. Browser session previews open in the same panel and support separate verified URL opening in a familiar local browser. **Browser automation is provider-neutral:** Chromium/Playwright first; Cloudflare Browser Run when managed live view and human intervention required; Moli optional for Rust-native DOM-first tasks with Chromium fallback. Real user browser closure does not stop durable jobs; it may end a temporary browser session. No new Core backend or payment authority; three themes apply.

See `specs/feature/319-*/spec.md` R1.2, `docs/architecture/CHAT-NATIVE-INTERACTIVE-WORKSPACE-ADR.md`, `docs/architecture/BROWSER-ADAPTER-AND-SESSION-LIFECYCLE.md`, and examples in `templates/`.

## R1.3 — Computer Use, Cloudflare Clef and Cloudflare Kitesurf (2026-11-01)

This revision explicitly integrates current **SPEC-208 Revision 9**, which *already* specifies Clef-first dynamic Computer Use routing and records that Moli is not production-qualified. No new numbered spec is needed. It updates SPEC-312/314/317/318/319/324 and adds a Computer Use/Clef ADR and executable example policies/test matrix. Scope: final-result-only headless runs, desktop GUI via Runner, browser-provider selection (API/MCP, qualified Chromium, optional Moli/Kitesurf), Cloudflare Browser Run live handoff, optional Clef-flash typed decision routing and durable crash recovery. Neither Clef, Moli nor Kitesurf is required for Core/Chat/Mini App Creator UAT. Production domain remains **smartsihub.com**. All changes remain proposed docs; no code/runtime/GitHub deployment performed.
