# Section 01 — Public inventory and truth map

## Objective

Create the evidence-backed inventory that constrains every later public-site change. The output is a maintained, reviewable public-surface truth map; it does not introduce a new public experience or make unverified marketing claims.

## Scope and ownership

Own the inventory and test fixtures for public route ownership, claim provenance, public assets, crawl behavior, auth handoff and current visual/accessibility baseline. Inspect the current route table, Home, Navbar, Footer, public content source, SEO metadata, sitemap/prerender and relevant tests before changing them.

Likely seams are `apps/web/client/src/App.tsx`, `pages/Home.tsx`, `components/Navbar*`, `components/Footer*`, `homeContent.ts`, `components/Seo.tsx`, `publicSitemap.ts` and `publicSeoPrerender.ts`; verify exact paths and owners before edit. Do not change authenticated product pages, provider contracts, worker execution, or database schema in this section.

## Required deliverables

1. Add a repository-local public truth-map artifact or typed source colocated with the existing public-content convention. It must record, for each public route: route owner, title/description/canonical source, indexability, source of proof/capability claim, asset rights owner, primary CTA/handoff target and relevant test owner.
2. Record which claims are approved, illustrative, pending verification or prohibited. Pricing, customer evidence, security claims, capability breadth and film claims require an authoritative source; unknown claims stay absent from public copy.
3. Produce a route/crawl inventory including public nav/footer links, sitemap entries, prerender entries, robots/canonical behavior and unadvertised retired paths.
4. Establish baseline focused tests or fixtures for the inventory so later sections cannot accidentally reintroduce a route/claim that was rejected.

## Retirement and safety boundary

`/workflows` and the legacy custom workflow engine are retired. Treat any public marketing, nav, footer, sitemap or prerender reference to that path or legacy-engine vocabulary as a defect to be removed in Section 02. Do not add a redirect, compatibility route, test fixture that exercises it as supported, new schema, new caller or alternate workflow implementation. Use approved capability, automation or task terminology only after this inventory verifies it.

No source may expose authenticated data, tenant data, private prompts, signed media URLs, internal task IDs, worker details, provider credentials or analytics identifiers in a static/public payload. Long-running work remains outside this feature and must use the canonical `worker_jobs` plus outbox control plane if later required.

## Implementation sequence

1. Trace public routes from the router into page components and crawl generators, then classify paths as public, authenticated, retired or unknown.
2. Trace visible product/pricing/proof copy to its owner. Mark unsupported copy as pending rather than inferring support from similarly named internal code.
3. Trace primary CTAs through signed-out and signed-in outcomes. Preserve only validated intent parameters; discard arbitrary query forwarding.
4. Inventory image/video sources, alt/caption availability, OpenGraph assets and withdrawal/invalidations owner.
5. Capture current focused route/SEO test conventions and create minimal fixtures around the truth map.
6. Publish concise findings for Sections 02–05. A missing source of truth is a gate, not permission to fabricate content.

## Interfaces exported to later sections

| Export | Consumer | Contract |
|---|---|---|
| Public route inventory | 02, 05 | One authoritative classification and canonical/SEO owner per public route. |
| Approved claim matrix | 02, 03, 04 | Copy may only use entries marked approved or explicitly illustrative. |
| CTA handoff contract | 03, 04 | Destination and allow-listed intent fields for signed-out/signed-in visitors. |
| Asset/evidence registry | 03, 04, 05 | Public-safe asset, rights/caption/alt status and withdrawal owner. |
| Baseline route/crawl tests | 02–05 | Existing public behavior protected without asserting retired routes are supported. |

## Acceptance criteria

- Every discovered public route has a classification, metadata/canonical owner and a tested crawl expectation.
- Visible capability, pricing, proof and film claims are traceable to a named source or omitted.
- Retired workflow references are catalogued with exact public surface for removal in Section 02.
- The inventory demonstrates no private/authenticated payload is intentionally included in public page or prerender data.
- Findings identify whether a supported public Film route exists. Section 04 may only add/modify a route after that decision and an approved claim/asset source exist.

## Tests and proof

- Add focused route/SEO/content tests using existing web conventions; browser-facing React tests use jsdom.
- Assert public routes have their expected owner/canonical configuration and that no fixture labels `/workflows` as supported.
- Snapshot only stable, semantic route/metadata data. Do not snapshot credentials, signed URLs or generated timestamps.
- Record baseline test commands and outputs in the section implementation record. Do not run `npm run typecheck`.

## Implementation record

Implementation must list changed paths, source-of-truth decisions, unresolved external owners and focused test evidence. It must explicitly state any claim/asset/price source that remains unavailable, because Sections 03 and 04 are blocked from asserting it.

### Completed inventory record — 2026-10-02

- Added `implementation/public-truth-map.md` with route, claim, crawl, asset, CTA/privacy and unresolved-owner inventories from source inspection.
- Source ownership verified in `App.tsx`, `retiredRouteGuard.ts`, `Home.tsx`, `homeContent.ts`, `Navbar.tsx`, `Footer.tsx`, `smartaihubPublicIndex.ts`, `public/sitemap.xml`, `publicSitemap.ts` and `publicSeoPrerender.ts`.
- Nine local homepage WebP assets are present. Rights, releases, captions/source provenance and withdrawal owner remain unverified. Pricing, customer proof, security/compliance and uptime claims have no authoritative owner evidence in this repository.
- The route guard blocks `/workflows`; stale index, sitemap and marketing mentions were assigned to Section 02 for scoped removal. No unsupported public Film route or proof asset was found; Section 04 must use an existing verified handoff or remain blocked.
- Added public truth-map regression coverage under `apps/web/shared/__tests__/smartaihubPublicTruth.test.ts`; focused evidence is recorded in Section 02.
- Expanded the route inventory to cover help/legal, desktop, tokenized share, public evidence review, auth callbacks, Spec 260 dynamic entries, and authenticated/admin route families. Regression checks keep handoff/private and non-public Spec 260 paths out of the static sitemap; per-route canonical/noindex behavior for dynamic product owners remains unverified.

## UI/UX Contract

### Target User / JTBD
Public visitor needs to understand a verified capability and reach a supported product entry.

### Surface Inventory
Existing public route(s) owned by this section; see section-specific route list above. No authenticated redesign or new retired route.

### Component Map
Existing public shell and this section's route/content module consume the Spec 270 resolved foundation; router and SEO helpers retain their existing ownership.

### State Matrix
Initial/prerender, signed-out/signed-in handoff, loading, error/unavailable content, consent, hover, focus, selected, disabled, and locale fallback are handled or explicitly not applicable to this section's surface.

### Responsive Matrix
Validate mobile, tablet, laptop, and desktop; preserve content order, media crop, navigation, and accessible tap targets.

### Accessibility Acceptance
Semantic landmarks/headings, keyboard operation, visible focus, labels, contrast, reduced motion, and meaningful media alternatives.

### Copy Contract
Thai and English copy follows the approved claim/source registry, avoids retired routes and unsupported claims, and uses existing localization fallback.

### Browser Evidence Required
Capture route at mobile, tablet, laptop, and desktop plus keyboard, reduced-motion, and relevant error/unavailable states; mark unavailable browser proof unverified.
