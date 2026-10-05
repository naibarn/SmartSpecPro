# Spec 263 Public Truth Map

Date: 2026-10-05 (repository follow-up)
Evidence scope: repository route/content/crawl sources only; this is not external claim, legal, customer, or asset-rights certification.

## Route ownership and crawl inventory

| Route or route family | Owner/source | Classification | Crawl/canonical | Claim/evidence state | Primary handoff |
|---|---|---|---|---|---|
| `/` | `apps/web/client/src/App.tsx`; `client/src/pages/Home.tsx`; `client/src/pages/homeContent.ts`; `components/publicUi/index.ts` (`PublicHomeExperience`) | Public home | Indexable, canonical `/`, prerendered | Bilingual outcome-led visual hero, immediate Vertical Series spotlight, feature/gallery/docs discovery, access/trust copy, and closing CTA. Local WebP is explicitly labelled illustrative; no customer or performance proof is asserted. Rights/provenance and Spec 270 public-ready artifact remain unverified. | `/signup`, `/features#vertical-series`, `/docs`, `/gallery`, `/contact`, and `/login?returnUrl=%2Fdrama-series` |
| `/pricing` | `App.tsx`; pricing page | Public | Indexable; metadata owner to verify | Prices/credits unverified by this repository audit | Existing signup/plan CTA |
| `/features`, `/about`, `/changelog`, `/careers`, `/community`, `/support`, `/resources`, `/status`, `/security`, `/contact` | `App.tsx`; public page components | Public | Indexable route candidates; sitemap/prerender coverage varies | Capability, trust, uptime, security and customer claims need authoritative evidence; otherwise omit | Existing public CTAs/contact |
| `/docs/**`, `/blog/**` | `App.tsx`; docs/blog sources | Public content | Indexable only for published public content; route-specific metadata owner | Published copy needs a source review; no legacy engine promotion | Existing docs/blog links |
| `/marketplace`, `/gallery` | `App.tsx`; marketplace/gallery pages | Public product discovery | Indexable | Listings/assets are live product data; no claim of rights clearance inferred | Existing marketplace/signup links |
| `/help`, `/help/:slug+` | `App.tsx`; HelpPage/HelpTopicPage | Public support content | Public page; do not infer inclusion in static sitemap; page metadata owner must verify published state | Help copy owner; exclude private case/customer data | Existing support/help links |
| `/terms`, `/privacy` | `App.tsx`; legal pages | Public legal | Indexability/canonical must follow legal-page metadata; never infer from route presence | Legal owner | Existing legal shell links |
| `/desktop/open`, `/desktop/view` | `App.tsx`; desktop handoff/view pages | Public entry/asset handoff | No marketing sitemap entry; page must not disclose private launch tokens or media | Desktop product owner; verify token handling separately | Validated desktop client handoff |
| `/share/:token`, `/share/vd/:token` | `App.tsx`; public share viewers | Token-scoped public content | Exclude from static sitemap; token must not be emitted in canonical/analytics/prerender | Share owner; verify revocation/expiry and noindex behavior | Token-scoped read-only view |
| `/evidence-review/:publicCaseId` | `App.tsx`; public evidence-review page | Public identifier-scoped review | Exclude from static sitemap; no private evidence in generic prerender; verify page-level indexing and authorization | Evidence-review owner | Case-specific public review |
| `/verify-email`, `/verify-email-change`, `/auth/callback/:provider`, `/login`, `/signup`, `/forgot-password` | `App.tsx`; auth pages/callbacks | Authentication and account handoff | Exclude from marketing sitemap; callback/token/query data must not enter canonical, analytics or prerender | Auth owner | Existing auth provider flow |
| `SPEC260_PAGE_ROUTES` | `@smartspec/shared/src/emergencyRouteManifest`; `EmergencyRoutePage` | Mixed public and authenticated emergency routes | Follow each manifest entry's `access`; public routes only if explicitly published; authenticated routes noindex and never public-prerendered | Spec 260 route owner; verify each entry at source | Existing route-specific page |
| `/decision-intelligence`, `/marketplace-capture/**`, `/admin/**`, `/domain-admin/**`, `/chat`, `/automation`, `/studio/**`, `/teams/**`, `/dashboard/**`, `/drama-series/**`, `/worker-jobs`, `/render-jobs`, `/media-studio`, `/content-protection/**`, `/billing/**`, `/credits`, `/usage`, `/tasks`, `/media-history`, `/groups/**` | `App.tsx`; existing product pages and auth wrappers | Authenticated/private product routes (including admin/operator) | Exclude from marketing sitemap/prerender; `RequireAuth`/route owner governs access and private metadata | Owning product feature; auth/tenant checks remain source of truth | Existing authenticated navigation |
| `/signup` | `App.tsx`; auth entry | Public-to-auth handoff | No marketing index target required | Handoff must discard arbitrary query parameters; only explicitly approved intent survives | Auth flow |
| `/workflows` and descendants | `retiredRouteGuard.ts` | Retired/blocked | Must not be indexed, linked, redirected, or prerendered | Prohibited: legacy custom workflow engine | None |

