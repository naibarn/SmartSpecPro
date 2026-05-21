# Research Notes - Marketplace Capture Extension

Date: 2026-05-17
Spec: `spec.md`
Mode: file-based deep-plan, self-review

## Research Decision

Codebase research is required because this feature adds a new app, REST upload routes, tRPC web UI routes, Drizzle schema, LLM integration, storage, and auth/security boundaries.

Web research is required because the plan depends on current Chrome Extension MV3 APIs and extension policy/security guidance, plus OWASP guidance for uploads, SSRF, and LLM prompt injection.

SocratiCode status: green, 86,565 indexed chunks, watcher active.

## Codebase Findings

### Repository Shape

- Root repo is an npm monorepo with `workspaces: ["packages/*", "apps/*"]` and `packageManager: npm@10.8.2`.
- `apps/web` is the existing React + Express + tRPC web app.
- No `apps/extension` workspace exists yet.
- `apps/web/package.json` exposes `npm run check`, `npm run test`, `npm run build`, and `npm run db:push`.

### Web Backend Boundaries

- Express server entrypoint: `apps/web/server/_core/index.ts`.
- tRPC router aggregation: `apps/web/server/routers.ts`.
- Existing public skill marketplace router: `apps/web/server/routers/marketplace.ts`, registered as `marketplace`.
- Existing client public route `/marketplace` is already used by `apps/web/client/src/pages/Marketplace.tsx`.
- Therefore this feature must avoid the generic `marketplace` namespace and use `marketplaceCapture` / `/marketplace-capture`.

### Request Body And Uploads

- Global JSON body limit is `10mb` in `apps/web/server/_core/index.ts`.
- Existing multipart examples use Express + `multer` outside tRPC, then persist through `storagePut`.
- Useful references:
  - `apps/web/server/routers/feedback.ts` shows small multipart upload with auth after multer, temp cleanup, `storagePut`, and error middleware.
  - `apps/web/server/routers/mediaJobs.ts` shows larger media upload flow.
- Marketplace screenshots and image binaries must not be sent as base64 JSON. Use multipart route under `/api/marketplace-capture/.../assets`.

### Auth, Tokens, CSRF, Origin

- `apps/web/server/_core/authz.ts` supports bearer JWT, static/internal tokens, API keys, delegated worker tokens, and session auth.
- `apps/web/server/_core/tokens.ts` provides `signBearerToken`, `verifyBearerToken`, `hasScope`, `parseScopes`, and JWT `jti` support.
- `authorizeRequest` checks revoked bearer token `jti` via `isJtiRevoked`.
- Existing CSRF middleware in `apps/web/server/_core/index.ts` protects `/api` and `/trpc` state-changing requests by checking `Origin`; no-Origin bearer requests are allowed.
- Extension routes need stricter behavior than ordinary server-to-server bearer routes:
  - exact extension origin allowlist
  - bearer only for extension REST routes
  - reject cookie-authenticated extension POSTs
  - reject production extension POSTs missing `Origin`
  - no wildcard CORS for authenticated browser calls

### Storage And Remote Images

- `apps/web/server/storage.ts` exposes storage primitives including `storagePut`, `storageGet`, `storageDelete`, `storageResolveUrl`, and presign helpers.
- `apps/web/server/services/imageProxySafety.ts` already implements redirect-aware remote image fetching with URL validation, timeout, max bytes, redirect limits, and `image/*` content-type checks.
- Marketplace remote image mirroring should reuse or wrap this safety model and add marketplace CDN allowlists. MVP can store original image URLs only until allowlists are configured.

### LLM Integration

- `apps/web/server/_core/llmRoutes.ts` registers existing LLM REST routes and handles provider routing, limits, and auth patterns.
- Marketplace extraction should be server-side only. The extension should never receive provider keys and should not call LLM providers directly.
- The plan should create `marketplaceExtractionService` and keep prompt/result validation isolated from route handlers.

### Database And Migrations

