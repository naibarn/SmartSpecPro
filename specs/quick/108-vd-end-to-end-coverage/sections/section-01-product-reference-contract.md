# Section 01 — Product-reference contract

## Ownership

Own the canonical resolution of special-edition/product reference assets from persisted config to provider-bound image/video inputs. Do not change preset synthesis or QC policy here.

## Target files

- `apps/web/server/services/verticalDramaProductReferenceResolver.ts` (new preferred seam)
- `apps/web/server/services/verticalDramaProductTieIn.ts`
- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- Existing media lifecycle/cleanup service used by `createAssetFromAttachment`

## TDD

Write resolver tests for ownership, expiry, dedupe, priority, cap, and missing-required-upload failure before implementation. Add pipeline tests proving uploaded URLs reach the generated frame and render request.

## Acceptance

- Uploaded image IDs are resolved only for the owning tenant/user.
- Special-edition upload failure is visible and repairable, never silently degraded.
- Existing direct and Marketplace reference paths remain compatible.
- Explicit storyboard picker overrides remain authoritative.
- Reloaded product picker and generation resolve the same authoritative reference set.
- Managed storage references are normalized to provider-fetchable URLs.

## Risks

Do not put signed URL or DB logic in a shared pure contract module. Avoid importing router-private helpers into the pipeline; use a service seam to prevent cycles. Define compensation/idempotency for staged asset rows before changing the create transaction.
