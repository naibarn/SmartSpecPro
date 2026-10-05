# Section 02 — Shell, content, and retired-claim repair

## Objective

Make the shared unauthenticated shell and public content truthful, navigable and localized while removing stale advertising for retired workflow surfaces. This section consumes Section 01's truth map and supplies the stable page frame/content contract for Sections 03–05.

## Dependencies

- Requires Section 01 public route, claim, CTA and asset inventories.
- May proceed while Spec 270 completes its visual foundation, but must not create a private design resolver/provider or high-fidelity page system.
- Does not depend on or modify authenticated-product behavior.

## Scope

Update existing public Navbar/Footer/content/SEO ownership seams only after confirming current paths. Consolidate route labels, descriptions, visible navigation/footer copy and truth-checked feature narratives into the existing localization/CMS/content pattern where feasible. Keep current public URLs unless the Section 01 route decision explicitly approves a change.

Use SmartAIHub's existing wrapper components and the Spec 270 public-ready foundation when it is available. Before adding a new UI component, run the repository-required Astryx discovery commands from the web workspace: `npm run astryx -- build "public AI work platform shell"`, `npm run astryx -- docs layout`, then inspect each selected component/token API. Do not add Astryx resets globally, raw layout elements, hard-coded visual values, a second design resolver or broad rewrite of old pages.

## Required behavior

1. Navigation and footer expose only verified public destinations. Active state must match the router; mobile menu state, keyboard escape/close, focus restoration and reduced-motion behavior stay correct.
2. Remove public links, labels, generated marketing copy and crawl references that promote `/workflows` or the legacy custom workflow engine. Replace with approved, truthful capability/automation/task language only where Section 01 gives a source. Never restore the retired route, add a redirect, or add compatibility behavior.
3. Make route title/description/nav/footer labels come from one content ownership path where current architecture permits. Keep Thai/English labels, CTA, empty/loading/error/fallback and consent wording localized using established keys and safe fallbacks.
4. Preserve consent behavior and ensure no analytics event captures prompt/query content, tenant identifiers or arbitrary URL parameters.
5. Ensure all shell links have a stable, supported signed-out target. Auth handoff uses the Section 01 allow-list; no open redirects.

## UI/UX Contract

### Target user and JTBD

Visitors need to identify the product area they want, move through public routes safely, and enter the supported product surface without encountering obsolete workflow marketing.

### Surface and component map

| Surface | Owner | Change |
|---|---|---|
| Desktop navigation | existing public shell | Verified links, route-active semantics, localized labels. |
| Mobile navigation | existing public shell | Accessible disclosure/dialog behavior and same route set. |
| Footer | existing public shell/content source | Verified discovery, legal/trust and resource links only. |
| Shared public copy | existing content/localization source | Truth-checked terms and CTA labels. |
| Consent/analytics boundary | existing consent/analytics owner | Preserve opt-in and remove sensitive payloads. |

### State matrix

| State | Required behavior |
|---|---|
| desktop nav idle/active | Current route has semantic current-page indicator; links remain keyboard reachable. |
| mobile menu closed/open | Toggle has expanded state; open menu traps no focus unless existing dialog pattern requires it; Escape and route selection close it. |
| keyboard focus | Visible focus, logical order and focus returns to toggle after close. |
| hover/selected | Non-color affordance; hover never triggers navigation or tracking. |
| unknown/withdrawn public target | Do not render the link; show existing safe fallback only where needed. |
| consent pending/declined | No nonessential analytics until existing policy allows it. |
| locale fallback | Safe approved default language; no mixed raw key text. |
| reduced motion | Menu/indicator remains comprehensible without animated-only cues. |

### Responsive matrix

| Viewport | Required behavior |
|---|---|
| 360×800 | Long bilingual labels wrap/overflow safely; controls remain tappable. |
| 390×844 | Menu controls, CTA and legal links remain reachable without horizontal scroll. |
| 768×1024 | Navigation changes layout without duplicate/interleaved focus targets. |
| 1024×768 and 1440×900 | Desktop nav uses readable grouping and preserves route-active state. |

### Accessibility acceptance

Use semantic navigation and landmarks, accessible names, current-page state, keyboard operation, visible focus, text/semantic state beyond color and meaningful link text. Mobile menu changes are announced without moving focus unexpectedly. Meet existing contrast and target-size baseline.

### Copy contract and browser evidence

Tone is concise, outcome-led and truthful. Do not use legacy workflow terms or claim unverified pricing/customer results. Validate at the four listed viewport classes, keyboard-only menu flow, reduced motion, locale fallback and consent-declined state with screenshots/results if browser tooling exists; otherwise record visual proof as unverified.

