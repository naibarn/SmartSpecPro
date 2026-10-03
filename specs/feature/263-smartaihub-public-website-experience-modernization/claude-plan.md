# Spec 263 Implementation Plan

## Objective and delivery boundary

Modernize unauthenticated SmartAIHub public pages to tell a truthful, outcome-led platform story, make AI Film/Short Film/Vertical Series a prominent flagship, improve route discovery, SEO, trust and conversion, and hand off to authenticated product surfaces. Spec 263 owns public meaning and experience. Spec 270 owns design artifacts/resolution; Spec 224 owns implementation/QA; Spec 256 owns capability discovery; Spec 258 owns film behavior. This is a focused migration, not a wholesale redesign of authenticated pages.

Repository `AGENTS.md` is binding: do not revive `/workflows`, legacy workflow engine, workpacks, Agency, OpenSandbox or Docker dispatch. Spec 263's taxonomy currently mentions workflow builders and stale workflow marketing may be present. Replace those claims with truthful capability/automation/task language and ensure legacy `/workflows` is not advertised, linked, prerendered or indexed. Do not add a new legacy-compatible route. Long-running behavior stays behind canonical worker_jobs/outbox. Use the Astryx 0.6.3 wrapper/foundation without global resets or hard-coded styling; preserve existing user-facing behavior unless directly changed by this spec. Never run repository-wide `npm run typecheck`.

## Sequencing and dependency gates

### P0 — Public site G0 inventory and truth map

Inventory `App.tsx` public route table, Home, Navbar/Footer, content source, SEO metadata, sitemap/prerender, analytics/privacy, auth handoff and tests. Establish route ownership, actual supported product capabilities, pricing source, localization/content source, approved claims, canonical URL strategy, asset/consent rights, public/private boundaries and baseline performance/accessibility. Flag false/stale `/workflows` claims for removal from public surfaces. No new capability claims until evidence exists.

### P1 — Dependency on Spec 270 public-ready design foundation

Spec 270 must first deliver canonical design contracts, pinned Astryx resolver/catalog snapshot, approved SmartAIHub/Astryx foundation, safe assets and reviewable design variants. Spec 263 must consume its artifacts/resolved components and must not build a private provider or resolver. Route/content/claim inventory can proceed alongside Spec 270 G0; high-fidelity new page styling and visual acceptance wait for the public-ready foundation. If it is blocked, make only low-risk route/SEO/content corrections and label design work blocked.

### P2 — Content and public shell

Create a single source for public route labels, title/description, nav/footer and truth-checked feature narratives where possible, while respecting existing localization/CMS conventions. Update global shell and top-level page frame through existing component wrappers. Mobile navigation, active route, focus order, reduced motion and consent behavior remain intact. Do not add raw layout elements contrary to the supplied Astryx convention.

### P3 — Homepage outcome hierarchy

Implement one coherent homepage hierarchy: universal AI work platform → flagship AI Film proof → creation/research/build breadth → control/trust → concrete CTA. Keep infrastructure terms progressive. Film visibility must be immediate; users must understand idea-to-finished short film/vertical series. Use only product capabilities verified in P0. Public demo evidence is real and current or clearly illustrative; no fabricated metrics, logos, customer claims or output.

### P4 — Film flagship and public routes

Build/update AI Film/Short Film/Vertical Series public page from verified Spec 258 features and approved media. Check whether `/film` exists before defining route. Deep links go to supported authenticated entry and preserve only validated intent. Use existing public patterns for pricing/resources/trust/Marketplace/Mini App surfaces as their actual routes allow; do not invent incomplete product pages. Add useful empty/unauthenticated and not-found behaviors.

### P5 — SEO, privacy, performance, accessibility and rollout