Router evidence: `apps/web/client/src/App.tsx:625-649`; retirement guard: `apps/web/client/src/lib/retiredRouteGuard.ts:5-22`. Public shell: `Navbar.tsx:41-81`, `Footer.tsx`. SEO/crawl sources: `apps/web/shared/smartaihubPublicIndex.ts`, `apps/web/public/sitemap.xml`, `apps/web/server/routers/publicSitemap.ts`, `apps/web/server/services/publicSeoPrerender.ts`.

## Claim matrix

| Claim family | State | Rule |
|---|---|---|
| Route exists and is linked by current UI | Verified from source | May describe navigation destination, not product capability |
| Skill marketplace exists | Illustrative pending product-owner confirmation | Keep only neutral directory language until product owner confirms current behavior |
| Pricing, credits, plans | Pending authoritative pricing owner | Do not publish values or plan promises from source names alone |
| Security, governance, uptime, compliance | Pending security/operations owner | No certification, guarantee, or uptime claim without authoritative evidence |
| Customer, adoption, outcome or benchmark proof | Pending source | Omit until an approved evidence source is recorded |
| AI capabilities, marketplace outcomes and product breadth in public SEO copy | Pending product-owner confirmation unless directly descriptive of a current public route | Keep crawl/SEO summaries neutral; route presence alone is not proof of product behavior |
| Virtual workflow builder, workflow swarms, swarm execution, `/workflows` | Prohibited retired-system claims | Remove from public shell, discovery, sitemap and prerender; never restore route/runtime |
| Generic workflow word in unrelated documentation | Requires contextual review | Do not blanket-rewrite docs; change only text that advertises the retired engine |

## Assets and visual evidence

`apps/web/client/src/pages/homeContent.ts:36-46` maps nine local WebP assets. Repository presence and local paths are verified; asset rights owner, model releases, caption/source records, and withdrawal owner are **unknown**. Do not elevate these assets as customer evidence or claim rights clearance until their owner supplies that evidence. Existing source test: `apps/web/client/src/i18n/__tests__/publicSite.test.ts:33-38`.

## Homepage claim and asset registry — 2026-10-05

`implementation/public-claims-registry.json` is the source-grounded closeout registry for the current **SmartAIHub platform** homepage. It uses the shared record contract for claims, CTAs and media: origin, owner, allowed platform route, signed-in/out handoff, indexability, freshness, acceptance state and disposition.

