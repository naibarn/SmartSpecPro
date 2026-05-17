# Request

## Original user request

สร้าง spec file ใหม่เพิ่มเติมจาก specs/feature เดิม ให้สอดคล้องกับ codebase ปัจจุบัน

Provided source brief:

- SmartSpecPro Marketplace Capture Extension
- Product Requirements & Technical Specification
- Target repository: `naibarn/SmartSpecPro`
- Primary platforms: Shopee Thailand and TikTok Shop Thailand
- Primary product: Chrome Extension + SmartSpecPro Web/API integration
- Desired artifact: `spec.md`
- Status requested: ready for implementation planning

## Normalized brief

Create the next feature package under `specs/feature/` for a user-assisted marketplace product capture system.

The feature should specify:

- a Chrome Manifest V3 extension under `apps/extension`
- Shopee Thailand category/search scanning and product capture as MVP
- future TikTok Shop adapter support
- SmartSpecPro backend APIs for capture drafts, asset upload, analysis, preview, and confirm/save
- database tables for capture sessions, evidence assets, confirmed marketplace products, product images, and price snapshots
- LLM extraction through the existing SmartSpecPro LLM gateway
- evidence-first preview and user confirmation before saving
- security, rate limits, privacy, testing, and phased rollout

## Repository-informed assumptions

- The root repo is an npm workspace monorepo with `packages/*` and `apps/*`.
- `apps/web` is the current React + Express + tRPC application.
- There is no `apps/extension` app yet.
- `/marketplace` already means the public skill marketplace, backed by `apps/web/server/routers/marketplace.ts` and `apps/web/client/src/pages/Marketplace.tsx`; this feature must not reuse that product surface name for web routes.
- Express REST routes are appropriate for Chrome extension calls and multipart uploads.
- tRPC routers are appropriate for authenticated SmartSpecPro web UI reads/mutations where multipart is not needed.
- The existing unified storage layer is `apps/web/server/storage.ts`.
- The existing LLM gateway routes and routing services live around `apps/web/server/_core/llmRoutes.ts` and related LLM services.
- The global JSON body limit is 10MB, so screenshots and images must use multipart or presigned upload instead of base64 JSON.
- Current auth supports sessions, bearer JWTs, scoped API keys, static/internal tokens, and CSRF origin checks. Extension auth must use short-lived scoped bearer tokens and explicit allowed origins.

## Non-goals

- Do not implement code in this pass.
- Do not create a crawler that bypasses marketplace controls.
- Do not capture marketplace credentials, cookies, checkout pages, carts, chats, or account pages.
- Do not store permanent SmartSpecPro API keys in the extension.
