# Feature 326: Vertical Drama Story-to-Book Studio and EPUB/PDF Export

- **Version:** 0.1
- **Created:** 2026-11-06
- **Status:** In Progress
- **Priority:** P1
- **Owner:** Vertical Drama / Book Composition / Document Export
- **Depends-on:** Feature 131 (Vertical Drama Series), Feature 153 (Long-form Story Architecture), Feature 201 (Content Provenance and Copyright Protection)
- **Related:** Existing `worker_jobs` + outbox control plane; existing private media/artifact storage

---

## 1. Objective

Let a series owner select one or more vertical-drama sub-episodes, turn the
script/storyboard material into an editable illustrated-novel draft, review it,
and export the approved book revision as EPUB and/or PDF.

This is a story-to-book transformation. It reuses the series, episode, dialogue,
character context, and artwork already in Vertical Drama. It does not change the
source episodes or replace the existing series-writing and video-production
flows.

## 2. Product and architecture decision

### 2.1 Recommended book style

Start with an **Illustrated Novel**: readable prose and dialogue form the main
content, with existing authorized artwork placed alongside the related story
text. The author may choose no illustrations, chapter openers, occasional
illustrations, or every available storyboard-shot image. The all-shots option
supports series that already have an image for every shot while keeping image
selection and book text editable.

| Approach | EPUB | PDF | Decision |
| --- | --- | --- | --- |
| Illustrated Novel: prose plus optional artwork, including every shot image | Strong | Strong | MVP; one reviewed source can produce both outputs |
| Light Novel: text-first with a few illustrations | Strong | Strong | Compatible with the document model; a later editorial preset |
| Poster/Photo Storybook: image-led fixed pages | Limited | Strong | Defer; needs a separate visual-page editor and fixed-layout validation |

### 2.2 Canonical document and output renderers

Persist one versioned, typed **Book Document** as the authoring source of truth.
Generate EPUB and PDF independently from that document revision:

```text
Vertical Drama series + selected episode revisions
  -> source snapshot
  -> narrative composition job
  -> canonical Book Document
  -> author review and edits
  -> approved revision
       -> EPUB 3.3 reflowable renderer
       -> fixed-page PDF renderer
```

