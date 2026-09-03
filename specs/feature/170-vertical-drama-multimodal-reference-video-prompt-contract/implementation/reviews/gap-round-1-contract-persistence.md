# Post-implementation gap review 1 — contract and persistence

Date: 2026-08-31

Scope: start/stop truth, mixed reference schema, canonical asset ownership,
ordering, fingerprints, duplicate links, and product reference ceiling.

Checks:

- `check-sections.py` and `check-ui-contracts.py`: 6/6 sections complete.
- `verticalDramaShotMedia.test.ts` and feature-170 contract tests: passed.
- Read-through of `verticalDramaShotReferences.ts` and migration/schema:
  start/stop are image-only, reference rows require canonical assets, and the
  existing unique `(episodeId, shotNumber, mediaAssetId)` constraint remains.

Findings and actions:

- MUST_FIX: migration concatenation was unsafe for a nullable `configJson`.
  Fixed both profile updates with `COALESCE(configJson, '{}'::jsonb)`.
- MUST_FIX: linked references returned without MIME/thumbnail after insert or
  idempotent retry, so a reloaded UI could misclassify video/audio as image.
  Fixed `linkReference` to return the joined contract.
- MUST_FIX: reference count was only a schema ceiling, not enforced at link
  time. Added the bounded `VD_MAX_REFERENCE_ITEMS_PER_SHOT` runtime ceiling,
  default 50, with a structured rejection.
- NICE_TO_HAVE: a future migration may add a database-level active-set count
  constraint; application enforcement is the current safe boundary.

Result: no open MUST_FIX findings for this boundary.
