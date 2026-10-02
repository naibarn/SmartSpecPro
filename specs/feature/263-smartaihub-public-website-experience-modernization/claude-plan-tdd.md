# Spec 263 TDD Plan

Write failing tests first and follow existing web conventions. Use focused Vitest suites; React/browser-facing tests use jsdom. Do not run repository-wide `npm run typecheck`.

## P0 — Public site G0 inventory and truth map
- Route inventory checks: every public route has one owner/title/canonical; legacy `/workflows` absent from public nav, sitemap, prerender and marketing copy.
- Truth map checks ensure claims map to verified capabilities; pricing and customer proof are not fabricated.

## P1 — Dependency on Spec 270 public-ready design foundation
- Contract checks: public pages consume the approved artifact/catalog snapshot; unresolved design foundation is reported as blocked and no duplicate provider/resolver is created.
- Integration fixture: provider flags false still renders public experience.

## P2 — Content and public shell
- Component tests: desktop/mobile nav, route-active state, keyboard open/close/focus, footer links, localization fallback and consent behavior.
- SSR/prerender checks for stable content, canonical/title metadata and no private payload.

## P3 — Homepage outcome hierarchy
- Render tests for hierarchy, CTA destinations, film prominence and outcome copy; verify no retired workflow phrase/path and no unsupported capability or invented proof.
- Responsive/accessibility cases: heading order, media alt/caption, reduced motion, small viewport and no autoplay dependency.

## P4 — Film flagship and public routes
- Route tests for film page existence/path, supported CTA and validated deep link; unknown routes return intended not-found behavior.
- Media fallback, alt text/captions, unavailable asset and signed-in/signed-out handoff cases.

## P5 — SEO, privacy, performance, accessibility and rollout
- Sitemap/prerender/robots assertions against public route set; no retired or private routes; metadata and canonical consistency.
- Analytics consent and sensitive-data exclusion; image dimensions/loading hints; accessibility semantics and keyboard checks.
- Focused build/test proof; browser visual evidence or an explicit unverified result.
