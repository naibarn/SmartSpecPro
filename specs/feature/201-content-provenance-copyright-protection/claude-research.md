# Deep-plan Research — Feature 201

Date: 2026-09-18
Research mode: codebase plus authoritative external references

## Research decision

- Codebase: required. This is an existing git monorepo with React/Vite, tRPC,
  Drizzle/PostgreSQL, a canonical `worker_jobs` plus outbox control plane, a
  Web Video Editor, and Vertical Drama assembly.
- Web topics: selected for the named watermark/provenance technologies:
  VideoSeal/PixelSeal image and video watermarking, PDQ perceptual image
  matching, and C2PA Content Credentials.
- Testing: Vitest for Web client/server TypeScript, Rust `cargo test` for the
  desktop Worker, and focused Playwright tests for authenticated UI routes.
  The repository's full Web typecheck is intentionally not run because
  AGENTS.md forbids it unless explicitly requested due to RAM constraints.

## Codebase findings (shell fallback)

SocratiCode MCP discovery was attempted but the current transport exposed no
`codebase_*` tools, so discovery used targeted `rg` and line-range reads. The
fallback is recorded here so future work does not mistake shell search for an
indexed graph audit.

### Runtime and navigation

- `apps/web/client/src/App.tsx` is the real Wouter route registry and uses lazy
  page imports plus `RequireAuth`.
- `packages/shared/src/constants/menu.ts` is the shared menu registry. Feature
  flags are filtered by `getMenuItemsByGroup`; a hidden menu item is not an auth
  boundary.
- `apps/web/client/src/pages/Dashboard.tsx` owns the current quick-action list
  and dashboard cards. `DashboardLayout.tsx` is not the active source of truth.
- `apps/web/client/src/pages/Settings.tsx` owns settings section navigation.

### Jobs and media

- `apps/web/server/routers/editorMediaJobs.ts` validates tenant-owned
  `media_asset` references and inserts the editor job into the canonical worker
  plane with idempotency and billing.
- `apps/web/server/services/editorMediaJobContract.ts` maps
  `video.render` to `editor_video_render` and carries plan/revision identity.
- `apps/worker-app/src-tauri/src/worker_executor.rs` and
  `media_pipeline.rs` implement the desktop render operation and are tested by
  Rust unit/integration tests.
- `apps/web/server/services/verticalDramaAssembly.ts` builds and persists the
  immutable assembly manifest and writes the final `compiledVideo` media asset.
- `apps/web/server/services/jobControlPlane.ts` and
  `worker_job_outbox` provide the required durable job admission and event
  sequence. New long-running protection work must use this plane.
- `apps/web/server/storage.ts` provides tenant-safe storage reads/writes and
  object metadata; raw provider URLs are not an acceptable provenance record.

### Existing gaps relevant to Feature 201

- No Feature-201 route, menu item, Dashboard quick link, Settings section,
  router, schema, worker operation, or final compound protection gate exists.
- Existing `mediaAssets.checksumSha256` and `perceptualHash` are useful source
  signals but do not represent an ownership watermark or an evidence chain.
- Presentation image watermark code is visible branding and must not be reused
  as an invisible ownership watermark implementation.

## External technical findings

### VideoSeal / PixelSeal

The official Meta research repository documents an image mode and a temporally
consistent video mode, including detection after embedding. It is a provider
boundary, not a reason to expose model codewords or signing material to the
browser. The implementation should select a versioned provider and fail closed
when the configured provider is unavailable, rather than report `Protected`.

Source: https://github.com/facebookresearch/videoseal

### PDQ

Meta's PDQ reference describes a perceptual image hash and a quality metric.
PDQ is a similarity/search signal, not cryptographic proof and not a substitute
for an invisible watermark or a signed manifest. Store algorithm/version,
quality, and threshold with each match.

Source: https://github.com/facebook/ThreatExchange/tree/main/pdq

### C2PA

C2PA manifests bind claims, assertions, ingredients, and a signature into a
tamper-evident provenance unit. A composed artifact can reference ingredient
manifests, and the specification supports creator control over whether
provenance is included. The app must therefore represent C2PA as provenance
evidence and trust status, never as a standalone legal ownership adjudication.

Source: https://spec.c2pa.org/specifications/specifications/2.1/specs/C2PA_Specification.html

## Decisions derived from research

1. Keep source identity, invisible watermark, fingerprint, C2PA, rights claims,
   and legal ownership language separate in both storage and UI.
2. Protect only the final bytes after all transforms. For a compound video,
   inputs are ingredients; the final compiled artifact receives the final video
   watermark and self-detection result.
3. Image and video use modality-specific provider contracts and evidence. An
   image watermark on a still frame never satisfies a video protection gate.
4. Keep provider secrets server/worker-side. Persist opaque IDs, hashes,
   algorithm versions, and safe failure codes only.
