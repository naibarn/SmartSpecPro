# Section 03 — Homepage experience

## Objective

Implement a coherent, outcome-led public homepage that communicates SmartAIHub's verified value, makes AI Film/Short Film/Vertical Series immediately discoverable, and provides one clear supported conversion path. Preserve the established shell and do not redesign authenticated surfaces.

## Dependencies and boundaries

Requires Sections 01 and 02 plus a public-ready Spec 270 foundation: canonical design artifact, resolved component/catalog snapshot, approved SmartAIHub/Astryx wrapper and public-safe assets. If that foundation or an approved claim/asset is unavailable, perform only low-risk structure/content corrections and record high-fidelity work as blocked. Do not create a competing design artifact, provider integration, resolver or design-service path.

Use Section 01's approved claims/asset registry and Section 02's shell/CTA contract. Film execution remains governed by Spec 258; this section only links to verified public/product entry. It must not modify provider, media generation, worker or credit code.

## Page hierarchy

1. Hero: a plain-language universal AI work outcome and primary CTA.
2. Immediate flagship proof: AI Film/Short Film/Vertical Series with verified capability and approved visual evidence.
3. Verified breadth: creation, research and build capabilities expressed through approved user outcomes, not infrastructure internals.
4. Control/trust: only approved privacy, governance, availability or support statements.
5. Closing CTA: same supported destination/intent semantics; no invented waitlist, pricing, customer logos, metrics or demo outputs.

Keep progressive disclosure: a visitor should first understand outcome and film relevance; technical detail follows only where it helps an evaluator. Every link resolves to an inventoried public route or Section 01 signed-out handoff.

## UI/UX Contract

### Target user / JTBD

Creators, professionals, builders, organizations and technical evaluators need to understand what they can achieve, see credible Film proof, discover a relevant route and start with a supported CTA without navigating an obsolete workflow surface.

### Existing pattern reference

Inspect the current Home page, public shell and content modules first. Reuse their route/load/analytics conventions. New visual primitives must be resolved by Spec 270's canonical foundation and selected through the mandated Astryx discovery flow; avoid raw layout markup, hard-coded styling values, global CSS resets and standalone design systems.

### Component map

| Component/surface | Owns | Consumes |
|---|---|---|
| Public page frame | layout/landmarks/route composition | Section 02 shell and Spec 270 resolved foundation |
| Hero + primary CTA | outcome statement and supported action | Section 01 approved copy and handoff contract |
| Film flagship band | discoverability/proof presentation | verified Spec 258 claim and approved media registry |
| Capability bands | progressively disclosed verified outcomes | Section 01 claim matrix |
| Trust/closing CTA | approved confidence copy and conversion | content source, consent and CTA contract |

### State matrix

| State | Required experience |
|---|---|
| prerender/initial load | Semantic headings/content are visible without private payload or JS-only critical claim. |
| media ready | Approved image/video has dimensions, meaningful alt/caption and non-autoplay-dependent understanding. |
| media unavailable/withdrawn | Preserve hierarchy with localized descriptive fallback; do not show broken proof or fabricate a replacement. |
| signed out | Primary CTA uses Section 01 validated handoff. |
| signed in | CTA follows validated product-entry behavior without losing page state or arbitrary parameters. |
| consent pending/declined | No nonessential tracking or sensitive event fields. |
| loading/error | Only established public-page loading/error behavior; visible text explains the safe fallback. |
| hover/focus/selected | CTAs/cards have non-color affordance, keyboard focus and no hover-only facts. |
| reduced motion | Motion enhancement can stop; content, controls and status remain equivalent. |
| locale fallback | Approved Thai/English copy and safe fallback render, never raw translation identifiers. |

### Responsive matrix

| Viewport | Required behavior |
|---|---|
| 360×800 | Hero, film CTA and media fallback stack; no clipped text or horizontal scroll. |
| 390×844 | Film remains visible early; CTA tap targets and reading order are intact. |
| 768×1024 | Media/text balance remains readable and keyboard order matches visual order. |
| 1024×768 | Content bands and CTA hierarchy remain clear without overlap. |
| 1440×900 | Intentional max widths, readable line lengths and supporting proof do not overpower hero. |

### Accessibility acceptance

Use a single main landmark, logical H1/H2 hierarchy, semantic sections, descriptive CTAs, meaningful alt text and captions/transcripts for meaningful media. Keyboard flow, visible focus, contrast, target size, source order and reduced motion must meet the existing public baseline. Never rely on autoplay, hover or color alone to state a claim.

### Copy, visual and browser-evidence contract

Copy is concise, localized and source-backed. Avoid retired workflow language, unsupported metrics/logos/customer proof and provider-internal terminology. Consume the approved Spec 270 design artifact/resolved components; record its version/digest in implementation evidence. Capture homepage evidence at required breakpoints, signed-out/signed-in CTA outcome, keyboard flow, reduced-motion and unavailable-media fallback. If a browser is unavailable, record each visual state as unverified rather than inferred.