- Schema source: `apps/web/drizzle/schema.ts`.
- SQL migrations are in `apps/web/drizzle`, latest visible numbered migration is `0175_elevenlabs_dialogue_energy_guidance.sql`.
- New tables should be additive. Prefer varchar fields for feature statuses that may expand quickly unless PostgreSQL enum stability is required.
- Implementation should include schema tests or contract tests where practical, plus integration checks for tenant/user scoping.

### Frontend

- Client routes live in `apps/web/client/src/App.tsx`.
- Protected app routes are wrapped with `<RequireAuth>`.
- Add web pages under `/marketplace-capture`, not `/marketplace`.
- Existing UI uses React, wouter routes, tRPC React Query, lucide icons, Radix components, and Tailwind-style classes.

### Impact Notes

SocratiCode impact:

- `apps/web/server/_core/authz.ts` has broad dependent surface. Do not modify it for marketplace capture unless absolutely necessary; prefer a feature-local auth wrapper that calls existing `authorizeRequest`.
- `apps/web/server/routers.ts`, `apps/web/server/_core/index.ts`, and `apps/web/drizzle/schema.ts` are central integration files. Changes should be additive and small.

## Web Research Findings

### Chrome Extension APIs

- Chrome Side Panel API supports persistent extension UI that can complement browsing, can be enabled for specific sites, and can be opened by user gesture. Source: Chrome Side Panel API docs, lines 262-271 and 302-327. https://developer.chrome.com/docs/extensions/reference/api/sidePanel
- `activeTab` grants temporary host permission for the current tab after user invocation and avoids broad install-time host warning. Source: Chrome tabs API docs, lines 278-285. https://developer.chrome.com/docs/extensions/reference/api/tabs
- Content scripts can directly access a limited set of extension APIs and must message other extension parts for other APIs. They run in isolated worlds separate from page JavaScript. Source: Chrome content scripts docs, lines 203-223. https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Extension message passing supports content script, extension page, and service worker communication. Source: Chrome messaging docs. https://developer.chrome.com/docs/extensions/develop/concepts/messaging

### Chrome Web Store Policy

- Chrome policy requires transparency, narrow permissions, and limiting user data use to disclosed purposes. It explicitly calls out web browsing activity and scraped/automatically gathered data under Limited Use. Source: Chrome Web Store Program Policies, lines 161-199. https://developer.chrome.com/docs/webstore/program-policies/policies
- The extension UI and listing must clearly describe user-assisted capture, what data is collected, why, and where it is sent.

### Upload Security

- OWASP File Upload Cheat Sheet recommends allowlisted extensions, content-type validation, file signature validation, filename safety, storage location controls, user permissions, size limits, and CSRF protection. Source: OWASP File Upload Cheat Sheet, lines 158-193. https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
- Marketplace asset upload must validate size, declared type, magic bytes, decoded image dimensions where possible, and block active content.

### SSRF

- OWASP SSRF guidance distinguishes allowlist cases from arbitrary external request cases and notes SSRF can involve non-HTTP schemes. Source: OWASP SSRF Prevention Cheat Sheet, lines 205-213. https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- Backend remote image fetch should be disabled or strictly allowlisted for marketplace CDN hosts, with redirect target validation and private IP blocking.

### LLM Prompt Injection

- OWASP describes direct, remote/indirect, multimodal, and agent/tool prompt injection risks. Source: OWASP LLM Prompt Injection Cheat Sheet, lines 214-244 and 193-204. https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html
- Marketplace DOM, HTML, screenshots, and OCR text must be treated as untrusted data, separated from system instructions, validated against schema, and reviewed by the user before durable product save.

## Key Planning Constraints

- User must review/edit/select in extension before upload to avoid sending garbage or unwanted evidence.
- Durable SmartSpecPro product save happens only on web preview confirmation.
- MVP should implement Shopee first; TikTok Shop stays adapter-ready but not blocking.
- Do not change broad auth middleware unless required.
- Avoid new dependencies unless Vite extension scaffolding requires existing workspace-compatible dev dependencies.

