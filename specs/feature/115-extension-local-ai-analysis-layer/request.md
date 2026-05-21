# Request

## Original user request

ตรวจสอบและเพิ่ม spec ใน `specs/feature` ให้ Chrome Extension มีฟังก์ชั่นเพิ่มเติม โดยต้องสอดคล้องกับ codebase เดิม

Source brief:

- Document ID: SSP-EXT-PROMPT-API-SPEC
- Version: 1.0
- Date: 2026-05-21
- Scope: Chrome Extension only
- Primary goal: Add optional Chrome Prompt API / Gemini Nano local analysis to the existing SmartSpecPro Chrome Extension without disrupting Shopee and TikTok capture flows.

## Repository-informed normalization

Create a new follow-on feature package for the existing marketplace capture extension.

The current repository already contains:

- `apps/extension` MV3 extension package.
- `apps/extension/public/manifest.json` with `activeTab`, `scripting`, `storage`, `tabs`, and `sidePanel`.
- `apps/extension/src/content/index.ts` with Shopee and TikTok Shop content-message flows.
- `apps/extension/src/shared/types.ts` with platform union `"shopee" | "tiktok_shop"`.
- `apps/web/shared/marketplaceCapture.ts` with shared Zod contracts and limits.
- `apps/web/server/routes/marketplaceCapture.ts` mounted at `/api/marketplace-captures`.
- `apps/web/server/services/marketplaceExtractionService.ts` with server-side deterministic fallback plus optional LLM gateway.
- Web routes under `/marketplace-capture/*`.
- Media Studio integration that can already read marketplace product images through `trpc.marketplaceCapture`.

Therefore this feature must be additive:

- Do not recreate the extension workspace.
- Do not replace the existing capture draft/upload/analyze/preview flow.
- Use `tiktok_shop` where integrating with current contracts.
- Extend or bridge through `/api/marketplace-captures` and `marketplaceCapture`, not a new unrelated `/api/extension/insights` surface unless a compatibility adapter is explicitly introduced.
- Treat Chrome Prompt API as an optional local provider selected at runtime.

## External documentation checked

- Chrome Prompt API documentation: `https://developer.chrome.com/docs/ai/prompt-api`
- Chrome built-in AI APIs documentation: `https://developer.chrome.com/docs/ai/built-in-apis`
- Get started with built-in AI: `https://developer.chrome.com/docs/ai/get-started`

