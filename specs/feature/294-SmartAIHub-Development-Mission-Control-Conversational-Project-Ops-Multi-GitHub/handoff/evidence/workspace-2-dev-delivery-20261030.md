# SmartAIHub Workspace 2.0 development delivery evidence

Observed: 2026-10-30 UTC. Canonical source commit: `092d284ee582237e43959b9b092b3547b7a5fd7d` (integrated on `refs/heads/main`; prior source SHA `ea3cc93872fa815379756e87515c67fe91de8f2a`).

## Source and focused checks

- Workspace 2.0 full-page Chat, Task Control, and Mission Control entry points are in the canonical source. The primary Chat route loads the new workspace; legacy Goal admission and browser flows remain reachable through `/chat-legacy`.
- Focused Vitest run: 7 files, 110 tests passed. Scope covered the new workspace, Chat/session navigation, Task Control, Mission Control, Runner model selection, and the task-observability read model.
- Production-mode Vite client build passed to `/tmp/sspro-workspace2-build-20261030-retry` with `NODE_OPTIONS=--max-old-space-size=8192`. The first build attempt hit Node's default 4 GiB heap limit; host memory was rechecked before retry. Existing large-chunk/dynamic-import warnings remain.
- `git diff --cached --check` passed before integration.

## Development runtime

- `pnpm run dev:web:restart` restarted only `smartspec-dev-web.service`; it reported a healthy web/API readiness result and source checkout `092d284ee582237e43959b9b092b3547b7a5fd7d`.
- Anonymous diagnostics guard returned HTTP 403, as required.
- `https://aimarkethubs.com/healthz`, `/`, `/chat`, `/chat?mode=tasks`, and `/chat?mode=mission` returned HTTP 200. These are transport/SPA-document checks, not proof of authenticated rendering.
- No production service or production deployment was changed.

## Browser acceptance and remaining gaps

- `pnpm run dev:web:verify` did not pass: its unrelated tenant Home/branding prerequisite returned HTTP 404 for the public Home API and two existing logo assets. The script stopped before its authenticated dashboard checks.
- A direct development Admin browser login attempt returned HTTP 401. Authenticated Chat/Task Control/Mission Control visual interaction, mobile layout, and screenshots therefore remain unverified; no owner UAT is claimed.
- No real active execution was available as evidence for populated live output or a full project lifecycle. UI stage facts remain explicitly `Not recorded` when the canonical task record does not report them. Multi-execution and Harness targeting still require owner UAT against authorized live records.
- This checkpoint does not complete SPEC-224: real Child 1/2 execution, receipts, settlement, automatic Child 2 continuation, and independent Final Verify remain outstanding.

## Follow-up: Dashboard modal still exposed legacy control surfaces

- Root cause: the Dashboard assistant modal is rendered by `FeedbackButton`. Its Task Control and Mission Control tabs mounted `UniversalControlPlanePanel` and `TaskObservabilityMonitor` directly, so navigating from Dashboard never entered the new `/chat?mode=tasks|mission` Workspace routes. The full-page implementation existed, but the primary dashboard entry point still presented the old UI.
- First repair: Task Control and Mission Control tabs open their full-page Workspace route while preserving the selected conversation and thread. The Chat modal has an explicit `เปิด Workspace เต็มหน้า` action. The legacy Goal-admission panel remains available at `/chat-legacy`. Integrated as `a2315356f6c187a66100f964da984ad69513b7d7`; dev service restarted and reported healthy at that revision.
- User clarification: the Chat modal itself must retain full Chat capability, with only panels collapsed by default. Do not fork Chat behavior or make Chat use require leaving the modal.
- Follow-up implementation: full Chat and modal now mount the same `UnifiedChatSurface` and `ChatView`; modal mode starts with session history and the execution inspector collapsed and exposes controls to expand them. Full-page mode starts expanded. Chat content, tools, thread/session navigation, execution activity, and inspector implementation are shared.
- Focused verification after this follow-up: `vitest run client/src/components/guardian/__tests__/FeedbackButton.test.tsx client/src/pages/UnifiedWorkspace.test.tsx client/src/pages/__tests__/Chat.browserSession.test.tsx` passed (66 tests).
- Shared-surface follow-up integrated as `661670185e9a376abe9f3d1bda6e2cac6fd5d192`; `pnpm run dev:web:restart` reported healthy at that exact checkout. `dev:web:status` showed the dev web service and aimarkethubs Cloudflare tunnel active; local and `https://aimarkethubs.com/chat` returned HTTP 200. The Vite module served by `aimarkethubs.com` contains `UnifiedChatSurface` and the expand/collapse controls.
- Authenticated browser visual verification remains unavailable from the prior login `401`; no production deployment or authenticated UI acceptance is claimed. `smartaihub.app` remains on its separate production deployment.
