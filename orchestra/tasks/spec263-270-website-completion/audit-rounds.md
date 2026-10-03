# Post-implementation audit rounds — Spec 263 / 270 website continuation

Scope: the changed public homepage, shared SEO path, navigation/footer, signup entry copy, and their direct tests. These rounds do not certify every requirement in Specs 263 or 270.

1. **Route and page ownership** — `Home.tsx` uses existing `/`, `/signup`, `/features`, `/docs`, `/contact` paths; `App.tsx` already registers `/signup`. Existing public sitemap tests pass.
2. **Capability claims** — Homepage copy is reduced to product information/resources; Signup's unsupported 10K/50K/99.9% and “thousands” claims are removed. `publicSite.test.ts` and `smartaihubPublicTruth.test.ts` pass.
3. **Retired workflow language** — Homepage shell and visible text no longer promise retired workflow-builder capabilities; truth guard passes.
4. **Locale parity** — EN/TH home namespaces match; translated page title, description, heading, CTA and links are asserted by `publicSite.test.ts`; focused tests pass.
5. **CTA/runtime policy alignment** — Signup mode is runtime-configured, so homepage/navbar CTA remains neutral. Invite-required copy renders only for confirmed invite-only mode. Config loading/error shows a neutral unavailable message. Read-only review identified this issue; regression guard added.
6. **Tenant isolation** — Public Home opts out of tenant SEO defaults and remote tenant SEO. `Seo.test.tsx` verifies fixed SmartAIHub metadata and no fallback image with tenant metadata present.
7. **Crawler shell and hydrated SEO** — Shell title/description/keywords are neutral and marked for Helmet ownership; browser smoke confirmed one description after hydration in both locales, correct localized title/description, and no social preview image.
8. **Prerender parity** — `publicSeoPrerender.test.ts` checks shell snapshot title/description/content match; server service tests pass.
9. **Navigation/footer behavior** — Navbar CTA points to the existing signup route and is mode-neutral; removed nonfunctional newsletter input/Subscribe action. Navbar test passes.
10. **Browser/responsive and route guard** — Vite source smoke at 390px confirmed EN/TH home route, localized document language/title/metadata, no horizontal overflow, and `/signup` route copy has no removed claims. With API unavailable, signup showed neutral “options unavailable”; no page errors. This is a development-server smoke, not backend/production proof. Public sitemap/truth and seven focused suites passed (25 tests).

## Deferred proof and remaining blockers

- No build was run, per the user's latest instruction. Final bundle/build compatibility is unverified.
- Vite dev server has no backend: auth, tenant and registration API requests returned the app shell. The smoke confirms UI fail-closed behavior only, not live signup/API operation.
- No deployed browser, production crawl, external content approval, customer/rights approval, or production credential check was performed.
- Spec 263 public-ready film/short-film/vertical-series artifacts, claims/assets authority and associated Film proof remain external blockers.
- Spec 270 Section 06 durable artifact ownership and live Spec 224/256 authorities/providers remain external blockers.
- Therefore the public homepage continuation is locally verified, while Specs 263 and 270 are not fully closed.