- The registry covers exactly the copy and two images passed from `Home.tsx` to `PublicHomeExperience`. It does not silently treat unused locale keys or another public route's copy as homepage content.
- The only homepage media are `smartaihub-home-hero.webp` and `smartaihub-vertical-series.webp`. Both remain explicitly illustrative with the existing bilingual caption and error fallback. Their repository path and SHA-256 are recorded, but license, prompt/provenance, synthetic status, rights owner and withdrawal owner are unverified. They therefore cannot serve as product screenshots, Film proof, customer results or rights-cleared campaign media.
- Current homepage discovery copy is retained only as neutral, source-limited editorial/navigation text. No registry entry marks pricing, security/compliance, uptime, customer/adoption, benchmark or public Film claims approved.
- The sole product-entry handoff is the existing `/login?returnUrl=%2Fdrama-series`, whose return path is allow-listed by `authRedirects.ts`; no `/film` path is invented. Resource links are recorded as navigation evidence only: a route's existence never proves the capability copy behind it.
- This shared registry applies only when `isSmartAIHubPublicSite(tenant)` selects the platform homepage. Exact tenant-published pages are tenant-owned and remain outside this registry; they must not inherit platform imagery, claims or CTA authority.

**Closeout disposition:** unknown legal/vendor/product proof is not represented as approved. The retained non-normative copy and disclosed illustrations are not a substitute for external acceptance. Before any normative capability, customer, Film, pricing, legal/trust or campaign claim is added, its owner must replace the relevant registry entry with an authoritative source and evidence reference.

The homepage currently uses the existing local hero and vertical-series illustrations with localized alt text, a caption stating that the image is illustrative (not a live product screen or customer result), and an unavailable-image status fallback. This establishes safe presentation behavior only; it does not establish rights clearance or satisfy approved-proof-media requirements. The canonical SmartAIHub domain always renders this app-owned Spec 263 experience, even when legacy platform-scoped or SmartAIHub-owned CMS home content is published; exact-tenant CMS home pages remain available on custom tenant domains.

## CTA, privacy and analytics

- Existing homepage destinations include `/signup`, `/features`, `/docs`, and `/contact`; the Vertical Series entry uses the same-site login return path `/login?returnUrl=%2Fdrama-series` to reach the existing authenticated `/drama-series` product route.
- Signup/auth handoff accepts only the explicit validated `/dashboard`, `/drama-series`, device user-code, and UUID-backed MCP authorization intents in `client/src/lib/authRedirects.ts`; arbitrary paths/query fields, private identifiers, fragments, and retired `/workflows` are rejected. Re-verify whenever a supported intent is added.
- PostHog remains uninitialized unless localStorage contains an explicit persisted grant; revocation opts out and resets identity. SPA pageviews are limited to known public paths or `/blog/[slug]` and `/marketplace/[listing]`, with only the relative route template emitted. No consent UI/canonical authority was found, so analytics stays off until the privacy owner connects an approved consent path. Browser/vendor payload proof remains open.
- Public route snapshot/prerender is live through `apps/web/server/_core/vite.ts:182-204` and `:240-257`; it must not serialize authenticated state.

## 2026-10-05 follow-up

- The old tool-directory fallback copy was replaced with a bilingual outcome-led description and a prominent Vertical Series product entry; all public actions use verified local routes.
- `/drama-series` remains private/authenticated. This is product discoverability, not a new public Film route or public film-capability proof.
- Multi-tenant public pages remain exact-tenant scoped in the server query and client payload/cache checks. A `tenantId: null` legacy/global row is not reused across domains.
- Browser/production crawl, legal/asset rights, route-by-route canonical review, analytics consent/payload proof, and RUM remain open evidence obligations.

## Baseline and tests

- Added `apps/web/shared/__tests__/smartaihubPublicTruth.test.ts` to prevent retired route/claim regressions in public index, sitemap, prerender, sitemap/LLM output, and footer.
- Existing nearest tests: `server/services/publicSeoPrerender.test.ts`, `server/routers/publicSitemap.test.ts`, `client/lib/retiredRouteGuard.test.ts`, `client/src/i18n/__tests__/publicSite.test.ts`.
- Focused commands and results are recorded in the Section 01/02 implementation records.

## Open owners

Pricing/product claims: Product Marketing. Asset rights and removal: Asset owner. Security/compliance claims: Security owner. Uptime claims: Operations owner. Signup intent and analytics allow-list: Auth/Privacy owners. These owner decisions cannot be inferred from repository implementation.