## Tests

- Begin with focused failing tests for public link set, active route, retired claim/path absence, locale fallback, mobile open/close and keyboard/focus behavior.
- Add tests for valid auth handoff allow-list and no sensitive analytics payload.
- Use jsdom for browser-facing React tests; retain production routing/crawl behavior tests nearest their owner.
- Do not run repository-wide typecheck.

## Acceptance criteria

- No public nav/footer/content/sitemap/prerender surface advertises or links retired `/workflows` behavior.
- All visible links and CTA destinations are backed by Section 01 inventory.
- Public shell is usable across required breakpoints and keyboard/reduced-motion states.
- Content/localization and analytics changes remain within established ownership paths.

## Implementation record

List exact retired claims removed, their replacement source (or removal-only decision), changed content keys/components, tests and browser evidence. Report sources not verified rather than substituting internal implementation terminology.

### Implementation record — 2026-10-02

- Removed `/workflows`, `/docs/workflow-builder`, `/docs/swarm-execution` and `/docs/faq/workflows` from public index/sitemap ownership. No route, redirect, or compatibility behavior was added.
- Replaced retired virtual-workflow/swarm claims in public Footer, sitemap/LLM output and SEO prerender snapshots with neutral product/discovery language. Generic `workflow` usage outside this exact public claim set was not broadly rewritten.
- Replaced unsupported enterprise, pricing/credits, uptime, governance and marketplace-governance descriptions in crawl/SEO copy with neutral information language pending authoritative owner approval.
- Added `apps/web/shared/__tests__/smartaihubPublicTruth.test.ts`. It first failed on the stale `/workflows` index entry, then passed after scoped removal. Updated the nearest prerender expectation to the new verified-neutral H1.
- Verified no retired path/claim matches in Footer, public index, static sitemap, sitemap/LLM output or prerender source; the existing route guard continues returning not-found for `/workflows`.
- Focused verification: `cd apps/web && npm test -- --run shared/__tests__/smartaihubPublicTruth.test.ts server/services/publicSeoPrerender.test.ts server/routers/publicSitemap.test.ts` — 3 files, 10 tests passed.
- Browser viewport, keyboard and consent-declined proof were not run. Pricing/product/security claims and the full auth-intent/analytics allow-list remain open owners in the truth map; only copy/crawl retirement is complete here.

### Tenant-aware public shell follow-up — 2026-10-05

- `Navbar` and `Footer` now resolve platform content from the current tenant's primary domain. Custom tenant domains use their own name/logo, show only the tenant home link, and omit SmartAIHub product/company/resource/social/support/email links. A tenant-provided contact email is shown only when present.
- If tenant resolution is absent, SmartAIHub-specific public content is shown only on a verified SmartAIHub or local-development host; unknown hosts fail closed. Removed the unused `navbar.workflows` translation key and its required-key assertion.
- Direct public content routes now pass through `TenantPublicRoute`: SmartAIHub keeps its existing route, a custom tenant renders only the exact tenant's published page for that route key, and an unpublished/unknown page shows a localized tenant-safe state. This closes the direct-URL fallback gap for features, pricing, docs/help, company/resources/trust, blog, marketplace, gallery and legal routes; emergency public incident routes remain their separately owned service.
- Published tenant pages retain the requested route as their canonical path; the emergency notice is rendered only on the tenant home route, not on arbitrary tenant content pages.
- Tenant `robots.txt` now points to the tenant canonical sitemap and LLM index; custom tenant LLM indexes contain only that tenant's published, route-backed pages. Unknown hosts receive a private crawler policy instead of SmartAIHub crawler metadata. Tenant sitemap output advertises route keys accepted by the shared public route boundary.
- Added bilingual mobile-menu labels, expanded/controls/current-route semantics, Escape-to-close with focus restoration, and reduced-motion handling. Tenant page background video is omitted when the visitor requests reduced motion.
- Focused regressions: public host brand boundary, Navbar, Footer tenant branding, tenant direct-route boundary/canonical path, tenant sitemap/robots/LLM output, TenantHomePage reduced-motion, nav localization contract and Spec 270 artifact service — 8 files, 58 tests passed on the task worktree. App and changed component/server syntax parsing, `git diff --check` and locale JSON parsing passed.
- This closes local shell identity leakage and the reduced-motion autoplay gap. Tenant-specific editable nav/footer content is not exposed by the current tenant contract; browser viewport/keyboard and deployed-domain evidence remain unverified.

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
