---
name: audit_feature044_orchestrator_multimodal
description: 2026-03-18 frontend security audit — orchestrator SSE, guardian, agency preview, automation browser, help renderer, authService localStorage token storage
type: project
---

# Frontend Security Audit — 2026-03-18

**Branch:** codex/feature-044-multimodal-chat-memory
**Scope:** 32 components changed in last 5 days (orchestrator UI, guardian, agency preview, automation browser, help, personas, settings)

## Critical Findings

### FE-C1 — JWT stored in localStorage (authService.ts)
`apps/web/client/src/services/authService.ts:44,67`
- `localStorage.setItem('smartspec_auth_token', token)` — browser-context fallback when Tauri is not available
- `localStorage.getItem('smartspec_auth_token')` on read
- User data including email/role also stored: `localStorage.setItem('smartspec_user_data', JSON.stringify(user))`
- All LLM provider API keys fall back to `sessionStorage` (lower risk but still client-accessible)
- **Why CRITICAL**: Entire auth session is XSS-extractable. Any script injection anywhere on the page can steal the token and impersonate the user indefinitely.

### FE-C2 — XSS via unsanitized HTML in TextContentPreviewContent.tsx
`apps/web/client/src/components/agency/preview/TextContentPreviewContent.tsx:67,83`
- When `data.format === "html"` the raw server-supplied `data.content` string is passed directly to `dangerouslySetInnerHTML`: `if (data.format === "html") return data.content;`
- The `renderMarkdown()` function correctly HTML-escapes text input first, but the `"html"` branch completely bypasses it.
- An agency run that produces `format: "html"` content containing `<script>` or `<img onerror=...>` will execute in the user's browser.
- **Why CRITICAL**: Agency output is LLM-generated and could be influenced by prompt injection from external data sources processed by an agent run.

## High Findings

### FE-H1 — CSRF gap: raw fetch() POST for feedback file upload (FeedbackButton.tsx)
`apps/web/client/src/components/guardian/FeedbackButton.tsx:64`
- `fetch("/api/feedback/upload", { method: "POST", body: formData, credentials: "include" })` — state-changing mutation using raw fetch rather than tRPC client.
- No CSRF token is included in the request. The endpoint relies on the session cookie which is sent automatically by `credentials: "include"`.
- If the backend for `/api/feedback/upload` is an Express route without CSRF middleware, this is exploitable via a cross-origin form submission.
- **Recommendation**: Move the upload to a tRPC mutation or add a CSRF token header (`X-CSRF-Token`) from a cookie-synced value.

### FE-H2 — HelpTopicRenderer: `ALLOWED_ATTR` includes `href` without protocol allow-list
`apps/web/client/src/components/help/HelpTopicRenderer.tsx:18`
- DOMPurify is correctly used and `ALLOWED_TAGS` is appropriately restricted.
- However, `ALLOWED_ATTR` includes `href` and `src` without a `FORCE_HTTPS` or `ALLOWED_URI_REGEXP` configuration.
- DOMPurify by default strips `javascript:` URIs so the direct XSS vector is blocked, but `data:` URIs on `<img src="data:...">` are permitted and can be used for CSP bypass/phishing or to leak navigation context.
- **Recommendation**: Add `ALLOWED_URI_REGEXP: /^(https?:|mailto:|#)/i` and `FORBID_ATTR: ['data-*']` to the DOMPurify config.

### FE-H3 — Unguarded `/admin/system-guardian` route accessible via direct navigation before auth resolves
`apps/web/client/src/pages/AdminSystemGuardian.tsx` / `apps/web/client/src/App.tsx:269-271`
- The route IS wrapped in `<RequireAdmin>` in App.tsx (confirmed). **No finding here.**
- However, `AdminSystemGuardian` page renders immediately on mount before the `statsQuery` / `incidentsQuery` tRPC calls resolve. If `RequireAdmin` has a race condition where it renders children before auth state is confirmed, the admin UI components render without guard.
- Requires verification of `RequireAdmin` implementation — not audited here.

## Medium Findings

### FE-M1 — SSE stream URL embeds `lastEventId` as a plain query parameter
`apps/web/client/src/hooks/useRunStream.ts:50`
- `?lastEventId=${encodeURIComponent(lastId)}` — event IDs are UUIDs so this is low sensitivity, but the URL is logged in browser history and server access logs.
- The standard mechanism for Last-Event-ID is the `Last-Event-ID` HTTP request header sent automatically by the `EventSource` API.
- The manual query-param approach means the server cannot distinguish between a legitimate reconnect and a forged catch-up request using a stolen event ID.
- **Recommendation**: Remove the `?lastEventId=` query-param and rely on the native `EventSource` `Last-Event-ID` header mechanism; configure the server to read `req.headers['last-event-id']`.

### FE-M2 — LiveBrowserStreamRenderer iframe: no `sandbox` attribute
`apps/web/client/src/components/automation/LiveBrowserStreamRenderer.tsx:73-81`
- `<iframe src={target.url} allow="clipboard-read; clipboard-write" />` — no `sandbox` attribute.
- The iframe loads a live browser session stream URL. Without `sandbox`, the embedded content inherits full same-origin permissions if the URL is same-origin (e.g., served from the same Express app).
- `clipboard-write` permission is particularly broad for an observe-only embedded view.
- **Recommendation**: Add `sandbox="allow-scripts allow-same-origin"` (minimum required) and audit whether `clipboard-read; clipboard-write` is needed for observe-only mode.

