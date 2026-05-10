[COMPLETE] wave-1-seo-audit - Inspected code-level SEO/GEO/AEO support and public `smartaihub.app` crawler signals.
[COMPLETE] wave-2-seo-remediation - Added repo-local fixes for sitemap fallback, AI crawler policy, LLM-readable files, reachable OG image defaults, and route tests.
[COMPLETE] wave-3-public-prerender - Added server-side semantic HTML snapshots for public SEO routes so crawlers see `<main>`, H1, JSON-LD/FAQ schema, and related internal links in the first HTML response.

## Fresh Session Notes
- Existing stale orchestra state without `snapshot.json` was archived to `orchestra/archive/20260508T025957Z/`.
- Git working tree was clean before this session started.

## Audit Findings
- Code has a strong tenant SEO foundation: `SEOHead` emits title, description, keywords, OG/Twitter tags, AI context meta, JSON-LD, robots meta, and favicon when tenant data is present.
- `/api/tenant/seo?path=/` returns tenant defaults plus AI context/key facts and related links.
- `/api/tenant/seo?path=/docs/seo/ai-search-optimization` currently returns `metadata: null`, so path-specific AI-search docs metadata is not active in production for that path.
- Production `robots.txt` includes Cloudflare Managed Content that disallows `GPTBot` and `ClaudeBot`, while also setting `Content-Signal: search=yes,ai-train=no` without `ai-input=yes`.
- Production `/sitemap.xml` returns HTTP 500 with body `Failed to generate sitemap`.
- Production `/llms.txt` returns the SPA HTML shell instead of an LLM-readable markdown index.
- Static scanner output is partially false-positive due to SPA rendering, but still flags missing committed/static `robots.txt`, `sitemap.xml`, and `llms.txt` artifacts.

## Verification
- Ran SocratiCode `codebase_status`: green, watcher active.
- Ran SocratiCode searches for public tenant SEO, sitemap, robots, and LLM search surfaces.
- Ran `node /home/dev/.codex/skills/seo-audit/tools/seo-scanner.mjs /home/dev/projects/SmartSpecPro/apps/web`.
- Ran `node /home/dev/.codex/skills/seo-audit/tools/content-scorer.mjs /home/dev/projects/SmartSpecPro/apps/web`.
- Ran `node /home/dev/.codex/skills/seo-audit/tools/og-validator.mjs /home/dev/projects/SmartSpecPro/apps/web`.
- Probed `https://smartaihub.app/`, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, and `/api/tenant/seo?...` with `curl`.
- Added and ran `npm --prefix apps/web test -- server/routers/publicSitemap.test.ts`; passing.
- Ran `npm --prefix apps/web run check`; passing.
- Re-ran `node /home/dev/.codex/skills/seo-audit/tools/seo-scanner.mjs /home/dev/projects/SmartSpecPro/apps/web`; static `robots.txt`, `sitemap.xml`, `llms.txt`, and `favicon.ico` are now present. Remaining scanner findings are mostly SPA/static-shell and widget/debug HTML limitations.
- Re-ran `node /home/dev/.codex/skills/seo-audit/tools/og-validator.mjs /home/dev/projects/SmartSpecPro/apps/web`; production `https://smartaihub.app/images/dashboard-preview.png` was separately verified with `curl -I` as HTTP 200.

## Remediation Notes
- `/sitemap.xml` now falls back to static SmartAIHub public URLs if DB or tenant-specific content lookup fails instead of returning HTTP 500.
- `/robots.txt` now emits `Content-Signal: search=yes,ai-input=yes,ai-train=no`, allows major AI/search crawlers in repo-controlled output, and links both sitemap and llms index.
- `/llms.txt` and `/llms-full.txt` are served dynamically from `smartaihubPublicIndexSections` and also exist as static public fallback files.
- Static shell and seed/import defaults now use `/images/dashboard-preview.png`, a production-reachable image, instead of missing `/images/og-image.png`.
- Cloudflare Managed Content can still override production robots behavior until its dashboard/rules setting is changed and redeployed.
- Public SPA fallback responses now pass through `injectPublicSeoSnapshot`, which inserts semantic crawler content for public SmartAIHub routes while skipping API/admin/internal routes.
- The prerender snapshot currently uses curated route content plus SmartAIHub public index/discovery links. It is intentionally lightweight and avoids full React SSR risk.

