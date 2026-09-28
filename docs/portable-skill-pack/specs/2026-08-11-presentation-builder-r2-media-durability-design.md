# Presentation Builder R2 Media Durability Design

## Goal

Make generated Presentation Builder images and videos durable in Cloudflare R2 before they are persisted or exposed to the editor. Remove browser-visible failures caused by server-only runtime globals, including `__dirname is not defined`, and prevent the builder from starting all media jobs at once.

## Scope

- Image and video generation in the Presentation Builder and its server-side slide generation services.
- Existing presentation media task polling and completion persistence.
- Text-only slot states for unavailable, expired, or failed media.
- A safe backfill path for legacy presentation media whose provider URL is still reachable.
- Focused regression tests for durability, polling, and bounded media scheduling.

Audio generation and unrelated presentation import/export behavior remain unchanged.

## Proposed flow

1. The server creates or polls a media task through the shared task boundary.
2. When the provider reports a terminal result, the server downloads the provider URL to a temporary file/stream.
3. The server uploads the file to R2 using an idempotent presentation-scoped key and persists/returns only the managed storage URL.
4. Slide/job records retain media type, task identity, and durable URL metadata so retries do not create duplicate objects.
5. The builder schedules media work with a small bounded concurrency (default one per slide-generation batch) and preserves per-slot status instead of failing the whole batch when one asset fails.
6. The client renders durable media URLs. A missing, expired, or unavailable URL is represented by a text-only placeholder with a retry/regenerate action; provider URLs are never silently retained as permanent data.

## Runtime boundary

Presentation server services must not be imported into client bundles. Filesystem path resolution and `__dirname` usage stay server-only; browser-facing modules receive URLs/data through tRPC responses or plain shared contracts.

## Failure handling

- If provider polling fails, the slot becomes `failed` with a user-safe message and retry option.
- If provider output is no longer reachable, the slot becomes `expired`/`unavailable` and displays text only.
- If R2 is not configured, new generated media fails explicitly instead of persisting a temporary URL.
- Backfill defaults to dry-run and only applies when database and R2 configuration are present.

## Verification

- Unit tests for provider URL to R2 ingestion, idempotency, and managed URL output.
- Router/service tests proving completed presentation media never persists a provider URL.
- Tests proving media generation is sequential or bounded by the configured concurrency and a failed slot does not erase successful slots.
- Client tests for text-only unavailable/expired slot rendering.
- `git diff --check` and focused presentation test commands; repository-wide diagnostics remain separately reported.
