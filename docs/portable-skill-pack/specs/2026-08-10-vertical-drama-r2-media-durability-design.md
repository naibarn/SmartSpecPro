# Vertical Drama R2 Media Durability Design

## Problem and evidence

Vertical Drama persists provider result URLs directly in several JSONB payloads and
in `media_assets.originalUrl`. Kie.ai result URLs are temporary, so a generated
image or video can render immediately and then disappear after the provider link
expires. The current completion contract also leaves part of finalization to the
browser: a user can navigate away after a task completes but before the result is
registered as a durable asset.

The existing storage layer already supports Cloudflare R2 through the S3 API and
serves stable application URLs through `/api/storage/files/:key`. Existing
Vertical Drama ownership and asset-link tables already carry tenant/user/series
scope, so the first repair does not require a new database table.

## Approved approach

Use a server-owned, idempotent Vertical Drama media finalizer at the task-result
boundary. When a tagged Vertical Drama task reaches `completed`, the server
downloads the provider output, uploads it to the active R2 bucket, creates or
reuses a `media_assets` row, and exposes only the managed storage URL to Drama
consumers. The provider URL remains transient provenance only and is never the
authoritative display URL.

The finalizer is shared by image and video flows and is safe to call repeatedly.
It rejects a non-R2 active storage configuration for generated Drama media instead
of silently falling back to local disk or another temporary provider. Remote
downloads use bounded timeouts, response-size limits, content-type validation,
and the existing URL safety policy.

## Completion and persistence flow

1. Generation submission continues to use the existing provider/task contract and
   writes Vertical Drama provenance tags (`seriesId`, `episodeId`, shot/purpose).
2. The task status boundary invokes the finalizer before returning a completed
   result to the caller. The returned result contains the managed URL and asset id.
3. Existing Drama link/finalize mutations continue to attach the returned asset to
   the correct character, location, start-frame, reference, cover, clip, or
   assembly manifest. They no longer register the raw provider URL.
4. Server-side assembly paths resolve managed storage keys and continue to use the
   storage proxy for video seeking and downloads.

For task types that do not carry enough provenance to mutate a specific JSONB
slot, the finalizer still creates the durable asset. The next Drama detail read
and the existing slot-specific finalize operation can then link it without
re-downloading the provider result.

## Unified task polling boundary

The MCP lookup, deferred-retry lookup, provider lookup, and Vertical Drama R2
finalization are implemented in one shared server service. `media.getTask` and
the portrait, episode-cover, and ad-banner status procedures all call this
service. Domain routers retain only their own terminal-state persistence, so a
domain-specific poll cannot bypass MCP/deferred tasks or return a transient
provider URL. Credit reconciliation remains at the media router boundary,
where the existing billing behavior is already centralized.

## Backfill and recovery

Add a resumable command with `dry-run`, scoped series/tenant filters, a batch limit,
and idempotent apply mode. It inventories all Drama-linked images and videos,
including character/location links, shot references, approved start frames, angle
grid candidates, motion-prompt clips, episode covers, compiled videos, production
episode videos, and trailer media.

- A reachable external URL is downloaded, uploaded to R2, and all applicable
  references are rewritten to the managed asset.
- A managed R2 key is only normalized; it is never downloaded and re-uploaded.
- An unreachable/expired URL is marked `expired` in its owning asset/JSONB state.
  The original URL is retained only as diagnostic provenance and is not returned
  as a display URL.
- The command can be run repeatedly without duplicate assets or duplicate JSONB
  updates and reports recovered, already-durable, expired, and failed counts.

## UI recovery contract

Every Drama image/video slot treats managed URL failure as a first-class state.
The UI renders an accessible placeholder containing the slot identity and
“ไฟล์หมดอายุ”, never substitutes another shot's media, and offers “สร้างใหม่”.
Regeneration reuses the persisted prompt/configuration where possible. A browser
`onError` fallback covers stale cache or unexpected provider failures in addition
to the server-projected `expired` state.

## Failure, security, and operational rules

- R2 upload failure is retryable and must not replace the last known durable asset.
- All queries and backfill updates remain tenant/user/series scoped.
- External URL fetches reject unsupported schemes, private-network targets, and
  oversized responses; videos are streamed through a temporary file and cleaned
  up in `finally`.
- Backfill is never run automatically against production data in this change;
  operators first run dry-run, inspect counts, then run apply with an explicit
  scope.

## Verification

Focused tests cover R2-only admission, idempotent ingestion, remote download
failure/size limits, task completion projection, JSONB reference rewriting,
expired-state projection, backfill dry-run/apply behavior, and UI placeholder/
regeneration states. Existing repository-wide typecheck noise is reported
separately from changed-file and focused-suite results.

## Marketplace Auto Review extension

Marketplace Auto Review now uses the same unified task polling boundary as
Vertical Drama. Direct image/video attempts and the staged checkpoint image/video
pipeline both finalize provider results to R2 before persisting `resultUrl`,
`storyboardFrameUrls`, `videoClipUrls`, staged artifact URLs, or final output
links. The Auto Review finalizer uses streamed temporary files for videos,
requires active Cloudflare R2, and returns the stable storage-proxy URL.

`server/scripts/backfill-marketplace-auto-review-media.ts` rewrites reachable
legacy URLs in run metadata, result JSON, stage outputs, and provider-event
snapshots. It defaults to dry-run and supports `--apply` and `--run-id`; an
unreachable provider URL is retained as provenance and the UI renders an
expired/unavailable placeholder with regenerate or upload actions.
