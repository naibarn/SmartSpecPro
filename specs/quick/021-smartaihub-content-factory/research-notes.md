# Research Notes

## Codebase scan
- Public pages already use tenant-driven content and SEO helpers.
- `Seo` supports remote tenant SEO by path and can consume `seo_metadata`.
- `tenant_pages` already stores page metadata and can power docs/extra pages.
- `blog_posts` already stores `metaDescription` and `metaKeywords`.

## Existing patterns
- Docs pages are rendered from `useTenantPage('docs-*')` and `DocPage`.
- Generic content pages use `ContentPage` with tenant metadata fallbacks.
- Blog list and blog post pages render tenant blog records and now can consume post-level meta.
- Current seed scripts are separate but conceptually similar and can be extended safely.

## Risks
- Many admin/ops pages still contain legacy accent colors.
- `blog_posts` does not have a unique constraint, so seeds must upsert manually.
- Adding too many pages without intent separation would dilute SEO gains.

## Validation notes
- `npm --prefix apps/web run check` passes after recent SEO and content changes.
- Seed scripts were already proven against the `smartaihub.app` tenant.

## Recommended direction
- Build a reusable content blueprint seed that can add new docs/blog/FAQ pages in batches.
- Upsert SEO by path for every important public route.
- Sweep the highest-visibility admin/ops pages to the enterprise palette first.
