# Feature 174 Research

## Research scope and method

The repository was inspected from `/home/dev/projects/SmartSpecPro` on 2026-09-02.
The requested feature is an extension of an existing Vertical Drama workflow,
not a greenfield page. SocratiCode was unavailable in this runtime, so targeted
shell discovery (`rg`, focused `sed`, package scripts, and existing tests) was
used as the fallback. The existing dirty worktree was treated as user-owned;
unrelated edits were not considered part of this feature.

## Existing architecture

- The web application is a TypeScript React/Vite client under
  `apps/web/client/src`, with tRPC routers and services under
  `apps/web/server`.
- PostgreSQL persistence uses Drizzle schema definitions in
  `apps/web/drizzle/schema.ts` and additive SQL migrations under
  `apps/web/drizzle`.
- Vertical Drama ownership is tenant and user scoped. Existing procedures use
  `verticalDramaProcedure`, `ctx.tenantId`, and `ctx.user.id` before loading
  series/episode records.
- Media is represented by managed `mediaAssets` rows. Existing picker flows
  can select Library and History media, upload local files, and use existing
  managed/broker URL paths. A raw URL must not become an implicitly trusted
  cross-tenant reference.
- Browser-facing tests use Vitest with the jsdom environment when DOM APIs are
  required. The web package exposes `npm test`, `npm run typecheck`, and Vite
  build scripts.

## Feature 174 baseline found in the worktree

The baseline already contains a first additive implementation:

- `apps/web/shared/verticalDramaSeries/objectReferences.ts` defines basic mode,
  source, create/update, asset, shot-link schemas, and a stable key helper.
- `apps/web/drizzle/schema.ts` contains four initial tables:
  `vertical_drama_object_references`,
  `vertical_drama_object_reference_assets`,
  `vertical_drama_shot_object_references`, and
  `vertical_drama_episode_object_references`.
- `apps/web/drizzle/0277_vertical_drama_object_references.sql` is the additive
  foundation migration. It is not a complete lifecycle, detection, or
  backfill migration.
- `apps/web/server/services/verticalDramaObjectReferences.ts` provides initial
  series ownership, CRUD/archive, asset attachment, shot link/unlink,
  commercial-object creation, and a deterministic name-substring detector.
- `apps/web/server/routers/verticalDramaSeries.ts` exposes the initial catalog
  CRUD/asset procedures. The current list input is only `{ seriesId }` and the
  write contracts do not yet consistently carry revision/idempotency state.
- `apps/web/server/routers/verticalDramaEpisodes.ts` invokes detection from an
  episode detail read as a fire-and-forget side effect. This is intentionally
  non-blocking, but it violates the required read-purity and deduplicated job
  boundary and must move to an explicit advisory path.
- `VerticalDramaObjectReferenceTab.tsx` is a new central, wide catalog surface
  that includes object creation, asset picker/drop-zone affordances, and a
  compatibility Product Tie-in editor.
- `VerticalDramaProductTieInTab.tsx` remains the legacy JSON-backed commercial
  editor. It must be progressively disclosed or adapted, not rendered as a
  second competing catalog source of truth.
- `ImageSourcePicker.tsx` already owns Library, History, upload, and source
  selection behavior. A focused `dropZone` presentation option was added, but
  the full catalog and shot-level managed-media binding still need integration.
- `VerticalDramaSeriesDetailPage.tsx` has a compatibility route where
  `tab=product` resolves to the unified objects surface. Existing Special Tie-in
  dialog behavior remains separately owned by
  `SpecialTieInEpisodeDialog.tsx`.

## Required integration boundaries

### Catalog and data

The catalog needs a single identity per series and stable commercial identity
for Marketplace Capture-backed products. It must add richer metadata (object
type, narrative role, continuity notes, aliases, and commercial policy) without
making the image optional create flow fail. Asset links need canonical/detail/
alternate roles, approval state, provenance, ordering, and reversible removal.
Active uniqueness must match the lifecycle rather than treating archived or
removed history rows as active duplicates.

### Detection and continuity

Detection is advisory. It must examine series story context, episode synopsis,
shot text, location, time/day, and continuation signals before deciding whether
an object candidate is relevant. A direct continuation (same place/time or
travel continuation) may preserve an object; a different place/day may not.
String matching is only a fallback signal. Suggestions require evidence,
confidence, detector version, context fingerprint, expiration/retry state, and
review decisions. Manual removal is an auditable tombstone that automatic
detection cannot silently recreate.

