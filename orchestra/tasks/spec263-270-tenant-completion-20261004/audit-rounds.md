# Evidence-backed review rounds

These are source/contract review rounds, not automated test or browser claims.
No build, deploy, migration, service restart, or production write was performed.

1. **Tenant resolution:** tenant middleware resolves an active tenant from the request hostname and assigns `req.tenant`; unknown/inactive hosts return 404. (`apps/web/server/_core/tenant.ts`)
2. **Public page ownership:** the public page route constrains `tenantId`, `pageKey`, and `isPublished` in SQL and returns 404 on no matching tenant-owned row. (`apps/web/server/routers/tenant.ts`)
3. **Duplicate selection:** the route orders by `updatedAt` and `id` descending, then limits to one row for deterministic behavior. This is a temporary deterministic policy, not a uniqueness guarantee.
4. **Client cache isolation:** page cache keys include the resolved tenant ID; effect cleanup aborts the prior request when tenant/page changes. (`apps/web/client/src/hooks/useTenantPage.ts`)
5. **Payload validation:** client requires exact tenant ID, requested page key, and published state before accepting/caching a response; missing tenant ownership is rejected.
6. **Fallback behavior:** SmartAIHub uses localized built-in copy only when there is no valid published tenant page; other tenants receive a tenant-name/SEO fallback rather than SmartAIHub copy. No global `tenantId=null` row is rendered.
7. **Content safety:** rich HTML uses the existing DOMPurify renderer; page links and media URLs pass URL scheme/origin checks before rendering. (`SafeHtml.tsx`, `TenantHomePage.tsx`)
8. **SEO behavior:** tenant page title, description, keywords, and OG image flow through `Seo`; canonical route remains `/`. Live output and tenant-domain canonicalization have not been browser-verified.
9. **Sitemap tenant scope:** sitemap resolves an active tenant by primary hostname or configured domain alias and filters published rows by that tenant ID. (`publicSitemap.ts`)
10. **Schema/type alignment:** tenant page and SEO tenant IDs use varchar string IDs in the source schema and migration snapshot; corresponding router/composer comparisons use strings. No database migration was run.
11. **Public render semantics:** tenant pages use the Astryx Section/Grid/Card/Heading/Text/VStack/Link components; a first-section heading falls back to the page title. Responsive visual fidelity is unverified because build/browser checks were not run.
12. **Spec 263 closure boundary:** source can consume tenant-owned public sections, but approved visual artifact, factual claims, asset rights, route inventory/redirect proof, Film acceptance and visual gates remain unresolved in the canonical spec.
13. **Spec 270 closure boundary:** this change does not activate provider routing or authoring; those remain disabled/fail-closed pending G0 reconciliation, durable artifact authority, and callable Spec 224/256 contracts.
14. **Runtime provenance:** previous incident evidence showed the production service checkout lagged `origin/main`; this task branch is not deployed, so it cannot change the public website yet.

## Review disposition

- Fixed in source: tenant ownership filtering, tenant-scoped cache, payload validation, generic tenant fallback, string tenant ID contracts, deterministic public-page selection, active-domain sitemap resolution, component-based section rendering.
- Deferred by external authority/data: approved SmartAIHub homepage content/design, assets and rights, Film route/artifact, provider activation and proof contracts.
- Heavy verification pending: focused browser/API tests, package/build check, migration/DB compatibility, synchronized runtime deployment and public response verification.
