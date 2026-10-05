# Orchestra Lifecycle

## 2026-10-05 public homepage incident continuation
- Repository repair: remove acceptance of a `tenantId=null` platform/global page in `useTenantPage`; the SmartAIHub canonical host now reaches the code-owned curated home unless an exact SmartAIHub tenant-owned published page exists. Other tenants continue to render only exact-tenant published content. Regression proof is 2 focused files / 16 tests on the candidate; final integrated SHA/build is pending.
- Runtime RCA: current service checkout is on `codex/spec261-spaas-phase-a-20261005` at `d6ef8f3eb88f408a0259633ef4c48325e12bf0cd`, not current `origin/main`; its Home static bundle matched the public asset byte-for-byte. The API response is dynamic/no-store, ruling out Cloudflare cache as the primary cause. A prior canonical build failed on an unbuilt local remotion package; fixes landed in main at `6fa47dd...` and `6c548c1...`, and build passed at the latter SHA.
- Deployment/live proof remains pending. The shared service checkout has unrelated dirty changes and must not be reset/rebased/overwritten. Only a verified static artifact may be promoted, with backup/rollback and a check that it does not require newer server APIs. Recheck public asset hash and page copy after promotion.
- Spec 263/270 remain partial pending browser/responsive/accessibility/crawl evidence and external claims, asset rights, durable artifact/catalog, authority and provider gates. No browser, production DB write, migration, or live deployment is claimed here.

```yaml
task_id: spec263-270-public-completion-20261005
goal: Close all safe repository-owned implementation gaps in Specs 263/270 and make external blockers explicit.
scope: large
risk: high
phase: FINAL_VERIFY
resume_from: TDD_DESIGN
state: safe_continuation_integrated_external_proof_open
user_authorized: autonomous_safe_implementation_and_normal_main_integration
build_requested: false
full_typecheck_requested_this_turn: true
```

## Stage ledger
- PLANNING: COMPLETE — task-scoped plan, contract, gates, and authority blockers recorded.
- TDD_DESIGN: COMPLETE — focused tests for tenant identity, navigation state, reduced-motion video, and fork/compare scope/idempotency.
- IMPLEMENT: COMPLETE for safe repository-owned scope — tenant brand host helper, shell updates, motion behavior, stale public nav key removal, injected native fork/compare, replay scope checks.
- VERIFY: COMPLETE for changed focused scope — final route/crawler candidate run: 8 files / 58 tests passed; App and changed TSX/server syntax parse, locale JSON parse, and `git diff --check` pass.
- DEBUG_FIX: COMPLETE — review exposed (a) `tenant=null` misclassified as SmartAIHub on unknown hosts, (b) unconfirmed reduced-motion state briefly permitting autoplay, (c) stale `navbar.workflows` translation contract, (d) unguarded cross-tenant replay rows, (e) direct-route global fallbacks, (f) tenant crawler global content, and (g) missing noindex on tenant-unpublished routes. Each was fixed and targeted regressions pass.
- REVIEW: COMPLETE — 23 targeted passes recorded; latest sitemap route-key repair has two consecutive clean rounds (22–23).
- INTEGRATE: COMPLETE — latest homepage fallback repair `9524ec7592a4a5b57bf8a65baf1f04b2074ffc21` was pushed through normal non-force GitHub path and verified equal to refreshed `origin/main`.
- FINAL_VERIFY: BLOCKED — complete-spec acceptance needs external authorities, the Spec 224 full-verification queue, browser/live proof, and production evidence. Host memory is available, but Spec 224 §36.4.3 prohibits spawning full checks from a local command runner. No canonical enqueue tool is available in this session, so typecheck status is `QUEUE_REQUIRED` rather than passed or failed.

