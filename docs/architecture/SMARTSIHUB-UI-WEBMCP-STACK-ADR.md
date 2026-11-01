# ADR — SmartSIHub Modern UI / Headless Agents / WebMCP, 2026-11-01

Decision: Hono/TS owns canonical Action APIs; first-party interactive UI React 19/Vite/TS/Tailwind 4; public website Astro/Cloudflare adapter/selective SSR with React islands; small owned accessible component primitives (Base UI/shadcn-compatible copied source); SPEC-287 canonical semantic token governance with a brand-new modern SmartSIHub profile; no legacy Astryx runtime imports.

Rationale: Astro SSR/static is appropriate to SEO-first creator portfolios/Mini App listing; an SPA-only site cannot meet first-content and crawl needs as efficiently. Interactive Creator/Chat/Studios need rich React. Agents need headless, authenticated action endpoints that remain independent of DOM/browser. WebMCP early preview is browser-only tool registry; it is an adapter with capability detection, not an alternate execution authority.

Alternative decisions: Next.js/OpenNext adds unnecessary complexity for public content and edge deployment at initial scope; a single React SPA for public + console worsens crawlability and bundle isolation; Angular/Vue switching costs are unjustified without a measured need; shadcn default look is not a product identity; full custom primitives needlessly reinvent accessibility; Rust/Wasm UI is not required.

Design toolchain: visual briefs, researched references and proprietary brand tokens, semantic token registry, Figma or Penpot optional design source, Storybook, Playwright snapshots, axe, Lighthouse, bundle analyzer, human mobile UAT; optional Stitch/AI generator per SPEC-270 is a sketching assistant, not an authoritative renderer. Rendering conformance remains SPEC-287.

Agent action protocol: canonical schema/SDK -> adapters for human UI, HTTP/OpenAPI, MCP tools through existing SPEC-199/248, WebMCP in supported browsers. Respect established authentication/tenant/skill/economic/job owners.

Official verification: https://developer.chrome.com/docs/modern-web-guidance/guides/webmcp/webmcp ; https://github.com/GoogleChromeLabs/webmcp-tools ; https://developers.cloudflare.com/workers/framework-guides/web-apps/astro/ ; https://ui.shadcn.com/docs/tailwind-v4 .
