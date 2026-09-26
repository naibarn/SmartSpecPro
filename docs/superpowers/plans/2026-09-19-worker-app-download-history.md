# Worker App Download History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a safe, target-aware history of at least ten older Worker App installer versions to the Dashboard while preserving the current latest release contract.

**Architecture:** Extend the existing desktop release route with a shared Worker App candidate resolver that merges published catalog assets and static release files, sorts by the existing version comparator, deduplicates versions, and resolves exact-version downloads. Add a small history fetch/render path to the existing `DesktopReleasePanel`, reusing its current accordion and download styling.

**Tech Stack:** Express, TypeScript, Zod-backed desktop release services, React, Radix/shadcn Accordion, Vitest, existing dashboard i18n JSON.

**Spec:** `docs/portable-skill-pack/specs/2026-09-19-worker-app-download-history-design.md`

## Global Constraints

- Preserve the existing `/api/desktop-releases/worker-app/latest` response shape and latest download behavior.
- Public history must include published releases only and must resolve requested versions through an allowlist, never a user-controlled filesystem path.
- Return up to ten older versions after the latest; if fewer exist, return all available.
- Keep Windows x64 and macOS arm64 target validation unchanged.
- Do not run `npm run typecheck` or any repository typecheck command unless explicitly requested.
- Preserve unrelated dirty-worktree changes.

## Review Focus

- Duplicate assets for one version: one deterministic history row and one matching download target.
- Unknown or traversal-like version query: 404 without reading an arbitrary path.
- Published database assets mixed with static installers: both are downloadable through the same exact-version route.
- Unsupported target query: existing 400 validation remains intact.
- Dashboard loading/error/empty history: latest download remains usable and panel is collapsed by default.

### Task 1: Backend Worker App history and exact-version download

**Files:**
- Modify: `apps/web/server/routes/desktopReleases.ts`
- Test: `apps/web/server/routes/__tests__/desktopReleases.companionExtension.test.ts`

**Interfaces:**
- Produces `GET /worker-app/history` with `{ generatedAt, latest, history }` and accepts `version` on `/worker-app/download`.
- Reuses `workerAppTargetFromRequest`, `compareDesktopReleaseVersions`, `listPublicDashboardReleases`, and published `listDesktopReleaseCatalog`.

- [x] **Step 1: Write failing route tests** for ten older static versions, exact-version selection, unknown version 404, and history route registration/shape.
- [x] **Step 2: Run the focused server test** and confirm the new assertions fail because the history route and version selector do not exist.
- [x] **Step 3: Implement the shared candidate resolver** with deterministic sorting/deduplication and a ten-item history slice; keep `/latest` mapped to the first candidate.
- [x] **Step 4: Add exact-version selection** to the download route using the resolved candidate list and return 404 when no exact match exists.
- [x] **Step 5: Run the focused server test** and confirm all route assertions pass.

### Task 2: Dashboard history state, panel, and translations

**Files:**
- Modify: `apps/web/client/src/features/desktop-releases/DesktopReleasePanel.tsx`
- Modify: `apps/web/client/src/features/desktop-releases/__tests__/DesktopReleasePanel.test.tsx`
- Modify: `apps/web/client/src/locales/en/dashboard.json`
- Modify: `apps/web/client/src/locales/th/dashboard.json`

**Interfaces:**
- Consumes the Task 1 history response at `/api/desktop-releases/worker-app/history` for Windows and macOS targets.
- Produces collapsed-by-default accessible history panels with per-row download links.

- [x] **Step 1: Write failing UI tests** for collapsed initial state, expansion, ten rows, and exact version download href.
- [x] **Step 2: Run the focused UI test** and confirm it fails because history is not fetched/rendered.
- [x] **Step 3: Add a cancellable history hook** and render the panel below each applicable installer card without changing latest card behavior.
- [x] **Step 4: Add English and Thai labels** for history, row metadata, and empty/error/loading states.
- [x] **Step 5: Run the focused UI test** and confirm it passes.

### Task 3: Integrated verification and build

**Files:**
- Review only: files changed in Tasks 1–2.

- [x] **Step 1:** Run both focused Vitest files together.
- [x] **Step 2:** Run `git diff --check` and inspect the owned diff for accidental changes or stale route assumptions.
- [x] **Step 3:** Run the existing web build command (`npm run build` from `apps/web`) and record the exit code and output.
- [x] **Step 4:** Re-run the focused tests after any build-induced/generated-file check and report browser/Windows proof boundaries explicitly.
