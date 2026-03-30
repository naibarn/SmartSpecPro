# Implementation Plan

## Objective
Turn SmartAIHub into a scalable public-content system where each page targets a different search intent and every major surface uses the same enterprise palette.

## Approach
1. Extend the existing seed pipeline with a reusable content factory for docs, blog, FAQ, and SEO metadata.
2. Add more tenant pages and blog posts with clearly separated keyword clusters.
3. Upsert SEO records by path so public pages, docs pages, and blog posts can be optimized individually.
4. Sweep the highest-visibility admin/ops screens to blue/cyan/teal instead of legacy purple/pink/violet accents.

## Affected areas
- `apps/web/scripts/*seed*`
- `apps/web/server/routers/blog.ts`
- `apps/web/server/routers/tenant.ts`
- `apps/web/client/src/pages/Docs.tsx`
- `apps/web/client/src/pages/Blog.tsx`
- `apps/web/client/src/pages/BlogPost.tsx`
- public/admin high-visibility pages still using legacy accent colors

## Content architecture
- Create page blueprints for:
  - marketplace discovery
  - workflow design
  - swarm execution
  - chat output
  - presentation output
  - video output
  - security and governance
  - AI search optimization
  - FAQ-driven support intent
- Ensure each page has a unique title, description, keyword set, and body copy.
- Seed metadata in the database so the UI can render the same intent on every request.

## Admin palette cleanup
- Convert the remaining visible purple/pink/violet surfaces to enterprise blues/cyans.
- Focus first on pages used for search, setup, billing, profile, media, and health visibility.

## Long-term SEO strategy
- Treat docs/blog/FAQ as a content graph, not isolated pages.
- Add new pages incrementally instead of broadening old pages.
- Keep keyword clusters distinct so SmartAIHub can rank for more total queries.

## Risks
- Overlapping keyword targets can cannibalize rankings.
- Unstructured expansion could create near-duplicate pages.
- Bulk color changes in admin pages must not reduce contrast or accessibility.

## Acceptance criteria
- New docs/blog/FAQ pages exist in the DB with path-specific SEO metadata.
- Existing public pages keep a consistent enterprise palette.
- Re-running seeds updates content instead of duplicating it.
- The site can keep growing by adding new blueprints rather than hand-editing every page.
