# Feature 326 — Ten-round gap review

Review date: 2026-11-06. Reviews were performed against the integrated Feature
326 code plus the current uncommitted Book Studio follow-up. Each fix is
included in the final section-04 checkpoint unless noted. This record is not
runtime acceptance evidence.

## Round 1 — Spec and acceptance coverage

- **Inspected:** Feature 326 sections 1–10, the four implementation sections,
  tRPC Book routes, document schema, and Book Studio component.
- **Findings:** The first authoring pass lacked user-selected cover metadata,
  all-shot preflight visibility, chapter reorder/split/merge, basic metadata
  editing, illustration replacement/removal/alt text, and independently
  visible export controls. The follow-up adds those authoring paths, exposes
  coverage and an image-size estimate, and adds EPUB, PDF, both, retry, cancel,
  and download actions.
- **Focused recheck:** `bookDocument.test.ts`, `verticalDramaBookSnapshot.test.ts`,
  `verticalDramaBookRenderers.test.ts`; UI and router esbuild checks.
- **Remaining:** The credit display is a conservative fixed estimate
  (20 credits/chapter), not a provider-specific quote. Exact quoting remains
  open because the shared structured-LLM call surface does not expose a quote
  API.

## Round 2 — Tenant and authorization boundaries

- **Inspected:** Every procedure in `verticalDramaBooks.ts`, source reads in
  `verticalDramaBookSourceService.ts`, media row scopes, worker job ownership,
  and `canReadManagedStorageKey`.
- **Finding:** Source and artifact queries consistently bind tenant and owner;
  export downloads are authorized only for an `available` artifact row. Series
  access matches the existing owner-only Vertical Drama procedures. No sharing
  capability was added.
- **Repair:** Added an explicit tenant/user/series match for joined export,
  revision, and book rows; safe DTOs omit raw snapshots and checksum columns.
- **Focused recheck:** esbuild of Book router and root router; manual query
  predicate inspection; `git diff --check`.
- **Remaining:** A dedicated mocked cross-tenant router/storage authorization
  test and authenticated UI test are not present.

## Round 3 — Snapshot identity and source freshness

- **Inspected:** Snapshot canonicalization, source payloads, all referenced
  shot/cover checksums, Book `get`, save, approve, compose, and retry paths.
- **Finding:** Freshness initially ignored cover/asset checksum changes. The
  source-content fingerprint now includes every pinned asset checksum, and
  Book `get` compares the current source before displaying stale state.
- **Repair:** All block source references are checked against pinned episode
  hash/revision/locator and chapter source membership; asset checksum changes
  are covered by tests.
- **Focused recheck:** source snapshot and document schema Vitest suites.
- **Remaining:** Current episode repair rows are not authoritative active
  revisions for ordinary Vertical Drama reads, so snapshot `episodeRevisionId`
  remains null while a complete payload fingerprint and immutable payload are
  stored. Exact linkage to an active source-revision contract remains open.

## Round 4 — Image coverage and ordering

- **Inspected:** Approved-frame collection, media status/MIME checks, all-shot
  coverage, composition order, cover selection, renderer asset lookup.
- **Findings:** Pending or unsupported image formats could initially be counted
  as usable. They are now rejected; WebP is normalized to PNG for EPUB, and
  decoded pixel and byte totals are bounded. All-shot composition emits each
  pinned shot image beside its shot prose in source order.
- **Focused recheck:** `verticalDramaBookSnapshot.test.ts` includes pending and
  missing image cases; renderer tests verify image/checksum failure.
- **Remaining:** No representative series with every real shot image was
  exported in an authenticated pilot.

## Round 5 — Revision, editing, and approval safety

- **Inspected:** Create/save/compose/cancel/retry/approve transactions, status
  transitions, source binding, and revision fingerprints.
- **Findings:** Create could leave an orphan Book if revision insertion failed;
  concurrent saves could allocate the same revision number; concurrent
  approvals could leave two revisions approved.
- **Repairs:** Create writes Book and first revision in one transaction; saves
  lock the Book and reject stale revision counters; approval locks the Book,
  supersedes the previous approval and approves the selected intact revision
  atomically. Blank or fingerprint-mismatched documents cannot be approved.
- **Focused recheck:** router esbuild and document schema tests; transaction and
  status predicates inspected.
- **Remaining:** No database-backed concurrency test has run.

## Round 6 — Job idempotency, retries, cancellation, and cost

