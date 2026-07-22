# Research notes

Production evidence:
- Worker job `3487f6bb-b7c2-444b-9574-4e3cc7502f72` for episode 113, shot 3
  completed as `image.generate` with `references=[]`.
- Its prompt declared three inputs: character assets 200 and 219 and location
  asset 233.
- Those assets have `storageKey` and `originalUrl` values beginning with
  `/api/storage/files/`.
- `resolveHermesReferenceAssetIdFromUrl` strips that prefix and only compares
  the stripped value to `media_assets.storageKey`, so all three lookups miss.

Relevant modules:
- `apps/web/server/services/hermesMediaReferences.ts`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- their focused Vitest suites

Security boundary:
- Resolution must remain scoped by tenant and user.
- Worker jobs continue to store durable asset ids and checksums, not URLs.

