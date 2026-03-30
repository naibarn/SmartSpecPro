# TDD Guidance

## First tests to update
- Verify `/api/tenant/seo?path=...` returns path-specific metadata and merged defaults.
- Verify blog list and blog post responses include meta fields needed for SEO.
- Verify seed scripts are idempotent when run repeatedly.

## Expected failing conditions before the fix
- New docs/blog/FAQ pages will not exist in the DB yet.
- Blog SEO data will not be available per post path.
- Some admin pages will still show legacy accents.

## Regression checks
- Public routes still resolve for home, docs, blog, marketplace, pricing, contact, gallery, and workflows.
- `Seo` continues to emit canonical, OG, Twitter, and JSON-LD tags.
- Re-running seeds should update rows instead of duplicating them.

## Implementation notes
- Prefer path-based upserts for SEO and tenant pages.
- Keep keyword clusters separated by page intent.
- Avoid changing routes unless it creates a clearly better discoverability surface.
