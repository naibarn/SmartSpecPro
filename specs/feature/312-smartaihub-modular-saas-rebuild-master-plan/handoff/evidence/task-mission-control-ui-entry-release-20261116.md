# Task Control and Mission Control UI entry release

**Recorded:** 2026-11-16 (Asia/Bangkok)

**Platform source:** `smartaihub-platform/main` at `c58886fb7d8f0275dd14e8415331b6118cf97e6c`

**Target:** `modular-debian-dev` — `https://aimarkethubs.com`

## Change

- On the DEV host, the Chat sidebar's **Task Control** and **Mission Control** entries now open the corresponding interactive workbench instead of leaving the user in Chat or showing “Coming soon”.
- `/chat?view=tasks` opens the Task Control / Execution Workbench with synthetic Job fixtures and task-focused filters. `/chat?view=missions` opens the Mission Control fleet view.
- The workbench has an in-page switch between both areas and a **Back to Chat** action. The direct `/dev/mission-control-prototype` route remains supported.
- The preview is restricted to the DEV host and uses labeled synthetic data. It does not claim live execution state or issue backend mutations.

## Release and verification evidence

- The exact integrated Platform SHA above built Core, Shell and Chat using the registered immutable release builder and pinned pnpm 10.4.1. Core and Shell builds passed; Chat Vite build and Wrangler dry-run passed. Vite emitted its existing advisory about a minified Chat chunk above 500 kB.
- The registered `modular-debian-dev` controller returned `DEPLOYED_AND_VERIFIED` at `2026-11-15T23:34:29Z`. Core, Chat and Shell local health checks returned 200; public shell root/login, Chat health and module manifest returned 200; anonymous Chat session correctly returned 401.
- Public GET requests to `/chat?view=missions`, `/chat?view=tasks`, and both direct prototype URLs returned HTTP 200.
- Release receipt: `/home/dev/modular-development-releases/modular-debian-dev-c58886fb7d8f0275dd14e8415331b6118cf97e6c-task-mission-control-entry/release-manifest.json`.
- No legacy `smartaihub.app` release or Cloudflare production deployment was performed.

## Acceptance still open

The public route checks establish that the shell is served, not that an authenticated browser rendered and clicked the navigation. Complete normal-session browser UAT for both sidebar entries, area switching, Task execution details, Mission details, Back to Chat, and desktop/tablet/mobile layout. Keep live Mission/Task backend integration acceptance separate from this synthetic UX preview.
