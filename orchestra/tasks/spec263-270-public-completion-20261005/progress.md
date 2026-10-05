# Progress

## Current checkpoint
- Branch/worktree: `codex/spec263-270-public-completion-20261005`; tenant shell/service checkpoint `ec3e469ffff68ec7ee1a8299b8984e45063eddaa`, evidence commit `28b247b427692815a9e9e221976c2587b84920f3`, and direct-route/crawler repair `8f9f635fd2cc65239c4178cc6a79886e7b2d5229` are reachable from `origin/main`. Main has since advanced concurrently to `ff8cd676035daf697c7bca5e94028ed965358632`; the route/crawler repair remains an ancestor.
- This continuation closes repository-owned gaps in tenant brand isolation, public navigation/accessibility, reduced-motion autoplay, stale retired nav metadata, and the injected Spec 270 artifact service boundary.
- Focused proof for the integrated checkpoint: 6 files / 47 tests passed. The current direct-route/crawler repair then passed 8 files / 58 tests; App and changed TSX/server syntax parsing, `git diff --check`, and bilingual locale JSON parse passed.
- No app build, repository-wide typecheck, browser/UAT, production crawl, DB write, provider call/certification, or deployment.

## Current stage and resume
- Stage: `REVIEW` complete with 23 targeted passes; route and crawler boundaries keep SmartAIHub routes unchanged, resolve tenant page keys to exact published tenant content, and use tenant-only crawler output.
- Resume: `EXTERNAL_AUTHORITY_AND_EVIDENCE`. Whole Specs 263/270 remain `IMPLEMENTED_BUT_BLOCKED` by authority and external-evidence gates below.

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
- Full repository typecheck was explicitly requested earlier, but Spec 224 §36.4.3 requires enqueue through canonical `worker_jobs` + outbox and prohibits spawning it from a local command runner. No canonical enqueue tool is exposed in this session; status is `QUEUE_REQUIRED` for current main SHA `ff8cd676035daf697c7bca5e94028ed965358632`. Prior broad diagnostics remain uncleared. No build is run per user instruction.
- Integration proof: normal non-force push promoted `8f9f635fd2cc65239c4178cc6a79886e7b2d5229`; GitHub `main` was verified at that SHA, then advanced concurrently to `ff8cd676035daf697c7bca5e94028ed965358632`. `git merge-base --is-ancestor 8f9f635... origin/main` passed. The worktree is clean.
- Next action: assign serialized CI/dedicated-runner typecheck and remaining external/browser/deployed-domain proofs against the latest main SHA. Build/deploy synchronization stays separate.
