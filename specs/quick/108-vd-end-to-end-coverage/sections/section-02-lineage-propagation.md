# Section 02 — Lineage propagation

## Ownership

Make sequel/special-edition facts explicit in direct episode continuation and preserve the existing parent snapshot/security behavior.

## Target files

- `apps/web/server/services/verticalDramaEpisodeContinuation.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaScriptGeneration.ts` if required by the episode path
- `apps/web/server/routers/verticalDramaSeries.ts`
- The post-create full-story job/status path invoked by `CreateSeriesWizard.tsx`

## TDD

Add S2/S3, live-memory, no-memory, deleted-parent, and original-mode byte-identity tests. Assert prompt contents are bounded and do not include the parent’s full episode list.

## Acceptance

- Full-story and direct-continuation routes use the same bounded lineage contract.
- Parent facts are tenant/user scoped and cannot be fabricated when unavailable.
- Special edition preserves parent cast/continuity while applying its product-specific constraints.
- Shell creation does not masquerade as story-generation/QC completion; queued, failed, and retry states are durable.

## Risks

Do not create a second independent continuity ledger. Reuse the child’s persisted lineage and current memory projection.