## Wave 3 Verification
- Ran `npm --prefix apps/web test -- server/services/publicSeoPrerender.test.ts server/routers/publicSitemap.test.ts`; passing.
- Ran `npm --prefix apps/web run check`; passing.

---

[COMPLETE] wave-media-history-ui - Improved Media History search, pagination, async states, empty/error recovery, gallery action density, and icon-button accessibility labels.

## Media History UI Discovery
- SocratiCode status: green; watcher active.
- SocratiCode impact for `apps/web/client/src/pages/MediaHistory.tsx`: direct impact limited to `main.tsx` and `MediaHistory.compile.test.tsx`.
- Backend `media.listTasks` already supports `limit`/`offset`, so pagination can be improved without changing router/API contracts.
- Backend task search is not currently exposed; chose client-side search on the loaded page to keep the change low-risk and avoid new backend surface.

## Media History UI Verification
- Ran `npm --prefix apps/web test -- client/src/pages/MediaHistory.compile.test.tsx`; passing.
- Ran `npm --prefix apps/web run check`; passing.
- Visual/browser screenshot gate was not run in this pass because the route is authenticated and no dedicated fixture/session was prepared.

[COMPLETE] wave-media-history-help - Updated retention copy, added contextual Help button, and created complete bilingual Media History help docs.

## Media History Help Verification
- Ran `npm --prefix apps/web test -- client/src/pages/MediaHistory.compile.test.tsx`; passing.
- Ran `npm --prefix apps/web test -- server/services/helpContentService.test.ts`; passing.
- Ran `npm --prefix apps/web run check`; passing.

---

[COMPLETE] wave-dashboard-signal-panel - Reworked Dashboard Trend & Health into a premium signal panel with credit runway, usage rhythm, media health, and live workload indicators.

## Dashboard UI Discovery
- SocratiCode status: green; watcher active.
- SocratiCode narrowed the main route to `apps/web/client/src/pages/Dashboard.tsx`.
- `Dashboard.tsx` already had analytics summary/time-series, recent media tasks, active workflows, and pending approvals loaded client-side.
- Existing Trend & Health section was the lowest-risk upgrade point because it already grouped usage and media-health concepts.

## Dashboard UI Verification
- Ran `npm --prefix apps/web test -- client/src/pages/__tests__/Dashboard.test.tsx`; passing.
- Ran `npm --prefix apps/web test -- client/src/i18n/__tests__/wave1-dashboard-common.test.ts`; passing.
- Ran `npm --prefix apps/web run check`; passing.
- A broad `npm --prefix apps/web test -- Dashboard` also surfaced unrelated existing failures in `AdminFunnelDashboard` and `WorkpackRoiDashboard`; the targeted Dashboard suite passed.

---

[COMPLETE] wave-completeness-security-review - Reviewed current uncommitted SEO, Media History, Dashboard, help, and static asset changes for completeness and high-security posture.

## Review Discovery
- SocratiCode status: green; watcher active; code graph available.
- SocratiCode impact showed:
  - `apps/web/server/routers/publicSitemap.ts` impacts `apps/web/server/_core/index.ts`.
  - `apps/web/server/_core/vite.ts` impacts `apps/web/server/_core/index.ts`.
  - `apps/web/client/src/pages/MediaHistory.tsx` impacts `main.tsx` and `MediaHistory.compile.test.tsx`.
- Worktree remained dirty from prior expected SEO, Media History, Dashboard, and help changes. No user changes were reverted.

