# Section 07 — Mini-App Project Settings Navigation

- **Requirement IDs:** Project-Settings-UX
- **Objective:** Make `/miniapp/:appId/settings` show project settings as primary content with clear App and Development navigation rather than the Progress workspace.
- **Owned paths:** `apps/web/client/src/pages/MiniAppRoute.tsx` and its focused test.
- **Prerequisites:** Existing Astryx AppPage, buttons and project routes.
- **Deliverables:** Focused project settings view showing App ID, current/LKG version and repository state, with Open App and Back to Development actions.
- **Verification:** Focused MiniAppRoute test; no Progress tab or timeline in settings mode.
- **Completion predicate:** Settings route renders the dedicated view, preserves owner controls and retains links to the running App and development workspace.
- **Evidence:** Integrated Main SHA and focused Vitest result.

## Verified outcome

- Integrated at SmartSpecPro Main SHA `1064ba665c91e9c3c15699ce73a5321f868c3ba4`.
- `MiniAppRoute.test.tsx`: 13/13 passed, including the Settings-first navigation regression.
- Deployed in release generation 100 as `smartspec-web-1064ba665c91e9c3c15699ce73a5321f868c3ba4-8f841d13ed01` from exact Main SHA `1064ba665c91e9c3c15699ce73a5321f868c3ba4`.
- The release receipt reports `DEPLOYED_VERIFIED`; web and Node worker runtime revisions both match the pinned SHA, health is 200, and anonymous diagnostics remains 403. The App, status and settings URLs return the app HTML shell. Authenticated owner rendering was not browser-tested because no legitimate owner session is available here.
- No database migration was run as part of this release.
