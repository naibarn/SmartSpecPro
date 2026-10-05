# Public UI dependency governance

## Approved boundary

The SmartAIHub-owned dependency boundary is `apps/web/client/src/components/publicUi/publicPrimitives.tsx`. Public page compositions import Astryx through this boundary. The boundary owns the scoped `publicHomeTheme`, the public layout token, and primitive export set. Additions require a public design component-registry entry and conformance check.

## Version and risk

The exact Astryx package version is governed by `apps/web/package.json` and `pnpm-lock.yaml`. Current app code uses the pinned installed API; package version and lockfile integrity must be included in canonical build provenance. Do not upgrade Astryx as part of page-only work without its documented upgrade and regression workflow.

## Fallback

The public Home is built from static HTML and ordinary navigation; optional decorative product-flow detail must not gate the H1 or CTAs. If the primitive package cannot load, the existing global error-safe boundary applies; the public design must not introduce a second component runtime or a global CSS reset.
