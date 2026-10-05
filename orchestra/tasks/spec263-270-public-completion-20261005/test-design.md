# Test Design

## Focused gates

- Home semantics, bilingual copy, primary signup link, vertical-series login return path, and tenant-specific rendering.
- Public page API exact-tenant query and no global-content fallback; client cache and payload tenant match.
- Safe auth return URL, retired-route guard, sitemap exclusions, and SEO prerender behavior.
- Design schema safety, feature defaults, resolver, native artifact service, handoff authority fail-closed behavior, provider candidate schema, and no provider/policy call without catalog snapshot.
- Media removal, explicit OG selection, public design package digest and route/claim/media registry validity.

## Candidate evidence

- `JWT_SECRET=local-vitest-public-tenant-test-0001 pnpm --dir apps/web exec vitest run client/src/components/__tests__/Navbar.i18n.test.tsx client/src/pages/Home.test.tsx client/src/i18n/__tests__/publicSite.test.ts client/src/components/__tests__/Seo.test.tsx client/src/components/__tests__/Seo.nullTenant.test.tsx client/src/pages/PublicMediaRemoval.test.ts client/src/hooks/__tests__/useTenantPage.test.tsx client/src/components/__tests__/TenantPublicRoute.test.tsx client/src/pages/TenantHomePage.test.tsx server/routers/__tests__/tenantPublicPages.test.ts --reporter=dot`: **10 files, 47 tests passed** after the final navigation repair.
- Local Chromium matrix: 360×800, 390×844, 768×1024, 1024×768, 1440×900 and 1920×1080 had one H1, no horizontal overflow, no user-facing toast and no page exceptions; wide sections centered at 1320px. Thai, reduced motion and mobile-menu keyboard/focus behavior were observed. Evidence: `evidence/browser-local-candidate.json`, `evidence/browser-local-interactions.json`, and `evidence/verified-candidate-home-{390,1440}.png`. Features and Docs also rendered at 390/1440 with no page error, overflow, or local marketing images: `evidence/browser-local-public-pages.json`. API responses were mocked; this is not production or signed-in acceptance.
- Route, locale, redirect, claims and media registries parse as JSON; route inventory has 57 individual entries, with no route groups.
- `python3 design/public/scripts/build_manifest.py` generated a deterministic digest; current digest recorded in `design/public/PUBLIC_DESIGN_PACKAGE.json`.
- `git diff --check`: pass after current edits.
- No app build, repository-wide typecheck, production browser/crawl, signed-in UAT, measured performance/contrast audit, or provider certification was run. These results are not inferred from focused checks.

## Requirement / evidence matrix

| Requirement | Observable behavior | RED evidence | GREEN evidence | Residual boundary |
|---|---|---|---|---|
| §37 narrative and one H1 | Thai/English visitors see an outcome narrative and supported Vertical Series entry | Previous public hierarchy was product/catalog led; legacy media had no provenance | Home and locale tests plus local browser show one H1, bilingual outcome copy and supported handoff | Production screenshots and content-owner acceptance remain separate |
| §38–39 Spec 270 design authority | page regions map to owned components/tokens and a content-addressed package | `design/public/` absent at baseline | Package registries, Astryx wrapper, references and reproducible manifest exist | No external component-catalog publication authority; CLI static-theme build fails to load `defineTheme`, runtime injection warning remains |
| Product/media evidence | no unverifiable media is represented as platform proof | Home, Features and Docs rendered local marketing media without recorded provenance | No marketing `<img>` remains in those pages; explicit illustration disclosure; implicit OG fallback removed | Static files retained for possible stored tenant/CMS URLs; rights and withdrawal authority unresolved |
| Route/locale/redirect truth | routes distinguish authority, tenant/auth, CTA, locale and SEO | Inventories incomplete at baseline | 57 route entries and locale/redirect/claim registries parsed and source mapped; Home handoff tested | Live crawl and canonical/indexability decisions remain open |
| Responsive/accessibility | required viewports, keyboard and reduced-motion states preserve access | Prior evidence did not cover candidate design and interactions | Local browser matrix and Home tests cover viewport reflow, menu close/focus restore, Thai and reduced motion | No signed-in browser, assistive-tech/manual contrast review, or production browser proof |
| SEO/privacy/performance | metadata does not invent media; canonical behavior remains tenant scoped | Default OG image had no provenance | Seo tests cover no-image and absent-tenant paths; importer/blog no longer invent default image | Consent authority, live crawl, measured CWV and production proof remain open |

