# Orchestra Lifecycle

```yaml
task_id: spec263-270-public-completion-20261005
goal: Close all safe repository-owned implementation gaps in Specs 263/270 and make external blockers explicit.
scope: large
risk: high
phase: FINAL_VERIFY
resume_from: TDD_DESIGN
state: implementation_checkpoints_integrated_external_proof_open
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
- INTEGRATE: COMPLETE — direct-route/crawler repair `8f9f635fd2cc65239c4178cc6a79886e7b2d5229` was pushed through normal non-force GitHub path and is an ancestor of current `origin/main` `ff8cd676035daf697c7bca5e94028ed965358632`.
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
