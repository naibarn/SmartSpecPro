# Convergence Review — Specs 263 and 270

Scope: task-owned diff on branch `codex/spec263-270-public-completion-20261005`.
Review rounds: 10 requested passes. Three material findings were corrected before the clean convergence run; rounds 4–10 were clean. Final focused verification is 6 files / 47 tests.

## Round ledger

1. **Tenant host identity — finding fixed.** A null tenant result was treated as SmartAIHub and could show global copy on an unresolved custom host. Added `isSmartAIHubPublicSite`: exact tenant primary domain or verified SmartAIHub/local host only; unknown host fails closed. Added direct helper coverage.
2. **Retired public nav metadata — finding fixed.** `navbar.workflows` had no caller but remained in locale JSON and a required-key test. Removed the public nav key and stale assertion; did not change unrelated authenticated sidebar keys or add routes.
3. **Artifact replay isolation — finding fixed.** Added tenant/project checks before returning idempotent replay records on create/append/fork; actor is part of the fork idempotency key; request identity/version bounds are checked before repository access. Added cross-tenant fake-repository replay tests.
4. **Fresh regression convergence — clean.** Ran the changed client/service tests and nav translation contract after the repairs: 6 files / 47 tests passed. Public host helper, Navbar, Footer, tenant-home reduced-motion, i18n key contract, and design artifact service are covered.
5. **Footer tenant data boundary — clean.** Custom tenant footer uses only tenant logo/name/email; SmartAIHub global link columns, social accounts and email do not render. The SmartAIHub host retains its existing footer. Footer tests assert both branches.
6. **Navbar and keyboard behavior — clean.** Custom domains expose only tenant home navigation and no Pro/product copy; menu tests cover localized state, active route, Escape dismissal and focus restoration. No new route or unsupported claim.
7. **Reduced-motion behavior — clean.** Background video requires a confirmed non-reduced-motion result; reduced or not-yet-resolved preference uses the poster/fallback. Focused tests cover reduced, default, and unresolved preference states.
8. **Spec 270 authority boundary — clean.** New behavior remains injected and default-off. No route, migration, provider call, durable adapter, authoring UI, or worker lifecycle was introduced; G0/Spec 224/256/provider blockers remain explicitly open.
9. **Retired systems and content scope — clean.** Changed public nav data contains no `navbar.workflows` key; route truth/handoff remains the already verified `/drama-series` path. No `/workflows`, Agency, workpacks, OpenSandbox, Docker dispatch, or `sandbox_jobs` reference was added by this delta.
10. **Final fast-gate and handoff — clean for partial integration.** Diff is coherent, no unresolved conflicts, tests parse/execute changed TSX/service files, locale JSON parses, whitespace check passes. No full typecheck/build/browser/deploy claim. Safe partial integration is the next action; whole specs remain blocked by listed external authorities/evidence.

## Stop result

- Clean rounds after the first direct-route repair: 2 consecutive (Rounds 13–14). A later crawl-surface review found and repaired another related gap; see follow-up rounds below.
- Material findings remaining in safe code scope: none found in these passes.
- Blocked findings: public claim/asset rights, route/crawl/analytics/RUM and deployed-browser proof; durable artifact ownership/recovery/retention/reference closure; live Spec 224/256/catalog and provider certification; serialized repository-wide typecheck.
- Stale gates: none for the exact focused code diff. Final docs-only edits require `git diff --check` before commit.
- Stop reason: proceed with `CHECKPOINT_PROMOTED_PARTIAL` after integration; whole Specs 263/270 cannot be closed honestly until blocked external authorities and evidence are supplied.

## Post-integration impact closure

11. **Direct public URLs on tenant hosts — finding fixed.** Direct `/features`, `/pricing`, docs/help, resources, trust, blog, marketplace, gallery, and legal routes could still render SmartAIHub defaults when a tenant had no page. Added `TenantPublicRoute` around public content routes: verified platform host preserves existing page; custom host resolves an exact tenant-published page or renders a localized unavailable state. Safety/emergency public routes remain under their separate owner.
12. **Tenant route canonical path — finding fixed.** Reusing `TenantHomePage` for a published non-home route would have emitted canonical `/` and shown the home emergency entry. Added route-specific canonical path and limited that entry to the tenant home. Added assertions in the route-boundary test.
13. **Route integration and exact-scope verification — clean.** Fresh focused run: 7 files / 50 tests passed. Babel parser accepted `App.tsx` and changed TSX; locale JSON and whitespace checks passed. Route keys match the existing tenant page convention, including `docs-{slug}`.
14. **Tenant/public contract review — clean.** The existing hook verifies returned `tenantId`, `pageKey`, and `isPublished`; the server public-page query filters exact current tenant. The wrapper leaves SmartAIHub-domain content untouched and sends unresolved custom content to a branded unavailable state; no new route or data API was introduced.

- Current closure rounds after the direct-route and canonical repairs: two clean passes (13–14).
- New direct-route repair still requires normal promotion from the task worktree; do not infer production/browser behavior from component tests.