## Review Verification
- Ran bundled secret scanner: `files_scanned: 12339`, `findings: []`.
- Ran `npm audit --omit=dev --audit-level=high`; exits non-zero due to high `xlsx` vulnerability with no fix, plus moderate `nodemailer` advisories and low transitive Google SDK chain advisories.
- Ran bundled dep-doctor: 50 findings, mostly unused/wrapper dependency signals plus pinned `@types/express` and `typescript`.
- Ran targeted OWASP-style pattern scan over changed files for eval, raw HTML assignment, command execution, weak hashes, unsafe raw query usage, and browser token storage; no matches found.
- Ran production header probe with `curl -I https://smartaihub.app/`; security headers are present, but CSP still allows `unsafe-inline` and `unsafe-eval`.
- Ran production `/robots.txt` probes with normal UA and GPTBot; currently still returns the older simple allow-all robots output, so repo-local AI crawler policy is not deployed/active yet.
- Ran Host spoof probe with `Host: evil.example`; Cloudflare returned 403.
- Some production URL checks intermittently failed with `getaddrinfo EAI_AGAIN smartaihub.app`; mark DNS-dependent health checks as partially unstable rather than passed.
- Ran targeted test bundle: `publicSeoPrerender`, `publicSitemap`, `MediaHistory.compile`, `Dashboard`, dashboard i18n, and help content service; 57 tests passing.
- Ran `npm --prefix apps/web run check`; passing.
- Ran `npm --prefix apps/web run build`; passing.

## Review Outcome
- Completeness is good for repo-local implementation, but production deployment verification remains incomplete.
- Security verdict is conditional pass. No critical finding was confirmed, but high-priority debt remains in `xlsx`, email verification logging, and SMTP TLS verification.
- Added follow-up hardening items to `orchestra/backlog.md` and detailed findings to `orchestra/risk_register.md`.

---

[COMPLETE] wave-security-remediation - Remediated high-priority repo-local security findings from the maximum-security review.

## Security Remediation Changes
- Removed vulnerable `xlsx` runtime dependency and `@types/xlsx`; upgraded `nodemailer` to `^8.0.7`, `@google-cloud/tasks` to `^6.2.2`, and added explicit `@testing-library/dom` peer devDependency.
- Replaced client spreadsheet preview with a secure download-only fallback so untrusted XLSX files are not parsed in browser runtime.
- Disabled server-side XLSX parsing in `fileParseTool`; CSV/TXT parsing remains supported.
- Added manual redirect handling for file ingestion with host/scheme revalidation on every redirect hop.
- Stopped production logging of verification/password-reset codes and masked email addresses in email logs.
- Re-enabled SMTP TLS certificate verification by default, leaving only a non-production explicit override path.
- Canonicalized public sitemap/robots/llms and prerender base URLs to configured/canonical SmartAIHub URLs instead of trusting spoofable Host/fwd-proto fallback.
- Optimized `/images/dashboard-preview.png` from 5.4 MB to 1.1 MB and regenerated `favicon.ico` as a real ICO resource.

## Security Remediation Verification
- Ran `npm audit --omit=dev`; passing with `found 0 vulnerabilities`.
- Ran `npm --prefix apps/web test -- server/routers/fileParseTool.test.ts server/routers/fileParseTool.security.test.ts server/routers/publicSitemap.test.ts server/services/__tests__/cloudTasks.test.ts`; 60 tests passing.
- Ran `npm --prefix apps/web run check`; passing.
- Ran `npm --prefix apps/web run build`; passing after making Vite's React alias resolve the actual hoisted workspace package path.
- Verified no remaining `xlsx` package/import references in package manifests or runtime imports; remaining `xlsx` strings are accepted file-type/document labels and tests for explicit rejection.

---

[COMPLETE] wave-skill-maintenance-apply-failure-plan - Created an executable quick-plan for the Admin Skills maintenance apply failure affecting `intelligence-skill-creator`.

