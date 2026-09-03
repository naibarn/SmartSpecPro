# Feature 174 Implementation Plan

## 1. Implementation principles and boundaries

Implement Feature 174 as an additive extension of the existing Vertical Drama
system. Keep the catalog as the sole canonical identity for reusable physical
objects, use `referenceMode` to separate ordinary story objects from
commercial tie-ins, and preserve legacy `productTieIn` JSON and the existing
Special Tie-in entry point during rollout. No section may turn optional object
work into a prerequisite for storyboard creation or ordinary media generation.

The implementation must use the existing tRPC, Drizzle, managed-media, credit,
job, and UI patterns. Any new operation that cannot be safely enabled should
return an explicit capability state or typed warning; it must not be a silent
no-op. Existing unrelated dirty files remain out of scope.

## 2. Shared contracts and domain vocabulary

Update `apps/web/shared/verticalDramaSeries/objectReferences.ts` with the
canonical schemas and inferred types used by every layer. Define object type,
narrative role, continuity policy, asset role/lifecycle, assignment source,
suggestion decision, commercial profile, capability state, revision, bounded
idempotency key, and typed domain error mappings. Normalize source aliases at
the boundary (`history`/`library`, `upload`/`uploaded`, `primary`/`canonical`)
without losing original provenance.

The shared contract must distinguish:

- catalog identity and metadata;
- active/archived catalog state;
- active/removed asset attachment state;
- detected suggestion versus accepted shot usage;
- catalog-owned projection versus legacy/unclassified `prop_object` rows;
- ordinary story-object rules versus commercial Product tie-in rules.

Expose four stable fail-closed capability keys in that contract:
`objectCatalog`, `objectDetection`, `objectImageGeneration`, and
`objectLegacyBackfill`. The same keys must be returned by the server capability
procedure, consumed by the UI, checked by migration/backfill tooling, and
recorded in release evidence so a partially enabled rollout is understandable.

Create pure helpers for normalized aliases, context fingerprints, provider-cap
selection, stable asset ordering, and non-blocking warning serialization. These
helpers must be deterministic and independently tested.

## 3. Physical schema, lifecycle, and migration

Extend `apps/web/drizzle/schema.ts` and add an additive migration after 0277.
Retain the four foundation tables, adding the required metadata, explicit
commercial policy, revision, and lifecycle fields. Add series-scoped aliases,
durable detection suggestions/runs, prompt-run state, and projection lineage
where the existing schema has no equivalent. Add asset approval/role/provenance
and reversible removal fields. Make episode and shot relationships explicit
and active-aware; preserve historical rows without allowing duplicate active
links. Add indexes for tenant/series/status, episode/shot, fingerprint, and
retry lookup. Use PostgreSQL constraints/partial indexes where appropriate.

Migration/backfill must be an idempotent dry-run/report/apply/retry operation in
`apps/web/scripts` or the established migration tooling. Map existing
`productTieIn` JSON and Marketplace Capture identities into commercial catalog
records only when identity is reliable; preserve the legacy JSON and report
ambiguous/unavailable records for review. Feature flags must fail closed for
catalog, detection, paid generation, and backfill independently, using the
canonical keys `objectCatalog`, `objectDetection`, `objectImageGeneration`,
and `objectLegacyBackfill`.

## 4. Catalog service and typed router

Complete `apps/web/server/services/verticalDramaObjectReferences.ts` as the
single domain service. Enforce ownership, input limits, active-object and
per-shot caps, lifecycle transitions, canonical asset uniqueness, revision
conflicts, and idempotency. List defaults to active records and offers an
explicit archived/history mode. Asset operations attach managed `mediaAssetId`
values after ownership checks, support reorder/canonical selection, soft
remove/restore, and never delete underlying media.

Expand `apps/web/server/routers/verticalDramaSeries.ts` with the typed catalog
surface: list/history, create/update/archive/restore, alias management, asset
attach/reorder/remove/restore/canonical selection, prompt request/result, usage
listing, capability state, and Special reconciliation entry points. Use
existing auth/tenant procedure wrappers. Map domain failures to stable tRPC
errors and return revision/capability/warning metadata so the UI can explain
what happened.

