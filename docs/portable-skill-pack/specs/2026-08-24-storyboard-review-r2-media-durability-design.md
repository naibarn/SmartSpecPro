# Storyboard Review R2 Media Durability Design

Date: 2026-08-24
Status: approved for implementation

## Goal

Make `/storyboard-review` display only truthful image/video sources, handle expired
provider URLs without broken elements or dead links, and migrate historical media
reachable by Storyboard Review and Media History to owner-scoped Cloudflare R2.

## Authority and data flow

`media_assets` and `media_task_artifacts` remain the durability authorities. The
browser persists and receives `/api/storage/files/<key>` proxy URLs, not presigned
URLs. The storage proxy remains responsible for tenant/user authorization, Range
requests, ETag, and streaming.

Legacy data is reconciled in this order:

1. A ready owner-scoped R2 asset/object wins.
2. A provider URL may be copied to R2 only after owner/tenant scope, URL safety,
   successful download, MIME/size validation, and checksum are confirmed.
3. A provider URL remains a temporary fallback only while its availability is
   known and no durable copy exists.
4. Expired, missing, malformed, or ownerless media has no playback URL. Its
   provenance/status is retained for audit and user-facing recovery guidance.

## Storyboard Review contract

The server normalizes media embedded in `reviewData.tasks`, clips, output clips,
reference frames, companion audio, and final-composite assignments. It must not
invent ownership from a path or title. The returned projection contains a
canonical URL only for ready/fallback media and an availability status otherwise.
Save and migration paths may persist canonical replacements and status metadata;
ordinary reads must remain bounded and must not unexpectedly regenerate or charge.

## UI behavior

The project sidebar, history gallery, shot previews, and final-output controls use
the canonical projection. They render an image/video only when a playable URL is
present. On `provider_expired`, `r2_missing`, `storage_pending`, or malformed data,
they render a localized status card/placeholder and omit `<a href>`, download, and
external-open targets. Video uses the existing protected proxy and poster selection
from ready image media.

## Migration

The migration is dry-run by default and reports scanned, copied, already durable,
expired, missing owner, skipped, and failed records. It is idempotent by stable
owner-scoped key/checksum and updates database rows only after the R2 object exists.
It preserves provider provenance while changing playback fields to the R2 proxy.
Expired provider URLs are removed from playback fields but not silently deleted
from audit metadata. Unknown tenant/user ownership is quarantined in the report,
not guessed. Apply mode requires a recoverable database backup and remains a
separate operational action from local unit tests.

## Failure and recovery

An R2 outage must not turn a completed generation into a false provider failure.
The UI remains truthful and retryable. An expired provider asset is not silently
regenerated, and no credit is charged by reconciliation. A later explicit repair
or regeneration action may use the existing domain flow.

## Verification

Focused tests cover canonical precedence, expiry/no-link behavior, malformed
review payloads, tenant scoping, migration idempotency, and sidebar/gallery media
states. Browser evidence is required for production confidence at 390x844,
768x1024, and 1440x900; if unavailable, it is reported as an external gap rather
than inferred from unit tests.