## Skill Maintenance Failure Planning Discovery
- SocratiCode status: green; watcher active; code graph available.
- SocratiCode narrowed the issue to `AdminSkills.tsx`, `skills.ts`, `skillUpgradeApplier.ts`, `skillStudioService.ts`, `skillExecutor.ts`, and ISC runtime files under `apps/web/skills/intelligence-skill-creator/`.
- Impact check for `skillStudioService.ts` found downstream dependents in `skills.ts`, `skillUpgradeApplier.ts`, workpack services, and related tests.
- Existing dirty worktree was left intact; the planning artifact was added under `specs/quick/024-skill-maintenance-apply-failure/`.

## Skill Maintenance Failure Planning Verification
- Manual artifact verification completed: required deep-plan-quick files and section index were created.
- No implementation tests were run because this turn created a plan only and did not change runtime code.

---

[COMPLETE] wave-skill-maintenance-apply-failure-implementation - Implemented the Admin Skills maintenance apply failure fix for `intelligence-skill-creator`.

## Skill Maintenance Failure Implementation Changes
- Runtime path hygiene now prefers canonical skill roots and rejects copied `/runs/workspaces/` paths for `intelligence-skill-creator` execution.
- ISC Python runner now resolves canonical skill directories before copying into workspaces, and proposal output is saved relative to the canonical ISC root.
- Skill Studio proposal apply now supports safe JSON proposal files as well as legacy `.diff` files, excludes `.meta.json`, validates proposal path containment, and refreshes skill cache after apply.
- Upgrade applier finalization now recognizes no-change ISC completion as a completed no-change run and records a diagnostic `isc_workspace_root_pollution` failure code when logs/metadata show polluted workspace roots.
- Skills router now accepts `.json` proposal apply/content requests and exposes workspace-root diagnostic metadata for legacy apply runs.
- Admin Skills maintenance UI now shows workspace-root diagnostics separately from no-change normalization candidates.
- Vitest setup now resolves React aliases from the hoisted workspace package location when `apps/web/node_modules` is absent, unblocking targeted test execution in this workspace layout.

## Skill Maintenance Failure Implementation Verification
- Ran `cd apps/web/skills/intelligence-skill-creator && python3 -m unittest tests.test_runner_paths`; passing.
- Ran `npm --prefix apps/web test -- server/services/__tests__/skillStudioService.test.ts`; passing.
- Ran `npm --prefix apps/web test -- server/services/__tests__/skillUpgradeApplier.test.ts`; passing.
- Ran `npm --prefix apps/web test -- server/routers/__tests__/skills.legacy-upgrade-queue.test.ts`; passing.
- Ran `npm --prefix apps/web test -- client/src/pages/__tests__/AdminSkills.test.tsx`; passing.
- Ran `npm --prefix apps/web test -- server/services/__tests__/skillExecutor.sandbox.test.ts`; passing.
- Ran combined targeted gate: `npm --prefix apps/web test -- server/services/__tests__/skillStudioService.test.ts server/services/__tests__/skillUpgradeApplier.test.ts server/routers/__tests__/skills.legacy-upgrade-queue.test.ts client/src/pages/__tests__/AdminSkills.test.tsx`; 27 tests passing.
- Ran `npm --prefix apps/web run check`; passing.
- Initial `python` command failed because `python` is not installed in the environment; reran successfully with `python3`.
- Initial Vitest attempts failed before collection because React aliases pointed only at `apps/web/node_modules`; fixed the test config/setup to support the hoisted workspace layout.

## Residual Notes
- Full repository test suite was not run; targeted impacted suites and TypeScript check passed.
- The worktree remains dirty with unrelated pre-existing changes; only the skill maintenance implementation files were intentionally changed for this wave.

---

[COMPLETE] wave-admin-skills-maintenance-ui-followup - Improved the maintenance page so operators can distinguish old/new apply runs, see pending work, and understand remaining historical errors.

