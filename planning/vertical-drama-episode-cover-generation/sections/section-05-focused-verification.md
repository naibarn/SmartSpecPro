# Section 05: Focused Verification

## Depends on

Sections 01 through 04.

## Verification commands

Run the exact changed-file tests first, then the nearest projection/UI tests:

```bash
pnpm --dir apps/web exec vitest run \
  shared/verticalDramaSeries/episodeCover.test.ts \
  server/services/__tests__/verticalDramaEpisodeCover.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.episodeCover.test.ts
pnpm --dir apps/web exec tsc --noEmit
git diff --check -- \
  apps/web/drizzle/schema.ts \
  apps/web/drizzle/manual_vertical_drama_episode_cover_image.sql \
  apps/web/shared/verticalDramaSeries/episodeCover.ts \
  apps/web/server/services/verticalDramaEpisodeCover.ts \
  apps/web/server/routers/verticalDramaEpisodes.ts \
  apps/web/server/routers/verticalDramaSeries.ts \
  apps/web/client/src/pages/VerticalDramaSeriesDetailPage.tsx
```

Use the repository's existing `JWT_SECRET` test convention if the shell does not supply it. Do not invoke live paid generation.

## Security/correctness checklist

Inspect the final diff for ownership predicates, safe projection stripping, client-controlled reference URLs, foreign/non-image uploads, duplicate credit/provider calls, stale task overwrite, polling cleanup, and nested interactive controls. Confirm only the approved feature files changed; do not stage or reset unrelated dirty work.

## Browser evidence

If a local browser harness is available, exercise no-cover, model selection memory, generating/reload, ready/lightbox/download, failed/retry, drag-over/file picker, read-only, and narrow viewport states. Record the route and observed evidence. If unavailable, explicitly record that limitation and rely on focused tests/typecheck.

## Baseline separation

If the full or focused TypeScript check reports pre-existing errors in unrelated dirty files, capture the exact output and separate it from changed-file/test results. Do not broaden the patch to clean unrelated work.

## Completion proof

The feature is complete only when focused tests, diff hygiene, ownership/security review, and either browser evidence or a documented harness limitation are recorded.

## UI/UX Contract

This section records the final visual verification gate.

### Target User / JTBD

The user must be able to complete generation, monitoring, preview, download, and replacement without losing episode navigation.

### Surface Inventory

Toolbar model picker, card states, async status, lightbox/download, drag/drop/file picker, errors, and read-only view.

### Component Map

Verify the components and existing card/link boundary described in section 04.

### State Matrix

Verify no-cover, generating, ready, failed, read-only, catalog error, and upload error independently.

### Responsive Matrix

Verify both existing two-column desktop/tablet layout and one-column narrow layout, including wrapped controls.

### Accessibility Acceptance

Verify labels, keyboard file selection, focusable navigation, busy/status announcement, and no nested interactive elements.

### Copy Contract

Verify Thai action/status labels and confirm no extra prompt text or image overlay was introduced.

### Browser Evidence Required

Record route, viewport, state, and result for each available browser pass; if unavailable, state the harness limitation and attach focused test/typecheck evidence.