The public procedure names must be explicit and stable: `listObjectReferences`
(`seriesId`, `includeArchived`), `createObjectReference`,
`updateObjectReference`, `archiveObjectReference`, `restoreObjectReference`,
`listObjectReferenceAssets`, `attachObjectReferenceAsset`,
`setObjectReferenceCanonicalAsset`, `reorderObjectReferenceAssets`,
`removeObjectReferenceAsset`, `restoreObjectReferenceAsset`,
`listObjectReferenceAliases`, `upsertObjectReferenceAlias`,
`listObjectReferenceUsages`, `requestObjectReferencePrompt`,
`generateObjectReferenceImage`, and `reconcileCommercialObjectReference`.
Episode procedures must expose `getObjectReferenceSuggestions`,
`reviewObjectReferenceSuggestion`, `linkObjectReferenceToShot`,
`unlinkObjectReferenceFromShot`, and `resetObjectReferenceShotDecision`.
Every mutation accepts the owning identifier, `expectedRevision` where a row is
mutable, and a bounded `idempotencyKey` where it can be retried. Responses
return the changed row plus `revision`, `warnings`, and `capability` fields;
suggestions return a durable `suggestionId`, not only a name match.

## 5. Special/Product compatibility bridge

Adapt `VerticalDramaProductTieInTab.tsx`,
`SpecialTieInEpisodeDialog.tsx`, their routers/services, and
`VerticalDramaSeriesDetailPage.tsx` so `tab=product` resolves to the unified
Object Reference surface while legacy deep links continue to work. Keep the
Special dialog as the creation entry point, Marketplace Capture as the product
selector, and commercial disclosure/claim/footage/nine-shot/credit/approval
rules as the authoritative policy.

Implement a durable reconcile/bind operation that resolves the selected
capture/product to one commercial catalog identity, records an episode binding
and reviewed snapshot, and can retry idempotently after episode creation. Do
not render a duplicate CRUD editor. Ordinary story objects must never inherit
commercial behavior merely because they share the catalog.

## 6. Context-aware advisory detection

Create a pure context-pack builder and detector service that reads series story,
episode synopsis/outline, neighboring episode boundaries, shot text, scene,
place, time/day, travel/continuation markers, catalog metadata, aliases, and
existing manual decisions. Use a two-stage process: candidate extraction and
context/continuity scoring. Persist detector version, evidence excerpts,
confidence, context fingerprint, state, expiry, retry/backoff, and review
decision.

Replace detection from `getEpisodeDetail` read execution in
`apps/web/server/routers/verticalDramaEpisodes.ts` with an explicit advisory
mutation or deduplicated outbox/job. Episode detail remains read-pure and
immediate. Detection may auto-link only above the configured high-confidence
threshold and only when no manual tombstone/lock conflicts; lower confidence
creates a review suggestion. It must never call paid generation or throw into
the storyboard path.

## 7. Shot usage, projection, and generation propagation

Add typed shot usage procedures and integrate them into
`VerticalDramaStoryboardPanel.tsx` and the relevant episode page. The shot UI
must show catalog identity, source/evidence, confidence, active asset,
detected/manual status, and controls to accept, reject, reset, add, remove,
replace, lock, and choose canonical reference. Legacy `prop_object` rows remain
visible as unclassified references.

Build one resolver used by normal and Special media paths. It should merge
character, wardrobe, scene/location, object, and commercial groups without
cross-contamination; preserve deterministic ordering and enforce provider caps.
Projection writes need lineage so unlink/reconcile removes only rows produced by
that catalog link and preserves legacy rows. Missing/stale/unavailable object
assets become structured warnings and are skipped.

Wire the resolver into the existing image prompt, start-frame, video prompt,
and media bundle paths (`verticalDramaStartFrameGeneration.ts`,
`verticalDramaShotReferences.ts`, and related generation services). Do not
change character-age/wardrobe/location continuity behavior as part of this
feature.

## 8. Prompt and paid object-image operations

Add explicit catalog prompt generation using object metadata and the relevant
story context. Persist versioned prompt-run status, input fingerprint, result,
and failure/retry state. Image generation must be a separate user-confirmed,
credit-admitted, idempotent operation; generated media initially remains draft
until approved as canonical/detail/alternate. Provider/reference failures must
remain request-specific and must not poison global provider health.

Reuse existing media/job/credit ledgers and reference URL resolution. Enforce
bounded reference count/bytes, managed ownership, and safe retry/reconciliation.

## 9. Unified central catalog UI and drag/drop UX

Make `VerticalDramaObjectReferenceTab.tsx` the single wide central workspace.
Keep primary actions in the header: add object, add commercial product, import
reference, generate prompt, and (when admitted) generate image. Provide a
compact empty state and progressive disclosure for metadata, aliases, usage,
commercial policy, history, and advanced generation settings.

