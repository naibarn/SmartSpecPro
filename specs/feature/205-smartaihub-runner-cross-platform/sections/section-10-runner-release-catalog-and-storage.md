# Section 10 — Runner Release Catalog and Storage

## Goal

Create a release model dedicated to SmartAIHub Runner packages and raw update
binaries. Expose a validated SmartAIHub-owned catalog and same-origin download
routes without reusing Worker App releases, Worker runtime packs or the
Windows-only `worker_runtime_runner_artifacts` table.

## Ownership and files

Create or modify only these owned paths:

- `apps/web/shared/runnerReleases.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0336_runner_release_assets.sql`
- `apps/web/server/services/runnerReleaseService.ts`
- `apps/web/server/routes/runnerReleases.ts`
- `apps/web/server/_core/index.ts`
- `apps/web/server/services/__tests__/runnerReleaseCatalog.test.ts`
- `apps/web/server/routes/__tests__/runnerReleases.test.ts`

## Contract

Define platform values `windows`, `macos`, `linux`, `container`; architectures
`x64`, `arm64`, `multi`; profiles `local_device` and `shared_container`;
channels `stable`, `beta`, `nightly`; and asset kinds `package`,
`update_binary`, `manifest` and `checksums`.

The release asset table must contain version, platform, architecture, profile,
channel, asset kind, safe filename/content type, storage key, byte size,
SHA-256, manifest JSON, signature/key metadata, source commit, contract
version, release notes, validation state/checks and publication timestamps.
The unique identity is `(version, platform, architecture, profile, channel,
assetKind)`; storage key and SHA-256 are separately unique where the storage
provider permits it.

The public catalog returns only published valid assets and SmartAIHub relative
download paths. `latest` groups the compatible package and update binary for a
requested platform/architecture/channel. Admin catalog responses may include
validation/provenance fields but still must not expose GitHub tokens.

## TDD steps

1. Add Zod schemas and service tests for valid asset identity, duplicate
   identity rejection, incompatible platform/profile rejection and latest
   grouping.
2. Run the focused Vitest server test and observe the expected missing export
   or table failure.
3. Add the Drizzle table and numbered migration with a rollback SQL comment in
   the migration documentation; preserve the existing worker release tables.
4. Implement storage-key sanitization, hash recomputation, manifest validation,
   upload persistence, publication filtering and latest grouping.
5. Implement catalog/download routes with public read filtering, admin writes,
   range-aware streaming, safe headers and explicit 404/503 behavior.
6. Add route tests for published/unpublished visibility, withdrawn assets,
   malformed ids, download headers and storage-missing behavior.
7. Run the two focused test files and `git diff --check`.

## Security and acceptance

- Normal users never receive repository, workflow or external storage URLs.
- Hashes are recomputed from stored bytes; client declarations are advisory.
- Withdrawn/invalid/unpublished assets are not downloadable by normal users.
- Platform and architecture filters cannot return an incompatible binary.
- The route is registered once under `/api/runner-releases` and does not change
  Worker App or Worker runtime route semantics.

## UI/UX Contract

N/A for this storage/API-only section. Section 13 consumes the typed catalog.
