# Orchestra Backlog

- Deploy the repo changes and then verify production `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`, and OG image responses.
- Adjust Cloudflare Managed Content / robots policy outside the repo if it continues to inject `Disallow: /` for GPTBot, ClaudeBot, or other AI search crawlers.
- Add path-specific SEO metadata for `/docs/seo/ai-search-optimization` and other docs/blog routes that currently return `metadata: null`.
- Consider SSR/prerender/static snapshots for key public pages because the production HTML is primarily a React SPA shell; this is okay for Google rendering, weaker for LLM crawlers and simpler fetchers.
- Expand curated prerender copy over time for more individual blog/docs/marketplace detail, or replace the lightweight snapshot helper with full React SSR/prerender when the app is ready for that architecture.
- After deploy, fetch representative public pages with `curl` and verify the first HTML response contains `id="smartaihub-prerender"`, H1, JSON-LD, FAQ schema where applicable, and related internal links.
- Move CSP toward nonce/hash-based scripts and remove `unsafe-eval`/`unsafe-inline` from production once Vite/runtime dependencies allow it.
- Further optimize `/images/dashboard-preview.png` below 500 KB if visual quality remains acceptable, or add a WebP alternate for crawler/social use.
- Fix the `PresentationEditor.test.tsx` harness issue where targeted renders produce only `<div />`, blocking Article Builder UI regression tests from reaching `header.articleBuilder`.

## Marketplace Capture Extension Remaining Product Decisions

- Decide exact retention periods for unconfirmed and confirmed raw evidence.
- Decide whether product images should be copied from marketplace CDN in MVP or remain original URLs.
- Decide whether marketplace capture products eventually sync into Library/catalog records.
- Confirm production Chrome extension ID and SmartSpecPro domains for CORS/host permissions.
- Choose approved LLM model policy for text extraction, vision extraction, and JSON repair.
- Decide install-time vs optional runtime host permissions per marketplace for Chrome extension release.

## Gemini Omni Suite Implementation Queue

- Implement `specs/feature/114-gemini-omni-suite-media-assets/sections/section-01-validation-and-metadata-foundation.md` first.
- Continue through provider assets, Kie provider asset contract, Gemini Omni skills, admin presets/pricing, Media Studio UX, QA/learning orchestration, and rollout sections in the section index order.
