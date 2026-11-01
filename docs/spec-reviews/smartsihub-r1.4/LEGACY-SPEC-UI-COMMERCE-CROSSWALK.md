# Legacy SPEC Crosswalk — UI, Agent Action, Public Website and Commerce

**Scope and methodology:** Full directory-level inspection of `specs/feature` on GitHub `main` returned 307 top-level entries as observed 2026-11-01, not a claim that all 307 full specifications were line-by-line read. Deep source-oriented inspection targeted the authoritative specimens below; all others must be discoverable during Codex implementation inventory. GitHub `main` observed SHA `912281e41763d03ba9c88ff4f8cd61c944e006dd`. Do not silently assume no concurrent changes.

| Existing canonical spec | Observed authority | Required additive implementation response |
|---|---|---|
| 207 Economic Control | Wallets, ledger, financial payments, reconciliation | Credit V2 unit/adapter and multi-recipient settlement without new ledger |
| 199 / 248 existing MCP | MCP transport and Skill delivery | Remote headless Action tools, no second MCP registry |
| 224 / 278 | Jobs, orchestration/execution authority | Reuse `worker_jobs`/fencing, no new job engine |
| 256 Skill-first | Capability discovery, app/skill bindings | Contract compiler to UI/HTTPS/WebMCP/MCP |
| 261 SPAAS | Portable app/install/commerce offerings | Mini App metered/subscription published offers |
| 263 Public Website | Marketing-first site/journeys | New Astro portfolio/marketplace; legacy content remains reference |
| 270 Design Intelligence | Astryx+Stitch design generation/provider resolution | New product profile via existing design authority, not old UI port |
| 273 Mini App Data | Provider-neutral app data | Public display references, no arbitrary Mini App DB in Core |
| 277 Task Control | UX for durable jobs/progress | New accessible UI consumes job projection |
| 280 Capability Commerce | Metering, skill prices, revenue sharing | Four-role allocation and subscription skill revenue pool |
| 287 UI Governance | Semantic tokens, rendering conformance | New token profile/accessibility/anti-slop/WebMCP surfaces |
| 293 Git Federation | Repo and source ownership | App portfolio not same as source repository |
| 294 Mission Control | Unified work status | Agent UI and headless work report same status |
| 295 Release Fabric | Release/deployment authority | Independent public/apps release and refund-safe credit transition |
| 302 Project Identity | Project/app bindings | Portfolio references projects only where permissions permit |
| 303 Asset Rights | App/Skill/party ownership, payout bindings | Four economic roles and accurate public seller ownership |
| 304 App Identity | Apps/deployments/domains/aliases | Portfolio, App catalog and white-label canonical URLs |
| 311 Cloudflare legacy cutover | Full legacy migration cutover | New-domain go-live independent of legacy retirement |
| 312-318 DRAFT R0.5 | Modular stack, environment, job foundation | R0.6 addenda + new 319-321 |

**Gaps:** legacy UI Astryx/version-specific assumptions conflict with cleanroom marketplace; WebMCP browser-only misunderstood as server-agent transport; public app listing/portfolio/service order lacks clear product owner; 2-role old creator settlement conflicts with 4-role contract; default tenant skill credit values require 10x unit audit; a 10x rate change without account balance/price conversion would devalue wallets; a subscription that internally invokes Skills needs usage-backed royalty rather than per-call payer debits; credentials and BYOC merchant-of-record not equivalent.

**Source code inspected:** `apps/web/server/services/creditService.ts`, `creatorRevenueService.ts`, `skillRevenueBilling.ts`, `pricingCalculator.ts`, `apps/web/server/routers/credits.ts`, `billing.ts`. Observed 2-role creator settlement and tenant/skill revenue utilities. These source observations do not prove the effective deployed pricing exchange rate.

**No broad rewrite:** Existing SPEC-207/280/303/270/287 are authoritative; issue versioned applicability notes or additive revisions through canonical governance; do not overwrite immutable older specs blindly. Current deliverables are DRAFTS and have not been committed/deployed.
