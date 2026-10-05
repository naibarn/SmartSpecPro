# Orchestra Lifecycle

```yaml
task_id: spec263-270-public-completion-20261005
goal: Close all safe repository-owned implementation gaps in Specs 263/270 and make external blockers explicit.
scope: large
risk: high
phase: DEBUG_FIX
resume_from: TDD_DESIGN
state: repair_verified_ready_for_partial_integration
user_authorized: autonomous_safe_implementation_and_normal_main_integration
build_requested: false
full_typecheck_requested_this_turn: false
```

## Stage ledger
- PLANNING: COMPLETE — task-scoped plan, contract, gates, and authority blockers recorded.
- TDD_DESIGN: COMPLETE — focused tests for tenant identity, navigation state, reduced-motion video, and fork/compare scope/idempotency.
- IMPLEMENT: COMPLETE for safe repository-owned scope — tenant brand host helper, shell updates, motion behavior, stale public nav key removal, injected native fork/compare, replay scope checks.
- VERIFY: COMPLETE for changed focused scope — final route/crawler candidate run: 8 files / 58 tests passed; App and changed TSX/server syntax parse, locale JSON parse, and `git diff --check` pass.
- DEBUG_FIX: COMPLETE — review exposed (a) `tenant=null` misclassified as SmartAIHub on unknown hosts, (b) unconfirmed reduced-motion state briefly permitting autoplay, (c) stale `navbar.workflows` translation contract, (d) unguarded cross-tenant replay rows, (e) direct-route global fallbacks, (f) tenant crawler global content, and (g) missing noindex on tenant-unpublished routes. Each was fixed and targeted regressions pass.
- REVIEW: COMPLETE — 23 targeted passes recorded; latest sitemap route-key repair has two consecutive clean rounds (22–23).
- INTEGRATE: IN_PROGRESS for the direct-route/crawler repair; prior checkpoint `ec3e469ffff68ec7ee1a8299b8984e45063eddaa` remains reachable from current main.
- FINAL_VERIFY: BLOCKED — complete-spec acceptance needs external authorities, full typecheck runner, browser/live proof, and production evidence not present in this checkout. Earlier safe checkpoint remains integrated.

## Gap ledger
- GAP-263-CLAIMS-ASSETS: BLOCKED / external authority — approved Spec 258 public claims, rights/provenance/withdrawal owner for Film assets; no safe code substitute. Resume when the source evidence is recorded.
- GAP-263-SEO-ANALYTICS-BROWSER: VERIFY_ONLY / external environment — route-specific canonical/noindex ownership, consent/analytics payload proof, browser viewport/screen-reader/reduced-motion review, crawl/RUM, and deployed-domain response. Not proven locally; no build/deploy requested.
- GAP-270-DURABLE-OWNER: BLOCKED / product-data authority — durable schema/store owner and retention, delete, backup/recovery, reference closure, atomic uniqueness semantics. No speculative DDL or UI added.
- GAP-270-LIVE-AUTHORITY: BLOCKED / cross-spec authority — callable Spec 224/256 lifecycle and approved catalog/digest publication are absent.
- GAP-270-PROVIDER: BLOCKED / external account/legal/evidence — provider terms/certification, credential binding, quota, retention, egress, and real provider proof absent; feature gates remain false.
- GAP-FULL-TYPECHECK: PENDING / resource gate — do not run repository-wide local typecheck in this shared implementation session under AGENTS; assign serialized CI/dedicated runner against integrated SHA. Prior broad typecheck diagnostics are not represented as cleared.
- GAP-263-DIRECT-ROUTES: FIXED / tenant content isolation — `TenantPublicRoute` gates public content routes on host, tenant identity, and exact published page key; absent content renders a localized tenant-safe state. The route canonical path and home-only emergency entry are preserved. Fresh 7-file/50-test verification and App/component TSX parsing passed; post-review integration remains.
- GAP-263-TENANT-CRAWL: FIXED / multi-tenant crawl correctness — tenant robots/LLM responses now use canonical tenant identity, tenant-published route-backed pages, and a fail-closed policy for unresolved hosts; tenant sitemap includes only supported published route keys. Fresh publicSitemap suite passed within the 8-file/58-test run.
- GAP-263-TENANT-UNPUBLISHED-INDEX: FIXED / crawl correctness — tenant-safe unavailable states include route-specific canonical metadata with `noindex,nofollow`; assertion passes in `TenantPublicRoute.test.tsx` within the 8-file/58-test run.
- GAP-VERIFY-SEO-MOCK: FIXED / test harness — React hoisted metadata in the initial mock; the test now renders an explicit marker and passes. No production change was needed.
- GAP-VERIFY-SEO-MOCK: VERIFY_ONLY / test harness — the new assertion did not see the component SEO mock because the test mocked the alias while production imported a relative path. Align the mock module identifier and rerun the focused suites.

## Completion invariants
- No unresolved safe in-scope MUST_DO_NOW code gap remains for this checkpoint.
- Whole Specs 263 and 270 are not complete; external/authority and heavy proof gates remain open with owners/next actions in `progress.md`.
- Do not claim browser, build, deployment, production, provider, or full-typecheck success.
- This implementation delta is not stranded; it is integrated at `ec3e469ffff68ec7ee1a8299b8984e45063eddaa`. Keep remaining requirements assigned to external authority/evidence owners and do not claim whole-spec completion.
