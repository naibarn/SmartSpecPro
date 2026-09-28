# Research notes — 2026-09-09

## Verified source evidence

- apps/web/client/src/App.tsx: public routes at 639 onward, policy routes near 1412, private share/auth/device routes elsewhere. Route absence of RequireAuth is not a sufficient public-data policy.
- pages/Pricing.tsx uses packages.list; pages/Marketplace.tsx uses marketplace.list/getBySlug plus authenticated like/comment mutations. Only public projections belong in tools.
- pages/Help.tsx and HelpTopic.tsx use help public queries; routers/help.ts exposes manifest, topic and search index.
- hooks/useTenantPage.ts fetches /api/tenant/public-pages/:pageKey. routers/tenant.ts:671 resolves req.tenant and rejects unpublished pages. Preserve this boundary.
- pages/DocPage.tsx resolves tenant content then UI defaults; Blog.tsx and BlogPost.tsx use tenant-aware public REST endpoints.
- pages/Contact.tsx keeps controlled fields, Turnstile, honeypot and formStartedAt and submits via feedback.submitPublicContact. Tools must not invoke this mutation.
- App.tsx also exposes `/gallery` without an auth wrapper. `gallery.list` and `gallery.get` are public and filter published rows by current tenant/global scope; `gallery.view`, `gallery.like` and `gallery.download` are public mutations used by the existing UI and must remain outside WebMCP.
- shared/smartaihubPublicIndex.ts is a useful discovery seed, not an authorization list.
- TH/EN publicSite localization is already used by public pages. Preserve the existing product narrative and test resolved locale.
- Current server/NGINX `Permissions-Policy` headers list camera/microphone/geolocation/payment/usb but not `tools`; native rollout must verify browser default behavior and add only a narrow `tools=(self)` policy if required. No `Origin-Agent-Cluster: ?0` was found in the inspected source; response-level proof is still required.
- apps/web/package.json uses npm workspace scripts and Vitest; build invokes the atomic-build script. Avoid resource-heavy commands in this planning task.
- Existing feature README is a historical map; this feature adds an entry without rewriting unrelated entries.

SocratiCode tools are unavailable in this session; discovery used focused rg and file reads. No DB query or native browser run was performed. Existing unrelated worktree changes are preserved.

## Official references

- https://webmachinelearning.github.io/webmcp/ — rechecked 2026-09-09; Draft Community Group Report dated 2026-09-04, explicitly not a W3C Standard or Standards Track document. Defines Document model context, tools, policies and security considerations.
- https://developer.chrome.com/docs/ai/webmcp/imperative-api — rechecked 2026-09-09; document.modelContext registration, tool annotations and page lifecycle integration; current examples show object-shaped `inputSchema` at registration.
- https://developer.chrome.com/docs/ai/webmcp — checked earlier in this conversation; origin trial/flag workflow and progressive enhancement. Recheck before rollout.
- https://developer.chrome.com/docs/ai/webmcp/declarative-api — checked earlier in this conversation; form annotations and async response behavior. Declarative submission is not required by this release.

Do not promise an exact future stable browser milestone. Record actual browser build, flags/trial token scope and observed APIs during implementation. Origin trial enablement is a deployment prerequisite, not an application test result.
