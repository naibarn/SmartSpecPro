# SmartAIHub Content Factory and Enterprise Palette Expansion

## Summary
Expand the public site so every major surface speaks the same SmartAIHub language:
- enterprise skill marketplace
- virtual workflow builder
- swarm execution
- chat / presentation / video outputs

At the same time, create a scalable content-seeding approach so docs, blog, FAQ, images, and video-oriented public content can keep growing over time with distinct SEO intent per page.

## Likely affected areas
- Public pages and tenant-driven docs/blog pages
- SEO metadata tables and seed scripts
- Public-facing admin/ops pages that still use legacy purple/pink/violet/indigo accents
- Future content automation entry points for skills-generated docs/blog/FAQ assets

## Constraints
- Keep the work aligned with the current codebase and tenant model.
- Avoid destructive data changes.
- Prefer idempotent seeds and reusable content blueprints.
- Preserve existing routes unless a new route is necessary for discoverability.

## Assumptions
- `smartaihub.app` is the primary tenant to optimize.
- The site should prioritize search intent coverage over repetitive keyword reuse.
- Skills will eventually generate content assets, but the first step is to make the storage/rendering pipeline ready.

## Non-goals
- Full redesign of every low-traffic internal/admin screen in one pass.
- Replacing the existing content management model.
- Introducing external services just for SEO generation.