## Admin Skills Maintenance Follow-up Changes
- Added a maintenance overview strip with pending skill groups, safe visible actions, queued/running apply runs, attention-needed items, and latest activity timestamp.
- Added `Last analyzed` to the recommendation queue table.
- Added `Date & time` to the queued apply-run monitor with created, updated, relative age, and started timestamps.
- Kept workspace-root failures explicit and retryable instead of hiding them, so old failed runs are identifiable as historical path-pollution diagnostics.
- Normalized partial apply-run count responses to zero defaults to prevent `NaN` UI output.
- Added English and Thai locale copy for the new maintenance overview and timestamp labels.

## Admin Skills Maintenance Follow-up Verification
- Ran SocratiCode `codebase_status`: green, watcher active.
- Ran SocratiCode search for Admin Skills maintenance surfaces and impact checks for `AdminSkills.tsx` and `skills.ts`.
- Ran `npm --prefix apps/web test -- client/src/pages/__tests__/AdminSkills.test.tsx`; 12 tests passing.
- Ran `npm --prefix apps/web test -- server/routers/__tests__/skills.legacy-upgrade-queue.test.ts`; 7 tests passing.
- Ran `npm --prefix apps/web run check`; passing.

## Residual Notes
- Visual browser screenshot verification was not run because this admin route needs an authenticated admin session fixture. The UI behavior is covered by targeted component tests and TypeScript checks.

---

[COMPLETE] wave-admin-skills-next-action-guidance - Added explicit next-step guidance to the legacy upgrade queue.

## Next Action Guidance Changes
- Added a `Next step` column to the legacy upgrade queue.
- Classified each row as wait, no action needed, done, inspect/retry, apply upgrade, generate proposal, or review advice.
- No-change rows such as "Proposal generation completed without code changes" now display `No action needed` and the primary action button is disabled instead of prompting admins to generate another proposal.
- Bulk selection now excludes applied, dismissed, running, queued, and no-change rows so admins do not accidentally re-run historical no-op results.
- Added bilingual copy and a regression test for the approved/no-code-change case from the screenshot.

## Next Action Guidance Verification
- Ran `npm --prefix apps/web test -- client/src/pages/__tests__/AdminSkills.test.tsx`; 13 tests passing.
- Ran `npm --prefix apps/web test -- server/routers/__tests__/skills.legacy-upgrade-queue.test.ts`; 7 tests passing.
- Ran `npm --prefix apps/web run check`; passing.

---

[COMPLETE] wave-admin-skills-autopilot-recovery - Converted the maintenance recovery monitor from passive guidance to automatic safe remediation.

## Autopilot Recovery Changes
- Maintenance tab now automatically normalizes no-change apply runs when the system can prove the outcome is no patch/no code change.
- Maintenance tab now automatically retries workspace-root/path-pollution apply failures after the runtime path fix, without waiting for manual confirmation.
- Automatic retry is intentionally limited to classified workspace-root diagnostics; unknown failures remain visible for detail inspection instead of being retried blindly.
- Added an "Automatic recovery is active" panel showing how many no-change fixes and path retries the system is handling.
- Bulk selection now continues to exclude terminal/no-action rows so admins do not re-run historical no-op results.

## Autopilot Recovery Verification
- Ran `npm --prefix apps/web test -- client/src/pages/__tests__/AdminSkills.test.tsx`; 13 tests passing.
- Ran `npm --prefix apps/web test -- server/routers/__tests__/skills.legacy-upgrade-queue.test.ts`; 7 tests passing.
- Ran `npm --prefix apps/web run check`; passing.

---

[COMPLETE] wave-admin-skills-backlog-autoclear - Queued all actionable legacy skill upgrade backlog and made the monitor prevent duplicate proposal runs.

