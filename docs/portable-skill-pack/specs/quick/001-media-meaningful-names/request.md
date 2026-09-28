# Request

## Task

For newly created image/video media, replace repeated technical names such as `remotion_render_mp4` with meaningful names derived at the source. Use the same name in Media History, Library, public Gallery, and download responses. Do not rename historical media or internal artifact/storage identifiers.

## Repository assumptions

- Gallery already stores a searchable `title` and `description`.
- Media History currently uses the raw task prompt when publishing to Gallery.
- Vertical Drama tasks already carry series/episode/shot/clip provenance in task parameters or worker display metadata, but not consistently as a user-facing name.
- Public Gallery media is streamed by an Express route and must keep normal playback/range requests working.

## Constraints

- Use the existing npm workspace and TypeScript/Vitest setup.
- Preserve unrelated dirty worktree changes.
- Keep app-only naming metadata out of provider prompt semantics.
- No database backfill or historical rename.

## Success criteria

- New Vertical Drama assets use a title such as `คาเฟ่รักในเวทีพิเศษ ตอนที่ 29-1`.
- The corresponding download uses the same meaningful stem and the correct extension.
- Generic image/video jobs have a useful prompt/title fallback and do not default to the model ID.
- Existing worker contracts, artifact type, storage key, playback, and tenant/public access remain compatible.
