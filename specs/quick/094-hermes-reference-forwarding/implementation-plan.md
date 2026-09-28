# Implementation plan

## Objective

Ensure the reference images visible in Vertical Drama are resolved to durable
media asset ids and forwarded to Grok via Hermes in the same order as the
prompt's Image-N mapping.

## Approach

1. Add failing tests for first-party URLs whose database storage key still
   contains `/api/storage/files/`.
2. Expand the repository lookup to compare normalized, prefixed, and exact
   first-party URL forms under the existing tenant/user boundary.
3. Add an opt-in fail-closed batch mode when any expected reference cannot be
   resolved.
4. Enable fail-closed mode for Vertical Drama start-frame image submissions
   that already computed non-empty reference lists.
5. Run focused service/router tests, TypeScript checking, and inspect a live
   queued job for non-zero references.
6. Hash current reference bytes before queueing, use the current checksum in
   the job contract, and repair missing or stale checksum metadata
   best-effort.

## Acceptance criteria

- Episode 113 shot 3 queues `image.edit`, not `image.generate`.
- The queued job contains three ordered references for the two characters and
  the location.
- A missing required reference returns a clear precondition error before a
  Worker job is created.
- Tenant/user isolation tests continue to pass.
- Generic optional references retain best-effort behavior.
- A stale `media_assets.checksumSha256` cannot cause a deterministic Worker
  mismatch; the queued contract uses the hash of the current object bytes.
