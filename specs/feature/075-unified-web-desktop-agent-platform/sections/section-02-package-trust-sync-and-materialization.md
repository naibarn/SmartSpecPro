# Section 02: Package Trust, Sync, and Materialization

## Ownership

This section owns the trusted package lifecycle for desktop-local execution.

## Target files and modules

- `apps/web/drizzle/schema.ts`
- `apps/web/server/routes/desktopHost.ts`
- `apps/web/server/services/desktopPackageRegistryService.ts`
- `apps/web/server/services/packageSigningService.ts`
- `apps/web/server/services/revocationFeedService.ts`
- `apps/web/server/services/skillFiles.ts`
- `apps/web/server/services/localAiSkillPolicy.ts`
- `apps/tauri-shell/src-tauri/src/package_sync.rs`
- `apps/tauri-shell/src-tauri/src/package_materializer.rs`
- `apps/tauri-shell/src-tauri/src/secret_store.rs`
- `apps/web/server/services/__tests__/desktopPackageRegistryService.test.ts`
- `apps/web/server/services/__tests__/packageSigningService.test.ts`

## Scope

- define package manifests that wrap current skill/agency bundle structure
- sign server-published packages
- expose compatibility and revocation metadata
- sync packages to desktop and materialize them into Pi-ready or Agency-ready local runtime artifacts
- enforce local-unverified versus org-verified behavior
- define provenance and trust propagation rules for outputs created by local-unverified and project-local packages

## Implementation notes

- treat current skill bundles and agency definitions as the inner payload, not the outer trust envelope
- required package metadata should include:
  - package id
  - version
  - package type
  - signer
  - trust class
  - compatibility range
  - capability manifest digest
  - payload digest
- materialization outputs should include:
  - local bundle path
  - runtime destination
  - resolved capability manifest
  - revocation freshness metadata
- local-unverified packages should never be synced from the server as implicitly trusted packages
- desktop must support quarantine and revocation before execution begins
- artifact metadata should carry signer, trust class, runtime, and device provenance whenever outputs flow back into shared surfaces

## TDD expectations

- add signature verification tests before download/materialization wiring
- add package compatibility and revocation tests before execution integration
- assert local-unverified packages cannot masquerade as signed org packages
- assert materializer fails closed on missing digest/signature/compatibility metadata
- assert trust-tainted outputs cannot silently publish into verified organization surfaces

## Acceptance checks

- signed packages can be published, downloaded, verified, and materialized
- revoked or incompatible packages do not materialize or execute
- current skill bundle contracts still work inside the new package model
- desktop can surface clear trust labels for built-in, org-verified, local-unverified, and project-local packages

## Risks and coordination notes

- do not invent a package shape that ignores current `skill.manifest.json`, schemas, and existing reviewed local-execution contracts
- keep signer and revocation design generic enough to support future runtime-support packs, not just skills

## Implementation status

- Implemented server-side trust lifecycle primitives in:
  - `apps/web/server/routes/desktopHost.ts`
  - `apps/web/server/services/packageSigningService.ts`
  - `apps/web/server/services/revocationFeedService.ts`
  - `apps/web/server/services/desktopPackageRegistryService.ts`
- Added Tauri package-sync and fail-closed materialization entrypoints in:
  - `apps/tauri-shell/src-tauri/src/package_sync.rs`
  - `apps/tauri-shell/src-tauri/src/package_materializer.rs`
  - `apps/tauri-shell/src-tauri/src/secret_store.rs`
- The registry service now:
  - builds signed skill-package envelopes around existing `skill.manifest.json` / reviewed-bundle structure
  - derives capability digests from `resolveEffectiveLocalSkillExecutionPolicy(...)`
  - rejects `local_unverified` and `project_local` trust classes for server-published packages
  - blocks materialization on signature mismatch, revocation, or compatibility failure
  - blocks silent promotion of trust-tainted outputs into verified organization surfaces
- Added TDD coverage in:
  - `apps/web/server/routes/desktopHost.test.ts`
  - `apps/web/server/services/__tests__/packageSigningService.test.ts`
  - `apps/web/server/services/__tests__/desktopPackageRegistryService.test.ts`
  - `apps/tauri-shell/src-tauri/tests/package_sync_tests.rs`
  - `apps/tauri-shell/src-tauri/tests/pi_runtime_tests.rs`

## Final status

- Section 02 is implemented end-to-end for the current governed desktop-host slice.
