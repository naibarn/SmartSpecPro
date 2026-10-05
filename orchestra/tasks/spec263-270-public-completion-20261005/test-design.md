# Test Design

## Focused gates
- Home semantics, bilingual copy, primary signup link, vertical-series login return path, and tenant-specific rendering.
- Public page API exact-tenant query and no global-content fallback; client cache and payload tenant match.
- Safe auth return URL, retired-route guard, sitemap exclusions, and SEO prerender behavior.
- Design schema safety, feature defaults, resolver, native artifact service, handoff authority fail-closed behavior, provider candidate schema, and no provider/policy call without catalog snapshot.

## Evidence
- `pnpm --dir apps/web exec vitest run ...` focused command: **15 files, 110 tests passed** on candidate source (2026-10-05).
- `git diff --check`: pass.
- No app build, repository-wide typecheck, browser suite, live production crawl, or provider certification was run. These are explicitly pending and not inferred from the focused tests.

## Ten-pass review ledger
1. Spec 263 homepage hierarchy: outcome hero precedes the vertical-series discovery band.
2. Spec 263 CTA routing: signup remains `/signup`; vertical-series entry uses existing `/drama-series` via encoded local `/login?returnUrl=...`.
3. Multi-tenant client contract: cache key includes tenant ID/host and only exact `tenantId` payloads render.
4. Multi-tenant API contract: published page query filters exact current tenant; global/null content has no cross-tenant fallback.
5. Locale/SEO: Thai/English keys, canonical default copy, metadata, Open Graph, Twitter, and static shell stay in parity.
6. Accessibility structure: one main landmark, one H1, ordered H2, semantic nav labels, descriptive link labels, keyboardable Astryx actions.
7. UI implementation policy: Astryx components/layout/tokens; no raw div/span layout or page-local CSS/utility styling added.
8. Retired-surface review: homepage and supported entry introduce no workflow route/claim; retired-route regression test passes.
9. Provider boundary: missing catalog snapshot is rejected before policy/provider invocation; successful candidate includes schema version 1.
10. Promotion readiness: whitespace/conflict/secret fast-gate review and staged-path scope; full/browser/deploy proof remain separate obligations.