## Distinct review rounds — candidate closeout

1. Narrative/claim review: one outcome H1, immediately visible Vertical Series entry, no public Film route or unsupported customer proof. PASS.
2. Media review: Home, Features and Docs no longer render unverified local marketing imagery; obsolete Home asset constants removed; default OG image fallback removed. PASS after repair.
3. Tenant review: platform curated Home is gated to SmartAIHub; custom tenants retain their tenant-owned page path; focused Home tenant cases pass. PASS.
4. CTA/route review: signup and Features destinations remain public; Vertical Series keeps the local `/login?returnUrl=%2Fdrama-series` handoff. PASS.
5. SEO review: absent tenant SEO and explicit no-image behavior pass focused tests; blog/import code no longer invents a fallback image. PASS.
6. Responsive review: local Chromium at 360/390/768/1024/1440/1920 shows no overflow and centered 1320px frame on wide screens; Navbar finishes its entrance animation at the top. PASS (mocked local only).
7. Accessibility interaction review: one H1, Thai, reduced-motion state and mobile-menu keyboard close/focus restoration observed. PASS for this subset; manual assistive-tech/contrast remains open.
8. Design-system review: homepage uses the Astryx wrapper/components and scoped theme; no raw layout div/span or page-local CSS was introduced. PASS; static theme generation CLI still fails and injection warning remains.
9. Registry/digest review: 57 route entries, locale/redirect/claim/media JSON parse, package manifest regenerates deterministically. PASS.
10. Scope/syntax review: 5 focused suites / 21 tests pass and `git diff --check` passes. PASS; build/full typecheck remain separate gates.

11. Tenant/routes and changed public surfaces: exact-tenant hook/API/page suites pass (4 files / 17 tests); Home/Features/Docs run at mobile and desktop in Chromium without page errors or overflow. Reduced-motion menu opens by keyboard, closes on Escape, and restores focus after its 300ms exit. PASS (mocked local only).
12. Final clean audit before the last visual repair: combined candidate suite passed 9 files / 38 tests; syntax transforms passed for the then-current 9 client/server files; route/claim/design registries matched their recorded schemas and digest. PASS for then-current source only.
13. Navigation repair review: Thai desktop labels could wrap because flex children could shrink and the desktop nav activated at `lg`. Prevented shrinking/wrapping and moved the full nav to the compact menu below `xl`. The expanded focused regression run passes 10 files / 47 tests. Final changed-scope esbuild transform passes 10 TS/TSX files. Chromium at 360/390/768/1024/1440/1920 (Thai; mocked APIs) shows no overflow/page errors, desktop labels remain on one line at 1440/1920, and mobile menu opens by keyboard, closes on Escape and restores focus. Evidence: `evidence/browser-local-final-nav.json` and updated Home screenshots. PASS for local candidate only.

14. Final traceability/release review: Home/Features/Docs contain no rendered platform marketing images; concept panels are explicitly disclosed as illustrations, implicit OG defaults were removed, the supported Vertical Series sign-in handoff remains, tenant-owned page paths stay isolated, and no `/film` route or unsupported social/customer proof was introduced. Source records map 57 routes and 11 claims; rights/Spec270 catalog/privacy/content ownership, production crawl/accessibility/performance and deployed-domain evidence remain open. No additional repository-safe repair was found without external authority or new product evidence. PASS for safe source scope; external acceptance remains OPEN.

Rounds 13 and 14 are the two consecutive clean candidate reviews after the final repairs. All 14 rounds are candidate-level evidence; production acceptance, external approvals, full build/typecheck and deployment are not inferred.
