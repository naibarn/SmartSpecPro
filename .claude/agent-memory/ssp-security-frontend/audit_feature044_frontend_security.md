---
name: audit_feature044_frontend_security
description: 2026-03-16 frontend security audit for branch codex/feature-044-multimodal-chat-memory — XSS, JWT storage, CORS, VITE_ secrets, auth guards
type: project
---

Audit of SmartSpecPro React frontend and LLM integration on branch codex/feature-044-multimodal-chat-memory.

**Date:** 2026-03-16

## Confirmed Findings

### CRITICAL — XSS (unsanitized LLM output rendered as HTML)
- `apps/web/client/src/components/workflow/execution/ExecutionLogPanel.tsx:592` — `MarkdownRenderer` calls a hand-rolled `renderMarkdown()` that HTML-escapes the input first, so basic entities are safe, but the markdown list-item regex (`$1` after entity encoding) allows re-introduction of angle brackets via the `<li>` wrapper. Not immediately exploitable via `<script>` but the custom renderer is not audited by a security library. **Recommend DOMPurify wrap on output.**

### CRITICAL — JWT/Auth token in localStorage (web browser fallback)
- `apps/web/client/src/services/authService.ts:44,67` — `localStorage.setItem('smartspec_auth_token', token)` is the non-Tauri fallback path. Token persists across sessions and is accessible to any JS on the page (XSS = full account takeover).
- `apps/web/client/src/_core/hooks/useAuth.ts:45` — `localStorage.setItem("smartspec-user-info", JSON.stringify(meQuery.data))` writes full user object (including email, is_admin flag) to localStorage on every auth state update.

### HIGH — All /admin/* routes unguarded at the client router level
- `apps/web/client/src/App.tsx:149–175` — 20+ `/admin/*` and `/domain-admin/*` routes are plain `<Route>` without a `<PrivateRoute>` wrapper. Individual page components do call `useAuth({ redirectOnUnauthenticated: true })` but this means a brief flash of admin UI is visible before redirect, and any component that omits the hook is fully exposed client-side.

### HIGH — CORS allows .smartspec.local and .smartspec.pro subdomains
- `apps/web/server/_core/index.ts:126` — `ALLOWED_SUFFIXES` includes `.smartspec.local` and `.smartspec.pro`. If any subdomain on those domains is compromised (or exists as a dev/staging environment), it gets full credentialed CORS access to production. `.smartspec.pro` in particular is a real TLD suffix and the production app is on `smartaihub.app`.

### HIGH — Prompt injection: user `topic` injected into LLM user message without delimiter
- `apps/web/server/services/aiPresentationService.ts:8930–8955` — `buildTopicToSlidesUserPrompt` interpolates raw `topic` (user-supplied) directly into a plain-text user message with no XML boundary markers or injection guards. An attacker can prefix their topic with `\n\nIgnore previous instructions...` or inject false Requirements sections.

### MEDIUM — SVG content from presentation data rendered without DOMPurify
- Multiple files: `CanvasObjects.tsx:289`, `SlideElementPreview.tsx:125`, `PresentationEditor.tsx:472`, `PresentationEditor.tsx:7895` — `element.svgContent` / `preview.inlineSvgContent` from the database is rendered via `dangerouslySetInnerHTML` after only a `currentColor` string replacement. No DOMPurify. If any SVG in the DB contains `<script>` or `onload=` it executes.

## Why:
- These were introduced as part of the Feature 044 multimodal chat/memory refactor that touched presentation canvas and auth hooks.
- The localStorage JWT issue predates Feature 044 but was confirmed present in this branch.

## How to apply:
- Flag these in every future PR touching authService.ts, App.tsx route definitions, or any dangerouslySetInnerHTML site in presentation canvas.
