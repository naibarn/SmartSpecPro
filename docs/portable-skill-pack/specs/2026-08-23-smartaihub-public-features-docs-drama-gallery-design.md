# SmartAIHub Public Features, Docs, and Drama Profile Gallery

Date: 2026-08-23
Status: Approved for implementation

## Goal

Bring `/features`, `/docs`, and `/workflows/gallery` into one accurate,
bilingual public product story. The public pages must describe only the
currently user-facing SmartAIHub surfaces already represented by the homepage
and the shared Vertical Drama Series profile registry.

## Product boundaries

- Use the homepage's 15-feature catalog as the public feature source of truth.
- Remove stale public claims about workflow builders, swarm governance, SDKs,
  API integrations, enterprise publishing, and other surfaces not shown in the
  current product story.
- Use `apps/web/shared/verticalDramaSeries/seriesProfile.ts` as the source for
  all 13 public profile IDs, names, content kinds, format kinds, and source
  requirements.
- Do not fetch or expose user-owned series, private media, or tenant data from
  the public gallery.
- Keep existing public routes, authentication boundaries, and navigation
  contracts intact.

## Recommended implementation

Use the existing `publicSite` locale namespace for all visible copy, metadata,
alt text, profile content, and accessible labels. Keep the profile IDs in a
small presentation mapping that imports the shared registry so a removed or
renamed profile cannot silently become public copy.

The pages remain static and resilient: if a generated image fails, the card
keeps its aspect ratio and displays a gradient fallback; text and links remain
usable. No public API or database migration is required.

## Page designs

### Features

- Premium hero explaining the current creative workspace.
- Four spotlight sections for Vertical Series, Product Review Video,
  Chat + Skills, and the 100+ Skills ecosystem.
- A translated 15-item catalog grouped into Create, Organize, and Operate.
- A final CTA linking only to existing public routes.
- Four new landscape visuals, distinct from homepage assets, with DOM text kept
  outside the images for locale switching and accessibility.

### Docs

- Reframe the overview as a public user guide rather than an SDK/API portal.
- Searchable guide cards for Chat, Skills, Vertical Series, Product Data,
  Product Review Video, Media Studio, Storyboard, Video Studio, and asset
  organization.
- A visual “start to finish” guide with three steps and a translated route map.
- Three new editorial/blueprint visuals, distinct from homepage and Features.
- Keep links to existing public docs/help/contact routes only; no dead
  workflow/API claims.

### Drama Series Gallery

- Replace the workflow template query, filters, cards, drawer, pagination, and
  workflow CTAs with a static Drama Series Profile catalog.
- Group all 13 profiles into Drama, Documentary, and Review.
- Each profile card shows a unique portrait 9:16 visual, bilingual title and
  description, and a source/format badge derived from the registry.
- Use fictional/generic visual scenes without logos, real people, or embedded
  text. Profile cards link to the existing `/drama-series` entry point, whose
  authentication gate remains authoritative.
- The page must work for unauthenticated visitors and must not imply that a
  public visitor can create or view private series without signing in.

## Visual assets

Generate with GPT Image 2:

- 4 Features landscape assets.
- 3 Docs landscape/editorial assets.
- 13 Drama profile portrait assets, one for each registry profile.

All assets should be stored as optimized WebP files under
`apps/web/client/public/images/`, use descriptive stable names, include explicit
aspect-ratio containers, lazy-load below-the-fold media, and provide translated
alt text. Generated images must contain no readable language-specific copy.

## i18n

Extend both `en/publicSite.json` and `th/publicSite.json` with parity for:

- Features and Docs page labels, descriptions, guide titles, and metadata.
- Profile category labels, profile cards, source requirements, and CTA copy.
- New image alt text and empty/fallback labels.

Use `useScopedTranslation("publicSite")` and the existing language toggle. No
visible copy may remain hard-coded in either language in the three pages.

## Validation

- Locale parity tests for the expanded `publicSite` namespace.
- Focused page tests covering profile count/grouping, removal of workflow query
  usage, bilingual key rendering, image sources, and safe CTA routes.
- TypeScript diagnostics for changed files and a focused web build.
- `git diff --check`.
- Report browser/responsive visual proof separately if no browser runner is
  available; do not claim deployment or production proof from local checks.
