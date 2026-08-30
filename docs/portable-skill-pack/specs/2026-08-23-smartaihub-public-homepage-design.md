# SmartAIHub Public Homepage Expansion Design

Date: 2026-08-23
Status: Draft for user review

## Goal

Expand the public homepage at `/` for `smartaihub.app` into a longer, premium
product narrative that accurately promotes the user-facing capabilities shown
in the supplied reference image. The page must support the existing Thai and
English locale system completely, remain safe when tenant page content is
missing or incomplete, and keep the existing public route and loading behavior.

The primary promotional emphasis is:

1. Vertical series production.
2. Product-review video production.
3. Chat backed by many specialized Skills.
4. A Skill ecosystem of more than 100 available Skills.

## Scope and product claims

The feature catalog will cover only the approved user-facing surfaces from the
reference image:

- Chat AI
- Finance
- Finance Reports
- Media Studio
- Storyboard
- Vertical Series
- Video Studio
- Product Data
- Skills
- Media History
- Render Queue
- Library
- Private Files
- Presentation
- Credits

The copy will not mention admin-only, unreleased, experimental, or unrelated
platform capabilities. The “more than 100 Skills” claim will be presented as a
current product statement in the public copy, while the implementation will
avoid coupling the page to a new runtime count API.

## Recommended architecture

Use a hybrid content model:

- Keep `useTenantPage("home")` and the existing database-driven page data for
  tenant customization and SEO metadata.
- Add a dedicated `publicSite` i18n namespace with complete `en` and `th`
  content for the homepage's primary display copy, labels, feature catalog,
  CTAs, image alt text, and fallback SEO values.
- Render the locale content as the reliable baseline. If a tenant page has
  compatible content, use it for tenant-specific overrides; if it is absent,
  incomplete, or a section has no required items, fall back to the locale
  baseline rather than rendering an empty section.
- Add `/` to the public route namespace map so its public-site translation
  namespace is loaded before the page renders. Do not change auth, API, or
  route contracts.

This preserves the current content-management boundary while ensuring that a
single-language or stale DB payload cannot make the public page incomplete.

## Homepage composition

The current pitch-deck presentation will become a scrollable long-form page
with clear section anchors and responsive stacking. Existing `PitchDeck` and
`VideoBackground` behavior will be reused only where it remains reliable; the
homepage should not depend on a full-screen slide transition to expose content.

### 1. Hero

- Premium SmartAIHub positioning statement.
- Thai/English locale-aware badge, headline, subheadline, and CTA labels.
- A cinematic, wide hero visual generated with GPT Image 2, with no baked-in
  language-specific copy.
- Primary CTA to the public signup/start flow already supported by the app;
  secondary CTA to an existing public showcase such as Gallery.

### 2. Capability proof strip

Show concise proof points such as Thai/English support, 100+ Skills, vertical
series, product-review video, and reusable chat workflows. These are translated
labels, not hard-coded English UI text.

### 3. Vertical Series spotlight

This is the dominant section and receives the largest visual treatment:

- Explain the flow from concept/story bible to characters, storyboard/shot
  planning, start frames, video prompts, generation, continuity, and review.
- Use a wide cinematic key visual plus a smaller supporting visual or process
  collage.
- Link only to the existing Vertical Drama entry point if the route is
  available to normal users; otherwise use a safe non-action anchor or the
  existing signup CTA.
- Avoid promising automatic production outcomes, provider availability, or
  features that are not exposed to the normal user flow.

### 4. Product-review video spotlight

- Explain the path from product information and reference media to review
  angle, script, storyboard, scenes, and short-form video output.
- Use a premium studio product visual and a second visual showing a vertical
  review storyboard/timeline.
- Keep the copy focused on the user-visible workflow and avoid provider names.

### 5. Chat + Skills spotlight

- Present Chat as the natural starting point.
- Explain that the system can route requests to specialized Skills behind the
  conversation, including content, media, presentation, review, and workflow
  tasks that are actually available.
- Use a visual showing a refined AI conversation/workflow scene, not a literal
  screenshot containing untranslated text.

### 6. 100+ Skills ecosystem

- Give the “more than 100 Skills” claim a dedicated section with category chips
  and a marketplace/library visual.