- **Inspected:** `worker_jobs` adapter calls, job registry entries, billing
  metadata, artifact status transitions, and UI status polling.
- **Findings:** Chapter debit retries needed a stable key; export enqueue races
  needed active-job recovery; composition candidates needed a user retry path;
  export cancellation could otherwise publish an unreferenced object.
- **Repairs:** Chapter billing has a stable idempotency key; retry reuses the
  candidate and completed chapters; export reuses an active canonical job;
  composition/export cancellation is exposed; renderer asserts its lease
  before publishing; non-available uploaded files are deleted on failure.
  Composition performs a 20-credit/chapter precheck and displays that estimate.
- **Focused recheck:** job registry and Book router esbuild; retry/cancel state
  paths inspected.
- **Remaining:** Credits are checked but not reserved atomically before each
  provider call, and exact cost is not quoted. A provider call may be repeated
  after a process crash before chapter persistence, although app credit debit
  remains idempotent.

## Round 7 — EPUB structure, accessibility, and validation

- **Inspected:** ZIP local/central headers, first `mimetype` entry, OPF, XHTML,
  navigation, cover/copyright spine order, alt text, escaping, image paths, and
  validator behavior.
- **Findings:** Cover reading order and accessibility metadata needed explicit
  coverage. Cover now participates in the spine/TOC; OPF includes accessibility
  metadata and a valid UUID-shaped identifier; all content uses local generated
  paths and escaped text.
- **Focused recheck:** `verticalDramaBookRenderers.test.ts` opens the archive,
  inspects first-entry/stored-mimetype, cover, chapter text, image, and escaping.
- **Remaining:** `epubcheck` and Java are absent on this host. The worker fails
  closed, so no EPUB can become available here until EPUBCheck runs in the
  canonical worker.

## Round 8 — PDF Thai text and pagination

- **Inspected:** A5 HTML profile, CSP, data-URL-only images, escaped text,
  cover/copyright/contents/chapter order, Playwright PDF checks, Poppler text
  and metadata checks.
- **Finding:** Source fixtures prove HTML generation only; they do not prove
  browser rendering, Thai glyph shaping, font embedding, page links/bookmarks,
  or extraction from a real PDF.
- **Repair:** The renderer fails closed unless Chromium, `pdftotext`, and
  `pdfinfo` are available and the output has extractable chapter text and
  metadata. No external URL is permitted by the renderer CSP.
- **Focused recheck:** PDF HTML fixture checks.
- **Remaining:** Chromium, Noto Sans Thai/Th Sarabun New, `pdftotext`, and
  `pdfinfo` are absent here. Representative Thai PDF acceptance is open.

## Round 9 — Artifact privacy, integrity, and resource bounds

- **Inspected:** Tenant-owned media reads, MIME/checksum verification, decoded
  pixel/byte caps, output cap, private storage write/readback, artifact status,
  cancellation races, download URL handling, and managed-storage authorization.
- **Finding:** A cancellation after storage upload but before availability
  could leave an unreferenced private object. The worker now removes that
  object unless a row reached `available`.
- **Focused recheck:** export service esbuild, checksum fixture tests, and
  authorization predicate inspection.
- **Remaining:** Storage-provider readback and cross-tenant download need a
  configured integration environment for end-to-end proof.

## Round 10 — UI state, accessibility, responsiveness, and readiness

- **Inspected:** Book Studio tab mount, loading/error states, labels, keyboard
  controls, image alternatives, live job/artifact status, create/edit/reorder,
  and responsive wrapping.
- **Findings:** UI now shows stale-source and missing-image feedback, supports
  keyboard-operable selection/reordering and export cancellation/retry, and
  labels document/image controls. New layout uses semantic Astryx stacks and
  contains no raw `div` or `span` layout elements.
- **Focused recheck:** esbuild of Book Studio and series detail page; manual
  JSX/ARIA review; `git diff --check`.
- **Remaining:** No authenticated browser session or local Chromium is
  available, so mobile/tablet/desktop screenshots, keyboard interaction, and
  responsive overflow checks remain open.

## Closeout

All ten review passes were completed and code-level findings above were fixed.
Feature 326 is integrated as a development checkpoint, but full acceptance is
still **validation-pending**: canonical worker renderer capabilities,
development database migration, database-backed authorization/concurrency
tests, and authenticated browser evidence remain required. This document does
not mark those requirements passed.