15. **Tenant crawler output — finding fixed.** Tenant domains still received the static SmartAIHub `llms.txt` and the platform base URL in `robots.txt`; custom pages published through the route boundary were also absent from tenant sitemaps. Added tenant-only LLM projection from exact tenant-published route keys, canonical tenant sitemap/LLM URLs, and a disallow-all crawler policy for unresolved hosts. Extended the sitemap projection only to public route keys served by `TenantPublicRoute`.
16. **Crawler data and scope review — clean.** The tenant route handlers use the middleware-resolved tenant ID to query published pages; the renderer omits unsupported page keys and escapes titles/descriptions before Markdown output. Platform behavior remains on the verified SmartAIHub tenant/host; unknown hosts do not receive SmartAIHub LLM copy.
17. **Fresh focused regression and source review — clean.** Eight changed-scope suites passed (58 tests), including tenant route/sitemap/robots/LLM behavior. Changed TSX/server syntax parsed, locale JSON parsed, and `git diff --check` passed. No schema, migration, feature flag, provider, or deployment path changed.

- Latest material repair (tenant crawler output) has two consecutive clean review passes (16–17).
- The full public browser/crawl/live production evidence remains separate; this checkpoint does not certify deployed host behavior.

18. **Unpublished tenant noindex test — test harness repair.** Initial assertion could not find the mocked `Seo` metadata because React hoists `<meta>` elements into the document head. Replaced the mock output with an explicit test marker; no production-code change was needed for this test failure.
19. **Noindex and tenant-crawl regressions — clean.** The route test confirms `noIndex`, canonical path without query, and tenant-specific page-key resolution. The eight-file focused run passed 58 tests, including tenant sitemap, tenant/unknown robots policies and tenant LLM projections.
20. **Final impact review — clean.** App route wrappers cover supported public marketing/content/legal routes, retain SmartAIHub behavior on its verified domain, and leave emergency routes under their existing owner. Tenant pages are gated by the existing exact-tenant/published hook and sitemap admits only supported route keys. No safe in-scope MUST_DO_NOW code gap found.

- Earlier review checkpoint: 20 targeted passes; latest code/test repair at that checkpoint had two clean rounds (19–20).
- Remaining blockers are external authority and live/browser/production evidence documented in `lifecycle.md` and `progress.md`.

21. **Tenant sitemap route-key closure — finding fixed.** Follow-up inspection found the static `docs` and `blog` page keys were accepted by `TenantPublicRoute` but missing from the sitemap route map. Added both keys and regression rows; unsupported keys remain excluded.
22. **Focused route/crawler verification — clean.** Re-ran the eight changed-scope suites after the route-map repair: 58 tests passed. This covers exact tenant page route selection, noindex fallback, canonical path, robots/LLM tenant identity, and sitemap route keys.
23. **Final source and handoff review — clean.** App and changed TSX/server files parse; locale JSON parses; `git diff --check` passes; no secret pattern or conflict marker found. No build, full typecheck, browser, production crawl, or deployment was run. The repair is a safe partial checkpoint for normal integration.

- Total targeted review passes: 23; latest sitemap-key repair followed by two clean rounds (22–23).

## Continuation review — 2026-10-05

24. **SEO empty tenant/API response — finding fixed.** The reported `/features` white screen reproduced at `Seo` when `tenant` or remote `seo` was absent. Nullish typed fallbacks now use empty metadata; the focused test failed with `defaultTitle` on undefined before the fix and passes after it.
25. **Auth return intent — finding fixed.** Replaced arbitrary relative redirect acceptance with exact validated dashboard/drama-series/device-code/MCP-transaction intents. Regressions reject retired `/workflows`, private query identifiers, invalid codes/UUIDs and extra query fields.
26. **Analytics consent — safe code behavior closed; owner/UI remains blocked.** PostHog is inaccessible until an explicit persisted grant; revocation opts out and resets identity. No approved consent UI/authority exists in repository, so no legal copy or competing consent authority was invented.
27. **Pageview data minimization — finding fixed.** Only static public routes and normalized blog/marketplace slugs are emitted; event URL is relative, with no origin, query, fragment, tenant/private IDs, auth/share paths or marketplace auto-review case IDs.
28. **Spec 224 Vitest runner — finding fixed.** Removed unsupported `--minWorkers=1` under Vitest 4.1 from quick/integration profiles; runner tests verify generated args.
29. **Consent persistence failure — finding fixed.** If browser storage rejects the grant, analytics remains inaccessible; an already initialized SDK is opted out and reset. Regression explicitly simulates `SecurityError`.
30. **Candidate verification — clean focused gate.** Final run passed 12 focused suites / 65 tests after route privacy and storage-failure coverage. Package typecheck failed with 927 broad diagnostics; task source paths had no diagnostics after the SEO type fix. No build/browser/deploy claim.

- Open after this code closeout: approved consent UX/authority, public Film claims/asset rights, canonical route owners, browser/accessibility/crawl/RUM/live-site evidence, Spec 270 durable data/provider/catalog authorities, and post-integration verification. Whole specs remain partial.