## Gap ledger
- GAP-263-CLAIMS-ASSETS: BLOCKED / external authority — approved Spec 258 public claims, rights/provenance/withdrawal owner for Film assets; no safe code substitute. Resume when the source evidence is recorded.
- GAP-263-SEO-ANALYTICS-BROWSER: VERIFY_ONLY / external environment — route-specific canonical/noindex ownership, consent/analytics payload proof, browser viewport/screen-reader/reduced-motion review, crawl/RUM, and deployed-domain response. Not proven locally; no build/deploy requested.
- GAP-270-DURABLE-OWNER: BLOCKED / product-data authority — durable schema/store owner and retention, delete, backup/recovery, reference closure, atomic uniqueness semantics. No speculative DDL or UI added.
- GAP-270-LIVE-AUTHORITY: BLOCKED / cross-spec authority — callable Spec 224/256 lifecycle and approved catalog/digest publication are absent.
- GAP-270-PROVIDER: BLOCKED / external account/legal/evidence — provider terms/certification, credential binding, quota, retention, egress, and real provider proof absent; feature gates remain false.
- GAP-FULL-TYPECHECK: QUEUE_REQUIRED / execution authority — user requested full typecheck; Spec 224 §36.4.3 requires canonical `worker_jobs` + outbox enqueue and worker admission/lease, forbidding local command-runner execution. No enqueue tool is exposed here. Next action: submit serialized full check for current main `ff8cd676035daf697c7bca5e94028ed965358632` through the canonical Spec 224 path; retain prior baseline diagnostics as uncleared until exact-SHA result arrives.
- GAP-263-DIRECT-ROUTES: FIXED_AND_INTEGRATED — `TenantPublicRoute` gates public content routes on host, tenant identity, and exact published page key; absent content renders a localized tenant-safe state. The route canonical path and home-only emergency entry are preserved. Fresh 8-file/58-test verification and App/component TSX parsing passed; fix is included in `8f9f635...`.
- GAP-263-TENANT-CRAWL: FIXED_AND_INTEGRATED — tenant robots/LLM responses now use canonical tenant identity, tenant-published route-backed pages, and a fail-closed policy for unresolved hosts; tenant sitemap includes only supported published route keys. Fresh publicSitemap suite passed within the 8-file/58-test run.
- GAP-263-TENANT-UNPUBLISHED-INDEX: FIXED_AND_INTEGRATED — tenant-safe unavailable states include route-specific canonical metadata with `noindex,nofollow`; assertion passes in `TenantPublicRoute.test.tsx` within the 8-file/58-test run.
- GAP-VERIFY-SEO-MOCK: FIXED / test harness — React hoisted metadata in the initial mock; the test now renders an explicit marker and passes. No production change was needed.

## Completion invariants
- No unresolved safe in-scope MUST_DO_NOW code gap remains for this checkpoint.
- Whole Specs 263 and 270 are not complete; external/authority and heavy proof gates remain open with owners/next actions in `progress.md`.
- Do not claim browser, build, deployment, production, provider, or full-typecheck success.
- These implementation deltas are not stranded; they are integrated through `8f9f635fd2cc65239c4178cc6a79886e7b2d5229`. Keep remaining requirements assigned to external authority/evidence owners and do not claim whole-spec completion.

## Continuation checkpoint — 2026-10-05
- Integrated safe fixes in `d91e090a73821558a9dc52b87750b081bdf22c53` by normal non-force push; confirmed reachable from refreshed `origin/main`.
- Exact-scope focused run: 12 suites / 65 tests passed before promotion and again on integrated source SHA `d91e090a73821558a9dc52b87750b081bdf22c53`; staged diff passed `git diff --cached --check`, conflict-marker and scoped secret-pattern checks.
- Dependency-isolated package typecheck on exact `origin/main` `2c2e094...` failed with 942 diagnostics across 250 files; no task-owned source diagnostic. An earlier 927-error run used canonical dependency links and is superseded. Full typecheck remains `QUEUE_REQUIRED`. No build, browser, production crawl, provider call, DB mutation or deployment was performed.
- `GAP-263-SEO-NULL`: FIXED / INTEGRATED — null tenant/API metadata no longer crashes `<Seo>`; regression test passes.
- `GAP-263-AUTH-INTENT`: FIXED / INTEGRATED — only validated dashboard, drama-series, device-code and MCP transaction intents survive redirect parsing.
- `GAP-263-ANALYTICS-PRIVACY`: CODE_FAIL_CLOSED / INTEGRATED; consent UX/owner BLOCKED — no init before durable explicit grant, revoke resets identity, public pageviews emit only route templates. No approved consent UI/authority was found.
- `GAP-224-VITEST-WORKERS`: FIXED / INTEGRATED — unsupported Vitest 4.1 `--minWorkers` removed from quick/integration profiles.
- `GAP-APPS-WEB-TYPECHECK`: CODE_FAILED — dependency-isolated exact-main check `2c2e094...` reports 942 diagnostics across 250 files. No task-owned source errors. Earlier 927-error output was contaminated by canonical package aliases and is superseded. Next: owning module fixes and package rerun.
- `GAP-FULL-TYPECHECK`: QUEUE_REQUIRED — requires canonical `worker_jobs`+outbox admission; enqueue unavailable in this session.
- Outcome remains `CHECKPOINT_PROMOTED_PARTIAL`. Whole Specs 263/270 remain open for external authority, browser/live proof, and typecheck repair. The user's no-build instruction remains in force.

