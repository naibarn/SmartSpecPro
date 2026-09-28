# Vertical Drama Video Asset URL Reliability Design

## Status

Approved by the user on 2026-08-08 for implementation.

## Problem

Completed Vertical Drama video clips are stored as durable `media_assets` and
Worker artifacts, but the episode JSONB can retain a one-hour R2 signed URL in
`motionPromptPack.clips[].videoTask.videoUrl`. After expiry, the clip remains
visible in the storyboard but playback and download fail with
`403 ExpiredRequest`.

Observed evidence for episode 143:

- shot 3 maps to media asset 1296, `video/mp4`, 5,011,382 bytes;
- shot 4 maps to media asset 1297, `video/mp4`, 5,475,097 bytes;
- both Worker jobs completed successfully;
- the persisted signed URLs expired, while a newly minted Storage URL returned
  the original MP4 bytes successfully.

## Goals

1. Make completed generated clips reference a durable `mediaAssetId`.
2. Ensure new clips use an app Storage proxy or another non-expiring canonical
   URL in episode JSONB, never a provider signed query string.
3. Repair legacy worker-artifact URLs on episode read, including shots 3 and 4,
   without regenerating or charging credits.
4. Keep playback, download, episode assembly, and existing upload clips working.
5. Preserve tenant/user ownership checks for every asset lookup.

## Non-goals

- Do not regenerate existing video files.
- Do not change provider/model selection or video prompts.
- Do not add a separate public download service when the existing Storage proxy
  can serve the canonical object.
- Do not rewrite unrelated dirty-worktree changes.

## Recommended design

### Durable task contract

Add optional `mediaAssetId` to the shared `videoTask` contract. The field is
backward compatible with old JSONB rows and uploads. Hermes task projection
will expose the completed asset id in task result metadata; the episode page
will pass it through `persistVideoClipTask`.

The persisted generated task will retain `videoUrl` for compatibility, but it
will be normalized to `/api/storage/files/<storage-key>` whenever the source is
a managed Worker artifact. `mediaAssetId` is the authoritative identity;
`videoUrl` is a resolved delivery path.

### Legacy repair and response normalization

Add a server-side helper that:

1. finds generated clip URLs containing `/worker-artifacts/`;
2. extracts the storage key without trusting query parameters;
3. verifies the matching `media_assets` row belongs to the current tenant and
   user;
4. adds `mediaAssetId` and replaces the URL with the Storage proxy path;
5. leaves provider URLs and user uploads unchanged.

`getEpisodeDetail` will apply this repair to the response when a safe,
deterministic repair is found. The read path deliberately does not write the
whole JSONB pack back: doing so could overwrite a simultaneous completion of a
different clip. New completions persist the durable id immediately; legacy
rows are repaired on every read without creating credits or new media. If the
asset row is missing, the clip remains visible with its existing URL and the
client shows the existing failure behavior rather than fabricating a URL.

### Playback and download

The existing storyboard `<video>` and download helper will consume the
canonical proxy path. The current download flow already supports same-origin
Storage URLs, so no new endpoint is required. The proxy remains responsible
for fresh backend-to-R2 access and range requests.

### Assembly compatibility

`normalizeVerticalDramaStoredAssetUrl` remains the final defense for assembly
and server-side downloads. It will also accept the new `mediaAssetId`-backed
proxy path without changing existing provider/upload behavior.

## Data flow

```text
Hermes worker completes
  -> worker outputJson.mediaAssetId
  -> getTask exposes mediaAssetId + canonical result URL
  -> episode page persists { mediaAssetId, videoUrl: /api/storage/files/... }
  -> getEpisodeDetail repairs old signed worker URLs when safe
  -> storyboard playback/download/assembly use canonical proxy path
```

## Failure handling and security

- All media asset queries remain scoped by tenant id and user id.
- Signed URL query strings are never persisted after this change.
- A missing/deleted asset does not fall back to another user's object or an
  unverified storage key.
- Repair failures are non-fatal to episode loading and leave the original
  clip state available for diagnosis.
- Upload clips remain URL-based because they may not have a managed asset row.

## Testing plan

### Server

- unit-test URL normalization for signed Worker URLs, proxy URLs, uploads, and
  unrelated provider URLs;
- unit-test legacy repair with owned, foreign, missing, and malformed assets;
- test Hermes completed-task projection includes the asset id;
- test `persistVideoClipTask` accepts and preserves `mediaAssetId`;
- test episode detail repair is idempotent and does not alter unrelated clips.

### Client

- test completed polling persists the asset id;
- test download receives a same-origin canonical URL and does not use an
  expired external signed URL;
- preserve existing upload and pending-task tests.

### Verification

- run focused server and client tests;
- run `pnpm check` for the touched TypeScript surface;
- run `git diff --check`;
- perform a read-only DB/storage verification for episode 143 assets 1296/1297;
- record browser verification status for playback and download if a local app
  session is available.

## Rollout and migration

No relational migration is required because `videoTask` is JSONB and the new
field is optional. Existing rows are repaired lazily in the episode response.
New generation writes use the canonical contract immediately. A later bulk
repair job is optional and not required for correctness of the active episode
page; avoiding a read-path JSONB write also prevents concurrent clip
completions from being overwritten.

## Trade-offs

Using the existing Storage proxy adds a backend hop but removes URL expiry from
episode state and centralizes authorization. Lazy repair avoids a destructive
or expensive bulk migration, while rows that are never opened remain unchanged
until needed.
