# P0 actual full-page workspace correction — 2026-10-30

## Delivery identity

- Source commit: `961f94291517e372281a1d46b4cc35dc2a6fc5ae` (`feat(workspace): replace modal-first development workspace entry`), pushed to `origin/main`.
- Development target: `https://aimarkethubs.com`; production `smartaihub.app` was not restarted or modified by this delivery.
- Runtime: `smartspec-dev-web.service` restarted successfully and reported checkout revision `961f94291517e372281a1d46b4cc35dc2a6fc5ae-dirty`. The `-dirty` suffix is from unrelated pre-existing checkout edits; the task-owned frontend source is the integrated commit above.

## What changed

- `/chat` now renders the full-page AppShell workspace directly: persistent Chat / Task Control / Mission Control navigation, a Project/Session/Thread sidebar, the main work area, and a contextual run inspector. It no longer composes the old full-screen chat modal as its main page.
- The floating assistant launcher unmounts on `/chat`, while remaining available on non-workspace routes.
- Task Control groups the observed canonical work records by project, shows lifecycle stages as recorded/unrecorded, and preserves the selected project in the URL. Mission Control filters the same observed execution records by Harness, Agent, and Runner and preserves selected execution IDs in the URL for direct links and refresh.
- The inspector now presents separate Overview, Activity, Terminal, Files, Diff, Tests, Artifacts, Usage, Receipts, and Verify views, with explicit empty states when the corresponding run evidence is absent.
- Existing conversation/session navigation is retained; direct Chat, Task Control, and Mission Control URLs return the single-page app shell and preserve the supplied conversation/thread parameters.
- SPEC-294 Section 63 documents this correction and its delivery boundaries.

## Verification

- Focused tests: 4 files, 75 tests passed:
  `pnpm --filter @smartspec/web exec vitest run client/src/pages/UnifiedWorkspace.test.tsx client/src/components/guardian/__tests__/RouteAwareFeedbackButton.test.tsx client/src/components/guardian/__tests__/FeedbackButton.test.tsx client/src/pages/__tests__/Chat.browserSession.test.tsx`
- `git diff --check` passed before integration.
- Vite client production-mode build passed with `✓ built in 3m 58s` using output directory `/tmp/smarthub-p0-workspace-build-20261030-1042`. Existing large-chunk warnings remain; the build is otherwise successful.
- Development restart passed its health and diagnostics permission-guard checks. Local `/healthz`, `/chat`, `/chat?mode=tasks&projectId=unassigned&c=9&t=task:abc`, and `/chat?mode=mission&c=9&t=task:abc` returned HTTP 200.
- The public development URL `https://aimarkethubs.com/chat?mode=mission&c=9&t=task%3Aabc` returned HTTP 200. The server-transformed `UnifiedWorkspace.tsx`, `RouteAwareFeedbackButton.tsx`, and `UnifiedWorkspaceInspector.tsx` modules each returned HTTP 200 and contained the integrated page structure, `/chat` modal guard, and distinct Usage/Receipts tabs.

## Acceptance and remaining work

`OWNER_UAT_PENDING`. These checks prove integration, build, restart, route delivery, and served source modules; they do not prove an authenticated human browser session, visual acceptance at desktop/mobile sizes, or a live Harness execution.

The work remains partial. Actual lifecycle stage/evidence population depends on canonical project and run records; Mission Control currently filters and opens observed Runs but does not add a new Harness-specific dispatch scheduler; interactive Browser controls remain outside this inspector correction. Continue with authenticated owner UAT, then close only those capabilities whose authorized data and execution paths are evidenced. SPEC-224 live acceptance remains separate.