Align page metadata, canonical, OpenGraph, robots/sitemap/prerender to actual public routes; strip retired `/workflows` marketing and generated links. Ensure no authenticated/customer/private content enters static prerender or index. Honor consent and analytics policy; avoid sensitive prompt/query capture. Optimize image dimensions/formats/loading and route chunks against measured budgets. Verify WCAG-oriented semantics, keyboard, responsive, reduced motion, locale and contrast. Roll out using existing release process only; no production deployment in this task.

## UI/UX contract

- **Audience/task:** creator, general professional, builder, organization and technical evaluator quickly sees what SmartAIHub can accomplish, finds a relevant proof page and enters the product.
- **Route/surface inventory:** existing public homepage and only already-approved public routes for capabilities, film, pricing, resources, trust and discovery; exact inventory in section 01. No authenticated redesign.
- **Component map/ownership:** public shell/Navbar/Footer and route content use established SmartAIHub wrappers/components; content source owns copy; Spec 270 owns canonical design artifact and component resolution; existing router/SEO helpers own route metadata and crawl output.
- **State matrix:** SSR/prerender and client loading, signed-out/authenticated CTA, unavailable media, consent choice, mobile navigation expanded/collapsed, active route, reduced motion and not-found. Focus/hover/selected states are present and non-hover alternatives exist.
- **Responsive matrix:** mobile-first, then tablet/laptop/desktop layouts; validate nav, reading order, hero/media crop, CTA and text measure at each breakpoint.
- **Accessibility:** landmarks/headings, meaningful alt text, keyboard/focus, contrast, reduced motion, captions/transcripts for meaningful media, and no hover-only content.
- **Visual system:** consume Spec 270 canonical design artifacts and resolved Astryx/SmartAIHub components. Follow `npm run astryx -- build "public AI work platform home and film flagship"`, `npm run astryx -- docs layout`, component and token docs before new UI. Keep existing shell conventions where compatible; no broad replacement.
- **Copy/localization contract:** concise outcome-led Thai and English copy; keep terminology consistent with product localization; labels, CTA, consent, loading/error and fallback text must be localized. Avoid unsupported claims and stale workflow vocabulary.
- **Conversion and truth:** one primary CTA, clear route/deep-link behavior, no unsupported claims, no stale workflow entry, no sensitive analytics.
- **Browser evidence:** verify homepage and film route at mobile/tablet/laptop/desktop, keyboard-only navigation, reduced motion and unavailable-media state. Save screenshots/results to the task evidence folder; if no browser is available, mark visual acceptance unverified rather than inferred.

## Code and content boundaries

Likely seams include `apps/web/client/src/App.tsx`, `pages/Home.tsx`, public shell/Navbar/Footer, `homeContent.ts`, SEO components and `publicSitemap.ts`/prerender helpers; verify exact current paths before editing. Keep content ownership localized, avoid route duplication, and ensure browser title, canonical, sitemap and prerender agree. Reuse existing auth intent-hand-off contracts. Don’t change Film Studio execution or provider/job contracts.

## Verification and acceptance

Use focused tests nearest the affected pages, SEO and route generation. Browser evidence is required for final visual behavior if a browser test surface is available; otherwise state it as not verified. Check crawl output and prerender against current route set, inspect rendered public pages for retired claims and private leakage, and run relevant web build/lint commands only if practical. Do not run `npm run typecheck`. No deployment, analytics vendor account, external provider or production write is part of this plan.

## Cross-spec and blockers

1. Spec 270 precedes public high-fidelity implementation. Its native path should remain usable with provider flags false.
2. No canonical spec-number registry found; Spec 270's global uniqueness remains provisional but does not block public inventory.
3. Pricing, claims and public-safe proof need a source-of-truth check; do not invent or infer them.
4. Public asset rights and withdrawal/CDN/OpenGraph cleanup need existing asset lifecycle ownership.
5. `/workflows` is retired by repository instruction; remove public references and generated claims, but do not delete unrelated runtime code.
6. Keep modifications narrow and explicitly stage owned paths; preserve unrelated untracked work.
