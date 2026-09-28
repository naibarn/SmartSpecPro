# Synthesized Specification — Feature 174

## Objective

Deliver a production-usable series-level Object Reference catalog for Vertical
Drama. It must make story-critical props (for example a locked wooden box,
heirloom jade, ring, document, key, or weapon) reusable and visually stable
across shots, while unifying commercial Product tie-ins under the same
user-facing workspace without weakening their existing rules.

## Required user outcomes

- Create, edit, archive, restore/view history, and search reusable object
  definitions at series scope.
- Store object meaning, type, narrative role, continuity notes, aliases,
  canonical prompt, commercial policy, and provenance.
- Add a canonical image plus detail/alternate images from local disk, Library,
  History, or Marketplace Capture. The image may be absent at creation time.
- Drag/drop references into catalog slots and shot-level object slots using
  managed media ownership and visible progress/errors.
- Generate a context-grounded object prompt and optionally generate/approve an
  image only after explicit capability/credit admission.
- Detect relevant objects from series/episode/shot context with evidence and
  confidence, but allow manual correction and never block creator progress.
- Propagate approved object references to image prompts, image generation,
  start frames, and video prompt/media bundles with provider-cap handling.
- Display Product tie-ins in the same wide Object Reference surface while
  preserving Marketplace Capture provenance and Special Tie-in policy.

## Domain contract

The canonical identity is a series-owned object reference. It has
`referenceMode: story_object | commercial_tie_in`. Scene/location, character,
wardrobe, and object references remain separate typed groups. An object may
have zero or more active managed-media assets and zero or more episode/shot
usages. A usage may be detected, manually added, Special-derived, removed, or
locked. Manual decisions take precedence over automatic detection.

## Non-functional and safety contract

- Every read/write is tenant/user/series/episode scoped.
- Optional object work is advisory and fail-open for storyboard and media
  creation.
- No automatic paid generation, advertising, purchase, or product claim is
  performed by detection or migration.
- All retryable writes are idempotent, revision-aware, bounded, and typed.
- Managed media and Marketplace Capture references are revalidated at import
  and generation time. Arbitrary remote URLs are not trusted.
- Legacy Product tie-in JSON remains readable and recoverable during rollout.

## Completion boundary

Feature 174 is complete only when its physical lifecycle, typed API, context
detector, manual override semantics, Special binding, generation propagation,
central catalog/shot UI, migration/backfill operations, observability, focused
tests, and browser/runtime release evidence are present. A foundation table,
best-effort name match, or visible UI alone is not completion.