## Backlog Autoclear Changes
- Maintenance legacy queue now auto-queues every actionable pending/approved/failed/blocked legacy upgrade while the Maintenance tab is open.
- The monitor displays an automatic backlog cleanup panel with the remaining actionable count and sample skill names.
- Completed proposal-generation apply runs are now treated as `Review generated proposal`, so they do not get queued again as if still pending.
- Added a reusable `apps/web/scripts/auto-clear-legacy-upgrade-backlog.ts` utility with `--dry-run` support to clear existing DB backlog outside the browser.
- Skill Studio local folder checks now resolve legacy skill slug aliases before deciding a skill cannot be improved; this fixed `grok-imagine-creator` resolving to `grok-imagine-prompt-planner`.

## Backlog Autoclear Execution
- Ran `auto-clear-legacy-upgrade-backlog.ts --limit=100`: scanned 56, actionable 55, queued 50 proposal-generation tasks, 1 failed because `grok-imagine-creator` had no direct local folder.
- Fixed alias folder resolution and reran the script: attempted the remaining recommendation 139 and queued it successfully.
- Final dry-run result: `scanned: 56`, `actionable: 55`, `skippedActiveNoChangeOrProposal: 55`, `candidates: []`.

## Backlog Autoclear Verification
- Ran SocratiCode `codebase_status`: green, watcher active.
- Ran `npm --prefix apps/web test -- client/src/pages/__tests__/AdminSkills.test.tsx`; 14 tests passing.
- Ran `npm --prefix apps/web test -- server/services/__tests__/skillStudioService.test.ts`; 3 tests passing.
- Ran `npm --prefix apps/web run check`; passing.
- Restarted `smartspec-web.service` and verified `http://localhost:3000/healthz` returns `{"status":"ok"}`.

---

[COMPLETE] wave-admin-skills-hide-completed-history - Removed completed/proposal-ready history from the default maintenance monitor.

## Hide Completed History Changes
- Default `getLegacyUpgradeQueue` now filters completed apply runs that already generated a proposal or ended as no-change history.
- The Admin Skills UI also filters terminal history locally unless `Include applied items` is enabled.
- Autopilot now only sees visible actionable backlog, so completed proposal rows do not get queued again.
- Updated tests so no-change/proposal-ready rows are treated as hidden history, not next-action work.

## Hide Completed History Verification
- Ran SocratiCode `codebase_status`: green, watcher active.
- Ran `npm --prefix apps/web test -- server/routers/__tests__/skills.legacy-upgrade-queue.test.ts`; 8 tests passing.
- Ran `npm --prefix apps/web test -- client/src/pages/__tests__/AdminSkills.test.tsx`; 15 tests passing.
- Ran `npm --prefix apps/web run check`; passing.
- Restarted `smartspec-web.service` and verified `http://localhost:3000/healthz` returns `{"status":"ok"}`.

---

[COMPLETE] wave-admin-skills-hide-completed-apply-runs - Removed completed rows from the default queued apply-run monitor.

## Hide Completed Apply Runs Changes
- `getLegacyUpgradeApplyRuns({ state: "all" })` now returns only non-terminal apply runs: queued, running, failed, and blocked.
- Completed and canceled apply runs are still available through their explicit filters, but no longer appear in the default "All" monitor.
- The "All" count now represents active/problem runs instead of total historical runs.

## Hide Completed Apply Runs Verification
- Ran `npm --prefix apps/web test -- server/routers/__tests__/skills.legacy-upgrade-queue.test.ts`; 9 tests passing.
- Ran `npm --prefix apps/web test -- client/src/pages/__tests__/AdminSkills.test.tsx`; 15 tests passing.
- Ran `npm --prefix apps/web run check`; passing.
- Restarted `smartspec-web.service` and verified `http://localhost:3000/healthz` returns `{"status":"ok"}`.

---

[COMPLETE] wave-presentation-article-full-slide-image-mode - Added Article Builder support for generating slides as complete full-page media images.

