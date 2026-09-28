# Research notes

- Existing Admin surface: `apps/web/client/src/pages/AdminDesktopHost.tsx` and `DesktopReleasePanel` already provide admin-only release operations, upload, catalog, and refresh patterns.
- Existing storage: `apps/web/server/storage.ts` supports presigned upload, streamed download, and durable storage abstraction.
- Existing installer persistence: `desktopReleaseService.ts` creates a table at runtime and records storage keys, checksums, publication state, and actor data. Runtime artifacts should not be mixed into installer rows because runtime ids and manifest validation differ.
- Existing runtime endpoint: `apps/web/server/routes/workerRuntime.ts` currently scans release directories and enforces HyperFrames/Whisper/signature requirements. It needs a durable catalog path plus legacy fallback.
- Existing Worker App: `apps/worker-app/src/main.tsx` already has Runtime & agents Update/repair UI and fail-closed handling for manifest errors.
- Existing role policy: desktop release admin UI and API recognize multiple roles; this feature must narrow runtime mutations to `admin`.
- Existing release signing: `package-runtime-release.mjs` requires an external signature file and rejects placeholders. UI should upload only the resulting signed ZIP.
- Verification already available: Vitest route tests, Worker App TypeScript typecheck, and Rust runtime manifest tests.
- SocratiCode was not callable in this session; discovery used targeted `rg` and line-range reads as the repository fallback.
