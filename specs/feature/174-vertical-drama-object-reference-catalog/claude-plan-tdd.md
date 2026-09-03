# Feature 174 TDD Plan

Tests are written or updated before the implementation in each section. Use
Vitest and existing repository mocks; use jsdom for browser components and a
safe test database only for integration tests.

## 1. Shared contracts and domain vocabulary

- Test source alias normalization and provenance preservation.
- Test stable object keys, context fingerprints, deterministic ordering, and
  provider cap trimming.
- Test schemas reject oversized/invalid IDs, modes, roles, confidence, and
  idempotency keys while allowing an image-optional object.
- Test typed capability/error serialization and non-blocking warning shape.

## 2. Physical schema, lifecycle, and migration

- Test schema metadata/defaults, active-aware uniqueness, foreign ownership,
  soft removal, and canonical asset invariants in DB integration fixtures.
- Test migration dry-run/apply/retry is idempotent and preserves legacy JSON.
- Test ambiguous/unavailable legacy records are reported rather than mutated.
- Test each of the four capability keys fails closed independently.

## 3. Catalog service and typed router

- Test tenant/user/series isolation and typed not-found behavior.
- Test create/update/archive/restore, revision conflicts, idempotent retries,
  active limits, asset attach/reorder/canonical/remove/restore, and history
  list semantics.
- Test managed media ownership and no underlying-media deletion.
- Test each declared tRPC procedure returns revision, warnings, and capability
  metadata or a stable typed error.

## 4. Special/Product compatibility bridge

- Test Marketplace Capture identity resolves to one commercial catalog record.
- Test repeated Special reconcile does not duplicate records or bindings.
- Test existing nine-shot/footage/claim/disclosure/credit policy remains
  authoritative and ordinary story objects do not inherit it.
- Test legacy `tab=product` routing and Product tie-in JSON adapter behavior.

## 5. Context-aware advisory detection

- Test same-place/time continuation and travel continuation favor continuity.
- Test a different day/place does not force the prior object into a shot.
- Test aliases, evidence, confidence thresholds, detector version, and context
  fingerprints are persisted.
- Test manual accept/reject/remove/lock/reset precedence, dedupe, expiry,
  bounded retry, and read-pure episode detail.
- Test detector/provider failure is advisory and never blocks storyboard reads.

## 6. Shot usage, projection, and generation propagation

- Test manual add/remove/replace/lock and suggestion review semantics.
- Test catalog-owned projection lineage only removes its own rows and leaves
  legacy/unclassified prop references intact.
- Test one resolver separates character, wardrobe, scene, object, and
  commercial groups and trims references deterministically to provider caps.
- Test missing/stale assets produce warnings and continue generation.

## 7. Prompt and media generation propagation

- Test object prompt context and versioned input fingerprints.
- Test prompt retry/idempotency and provider-specific reference failure
  classification.
- Test image generation requires explicit confirmation and credit admission,
  produces a draft, and reconciles duplicate/retried jobs safely.
- Test approved object references appear in image/start-frame/video bundles.

## 8. Unified central catalog UI and drag/drop UX

- Test loading, empty, success, warning, conflict, archive/history, and
  disabled capability states.
- Test local file drop, Library/History drop contract, picker fallback,
  validation, upload progress, failure/retry, and draft preservation.
- Test add/edit/asset canonical selection and no duplicate Product editor.
- Test keyboard labels/focus/escape, responsive classes/layout, and Thai/English
  copy for primary states.

## 9. Observability and failure handling

- Test structured events are tenant-safe and redact URLs/secrets.
- Test retry/backoff reaches bounded terminal state and never invokes paid work
  for detection/migration.
- Test request-specific `reference_unavailable` does not alter provider health.
- Test capability denial and per-object failure do not fail the episode batch.

## 10. Integration, browser, and release gates

- Test migration report and legacy parity in a safe DB.
- Test an owner-scoped browser flow: create/import/drop, shot review/remove,
  Special commercial binding, and optional failure continuation.
- Test build/typecheck targeted gates and produce a release checklist that
  distinguishes local proof from live provider/deployment proof.