## Continuation 2026-10-05
- Added null-safe SEO defaults after reproducing the actual `/features` `defaultTitle` crash; added explicit auth intent allowlist, PostHog opt-in/revoke boundary and privacy-safe public route templates, and removed Vitest 4.1 unsupported worker flags.
- Current candidate focused proof: 12 suites / 62 tests. Package check: `CODE_FAILED`, 927 diagnostics across broad existing package/shared sources; no task-owned source diagnostics after SEO type correction. Runner evidence revision reflects base `0cbb0ae9...` because the worktree was dirty.
- Fast checkpoint integration pending; before promotion refresh `origin/main`, rebase, and rerun focused 12-suite gate. Do not claim package or full typecheck passed. Build/deploy remain prohibited by user direction.
- `GAP-263-SEO-ANALYTICS-BROWSER`: code hardening improved, but approved consent UI/authority was not found; persisted opt-in is fail-closed, browser/vendor proof still open. Route canonical ownership, viewport/accessibility/crawl/RUM/live-domain proof remain open.
- Full repository typecheck is separate `QUEUE_REQUIRED` under Spec 224 §36.4.3; package typecheck is distinct and already `CODE_FAILED` (927 diagnostics).

## Continuation — canonical homepage content routing
- Root cause confirmed in code: `/api/tenant/public-pages/:pageKey` selected only `tenantId = currentTenant.id`, and `useTenantPage` rejected `tenantId=null`. A published platform-scoped SmartAIHub home therefore missed both layers and `Home.tsx` fell back to the generic static experience. Existing task evidence records the production homepage payload with `tenantId=null`; production was not queried again in this continuation.
- Fix: preserve exact-tenant-first lookup; only on normalized `smartaihub.app`/`www.smartaihub.app`, only for `pageKey=home`, read a published `tenantId IS NULL` page. Client accepts that response only for the same canonical host and home key. Public-page cache keys now include both tenant and host. Custom tenant host and tenant-owned overrides remain isolated.
- Regression coverage added for canonical global fallback, custom-host rejection, canonical-host recognition, and tenant/host cache partitioning. Tests are `NOT_RUN`: Vitest is not installed/resolvable in this isolated worktree; attempting to invoke the canonical Vitest against it failed during config loading. No dependency overlay was left behind.
- Changed TypeScript/TSX files passed `transpileModule` syntax parsing and `git diff --check`. No build or deploy was run.
- Post-integration dependency-isolated package check on `9524ec7592a4a5b57bf8a65baf1f04b2074ffc21` is `CODE_FAILED` with 1,888 TypeScript diagnostics across broad apps/web scope; no diagnostic references the four changed TypeScript/TSX files. The runner observed 21,667 MiB available and completed normally (not resource-blocked). Full repository typecheck remains `QUEUE_REQUIRED` under Spec 224 §36.4.3.
- Status at this historical checkpoint: homepage content-routing gap was implementation-ready for canonical integration; this was superseded by integration at `9524ec759...`. Browser/live rendering remained unverified.

## Follow-up closeout — 2026-10-05
- Current task worktree `7d16fc68ea494cd9afb3ed2ec270fb9571209163` is an ancestor of refreshed `origin/main` `104e922c0c18f8e1c76d5d308020a358c58b4f23`; no unintegrated implementation delta exists.
- Ran the focused homepage regression suites on the task worktree: `server/routers/__tests__/tenantPublicPages.test.ts` and `client/src/hooks/__tests__/useTenantPage.test.tsx`; 2 files / 11 tests passed. This resolves the prior `NOT_RUN` note for these suites. The result is source-SHA scoped to `7d16fc68...`; it does not prove current public deployment behavior.
- Independent read-only reviews of Specs 263 and 270 found no additional safe repository-owned code gap. Remaining implementation candidates require decisions/authorities assigned externally: approved Film claims/assets/rights, analytics consent UX authority, durable artifact repository/retention/recovery owner, callable Spec 224/256 lifecycle, approved catalog digest publication, and real provider certification/credential binding. Do not add speculative routes, schema, provider execution, or enable flags without those inputs.
- Package `apps/web` check remains `CODE_FAILED` on `9524ec759...` with 1,888 diagnostics across broad package scope; no diagnostic referenced the four files changed by the homepage fix. This is an open package-wide repair item, not an identified regression in this task's changes. Full repository typecheck remains `QUEUE_REQUIRED` under Spec 224 §36.4.3; no enqueue tool was available.
- No build, browser/UAT, production crawl, provider call, database mutation, or deployment was run. Therefore whole-spec completion and live-site rendering remain unverified.
- Outcome: `ALREADY_IN_MAIN` for repository-owned changes; Specs 263/270 remain open for evidence/authority and verification gates above.
