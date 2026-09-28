# Document Management: Add Image/Video to Public Gallery

Date: 2026-08-27  
Status: Approved for implementation

## Goal

Allow an admin to publish an image or video selected in Document Management to
the tenant's public Gallery using a stable application URL that does not expose
an expiring signed or provider URL.

## Scope

- Add an `Add to Gallery` action to the selected media preview in
  `DocumentPreviewPanel`.
- Show the action only when the authenticated user has the exact `admin` role
  and the selected Library item is an image or video.
- Keep PDF, DOCX, audio, Markdown, code, folders, and other Library items out
  of this workflow.
- Reuse the existing Library-to-Gallery link and publication service so repeat
  clicks update the existing Gallery item instead of creating duplicates.
- Return/use `/api/gallery/media/{galleryItemId}/file` as the stable public
  media URL. The URL is backed by the stored object key and is not a signed URL.

## Current codebase fit

The repository already contains `publishLibraryItemToGallery`, Gallery link
records through `library_links`, and a public Gallery media route. The missing
work is wiring the service through the Library router and preview UI, then
aligning the service with the admin-only and `fileKey`/public-route contract.

## Architecture and data flow

1. Document Management derives the selected item from the existing Library
   query and renders the action only for an admin and image/video preview.
2. The client calls a Library mutation with only `itemId`; it never submits a
   source URL from the browser.
3. The server resolves the item with tenant scope, rejects deleted/private-vault
   items, requires the exact `admin` role, and accepts only image/video items
   backed by a managed storage key.
4. The server creates or updates the linked `gallery_items` row with
   `fileKey` (and `thumbnailKey` when available), marks it published, and keeps
   the existing `library_links` relation idempotent.
5. The client reports success and can expose the returned stable Gallery media
   URL. Public Gallery rendering continues to resolve media through the public
   Gallery route, including byte-range video playback.

## Public URL contract

`/api/storage/files/...` and signed/provider URLs are not public Gallery
contracts. Gallery rows must carry the managed storage key, while public
consumers use `/api/gallery/media/{id}/file` (and `/thumbnail` when needed).
The route performs the published-item and tenant checks before streaming the
object. The Library item must have a durable managed key; a missing key is a
truthful failure rather than a fallback to an expiring external URL.

## Authorization and safety

- UI visibility: `user.role === "admin"` and selected item type is image/video.
- Server authorization: repeat the exact admin check; client gating is not a
  security boundary.
- Resolve the Library item using the current tenant and exclude deleted items.
- Reject private-vault items and items without a managed storage key.
- Do not expose source URLs, provider credentials, or signed URLs in the
  mutation contract.
- Keep the existing tenant-aware public Gallery route and link cleanup behavior.

## UI states and copy

- Eligible idle: `Add to Gallery`.
- Pending: disabled action with loading indicator.
- Success: localized toast and returned stable public media URL.
- Unsupported/non-admin: no action rendered.
- Missing durable storage or server failure: localized error toast; no Gallery
  row is reported as created.
- Add English and Thai strings under the existing `documentManagement` scope.

## Testing and verification

- Service/router tests: admin success, non-admin rejection, tenant isolation,
  image/video acceptance, document/audio rejection, missing managed key
  rejection, and idempotent update.
- UI tests: admin sees/can invoke the action for image/video; non-admin and
  unsupported items do not see it; pending/success wiring is preserved.
- Public route tests: returned Gallery row resolves through the stable route
  and does not require a session or signed URL.
- Run focused Vitest suites, targeted TypeScript diagnostics/typecheck, and
  `git diff --check`.
- Browser, deployment, and production-storage verification remain separate
  checks and must not be claimed from local tests.

## Non-goals

- Publishing generic documents or audio to the Gallery.
- Changing public Gallery layout, search, or filtering.
- Making private Library files generally public without an explicit Gallery
  publication action.
- Adding a new database table or changing the storage provider.