## Full-Slide Image Mode Changes
- Added a `Slide visual mode` control in Article Builder with editable-slide mode and full-slide-image mode.
- Full-slide-image mode converts each planned page into one media prompt that asks the selected image provider to render the complete slide, including visible text inside the generated image.
- Image generation now uses those full-slide prompts in full-slide mode and reuses only matching page/slot assets.
- Slide JSON generation now builds a local importable image-only deck where each slide contains a single `image` element covering 100% of the canvas.
- Slot add/remove controls are hidden in full-slide mode because there is exactly one full-page image per planned slide.
- Added English and Thai UI copy for the new mode and workflow step.

## Full-Slide Image Mode Verification
- Ran SocratiCode `codebase_impact` for `apps/web/client/src/components/presentation/PresentationArticleGeneratorDialog.tsx`; no downstream caller files found.
- Ran `npm --prefix apps/web run check`; passing.
- Ran `npm --prefix apps/web test -- shared/presentation/generatedSlideImportability.test.ts server/services/presentationArticleGenerator.test.ts`; 48 tests passing.
- Attempted `npm --prefix apps/web test -- client/src/pages/PresentationEditor.test.tsx -t "prepares slide prompts"`; blocked by existing harness issue where `PresentationEditor` renders only `<div />` and `header.articleBuilder` is not present.

---

[COMPLETE] wave-presentation-article-full-slide-editorial-prompt - Reworked full-slide image prompts toward editorial infographic output.

## Full-Slide Editorial Prompt Changes
- Changed the full-slide image prompt from generic photo/poster wording into Thai-first vertical editorial slide instructions.
- Added explicit magazine/infographic layout requirements: large headline area, realistic photo focal subject, translucent lower text box, optional bottom callout cards, mobile-readable spacing.
- Added hard negative guidance against photo-only results, empty text boxes, blurry/micro text, random words, UI chrome, logos, and old "no text" instructions.
- Sanitized reused supporting-image prompts so old directives such as "No text, letters, captions, or logos" are not passed into full-slide image generation.

## Full-Slide Editorial Prompt Verification
- Ran `npm --prefix apps/web run check`; passing.
- Ran `npm --prefix apps/web test -- shared/presentation/generatedSlideImportability.test.ts server/services/presentationArticleGenerator.test.ts`; 48 tests passing.

---

[COMPLETE] wave-presentation-article-regenerate-latest-slot-asset - Made slot regeneration prefer the newest generated image for each slot.

## Latest Slot Asset Changes
- Added an optional `updatedAt` marker to Article Builder generated image assets.
- Regenerate and library assignment now stamp the slot asset when replacing a slot image.
- Normalization now chooses the newest matching asset for a slot by `updatedAt`, falling back to array order for older persisted drafts.
- This prevents old persisted/generated assets from winning over a freshly regenerated full-slide image when the same page/slot is reused.

## Latest Slot Asset Verification
- Ran `npm --prefix apps/web run check`; passing.
- Ran `npm --prefix apps/web test -- shared/presentation/generatedSlideImportability.test.ts server/services/presentationArticleGenerator.test.ts`; 48 tests passing.

---

[COMPLETE] wave-presentation-article-full-slide-style-presets - Added consistent style presets for full-slide image mode.

## Full-Slide Style Preset Changes
- Added a `Full-slide style` selector that appears only when `สไลด์เป็นภาพทั้งหน้า` is active.
- Added `Auto - choose from content` plus 24 built-in style presets, covering parenting, healthcare, corporate, social, news, documentary, luxury, education, product promo, data, travel, food, tech, finance, eco, fashion, real estate, and sport layouts.
- Persisted the selected style in the Article Builder draft so regenerating later keeps the same visual system.
- `Auto` resolves to one preset from topic/article/bundle keywords and uses that same preset contract for every page in the project.
- Full-slide prompts now include a project-level style contract, making every page in the same project consistent while allowing different projects to choose different visual systems.
- Full-slide payload debug JSON now records requested/resolved style metadata.

