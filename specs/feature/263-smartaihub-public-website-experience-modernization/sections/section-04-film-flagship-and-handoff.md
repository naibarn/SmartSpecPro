# Section 04 — Film flagship and handoff

## Objective

Create or revise the supported public AI Film/Short Film/Vertical Series flagship surface and its product handoff. The page must make a verified film outcome understandable without exposing execution internals, creating a fictional route or bypassing authentication.

## Dependencies and decision gate

Requires Sections 01 and 02, public-ready Spec 270 foundation, verified Spec 258 feature claims and public-safe media/assets. Section 01 must determine whether a public Film route already exists and which destination supports the entry intent. If no supported route/destination or approved proof exists, do not invent one: improve discoverability only through an approved existing destination and record the remaining feature as blocked.

This section does not modify Film Studio execution, provider calls, media/job persistence, credits or worker behavior. Any future long-running work belongs to the canonical `worker_jobs` plus outbox control plane and is outside this public-route scope.

## Route and handoff contract

- Use the existing route naming/router convention after verifying collision and public ownership. Do not introduce `/workflows`, legacy workflow compatibility or a generic workflow product route.
- Signed-out CTA enters the Section 01 allow-listed authentication/product handoff. Signed-in CTA lands on the exact supported Film entry.
- Preserve only named, validated intent fields. Ignore arbitrary return URLs, tenant IDs, task IDs, provider/model parameters and private media references.
- Unknown public film routes use existing not-found behavior; authenticated/private Film pages must not be statically indexed or prerendered.

## Content hierarchy

1. Film outcome and suitable creator/use case.
2. Verified path from idea to supported short-film/vertical-series result, described without claiming a duration, quality, model or delivery promise absent from the truth map.
3. Approved visual proof/demo with caption, provenance and unavailable-media fallback.
4. Clear product-entry CTA and secondary public discovery link only where inventoried.
5. Trust/support wording restricted to approved claims.

## UI/UX Contract

### Target user / JTBD

A creator or evaluator should know whether SmartAIHub's Film offering fits their project, see credible public proof, understand the supported next step and enter it safely whether signed out or signed in.

### Existing pattern and component map

Inspect the current public pages, router, Home film link and product-entry/auth patterns. Reuse public page frame, Section 02 shell and Spec 270 resolved components. Do not create a parallel Film design system, direct provider UI or a custom workflow interface.

| Surface | Owns | Consumes |
|---|---|---|
| Film public route/page | public narrative, proof presentation and public CTA | route inventory, approved claim/media registry, Spec 270 foundation |
| Film proof module | accessible visual/demo fallback | asset provenance/withdrawal owner |
| CTA handoff | valid signed-out/signed-in entry | Section 01 allow-list/auth contract |
| Not-found/route metadata | safe unsupported route behavior | existing router and Section 05 SEO contract |

### State matrix

| State | Required behavior |
|---|---|
| route loading/prerender | Meaningful title/summary and core content render without private data. |
| approved media available | Dimensions, alt/caption/provenance are present; visual is illustrative only if labelled. |
| media unavailable/withdrawn | Localized explanatory fallback and CTA remain; no broken preview or stale OpenGraph reference. |
| signed out CTA | Validated auth/product handoff preserves only allow-listed intent. |
| signed in CTA | Reaches verified Film entry and handles missing entitlement through existing product message. |
| unsupported route | Existing accessible not-found response; route is not added to sitemap/prerender. |
| consent declined | No nonessential media tracking/analytics payload. |
| hover/focus/selected | CTA/card states have text/semantic affordance and visible focus. |
| reduced motion | Poster/static explanation communicates the same idea as motion. |
| locale fallback | Approved Thai/English copy and safe fallback; no raw localization key. |

### Responsive matrix

| Viewport | Required behavior |
|---|---|
| 360×800 | Film proof and CTA stack with captions/fallback accessible and no horizontal scroll. |
| 390×844 | Primary CTA remains visible/reachable after proof content. |
| 768×1024 | Media/copy alignment retains reading and keyboard order. |
| 1024×768 | Page uses stable media dimensions and no overlay obscures captions or CTA. |
| 1440×900 | Visual proof supports, rather than overwhelms, outcome and conversion hierarchy. |

### Accessibility and copy acceptance

Use main/navigation landmarks, one clear H1, ordered headings, descriptive CTA labels, captions/transcripts where media conveys material information, keyboard reachability, contrast and reduced-motion support. Copy is factual, localized and avoids unverified performance, credits, pricing, customer, model/provider and delivery claims. No retired workflow wording or links.

### Browser evidence

Capture desktop/tablet/mobile proof, keyboard-only CTA/not-found flow, signed-out and signed-in handoff, reduced motion and unavailable-media fallback. Verify no private media URL/data leaks in rendered markup and no stale route appears in indexable output. If browser access is missing, mark these acceptance states unverified.

## TDD implementation sequence

1. Add failing route tests for the verified public film path or verified existing-destination fallback, metadata owner, not-found behavior and absence from retired workflow paths.
2. Add tests for authenticated handoff allow-list, media fallback/provenance, semantic headings, alt/caption and no private payload.
3. Implement through existing router/page/content conventions and resolved Spec 270 components.
4. Add focused SEO/crawl assertions jointly with Section 05 without duplicating sitemap ownership.

## Acceptance criteria

- Film is a truthful, early and usable flagship destination from the homepage and its own supported public surface where approved.
- Every CTA resolves to an inventoried supported product entry; unsupported input never becomes an open redirect.
- Unavailable proof, entitlement changes and unknown routes have safe visible behavior.
- The implementation does not change Film execution or revive a retired workflow surface.

## Implementation record

State the final route decision, source of each claim/proof asset, auth handoff fields, changed files, tests and browser evidence. Include any unresolved requirement that was blocked by absent Spec 258 proof, public asset rights or Spec 270 foundation.

### Status — blocked, 2026-10-02

Repository inventory found no supported public Film route and no rights-cleared public film proof asset/withdrawal owner. Existing private Film execution surfaces are outside this section. No new route or claim was invented. Use only the current approved destination after Product/Auth owners verify it; do not promote demo footage until Spec 258 claim and asset-rights evidence plus the Spec 270 public component foundation are available.

### Follow-up implementation — supported product handoff mapped, 2026-10-05

- Confirmed `/drama-series` is the existing authenticated Vertical Series product destination and the login return-url contract safely accepts the same-site route. The Home page now links to it without adding a fictional `/film` route.
- The handoff/destination gap is closed for discoverability. A dedicated public Film narrative/proof module remains blocked on approved Spec 258 claims, asset rights/provenance, and the missing public-ready design catalog; no production Film behavior was changed.
- Focused Home and auth-return-path tests pass. Browser signed-out/signed-in outcome and media fallback remain unverified.

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
