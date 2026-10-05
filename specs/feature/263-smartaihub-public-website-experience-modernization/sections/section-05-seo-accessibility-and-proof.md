# Section 05 — SEO, accessibility, and proof closure

## Objective

Close the public-site change with consistent metadata/crawl output, privacy-safe analytics, responsive accessibility/performance proof and a release-ready evidence record. This section integrates the settled shell, homepage and Film route; it does not deploy or claim production verification.

## Dependencies and ownership

Requires Sections 02–04. It owns cross-route public metadata, sitemap/prerender/robots alignment, final public accessibility/performance checks and implementation evidence. It consumes Section 01 inventory as the canonical route/claim/asset source. Do not move route or content ownership out of their existing modules merely to centralize this section.

Likely seams include `components/Seo.tsx`, public sitemap/prerender helpers, route metadata/configuration, consent/analytics utilities and focused page/SEO tests. Confirm exact current paths before editing.

## Required behavior

1. For every inventoried public route, title, description, canonical, OpenGraph, robots/indexability, sitemap and prerender agree. No private/authenticated route, tenant data, signed asset URL or unpublished Film surface reaches a crawler output.
2. Retired `/workflows` marketing/path references are absent from visible public content, canonical links, sitemap, prerender and generated metadata. Do not restore a legacy route or make a redirect to it.
3. OpenGraph/media references resolve only to approved public-safe assets with withdrawal owner. If an asset is removed, metadata and crawl outputs safely fall back rather than retaining a stale CDN reference.
4. Analytics observes the existing consent boundary and records only privacy-safe route/CTA events. It must not capture prompts, arbitrary query strings, tenant/user identifiers, private media URLs or provider/job details.
5. Verify responsive layout, semantic accessibility, reduced motion, keyboard flow, contrast and media alternatives for all changed public pages.
6. Measure only existing local budgets/tooling; document route chunks/image dimensions/loading strategy. Do not introduce a new analytics, crawler or performance dependency just for this work.

## Cross-section verification matrix

| Concern | Homepage | Film | Shared shell | Evidence |
|---|---|---|---|---|
| Canonical/title/description | required | required if public route | route labels agree | focused metadata test |
| Sitemap/prerender | eligible public route only | eligible only when approved public | no retired link | generator assertions |
| Private leakage | no auth/private payload | no signed media/product state | no sensitive handoff | rendered markup/output inspection |
| Keyboard/focus | CTA/media controls | CTA/not-found | nav/menu | jsdom + browser evidence |
| Reduced motion/media fallback | required | required | menu animation | browser evidence |
| Locale/consent | required | required | required | component/integration tests |

## UI/UX Contract

### Target user / JTBD

Visitors and crawlers must receive the same truthful page identity, while keyboard, mobile, assistive-technology and consent-constrained visitors can complete supported discovery and entry tasks.

### State matrix

| State | Required verification |
|---|---|
| indexable public route | Metadata/canonical/sitemap/prerender match inventory. |
| non-indexable/authenticated route | Excluded from public crawl output and carries no public private payload. |
| approved asset | OpenGraph and in-page source are public-safe and dimensioned. |
| withdrawn/unavailable asset | Accessible fallback renders and stale metadata/CDN reference is absent. |
| consent pending/declined | No nonessential tracking; page remains usable. |
| JS delayed/prerender | Title, primary heading, outcome and safe CTA remain meaningful. |
| keyboard/focus/error | Navigation, CTA, not-found and media fallback work with visible focus and semantic error/fallback copy. |
| reduced motion | Equivalent information/control is available without animation. |
| locale fallback | No raw keys or unsupported translated claim appears. |

### Responsive matrix

Validate 360×800, 390×844, 768×1024, 1024×768 and 1440×900 for shell, homepage and Film route. Confirm no horizontal clipping, visual/source-order mismatch, hidden CTA/focus target, unreadable caption or overlap. Use screenshots/results where a browser is available.

### Accessibility acceptance

Require semantic landmarks, one H1 per route, logical heading hierarchy, meaningful alternative text/captions, descriptive links, keyboard operation, visible focus, contrast, touch targets, text/non-color state indicators and reduced-motion equivalence. Report automated checks separately from manual keyboard/browser evidence; automated passing alone is insufficient.

## TDD and proof sequence

1. Add failing focused tests for metadata/canonical/sitemap/prerender agreement, no retired route/marketing text and no private payload in static output.
2. Add tests for consent-safe analytics payload, asset fallback/withdrawal behavior, headings/landmarks and keyboard-relevant component semantics.
3. Make smallest ownership-preserving fixes in existing SEO/crawl/content modules.
4. Run focused test suites, then browser checks. Do not run `npm run typecheck`.
5. Inspect generated crawl/prerender results and rendered markup directly. Capture measured performance outputs only from existing commands/tools.

## Acceptance criteria

- Public crawl and rendered output consistently represent only approved public routes and current truth-checked claims.
- No `/workflows` promotion or retired path survives in page content, metadata, sitemap or prerender output.
- Accessibility, responsive and privacy/consent evidence covers all changed public routes and documented media fallback states.
- Final evidence distinguishes verified local behavior from unavailable browser, production, CDN, analytics-vendor or external asset-lifecycle proof.
- No deployment, production mutation or external-account action occurs in this section.

## Implementation record

List changed files, focused commands/results, browser viewport/state captures, static-output inspection, measured performance observations and any unverified external proof. Provide release handoff only after code/test evidence exists; do not infer production indexing or asset propagation from local results.

### Partial implementation record — 2026-10-02

- Static public index, XML sitemap, sitemap/LLM output and SEO prerender no longer expose retired `/workflows`, virtual workflow builder or swarm claims. Regression coverage checks those crawl surfaces and the shared Footer; prerender's updated H1 expectation is also covered.
- Neutralized unsupported enterprise/credits/governance/uptime and unverified capability SEO descriptions until their owners provide authoritative evidence. Prerender admits only a single public marketplace slug and excludes authenticated multi-segment auto-review routes. Regression coverage guards the claims and token/auth/desktop/private route exclusion from static sitemap/prerender output.
- Focused verification: `cd apps/web && npm test -- --run shared/__tests__/smartaihubPublicTruth.test.ts server/services/publicSeoPrerender.test.ts server/routers/publicSitemap.test.ts` — 3 files, 10 tests passed.
- Cross-route title/canonical alignment, analytics consent payload minimization, viewport/keyboard/contrast/reduced-motion proof and asset withdrawal fallback are not certified by this scoped change. No browser/e2e, production crawl, analytics vendor or CDN proof was collected. Section 05 remains incomplete until Sections 03–04 and these proofs close.

### Accessibility and tenant-shell regression follow-up — 2026-10-05

- Added interaction tests for localized mobile menu state, `aria-expanded`/`aria-controls`, current-route semantics, Escape dismissal/focus restoration, reduced motion, tenant-specific Navbar/Footer branding, tenant-provided email, and reduced-motion video suppression.
- Focused verification after these changes: 8 files / 58 tests passed; App and changed component/server syntax parsed; bilingual locale JSON and `git diff --check` passed. Tenant-published routes preserve route-specific canonical paths; tenant sitemap/robots/LLM outputs now use the resolved tenant and route-backed published pages. Production/browser crawl, analytics/consent, performance/RUM and deployed-host proof remain pending.
- These are component-level checks only. Browser breakpoints, screen-reader/browser combinations, contrast, consent/analytics behavior, route-wide canonical ownership, performance/RUM, and public deployment remain unverified; section 05 remains partial.

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
