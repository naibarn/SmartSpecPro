# Media display hardening design

## Goal

Make private/generated images render reliably in Feedback, Library, and the
Vertical Drama surfaces (character references, location references, start-frame
and storyboard references), while preventing new records from storing URLs that
expire or cannot be authorized later.

## Design

1. **One client media loader.** Reuse the existing authenticated blob-loading
   pattern as a generic `AuthenticatedMediaImage` component. Managed storage
   paths and bare storage keys are fetched with browser credentials and the
   desktop auth interceptor, then rendered from an object URL. Public external
   URLs remain direct image sources so CORS is not introduced for ordinary CDN
   media. Every failure renders an explicit missing-image state instead of a
   browser broken-image icon.

2. **Durable server contract.** New Library media-task imports and Vertical
   Drama imports persist only the app storage proxy URL after a successful copy.
   A provider URL is never used as a long-lived fallback. Existing managed URLs
   are normalized to `/api/storage/files/<key>` and are checked with
   `storageExists` before being exposed as usable media. Missing objects are
   marked `expired`/unavailable in the existing media asset ledger, preserving
   references and avoiding false-ready records.

3. **Backfill and repair.** Run the existing Vertical Drama backfill for the
   affected tenant and extend it to validate managed objects. Migrate reachable
   external/signed URLs into durable storage, rewrite embedded episode/series
   JSON, and report unrepairable records without deleting them or triggering a
   paid regeneration. Library records receive the same durable-URL and missing
   object treatment through a focused migration script.

4. **Regression coverage.** Add unit tests for URL normalization, missing
   managed-object handling, the no-provider-URL fallback, and the generic image
   loader. Add focused component coverage for Library and Vertical Drama image
   surfaces. Verify with `git diff --check`, focused Vitest suites, the web
   build, and authenticated runtime probes for representative assets.

## Trade-offs and safety

- Object URLs add a fetch before rendering, but close the desktop Bearer-token
  gap and give consistent error states.
- Missing files are not silently regenerated because regeneration may charge
  credits; the UI reports them and the migration report identifies them.
- Storage existence checks are performed during repair/backfill and on the
  Vertical Drama lazy repair path, not for every list row, to avoid making each
  page load perform one storage request per thumbnail.
- Existing tenant/user authorization remains enforced by the storage proxy and
  media-asset ownership checks.