Do not use raw HTML or a rendered PDF as the canonical editable content. EPUB
and PDF have different layout needs: EPUB should reflow for reading-system and
user preferences; PDF should keep page composition stable. The EPUB v1 target is
EPUB 3.3 with XHTML content, a navigation document, package metadata, and local
assets. The format is a ZIP container and is reflowable by default under the
[W3C EPUB 3.3 Recommendation](https://www.w3.org/TR/epub-33/).

For PDF, use server-side HTML/CSS print layout rendered by the repository's
existing Playwright/Chromium stack when the canonical job runtime can provide
the browser and licensed Thai fonts. `page.pdf()` supports print CSS and tagged
output options ([Playwright Page.pdf documentation](https://playwright.dev/docs/api/class-page#page-pdf)).
Keep renderer selection behind an interface; verify Thai shaping, pagination,
font embedding, tagged output, and runtime availability in an implementation
spike before locking the production dependency. Do not launch rendering in the
web request process.

Do not convert PDF into EPUB or EPUB into PDF. Do not make fixed-layout EPUB the
default; preserve that option for a future image-led book profile.

## 3. Existing system fit and source mapping

The current source is the vertical-drama series and its ordered rows in
`vertical_drama_episodes`, including episode title, script, storyboard,
dialogue plans, and existing episode cover/artwork references. Series-level
title, synopsis/logline, locale, theme, and character context are available for
composition. The compiled video and `productionEpisodesManifest` are not the
canonical source for book text.

Default mapping:

| Existing source | Book Document |
| --- | --- |
| Series title, synopsis/logline, locale, theme | Book metadata and composition context |
| Selected sub-episode (`vertical_drama_episodes` row) | One chapter by default |
| Episode title | Suggested chapter title; editable by the author |
| Ordered scene/shot notes | Scene order and source facts for prose composition; never expose raw shot numbers as book headings |
| Dialogue and speaker context | Typed dialogue blocks with source links |
| Existing series/episode cover or key visual | Optional book cover, independent of chapter illustration settings |
| Ordered storyboard shots and their approved images | Inline illustrations paired with the corresponding rewritten story passages; shot numbers remain internal source references |

Authors can select a subset of episodes, reorder them, rename chapters, and
combine or split chapter groupings while retaining source links. Special
episodes may be included only through explicit selection. No episode is silently
added because it belongs to the same season.

The source snapshot must pin the exact selected episode revisions and artwork
versions/checksums, not only mutable asset URLs. When an upstream episode has a
canonical revision ID, persist it. For legacy mutable episode rows without one,
the immutable captured payload plus its canonical SHA-256 fingerprint is the
source version identity; do not invent an upstream revision ID. Persist that
payload and fingerprint with the book revision so a retry/export reads the same
source. If a selected source changes later, mark the book draft as source-stale
and offer an explicit refresh/recompose path. Never silently mix a new episode
revision into a reviewed book or replace prior user edits.

## 4. Author workflow

1. Open **Book Studio** from an authorized Vertical Drama series workspace.
2. Select episodes and arrange the proposed chapter structure. Default to
   episode order and one episode per chapter.
3. Set book metadata: title, subtitle, author display name, language, optional
   description, and optional copyright-page text. Default language to the
   series locale.
4. Choose the Illustrated Novel profile and image density: none, chapter
   openers, occasional illustrations, or every storyboard-shot image (all-shot
   mode requires a usable image for every selected shot).
   Choose a book cover independently from existing authorized cover/key visual
   artwork. v1 does not generate new images.
5. Review the model-based conservative AI credit estimate, selected episode
   count, image count/size, shot-image coverage, and source freshness before
   starting prose composition. Before each physical chapter-composition call,
   reserve credits for the pinned model, bounded input, output-token ceiling,
   retry count, and price headroom. Settle every provider attempt once against
   its reservation, then return unused reserved credits. Retries resume from
   completed chapters and must not reuse a closed reservation; replaying the
   same attempt settlement key must not draw credits twice.
6. Wait for durable composition progress, then edit the generated title,
   chapter titles, paragraphs, dialogue, scene breaks, captions, and artwork
   placements in a book preview/editor.
7. Approve a specific Book Document revision. Export EPUB, PDF, or both. Each
   format has independent progress and can succeed or fail independently.
8. Download the private export artifact from the series workspace. Re-export
   after edits creates a new artifact version; it does not mutate prior files.

### 4.1 Composition contract

The LLM receives only the selected source snapshot and the minimum relevant
series context needed for continuity. Composition must:

- convert scene/shot notes into book prose and transitions rather than copy the
  production shot list into the book;
- preserve event order, established facts, character relationships, and
  author-approved dialogue meaning;
- avoid inventing actions, history, relationships, motivations, or resolution
  not supported by the selected source and permitted context;
- preserve dialogue as identifiable blocks and retain speaker identity when it
  is known; flag missing/ambiguous speaker attribution for author review;
- keep each generated block linked to its source episode/scene references;
- generate chapter-sized bounded work units with resumable checkpoints;
- never overwrite user-edited/locked blocks during regeneration. Regeneration
  creates a candidate revision or updates only the explicitly selected blocks.

Artwork placement suggestions must reference only assets included in the
authorized source snapshot. In the all-shots mode, include each selected
storyboard shot's authorized image once, in source-shot order, adjacent to the
rewritten prose for that shot; retain the prose as real editable text. Offer
all-shots mode as complete only after confirming that every selected shot has a
usable image.
The author can remove or move any illustration and edit its caption and
alternative text. If there is no suitable image, compose a text-only passage
rather than requesting image generation.

## 5. Book Document contract

Persist a schema-versioned structured document, not one long HTML string.
Stable IDs are required for chapters and blocks so edits, source links,
regeneration, and export diagnostics can identify one item without replacing
the entire book.

Minimum document shape:

```json
{
  "schemaVersion": 1,
  "metadata": {
    "title": "...",
    "subtitle": null,
    "author": "...",
    "language": "th",
    "description": "...",
    "copyrightText": null,
    "coverAssetId": null,
    "coverAssetVersionId": null,
    "coverAltText": null
  },
  "source": {
    "seriesId": "...",
    "episodeRevisionIds": ["..."],
    "assetRefs": [{ "assetVersionId": "...", "sha256": "..." }],
    "sourceFingerprint": "..."
  },
  "chapters": [
    {
      "id": "...",
      "title": "...",
      "sourceEpisodeIds": ["..."],
      "blocks": [
        {
          "id": "...",
          "type": "paragraph",
          "text": "...",
          "sourceRefs": [{
            "episodeRevisionId": "...",
            "sceneLocator": "...",
            "sourceHash": "..."
          }]
        },
        {
          "id": "...",
          "type": "dialogue",
          "speaker": "...",
          "text": "...",
          "sourceRefs": [{
            "episodeRevisionId": "...",
            "sceneLocator": "...",
            "sourceHash": "..."
          }]
        },
        {
          "id": "...",
          "type": "illustration",
          "assetId": "...",
          "assetVersionId": "...",
          "assetChecksum": "...",
          "placement": "inline",
          "altText": "...",
          "caption": null,
          "decorative": false,
          "sourceRefs": [{
            "episodeRevisionId": "...",
            "sceneLocator": "...",
            "sourceHash": "..."
          }]
        }
      ]
    }
  ]
}
```

Supported block types in v1: `heading`, `paragraph`, `dialogue`, `scene_break`,
`illustration`, `caption`, and `quote`. In the all-shots mode, each selected
shot image is an illustration block ordered at its related story passage and
linked to the exact source shot. Its `placement` only identifies semantic flow
such as `inline` or `chapter_opener`; block order and source links are canonical.
Renderer-specific sizing and page-break behavior stay in format settings.
Layout-only properties do not belong in the shared document.

Minimum persistent records:

- **Book workspace:** tenant/user/series binding, book metadata, selected source
  revisions, chapter mapping, current revision and source fingerprint.
- **Book revision:** immutable canonical document snapshot, schema version,
  author edits, model/prompt/profile versions, source provenance, and approval
  state.
- **Book export artifact:** source revision, format, renderer/settings
  fingerprint, worker job, private storage reference, SHA-256 checksum, byte
  size, validation result, and creation time.

One series may have multiple books/volumes. A source episode may be reused in a
separate book if the author selects it; do not impose a series-wide one-book
constraint. Persist document revisions separately from the active series so
book editing cannot mutate the series bible, episodes, or story memory.

## 6. Export requirements

### 6.1 EPUB

- Export EPUB 3.3 reflowable, with semantic XHTML chapter content, package
  metadata, a valid EPUB navigation document, and correct reading order.
- Include cover metadata/image, title, author, language, and table of contents.
- Use the selected cover image and its alternative text as the publication
  cover; this does not replace or count as a chapter/shot illustration.
- Include every illustration block selected in the approved Book Document,
  including all selected shot images when all-shots mode is chosen, in document
  order alongside the text. The book-cover image is separate from chapter and
  shot illustrations.
- Preserve real text and dialogue; do not render page text into images.
- Make body text user-styleable. CSS must not force a specific font size, page
  width, or fixed page break within normal chapter content.
- Bundle only the selected local artwork and required CSS. No remote images,
  remote fonts, scripts, analytics, or tracking pixels.
- Provide meaningful alternative text for informative images; allow explicitly
  decorative images to carry empty alternative text. Warn when an informative
  image lacks approved alternative text.
- Validate generated EPUB with [EPUBCheck](https://github.com/w3c/epubcheck)
  before marking the artifact available. Store validation summary with the
  artifact.
- Do not require legacy NCX, fixed-layout rendering, DRM, or retailer-specific
  metadata profiles in v1 unless a later distribution target requires them.

### 6.2 PDF

- Export a digital-reading PDF with A5 portrait as the default page size and a
  restrained text-first illustrated layout. Keep page size, margins, body font,
  chapter opener, page numbering, and image placement in a versioned PDF profile.
- Include cover, title page, optional copyright page, contents, chapter
  openings, body, and optional closing note when present in the Book Document.
- Use the selected cover image and its alternative text on the PDF cover page;
  it does not replace or count as a chapter/shot illustration.
- Include every illustration block selected in the approved Book Document,
  including all selected shot images when all-shots mode is chosen, in document
  order alongside the text. Keep the cover image separate from inline images.
- Preserve Unicode/selectable/searchable text, including Thai dialogue; do not
  flatten the whole page into an image.
- Keep illustrations proportional, avoid accidental crop, and avoid a
  page-break orphan that separates a chapter heading from its first paragraph.
- Embed the chosen PDF fonts when permitted by their license. Produce tagged
  output and document outline/bookmarks when supported by the selected
  renderer; record any renderer limitation instead of claiming full PDF/UA
  conformance.
- v1 is a digital-reading PDF, not a print-production package: no bleed,
  crop marks, print signatures, or retailer-specific certification.

### 6.3 Both formats

“Export both” uses the same approved Book Document revision and common book
metadata, but creates independent EPUB and PDF jobs and artifacts. Layouts are
format-specific. Failure or retry of one format must not invalidate a
successfully validated artifact for the other.

## 7. Jobs, artifacts, and failure behavior

- Composition and rendering work that can exceed a request timeout must be
  admitted through canonical `worker_jobs` plus the outbox. Do not introduce a
  second queue, `/workflows`, Agency, OpenSandbox, Docker dispatch, or a custom
  workflow engine.
- Use idempotency keys that include book revision, operation/format, and
  settings fingerprint. Retry/resume must not duplicate a paid model call or
  publish duplicate artifacts.
- Expose durable queued/running/partial/succeeded/failed/cancelled state and
  chapter/format progress through the existing job status surface. Cancel stops
  future work; it does not remove earlier approved book revisions or completed
  artifacts.
- Do not mark an artifact available until renderer completion, file checksum,
  structural validation, and private storage read-back succeed. EPUBCheck is
  required for EPUB. PDF validation must verify non-empty pages, expected
  metadata, and extractable text before availability.
- Missing or inaccessible selected artwork fails preflight with the chapter and
  block identified; do not silently omit artwork. When all-shots mode is
  selected, report the affected shot references so the author can repair the
  image or explicitly remove that illustration before approval.
- For all-shots mode, preflight compares usable authorized shot images with the
  selected source shot count and shows coverage plus missing-shot references.
  Do not label the book as having complete shot-image coverage when any selected
  source shot lacks a usable image; let the author repair the source or choose a
  lower image density explicitly.
- If a source episode changes during composition, finish only against the
  pinned snapshot or stop as stale. Never combine revisions in one artifact.
- Large books are processed in bounded chapter batches and must not load an
  unbounded set of source images or rendered pages into web-process memory. If
  configured worker, token, image-size, or artifact-size limits are exceeded,
  show the author the estimated image count/size and a volume-splitting or
  lower-image-density action; preserve completed chapter work.
- User-visible errors are concise and sanitized; internal worker paths, stack
  traces, credentials, and raw provider diagnostics remain protected.

## 8. Security, rights, and privacy

- Enforce the same tenant and series ownership/authorization checks as the
  existing Vertical Drama workspace for book CRUD, job status, source images,
  artifacts, and downloads. Do not widen sharing or infer ownership from a
  display name.
- Copy authorized image bytes into the private artifact package through the
  existing media/storage access path; do not publish storage keys or permanent
  asset URLs. Downloads use the existing authorized, short-lived artifact path.
- Treat all book text as untrusted content. Render typed blocks with escaping;
  do not accept arbitrary HTML, scripts, CSS, or remote URLs in the document.
  The PDF renderer must not fetch user-controlled network URLs. EPUB archive
  paths must be generated by the server, normalized, and traversal-safe.
- Preserve original source IDs, revision/fingerprint evidence, user-edited
  text provenance, selected asset identity, and artifact checksum in internal
  records. Customer-facing metadata and errors must not expose internal
  repository/path diagnostics or hidden implementation IDs.
- Follow Feature 201's content provenance, licensing, and copyright policy.
  User-provided author/copyright text is editable metadata and is not a system
  assertion of publication rights.

## 9. Out of scope for v1

- New image generation, automatic image regeneration, video-to-text
  transcription, TTS/audio narration, translation, or automatic publication.
- Poster-led/photo storybook page design and fixed-layout EPUB.
- MEB or other retailer-specific ingestion, DRM, pricing, sales copy, ISBN
  purchasing, author storefront, or external account integration.
- Print-on-demand certification or print-production PDF with bleed/crop marks.
- Automatic rewriting of the source series, episode script/storyboard, series
  memory, or active story bible.

## 10. Acceptance criteria

1. An authorized user can create multiple books from a series, select a subset
   of its normal/special episodes, arrange chapter order, rename chapters, and
   persist the mapping without mutating source episodes.
2. A source snapshot fingerprints the selected episode revisions and
   referenced assets. Legacy episode rows without revision IDs are identified
   by the canonical fingerprint of their captured immutable payload. Later
   source edits visibly mark affected drafts stale; an export always identifies
   the exact approved book revision it used.
3. Composition produces typed, editable blocks with dialogue and source
   provenance. It obeys the no-unsupported-facts contract and does not expose
   shot numbers as book structure.
4. User edits survive regeneration unless the user explicitly selects those
   blocks for replacement. Approval is tied to a specific immutable revision.
5. The user can choose no artwork, chapter openers, occasional illustrations,
   or all selected storyboard-shot images from authorized existing assets.
   All-shots mode preserves source shot order and pairs every image with its
   related editable prose; missing-shot coverage is reported before
   composition. A book cover can be chosen independently. No image-generation
   job is called in v1.
6. EPUB output opens as a valid reflowable EPUB 3.3 publication with a cover,
   metadata, navigation, chapter order, Unicode text, and local images. When
   all-shots mode is selected, each selected shot image appears once next to its
   related prose in source order. EPUBCheck passes before download.
7. PDF output has the configured fixed page size, readable/extractable Thai
   text, intact image aspect ratios, sensible chapter breaks, and a contents
   page with working links. When all-shots mode is selected, each selected shot
   image appears once next to its related prose in source order. Bookmarks are
   produced where the selected renderer supports them. Pages do not contain
   full-page rasterized text, and PDF structural and text checks pass before
   download.
8. A request for both formats creates independent jobs; one format may be
   retried without losing the other format's available artifact.
9. Tenant isolation covers book records, progress, source assets, and artifact
   downloads. Export packages contain no remote resources or arbitrary active
   content.
10. Composition and rendering are durable, idempotent, resumable/cancellable,
    cost-gated for AI calls, and visible through the canonical job status
    surface. Cost estimates use the pinned model and bounded token envelope;
    actual provider attempts settle through a reservation with unique stable
    settlement keys. A request timeout does not lose persisted chapter progress
    or create a duplicate artifact; ambiguous provider usage remains a
    reconciliation case rather than being silently treated as free.
11. Thai EPUB layout is checked with reader-controlled font scaling; Thai PDF
    text and pagination are checked in representative page-render samples.
    Informative image alternatives and missing-alt warnings are covered.

## 11. Implementation sequence

1. Add versioned Book workspace/revision/artifact contracts and source snapshot
   reader; verify series and asset authorization and stale-source behavior.
2. Build bounded narrative composition into the Book Document with credit
   admission, provenance, review/edit, and revision approval.
3. Implement EPUB 3.3 serialization and EPUBCheck validation.
4. Implement PDF profile/rendering, first proving browser/font availability and
   Thai text extraction in the canonical job runtime.
5. Add independent dual-export actions, progress/retry/cancel UX, artifact
   downloads, and accessibility/layout regression coverage.
6. Pilot with one short series, a multi-chapter volume, a text-only book, a
   portrait-heavy book, and a source-stale edit before broad rollout.

## 12. Research references

- [W3C EPUB 3.3](https://www.w3.org/TR/epub-33/) — publication package,
  navigation, reflowable and fixed-layout behavior.
- [W3C EPUB Accessibility 1.1](https://www.w3.org/TR/epub-a11y-11/) —
  accessibility requirements and discoverability metadata.
- [EPUBCheck](https://github.com/w3c/epubcheck) — EPUB conformance checker
  maintained by the DAISY Consortium on behalf of W3C.
- [Playwright Page.pdf](https://playwright.dev/docs/api/class-page#page-pdf)
  — HTML print rendering and PDF output capabilities.