### Shot generation

Normal and Special paths must resolve one typed set of references. Object
references are additive to character, wardrobe, location, and commercial
references. Approved object assets must flow into image prompt/reference,
start-frame, and video prompt/media bundles subject to provider caps and stable
ordering. Missing or failed object references remain warnings and never block
storyboard creation, episode continuation, or non-object generation.

### Special/Product compatibility

The user-facing surface is one Object Reference catalog with explicit
`story_object` and `commercial_tie_in` modes. Marketplace Capture remains the
commercial input and the existing Special Tie-in dialog remains the episode
creation entry point. Existing footage-first, claim/disclosure, credits,
exactly-nine-shot, model, and approval rules remain authoritative. A durable
post-create episode binding/reconciliation is required; a client-only
fire-and-forget bridge is insufficient.

### UI/UX

The catalog should use the existing Product Tie-in central wide workspace,
not a narrow side rail. Primary actions are visible in the workspace header;
advanced commercial fields are progressively disclosed. The catalog and shot
controls need clear loading, empty, error, disabled, selected, and non-blocking
warning states. Images can be dragged from the local file system or the right
Library/History panel into an asset slot, with managed import and ownership
recheck. Shot cards need an object picker, evidence/review affordance, manual
remove/reset, canonical replacement, and legacy/unclassified visibility without
becoming overloaded.

## Safety, reliability, and operational findings

- Tenant/user ownership must be applied to every series, episode, object, asset,
  Marketplace Capture, and projection query. Foreign identifiers must return a
  typed not-found result rather than leaking existence.
- Object detection must not run paid generation and must not poison provider
  health with request-specific reference failures.
- Prompt/image generation needs explicit capability and credit admission,
  versioned prompt-run state, idempotency, draft/approval semantics, and
  reconciliation with existing job/credit ledgers.
- Retryable mutations need bounded idempotency keys and request hashes. Domain
  conflicts should be typed as `NOT_FOUND`, `BAD_REQUEST`, `CONFLICT`, or
  `CAPABILITY_DISABLED` rather than generic errors.
- Migration/backfill needs dry-run/report/retry behavior and evidence that the
  legacy `productTieIn` JSON remains unchanged. Rollback must disable new
  capabilities without deleting canonical or legacy data.
- Provider reference caps and byte/asset limits must be enforced server-side;
  automatic detection should skip safely while manual over-limit writes give a
  useful non-destructive error.

## External technical research

The following primary/official references informed the plan:

- MDN documents that `DataTransfer.files` is available in `drop` and `paste`
  events and is the browser-compatible path for files dragged from a desktop:
  https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer/files
- MDN documents the `DataTransfer` object and its file/string item model for
  drag-and-drop integration:
  https://developer.mozilla.org/en-US/docs/Web/API/DataTransfer
- PostgreSQL documents that composite unique constraints enforce uniqueness and
  automatically create a B-tree index, while partial unique indexes are the
  appropriate mechanism for uniqueness over only active rows:
  https://www.postgresql.org/docs/current/ddl-constraints.html
  https://www.postgresql.org/docs/17/sql-createindex.html

These references support using native drop event handling at the UI boundary,
managed-media conversion at the server boundary, and explicit active-lifecycle
constraints in PostgreSQL. They do not substitute for browser, provider,
database, or production proof.

## Verification baseline

- Focused ImageSourcePicker tests pass with jsdom after the current drop-zone
  addition: 11 tests passed.
- Vite client build passed with `npx vite build --configLoader runner` from
  `apps/web`.
- Full TypeScript checking currently reports many unrelated pre-existing
  errors; absence of an error in the new tab was checked with a targeted filter,
  but full typecheck is not green evidence.
- Astryx component discovery could not run because the local CLI module entry
  is missing. The implementation should continue using the existing project
  design system/components and avoid adding a global reset.
- No browser, live provider, deployment, or production migration proof has
  been established by this research pass.

## Planning conclusion

The safe implementation is an additive, staged completion: strengthen shared
contracts and physical lifecycle first; then build typed catalog/shot services,
advisory detection and Special reconciliation; then wire prompt/media
projections and the central UI; finally run migration/report and browser/runtime
release gates. The creator-facing generation flow stays available when optional
object work is missing or fails.
