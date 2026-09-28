# Decision Log

## Depth

Use standard quick-plan depth: the change crosses presentation server services, shared slide JSON state, and the builder UI, but does not require a new database table or external service.

## Decisions

1. Reuse the existing server-side R2 download/upload primitives and add a presentation-scoped durability wrapper rather than persisting provider URLs.
2. Keep polling server-side and return only managed URLs for completed image/video slots.
3. Use sequential media processing by default for the builder batch (`concurrency = 1`), preserving per-slot failures and successful slots.
4. Keep legacy unreachable provider URLs as unavailable text-only slots; backfill only reachable URLs and default the command to dry-run.
5. Treat `__dirname is not defined` as a presentation runtime-boundary bug: server-only path resolution must use ESM-safe `import.meta.url` equivalents, and errors crossing tRPC must be sanitized and actionable.

## Risks

- Provider downloads can be large or slow; reuse existing size/time limits and always remove temporary files.
- R2 configuration may be missing in local shells; tests must mock storage and production backfill must fail safely without claiming completion.
- A failed media slot must not invalidate otherwise importable slide JSON.
