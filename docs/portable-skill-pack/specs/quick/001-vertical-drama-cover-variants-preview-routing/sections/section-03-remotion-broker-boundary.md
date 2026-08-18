# Section 03 — Remotion Broker Boundary

## Ownership

Own `apps/web/server/services/verticalDramaRemotionRender.ts` and its focused tests, reusing existing broker/storage services.

## Tasks

- Resolve protected clip and cover URLs for worker-facing preview template and manifest sources using the existing tenant/user broker boundary.
- Keep `defaultStageAsset` server-side staging through `downloadClipToFile` and `storageStreamFile`.
- Preserve filename extensions and use the existing worker/provider TTL.
- Add regression coverage for `media-jobs/assets` protected URLs and assert no raw protected URL enters the worker input.

## Acceptance

- Web-side staging succeeds for the known episode 140 clip.
- Worker-facing template layers and asset manifest contain signed broker URLs.
- A broker failure aborts before queueing a broken preview job.
- Existing external media broker and managed-storage tests remain green.

## Operational checks

After backend restart, inspect the worker/web logs and retry episode 140 preview once. The old `asset_stage_failed` 404 must not recur.
