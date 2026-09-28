# Protected media image delivery and cache design

## Goal

Restore fast, stable image rendering in Vertical Drama while preserving tenant-
scoped authorization for every protected media request.

## Current problem

`AuthenticatedMediaImage` performs a client-side `fetch()` for protected media,
buffers the complete response as a `Blob`, and only then renders an object URL.
This bypasses native image loading/lazy loading, disables browser reuse with
`cache: "no-store"`, and creates one application fetch for every mounted image.
The protected storage route also currently returns `private, no-store` without
conditional validators.

## Chosen design

1. Render protected media with a normal same-origin `<img>` whose `src` is the
   normalized `/api/storage/files/...` or `/uploads/...` path.
2. Keep server-side authorization unchanged: authenticate the session/token,
   resolve tenant and user identity, and run `canReadManagedStorageKey` before
   streaming any object. An unauthorized request continues to return `404`.
3. Add HTTP validators to the protected storage response using a stable object
   version (storage metadata where available, with a safe fallback). Use
   `private, max-age=0, must-revalidate` so browsers can retain the body but
   must revalidate with the server before reuse; authorization therefore remains
   on the validation request and no shared/public cache is introduced. When a
   validator is supplied, check object metadata before opening the body stream
   so a matching response can finish as `304` without reading the image bytes.
4. Preserve the Blob fetch helper only for explicit open/download flows where a
   caller needs a local object URL. It is not used for normal image display.
5. Preserve native `loading="lazy"`, `onError`, alt text, and existing fallback
   behavior.

## Alternatives rejected

- `public, max-age=...`: faster but unsafe for tenant-private media and can serve
  revoked content from a shared cache.
- Short-lived signed URLs/CDN: scalable for a later media edge architecture,
  but adds URL minting, expiry, refresh, and cache-key complexity to this fix.
- A client-side Blob cache: retains the extra fetch/buffering path and can grow
  memory independently of the browser's image cache.

## Failure and security behavior

- Missing/expired session or failed ownership lookup remains a media failure,
  not a public fallback.
- A failed image request renders the existing readable fallback and does not
  expose the storage key's contents.
- `304 Not Modified` is returned only after the same authorization boundary has
  passed.
- No durable media, database row, or user draft is deleted or rewritten.

## Verification

- Component tests prove protected images render a direct normalized `src`, do
  not fetch a Blob during display, preserve lazy loading, and still show errors.
- Server tests prove conditional requests cannot bypass tenant authorization and
  receive validators/cache headers after authorization.
- Run focused Vitest suites, `git diff --check`, and changed-file diagnostics.