## TDD implementation sequence

1. Add failing semantic render tests for one H1, outcome hierarchy, immediate film link, supported CTA, no retired vocabulary/path and approved claim-source fixture.
2. Add failing tests for media fallback, alt/caption, auth handoff, consent-safe analytics, locale fallback and reduced-motion behavior.
3. Implement the smallest content/component changes through existing wrappers and Spec 270 resolver.
4. Add responsive/browser proof after focused component tests pass. Verify titles/canonical ownership remains with Section 05.

## Acceptance criteria

- A new visitor sees a truthful product outcome and film flagship before unrelated technical detail.
- Each visible claim/media/CTA traces to the Section 01 registry, and unsupported material is absent.
- Page remains useful when media fails, JS is delayed, consent is declined or motion is reduced.
- No legacy workflow marketing, route link or compatibility behavior appears.

## Implementation record

Record changed paths, Spec 270 artifact/version used, approved claim/asset sources, test results, browser screenshots/results and all blocked proof states. Do not claim visual certification from code review alone.

### Status — blocked on public-ready artifact and evidence owners, 2026-10-02

No high-fidelity homepage changes were made. Spec 270 now has isolated Astryx 0.6.3 discovery, a source-controlled catalog snapshot and deterministic resolver, but no approved SmartAIHub public-ready design artifact/wrapper or authorized authoring flow. The truth map also has no verified pricing/customer/security claims or cleared proof-asset owner. Section 06 remains blocked on durable artifact ownership and live authority ports. Proceeding with a redesign would violate the section's dependency and evidence gates. Resume when those product, storage, authority and asset owners close their gates.

### Follow-up implementation — low-risk public correction, 2026-10-05

- Replaced the generic tool-directory opening with a bilingual outcome-led hero and an immediately visible text-first Vertical Series entry. The entry uses the existing authenticated `/drama-series` destination through the local `/login?returnUrl=%2Fdrama-series` handoff.
- Added `PublicHomeExperience` as a SmartAIHub-owned wrapper boundary over installed Astryx components. No unapproved image, customer proof, pricing, or production promise was added.
- Updated app and crawler fallback SEO metadata together and added semantic/homepage route regressions.
- Focused evidence on candidate SHA: `Home.test.tsx`, `publicSite.test.ts`, auth/tenant/crawl/SEO and Spec 270 boundary suites; 15 files / 110 tests passed. Browser, responsive, consent, analytics, rights, and production crawl evidence remain unverified.
- **Status remains partial:** this satisfies the allowed low-risk structure/copy correction while rights-cleared Film media, approved Spec 258 public claims, complete design resolver/catalog authority, and browser evidence remain gated.

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


### Visual hierarchy follow-up — 2026-10-05

- Expanded the hero with existing local illustration assets, meaningful localized alt text/captions, explicit illustrative-only disclosure, and an unavailable-image fallback; immediately follows with the Vertical Series spotlight and supported auth handoff.
- Added localized feature/gallery/documentation discovery, truthful account/access explanation, and closing signup CTA. The emergency public entry now follows the flagship band so it does not interrupt the required hero-to-flagship sequence.
- Focused verification: `Home.test.tsx` and `publicSite.test.ts` pass (2 files / 15 tests). Image files exist at 1672×941 and component props were checked against installed Astryx source.
- Status remains **partial**: image rights/provenance and the Spec 270 public-ready design artifact are unverified, and browser/responsive/keyboard/reduced-motion evidence was not captured. The local illustrations do not count as approved customer/Film proof.

### Production browser diagnosis and follow-up — 2026-10-05

- A real Chromium capture of `https://smartaihub.app/` confirmed the new source and assets were live. The actual layout defect was the fixed 64/80px Navbar overlaying the Home main content, whose top offset was zero; the small `SmartAIHub` eyebrow was rendered underneath the brand navigation. Desktop and mobile had no horizontal overflow, the two illustration assets loaded, and no client-side exceptions occurred.
- The platform tenant still advertises a stale website-logo URL that returns HTTP 404. SmartAIHub now uses its source-owned brand mark on Navbar/Footer; custom tenants continue to use their own logos.
- Added a direct Vertical Series jump link to the hero so the flagship is discoverable in the hero composition, and a token-based responsive top offset matching the fixed Navbar.
- A legacy published SmartAIHub CMS home could override the Spec 263 experience. Canonical SmartAIHub now always renders the app-owned public experience; exact-tenant CMS pages remain active on custom tenant hosts.
- Validation is pending on the integrated SHA: browser recapture at 1440px and 390px, HTML/CSS asset checks, and post-integration package typecheck. This does not close the external Spec 270 design-artifact or Film proof/rights gates.
