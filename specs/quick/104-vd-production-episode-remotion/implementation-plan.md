# Implementation Plan

## Objective

Implement range-based Production Episode creation through the existing Remotion render queue, with durable per-EP status and UI playback/download.

## Work order

1. Add pure shared contracts/helpers for range partitioning, minimum-three validation, source mode, remainder policy, and additive group render metadata. Keep old manifest entries compatible.
2. Extend the existing `verticalDramaRemotionRender.ts` VD adapter to create one bounded GenericTemplate segment per Sub-Episode, using compiled video or shot videos, plus EP/title/watermark layers and the existing asset-staging path.
3. Add server service/router orchestration: validate tenant-owned episode range, resolve assets, create pending groups, enqueue one Remotion job per group, and reconcile terminal worker output to the exact group. Preserve existing Sub-Episode Remotion/FFmpeg paths and legacy Production Episode rows.
4. Update the Production Episodes panel with start/end/group-size/source mode/options/remainder confirmation and durable group cards. Preserve play/fullscreen/download behavior and add loading/empty/error/partial states.
5. Add focused tests at shared, Remotion, service/router, and UI helper boundaries; run changed-file diagnostics and targeted Vitest suites.

## Affected surfaces

- Shared: `apps/web/shared/verticalDramaSeries/assembly.ts`, possibly `workerRuntime.ts` only if a narrowly additive contract field is required.
- Remotion package: only if the existing schema needs an additive field; otherwise no generic package contract change.
- Server: `verticalDramaRemotionRender.ts`, `verticalDramaProductionEpisodeAssembly.ts`, `verticalDramaSeries.ts`, and focused tests.
- Client: `VerticalDramaProductionEpisodesPanel.tsx` and its tests/copy if needed.
- No migration expected.

## Acceptance criteria

- A valid range with at least 3 Sub-Episodes creates the expected groups and automatically numbers them.
- Remainder groups require an explicit create/skip decision.
- Auto/compiled-only/shot-only source modes follow their contracts and report missing sources clearly.
- Every accepted group creates a Remotion render job and survives refresh as pending/completed/failed.
- EP number, optional series title, and all enabled configured watermark slots render in the Remotion segment templates.
- Completed groups show correct range/summary and support play, fullscreen, and download.
- Existing legacy compiled Production Episode rows remain playable.
- Ownership and URL validation remain server-side and tenant-scoped.

## Risks and mitigations

- Generic worker contract drift: add contract tests and preserve existing fixtures; do not change existing schema literals without parity updates.
- Worker completion race: use immutable group identity and guarded terminal updates.
- Long render memory/CPU: one job per group, one segment per Sub-Episode, existing worker concurrency policy.
- UI stale refetch: use cached data fallback and invalidate/poll only while pending.