## Full-Slide Style Preset Verification
- Ran `npm --prefix apps/web run check`; passing.
- Ran `npm --prefix apps/web test -- shared/presentation/generatedSlideImportability.test.ts server/services/presentationArticleGenerator.test.ts`; 48 tests passing.

---

[COMPLETE] wave-presentation-article-full-slide-ratio-lock - Locked full-slide image mode to supported landscape/portrait ratios and fixed preview orientation.

## Full-Slide Ratio Lock Changes
- Full-slide image mode now limits aspect ratio choices to `9:16` and `16:9` only.
- If an older draft enters full-slide image mode with `4:5` or `5:4`, the dialog resets to `9:16`, clears generated images, and requires fresh generation.
- Generated image thumbnails in full-slide image mode now use the selected canvas aspect ratio, so portrait images preview as portrait and landscape images preview as landscape.
- Added Thai/English hint copy explaining the full-slide ratio lock and orientation-aware thumbnails.

## Full-Slide Ratio Lock Verification
- Ran `npm --prefix apps/web run check`; passing.
- Ran `npm --prefix apps/web test -- shared/presentation/generatedSlideImportability.test.ts server/services/presentationArticleGenerator.test.ts`; 48 tests passing.

---

[COMPLETE] wave-presentation-builder-rename-hide-draft-ai - Renamed Article Builder UI to Presentation Builder and hid Draft with AI actions.

## Presentation Builder Rename Changes
- Updated English and Thai header labels from Article Builder/สร้างบทความ to `Presentation Builder`.
- Updated English and Thai dialog title/description to describe the presentation-building workflow.
- Hid the Draft with AI action from both the desktop toolbar and mobile header menu.

## Presentation Builder Rename Verification
- Ran `npm --prefix apps/web run check`; passing.
- Ran `npm --prefix apps/web test -- shared/presentation/generatedSlideImportability.test.ts server/services/presentationArticleGenerator.test.ts`; 48 tests passing.

---

[COMPLETE] wave-presentation-editor-hide-fetch-pending - Hid the manual Fetch Pending action from Presentation Editor.

## Fetch Pending Visibility Changes
- Removed the Fetch Pending action from the mobile overflow menu.
- Removed the Fetch Pending action from the desktop header toolbar.
- Removed the now-unused manual `handleResolvePendingMedia` click handler; the existing automatic pending-media resolution effect remains intact.

## Fetch Pending Visibility Verification
- Ran `npm --prefix apps/web run check`; passing.
- Ran `npm --prefix apps/web test -- shared/presentation/generatedSlideImportability.test.ts server/services/presentationArticleGenerator.test.ts`; 48 tests passing.

---

[COMPLETE] wave-presentation-builder-split-text-layer-feasibility - Completed read-only feasibility analysis for split background/text-layer generation.

## Split Text Layer Feasibility Findings
- SocratiCode narrowed the relevant surfaces to Presentation Builder full-slide mode, slide JSON/import, shared presentation contracts, slideshow preview, internal slide render, MP4 export spec generation, degradation warnings, and Python Playwright/FFmpeg export.
- Current slide content already supports the primitive layering needed for a background image plus top text/shape layer.
- Current MP4 export can record browser-rendered slides through `slideRender.ts` when dynamic capture is required, so composited video export is feasible inside the existing export path.
- Green-screen text as a generated raster layer is possible but not the best default internal representation because chroma keying will be lossy around antialiased Thai text and shadows.
- Recommended implementation direction: keep internal slides as real layered elements or transparent overlay assets, and provide green-screen overlay export only as an optional external-compositing artifact.

## Split Text Layer Verification
- Read-only code inspection only; no source code changes were made for the feature.
- Fresh verification evidence: SocratiCode codebase search plus targeted reads of presentation contracts, Presentation Builder full-slide deck JSON generation, preview renderer, internal slide renderer, export spec builder, export degradation service, and Python presentation render task.