Use `ImageSourcePicker.tsx` for local upload, Library, and History selection;
support native drag/drop from hard disk and draggable Library/History tiles into
object asset slots. On drop, show a visible target state, validate file type/
size, upload/import as managed media, preserve source provenance, and expose
retry without losing the object draft. Make the same picker available in shot
object controls without duplicating all Library UI.

The four capability keys are fail-closed in the client: a disabled operation is
visibly explained and cannot trigger a hidden request.

The UI/UX contract is:

- loading: skeleton/disabled actions with no layout jump;
- empty: explain optional object references and offer add/import;
- success: show canonical badge, source, and usage count;
- warning: non-blocking detector/media/provider message with retry or review;
- conflict: preserve local edits and offer reload/merge;
- archived/removed: visible only in history and restorable explicitly;
- keyboard: all actions focusable with labels, escape closes overlays, drop
  zones have an equivalent file-picker button;
- responsive: central two-column workspace on desktop, stacked cards on tablet
  and mobile, never requiring the narrow side rail for primary work;
- language: Thai-first labels with English fallback matching existing locale
  conventions; avoid exposing internal mode names without a human label.

Route/component ownership is explicit: `VerticalDramaSeriesDetailPage.tsx`
owns the `tab=objects`/legacy `tab=product` route resolution;
`VerticalDramaObjectReferenceTab.tsx` owns the central catalog layout and
catalog mutation state; `VerticalDramaProductTieInTab.tsx` owns only the
progressively disclosed legacy/commercial adapter; `SpecialTieInEpisodeDialog`
owns Special episode creation; `VerticalDramaStoryboardPanel.tsx` owns the
shot usage controls; `ImageSourcePicker.tsx` owns source selection and drop
parsing; server services own all persistence and generation admission.
The browser proof must exercise loading, empty, successful import, upload
failure/retry, stale revision conflict, archive/history, suggestion review,
manual removal persistence, and a Special commercial record without rendering
two independent editors. Every state has an accessible text label and a
keyboard-equivalent action; hover-only affordances are not accepted.

## 10. Observability and failure handling

Emit structured tenant-safe events for detection queued/accepted/rejected/
expired, asset attach/remove/restore, projection reconcile, prompt/image run,
Special binding, capability denial, and typed failure. Include object/episode/
shot IDs, revision, idempotency fingerprint, detector/prompt version, and
redacted reason; never log raw private media URLs or prompt secrets.

Define bounded retry/backoff and terminal states for advisory jobs, provider
media import, prompt runs, paid image jobs, and Special reconciliation. A
failure on one object or one shot must not fail an episode-wide generation
request. Keep request-specific `reference_unavailable` separate from provider
health. Add operational metrics and a report endpoint/script for stale,
unclassified, ambiguous, and failed references.

## 11. Test-first implementation matrix

Before each implementation section, add focused Vitest tests using existing
mocking conventions. Cover shared normalization/fingerprints/caps; schema
constraints and migration idempotency; tenant isolation, limits, revision and
idempotency; asset lifecycle; Special reconcile; context continuation versus
new place/day; manual tombstone precedence; projection ownership; provider cap
and optional-media warnings; prompt/paid admission; and catalog/shot UI states
including keyboard and drag/drop. Use jsdom for browser components and DB
integration only when the test harness explicitly supports it.

## 12. Verification and release gates

Run focused unit/component tests, targeted typecheck filters, `git diff --check`,
and the web client build after implementation. Run migration dry-run/report and
DB integration proof in a safe test database. Run a browser flow proving
catalog create/import, Library/History and hard-disk drop, shot link/remove/
reset, Special commercial binding, and non-blocking failure. Prove provider cap
and managed-media behavior with deterministic fixtures. Assert that the four
capability keys are consistent between server, UI, migration report, and
release configuration. Do not claim production deployment or live provider
success from local tests; record any unavailable runtime gate explicitly.

## 13. Section ownership and execution order

Implementation sections must be split without overlapping file ownership:

1. contracts and pure helpers;
2. schema/migration/backfill;
3. catalog service/router;
4. Special/Product bridge;
5. context detector/advisory job;
6. shot usage/projection/resolver;
7. prompt/media generation propagation;
8. central catalog and drag/drop UI;
9. observability/reliability/capabilities;
10. integration tests, browser proof, and release gates.

The first two sections establish shared contracts and persistence. Service and
bridge/detector work follows them. Shot/media consumers follow the resolver.
UI can proceed after typed procedures are stable. Verification is last and may
fix defects in any earlier owner section, but must not broaden unrelated scope.
