# Implementation Plan

## Objective

Implement four independent episode-cover variants, route persisted cover choices
into episode previews, and fix the Remotion worker 404 caused by protected
storage URLs.

## Current-codebase fit

Use the existing `coverImage` JSONB field and shared cover helpers instead of a
new table. Keep the existing single-cover projection for list/assembly callers.
Extend the existing preview JSONB state with an optional cover slot ID. Reuse
the existing media broker and server-side storage adapter; do not weaken the
protected storage route.

## Workstreams

1. **Shared cover state and reference selection**
   - Add a four-slot variant envelope/parser/projector in `shared/verticalDramaSeries/episodeCover.ts`.
   - Preserve legacy single-state parsing and active/default cover projection.
   - Add seeded variant reference selection with requested scene-reference counts `[1, 2, 3, random(1..3)]`, model-capacity capping, and persisted strategy metadata.

2. **Cover router and preview routing**
   - Add optional `coverSlotId` to cover generation/status/upload procedures.
   - Isolate pending task, failure, replacement, and durable asset state per cover slot.
   - Add optional `coverSlotId` to preview state schema and assign a ready cover during `createEpisodePreview`.
   - Prefer unused cover slots and reuse randomly when the ready-cover set is smaller than preview slots.

3. **Worker asset boundary**
   - Resolve preview clip and cover references through the existing tenant-scoped broker before writing Remotion template/manifest URLs.
   - Ensure both template media layers and `assetManifest.sources` use the same worker-fetchable URLs.
   - Keep server-side `stageAsset`/duration probing on storage adapter reads.

4. **UI and verification**
   - Render four responsive cover cards with independent states/actions.
   - Keep shared model/logo controls and existing preview shot selection.
   - Show assigned cover slot on preview cards where useful.
   - Add focused shared, router/service, worker-boundary, and UI tests.

## Acceptance criteria

- Four cover slots render and can be generated independently.
- A retry of a slot can select a different reference set, while duplicate idempotency submissions remain stable.
- Legacy episode cover rows still render and can be used for preview creation.
- Preview creation persists a cover slot and uses that cover in the queued render.
- Four ready covers are distributed without reuse; fewer ready covers are reused only from the ready set.
- Protected clip/cover URLs are broker URLs in worker-facing preview input, and no worker-side 404 occurs for the known `media-jobs/assets` case.
- Focused tests and changed-file diagnostics pass.

## Risks and mitigations

- **Envelope compatibility:** centralize parsing and test both legacy and variant shapes.
- **Concurrent slot updates:** update only the requested slot and preserve other variant states in the JSONB envelope.
- **Reference capacity:** calculate available scene-reference capacity after logos and cap rather than submit an invalid request.
- **Worker URL expiry:** use the provider/worker broker TTL already defined for managed references; queue preview work immediately and preserve filename extensions.
- **Existing preview rows:** treat missing `coverSlotId` as active/default legacy cover.

## Rollout and verification

Run focused Vitest suites from `apps/web`, esbuild/transpile checks for touched
server files, changed-test formatting, and `git diff --check`. Restart the web
service after backend changes and perform one live preview retry for episode 140
to confirm the asset-stage 404 is gone.