- Include a link to `/marketplace` only if the public route remains available.
- Do not enumerate disabled or admin-only Skills.

### 7. Full feature catalog

Render all 15 approved items from the reference image as translated cards,
grouped for comprehension:

- Create: Chat AI, Media Studio, Storyboard, Vertical Series, Video Studio,
  Product Data, Presentation.
- Organize: Skills, Media History, Render Queue, Library, Private Files.
- Operate: Finance, Finance Reports, Credits.

The catalog is informational. Cards should not imply access to a protected
route. Where an item is not directly linkable for unauthenticated visitors, it
will remain a feature card and the main CTA will handle conversion.

### 8. Workflow and asset continuity

Use a compact visual sequence showing reusable work across private files,
library, history, and render queue. This section reassures users that generated
media is organized rather than lost after generation.

### 9. Final CTA

Use translated CTA text and a premium background treatment. Keep links limited
to existing public routes and the established signup/start flow.

## Visual asset plan

Generate four to six wide/landscape assets with GPT Image 2:

1. `smartaihub-home-hero.webp` — cinematic AI creative workspace, dark navy,
   cyan, teal, and warm gold accents; generous negative space for overlay text.
2. `smartaihub-vertical-series.webp` — premium vertical-drama production
   storyboard with character continuity, shot cards, and cinematic frames;
   no readable UI text.
3. `smartaihub-product-review-video.webp` — luxury product-review studio,
   product, camera, lighting, and vertical-video composition; generic product
   to avoid trademark/brand claims.
4. `smartaihub-chat-skills.webp` — elegant AI chat/workflow visualization with
   abstract skill nodes and conversation layers; no language-specific text.
5. `smartaihub-skills-library.webp` — curated capability library visual with
   abstract category tiles and a premium enterprise feel; no fake numerical UI.
6. Optional `smartaihub-media-continuity.webp` — organized media history,
   library, and render pipeline metaphor if the page needs a sixth visual.

Prefer WebP/AVIF-compatible public assets, responsive `srcSet` or CSS sizing,
lazy loading below the fold, explicit dimensions/aspect ratios, and translated
alt text. No generated image will contain Thai or English copy; all copy stays
in the DOM so locale switching is correct and accessible.

## i18n contract

Add a public-site namespace to both existing locale trees. It must include:

- Hero, spotlight, proof strip, catalog, process, and CTA strings.
- Every visible badge and metadata label such as “Output surface”.
- Image alt text and accessible labels.
- Public SEO title, description, and keywords for English and Thai.

No new locale fallback should be English-only for a visible homepage string.
Locale parity tests must compare the new namespace key set between `en` and
`th`. Existing `LocaleToggle` and language detection behavior remain the source
of truth.

## Failure handling and safety

- Preserve the current loading skeleton and unavailable state.
- If the tenant API fails, the homepage must still render the existing safe
  unavailable state rather than assuming private data or inventing user access.
- If an image fails to load, preserve layout with a styled fallback surface and
  meaningful alt text.
- Do not add new public API endpoints or expose tenant/user data.
- Do not claim browser, provider, deployment, or production proof from local
  rendering alone.
- Preserve unrelated dirty worktree changes and edit only owned files.

## Validation plan

Focused validation will include:

- Locale parity and translation-key tests for the new namespace.
- Home page tests for English/Thai rendering, DB-content fallback, CTA links,
  and all approved feature-card labels.
- Existing i18n loader/config tests after adding the namespace.
- TypeScript/formatter checks for changed files where available.
- `git diff --check`.
- A focused local production build or relevant web test command.
- If a browser tool is available, verify desktop, tablet, and mobile layout,
  image loading, no horizontal overflow, visible language switching, and
  long Thai/English wrapping. Otherwise report browser verification as pending.

## Trade-offs

- A dedicated locale namespace duplicates some content already stored in the
  database, but guarantees complete bilingual rendering and makes the public
  contract testable.
- Long-form sections increase page length and asset weight, so only the hero
  asset is eager-loaded and the rest are optimized/lazy-loaded.
- Premium visuals improve comprehension and conversion but must remain
  decorative/product-led; DOM text remains authoritative for language,
  accessibility, and SEO.
