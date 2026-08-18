# Research Notes

- User-visible identity appears in the manifest, action title, panel HTML/header, README, and Dashboard locale copy.
- Release identity is coupled across extension package metadata, package/verify scripts, the workspace lockfile, server filename pattern/routes, Dashboard URLs, and extension update constants.
- The server currently scans only `smartaihub-marketplace-capture-extension-*.zip`; the old route must scan both patterns or version `0.1.137` cannot discover the renamed release.
- Token delivery is initiated by `MarketplaceCaptureConnect.tsx` with `SMARTAIHUB_MARKETPLACE_EXTENSION_TOKEN` and received by the service worker. Canonical-first fallback needs to distinguish transport incompatibility from an explicit `{ ok: false }` security decision.
- `MARKETPLACE_EXTENSION_ALLOWED_ORIGINS` is read through `marketplaceCaptureConfig.ts`; a canonical variable can take precedence while the legacy value remains fallback.
- Marketplace tables, token claims, routers, capture headers, and content messages remain capability-specific and are not product-branding targets.
- Existing focused test tooling is Vitest for web code and Node test plus TypeScript/Vite for the extension.
- SocratiCode was unavailable in the active tool surface; discovery used focused repository searches and narrow reads.