### FE-M3 — LLM provider API keys stored in sessionStorage (authService.ts:284)
`apps/web/client/src/services/authService.ts:284`
- `sessionStorage.setItem(\`smartspec_apikey_${provider}\`, apiKey)` as a Tauri fallback.
- SessionStorage is accessible to any JS on the same origin. If a user enters third-party LLM API keys (OpenAI, Anthropic) via the browser, they are exposed to XSS.
- Note: the file's own TODO comment at line 272 acknowledges this: "TODO: Move API keys to server-side encrypted store (crypto.ts AES-256-GCM)".
- **Recommendation**: Do not persist third-party API keys client-side. Route them through a server-side encrypted store as the TODO indicates.

### FE-M4 — `GlobalAlerts.tsx`: unvalidated `senderName` and notification content interpolated into URL params
`apps/web/client/src/components/GlobalAlerts.tsx:75,100`
- Line 75: `const dmName = encodeURIComponent(m.senderName || m.senderEmail)` — `encodeURIComponent` is used, so URL injection is mitigated.
- Line 100: `const name = encodeURIComponent(modalMessage?.senderName || "")` — same, properly encoded.
- Not a current exploit but the URL-construction pattern is fragile: if the downstream route ever reads `dmName` from params and renders it without escaping, this becomes XSS.
- **Recommendation**: Use typed router navigation helpers instead of raw string interpolation in `setLocation()` calls.

## Low / Informational

### FE-L1 — TeamRoomView: SSE event content rendered without HTML escaping
`apps/web/client/src/components/orchestrator/TeamRoomView.tsx:193-194`
- `{(event.data as any)?.content ?? event.eventType}` — rendered inside a `<div className="text-sm whitespace-pre-wrap">`.
- React's JSX escapes string interpolation by default, so this is not an XSS vector. The finding is that `event.data` is typed as `Record<string, unknown>` and `(event.data as any)?.content` is cast with `any`, bypassing type safety. If `content` is a React element or object, the rendering behavior is undefined.
- **Recommendation**: Add an explicit string cast: `String((event.data as any)?.content ?? event.eventType)` and narrow the type.

### FE-L2 — `VITE_SMARTSPEC_WEB_URL` used in authService.ts — non-secret, acceptable
`apps/web/client/src/services/authService.ts:24`
- `import.meta.env.VITE_SMARTSPEC_WEB_URL || "https://smartaihub.app"` — this is a base URL, not a secret. No finding.

### FE-L3 — AgencyPreviewCard: provenance URLs from server rendered in `<a href>` without sanitization
`apps/web/client/src/components/agency/preview/AgencyPreviewCard.tsx:268-275`
- `<a href={p.url} target="_blank" rel="noreferrer">` — `p.url` comes directly from the server `provenance` array.
- `rel="noreferrer"` is present (covers noopener). However no protocol validation prevents `javascript:` if the server ever stores such a URL.
- **Recommendation**: Validate URLs with `/^https?:\/\//i.test(p.url)` before rendering as an `href`.

## Files With No Findings
- RunMonitorPanel.tsx — clean; all data text-rendered via JSX, no dangerouslySetInnerHTML
- GuardianChat.tsx — uses tRPC, content rendered via JSX text nodes
- SystemHealthBanner.tsx — renders `latestCriticalIncident.title` and `.message` as JSX text nodes
- OrchestrationConfirmForm.tsx — uses tRPC, controlled inputs only
- OrchestrationResultView.tsx — renders section.content as JSX text node (not HTML)
- PipelineProgressIndicator.tsx — no user content rendered
- ChatSidebar.tsx — all user content via JSX interpolation; uses tRPC
- PersonaSelector.tsx — display only, tRPC data
- AgencyPreviewCard.tsx — aside from FE-L3 provenance URL issue, clean
- MediaPromptPreviewContent.tsx — renders prompt as `whitespace-pre-wrap` text, not HTML
- PreviewCommitButton.tsx — no user content rendered
- PersonasPanel.tsx — system prompt preview in `<pre>` tag (properly escaped by JSX)
- UserAPIKeysPanel.tsx — key prefix displayed in `<code>` tag (JSX escaped)
- DynamicSkillForm.tsx — controlled form inputs, tRPC
- VideoDraftAIPanel.tsx — controlled form, tRPC
- HelpPanel.tsx — delegates to HelpTopicRenderer (see FE-H2)
- useHelpSearch.ts — client-side Fuse.js search, no DOM manipulation
- AutomationChatModal.tsx — uses tRPC/hooks, no raw HTML injection
- LiveBrowserWorkspace.tsx — aside from iframe (FE-M2 is in LiveBrowserStreamRenderer), clean
- GlobalAlerts.tsx — aside from FE-M4 note, all message content via JSX text interpolation
- ThreadRouter.tsx — routing only, no content rendering
- ImageGalleryPanel.tsx — renders image `src` from server (server-controlled URLs, not user input)
- AdminPersonas.tsx — tRPC forms, admin-only page
- AdminSystemGuardian.tsx — tRPC display, admin-only page

**Why:** How to apply: When reviewing future changes to authService.ts or agency preview components, FE-C1 and FE-C2 are the two highest priority items. FE-C1 has a filed TODO already.
