# Progress

## Current checkpoint
- Branch/worktree: `codex/spec263-270-public-completion-20261005`; tenant shell/service checkpoint `ec3e469ffff68ec7ee1a8299b8984e45063eddaa` and evidence commit `28b247b427692815a9e9e221976c2587b84920f3` are reachable from `origin/main`. Direct-route and crawler isolation repairs are implemented and focused-verified on this worktree atop main `28b247b4`; latest tenant crawler change has two clean review passes and is ready for a second integration checkpoint.
- This continuation closes repository-owned gaps in tenant brand isolation, public navigation/accessibility, reduced-motion autoplay, stale retired nav metadata, and the injected Spec 270 artifact service boundary.
- Focused proof for the integrated checkpoint: 6 files / 47 tests passed. The current direct-route/crawler repair then passed 8 files / 58 tests; App and changed TSX/server syntax parsing, `git diff --check`, and bilingual locale JSON parse passed.
- No app build, repository-wide typecheck, browser/UAT, production crawl, DB write, provider call/certification, or deployment.

## Current stage and resume
- Stage: `REVIEW` complete with 23 targeted passes; route and crawler boundaries keep SmartAIHub routes unchanged, resolve tenant page keys to exact published tenant content, and use tenant-only crawler output.
- Resume: `INTEGRATE` the verified direct-route/crawler repair, then `EXTERNAL_AUTHORITY_AND_EVIDENCE`. Whole Specs 263/270 remain `IMPLEMENTED_BUT_BLOCKED` by authority and external-evidence gates below.

## Repository-owned scope now closed for this checkpoint
- SmartAIHub-specific Navbar/Footer content only renders for verified SmartAIHub/local development hosts; unknown hosts fail closed. Custom tenants get their own available logo/name and only tenant-safe public navigation; global social/support/product/company/legal links are not leaked. Tenant-provided email is used only when present.
- Direct public content URLs are host-aware: tenant domains render only the corresponding exact-tenant published page, or a localized unavailable state. Published pages keep the requested canonical path and only the tenant home shows the emergency entry. SmartAIHub's current domain retains its existing public routes.
- Tenant sitemap/robots/LLM outputs use the tenant canonical domain and published route-backed content; unknown hosts do not receive SmartAIHub LLM data.
- Mobile menu semantics, localized labels, active route, Escape close/focus restoration, and reduced-motion animation behavior have focused coverage.
- Tenant home autoplay video waits for a confirmed non-reduced-motion preference; poster/fallback remains available otherwise.
- Removed the unused public `navbar.workflows` key and its stale required-key reference; no route/capability was added.
- Spec 270 service adds bounded native fork/compare and verifies repository replay scope across create/append/fork; fork idempotency is actor scoped. Feature flags remain default-off.

## Remaining blockers / post-integration obligations
- Spec 263: approved Spec 258 Film public claim source and rights-cleared asset/provenance/withdrawal owner; route-by-route canonical/robots/indexability owners; analytics consent/data minimization; real browser viewport/accessibility, crawl, performance/RUM, and deployed-domain evidence.
- Spec 270: durable artifact storage owner and approved retention/delete/backup/recovery/reference-GC/atomic uniqueness semantics; callable Spec 224/256 authorities; approved SmartAIHub component catalog publication/digest authority; provider terms/certification/credential binding/quotas/egress; native authoring UI remains gated.
- Full repository typecheck is not run in this shared implementation session under repository AGENTS resource restriction; previous known broad diagnostics remain a separate post-integration heavy gate. No build is run per user instruction.
- Integration proof for the first follow-up: non-force push; remote `main` advanced through `ec3e469ffff68ec7ee1a8299b8984e45063eddaa` and evidence commit `28b247b427692815a9e9e221976c2587b84920f3`; both are reachable. The direct-route/crawler repair remains a task-owned dirty delta and must be promoted as a second checkpoint before final handoff.
- Next action: fast-gate and promote the direct-route/crawler repair, then assign serialized CI/dedicated-runner typecheck and remaining external/browser/deployed-domain proofs against the latest main SHA. Build/deploy synchronization stays separate.
