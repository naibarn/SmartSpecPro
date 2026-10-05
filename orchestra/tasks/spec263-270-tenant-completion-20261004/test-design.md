# Test Design — Public Tenant Homepage

| Requirement | Regression check | Current evidence / residual |
|---|---|---|
| Published page for current tenant overrides homepage | `Home.test.tsx` renders tenant sections, CTA, SEO | Existing from prior branch; add explicit primary SmartAIHub case |
| Other tenant never receives SmartAIHub fallback | `Home.test.tsx` neutral tenant fallback case | Existing from prior branch |
| Cache key and async response are tenant-scoped | `useTenantPage.test.tsx` tenant switch and stale response cases | Existing from prior branch |
| Unowned/mismatched legacy page is rejected | `useTenantPage.test.tsx` wrong ID and null/missing ID cases | Add null/malformed payload cases |
| Public endpoint filters by request tenant and published status | focused router contract test or directly scoped service test | Add if a stable Express/DB mock seam exists; otherwise mark runtime proof pending |
| Tenant public sitemap uses tenant/domain mapping | `publicSitemap.test.ts` secondary domain case | Existing from prior branch |
| Schema mirrors migration's canonical string tenant identity | Drizzle metadata/source consistency check | Existing migration performs generic FK conversion; no data migration or live mutation |
| Browser visual claim | browser screenshot at required breakpoints | Deferred: no build; existing design owner/asset approvals remain blocked |

Run only the changed-surface tests. Do not run `npm run typecheck` or a build.
