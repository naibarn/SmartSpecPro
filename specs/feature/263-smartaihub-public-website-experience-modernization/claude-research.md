# Spec 263 Research

## Research decision

- Codebase research was required. SocratiCode is unavailable in this runtime; targeted source discovery and a read-only repository scout were used.
- Current-technology research was required for the optional Stitch provider. No credentials were inspected, and no provider call, upload, or generation was made.
- Web tests use Vitest; browser evidence uses the repository Playwright setup. The repository forbids npm run typecheck due to RAM constraints.

## Existing public-site seams

- Public routes are registered in apps/web/client/src/App.tsx. Home, Pricing, Features, Docs, Contact, Support, Resources, Status, Security, Blog, Marketplace, and legal/trust surfaces already exist. There is no public /film route; its product CTA must resolve through a verified Film Studio route.
- Homepage source is apps/web/client/src/pages/Home.tsx; content/assets are in homeContent.ts. Shared nav/footer are components/Navbar.tsx and components/Footer.tsx.
- Client metadata is handled by components/Seo.tsx. Crawl-facing sitemap/route metadata and HTML snapshots use server/routers/publicSitemap.ts and server/services/publicSeoPrerender.ts.
- Preserve known URLs unless the route inventory establishes an approved replacement, canonical, status, and redirect.

## Retired workflows correction

- /workflows is centrally redirected by client/src/lib/retiredRouteGuard.ts and App.tsx; server routing returns 410.
- shared/smartaihubPublicIndex.ts still advertises the path in public discovery/sitemap, and publicSeoPrerender.ts contains stale workflow-engine claims. Correct these stale public claims without adding callers, routes, docs, tests, or compatibility for the retired engine. General multi-step work storytelling must point to supported capability/task surfaces.

## Design authority and UX constraints

- Spec 263 Revision 263.8 assigns canonical design artifacts, component resolution, and design verification to Spec 270; Spec 224 owns implementation/final verification.
- Astryx 0.6.3 is present, but existing pages primarily use Tailwind/shadcn markup. New UI must follow repository Astryx discovery/layout/token rules; do not broadly retrofit unrelated pages.
- No public design package/registry, public route inventory, redirect map, or full design evidence package was found.
- UI must support Thai/English, responsive layouts, keyboard/accessibility states, and media/tenant failure fallbacks, and must not invent product/provider/customer claims.

## Test conventions and proof boundary

- Add focused Vitest tests with --run; React/browser tests need jsdom. Use Playwright only for route/browser evidence that unit tests cannot establish.
- Test metadata/sitemap deterministically and verify auth return routes, prompt privacy, safe attribution, and handoff recovery.
- Local tests cannot prove production analytics baselines, legal/rights approvals, indexed crawl behavior, CDN invalidation, rollback rehearsal, or search-console state. Keep these as release gates.
- Do not run the prohibited repository TypeScript check.

## External Stitch facts

- Google describes Stitch as an experimental UI design tool with text/image input, iterative variants, and design/code export: https://developers.googleblog.com/stitch-a-new-way-to-design-uis/
- The current google-labs-code/stitch-sdk repository documents an MCP endpoint, API-key or OAuth authentication, screen generation/edit/variants, and HTML/screenshot retrieval; its README says the SDK is not an officially supported Google product: https://github.com/google-labs-code/stitch-sdk
- Keep this as an optional adapter behind Spec 270, pin/review API/license before adoption, default flags off, sanitize imported output, and never bundle credentials or provider dependencies into production runtime. Live compatibility is unverified.
