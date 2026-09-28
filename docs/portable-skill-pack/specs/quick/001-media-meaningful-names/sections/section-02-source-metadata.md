# Section 02: Source metadata propagation

## Ownership

Own the app-only metadata contract and Vertical Drama generation/assembly call sites. Preserve worker and artifact protocol names.

## Target files

- `apps/web/server/services/mediaGenerationService.ts`.
- Relevant Vertical Drama routers/services that already know series/episode/shot/clip context.
- Existing focused tests for media generation and Vertical Drama task metadata.

## Behavior

Add only the naming keys needed by the shared resolver to the persisted internal metadata allowlist. Populate title context at the source for newly generated VD media, including both direct image/video generation and assembled outputs where the caller already has series/episode data. Keep metadata out of provider prompt semantics. Use existing display fields for worker assembly where available.

## TDD and acceptance

- Assert naming metadata survives task persistence/projection and provider-facing filtering behavior.
- Assert assembly still uses the technical render/storage filename and artifact type.
- Assert incomplete metadata remains recoverable by generic fallback.

## Risks

There are many VD call sites. Change only paths that create the affected media and reuse existing provenance values; do not perform an unrelated router refactor.
