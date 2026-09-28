# Public route coverage

All paths are from apps/web/client/src/App.tsx inspected 2026-09-08. An implementation route-parity test must refresh this inventory when App.tsx changes.

| Routes | Required capability | Source / boundary |
|---|---|---|
| /, /features, /about | read current page, discover, navigate | Page presentation plus published tenant content, publicSite TH/EN |
| /pricing | above plus list packages | packages.list and displayed pricing semantics |
| /docs, /docs/:slug+, /docs/worker-app-macos-build | read, metadata search, navigate | Docs/DocPage and explicit worker guide; tenant content wins over default only as UI does |
| /help, /help/:slug+ | read, Help search, navigate | help.getManifest/getTopic/getSearchIndex; retain anonymous visibility |
| /blog, /blog/:slug | read, published metadata search, navigate | /api/blog/posts and slug endpoint, current tenant and published only |
| /marketplace, /marketplace/:slug | catalog search, public detail, navigate | marketplace.list/getBySlug; do not expose raw skill prompts, private source, user likes or mutations |
| /gallery | public gallery search, public detail, navigate | gallery.list/get; published rows only, current tenant plus intentionally global rows; do not expose view/like/download mutations as tools |
| /contact | read, prepare contact, navigate | Contact state and existing feedback public contact submission, human submits |
| /changelog, /careers, /community, /support | read, discover, navigate | Existing visible public content and links; no new application/subscription/submission workflow |
| /resources | read, site metadata search, navigate | smartaihubPublicIndex, filtered against route and publication policy |
| /status, /security | read, discover, navigate | Existing public statements; explicitly identify static vs live information |
| /terms, /privacy | read, discover, navigate | Existing policy content; no summaries that change legal meaning |

## Explicit excluded surfaces

No tools on /login, /signup, /forgot-password, /verify-email, /auth/*, /desktop/open, /desktop/view, /workers/connect, /mcp/pairing/approve, /auth/device, /factory, /terminal, /kilo, /docker, /docker-redirect, /presentation/:itemId/play, /share/:token, /404 or unmatched URLs. These routes must be tested as exclusions, not quietly omitted from inventory. Preserve normal links to login/signup where already present; WebMCP navigation itself remains limited to the informational allowlist.

All RequireAuth/RequireAdmin/domain-admin routes and /marketplace-capture/* are excluded. Future public routes must be classified before they receive tools. Resource-index links that lead outside the allowlist must not automatically expand tool navigation permissions.

The public `/gallery` page has anonymous server mutations (`gallery.view`, `gallery.like`, `gallery.download`) used by the existing UI. WebMCP must never register or invoke those mutations; reading a gallery item is not permission to increment a counter. Gallery media URLs must continue through the existing managed-media access path and the tool result returns metadata only unless the current UI already exposes a public URL.

## Completeness rule

Every in-scope page provides a public view model including title, canonical public path, resolved locale, sections and source kind. Dynamic not-found, unpublished and unavailable pages return truthful states without falling back to other tenants. A default page remains eligible only if the UI itself uses that same default; network failure is not evidence of publication.
