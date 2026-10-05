# Orchestra Lifecycle

```yaml
task_id: spec263-270-public-completion-20261005
goal: Close all safe repository-owned implementation gaps in Specs 263/270 and make external blockers explicit.
scope: large
risk: high
phase: POST_INTEGRATION
resume_from: EXTERNAL_AUTHORITY_AND_EVIDENCE
state: implemented_but_blocked_external_authorities_and_evidence
user_authorized: autonomous_safe_implementation_and_normal_main_integration
build_requested: false
full_typecheck_requested_this_turn: false
```

## Stage ledger
- PLANNING: COMPLETE — task-scoped plan, contract, gates, and authority blockers recorded.
- TDD_DESIGN: COMPLETE — focused tests for tenant identity, navigation state, reduced-motion video, and fork/compare scope/idempotency.
- IMPLEMENT: COMPLETE for safe repository-owned scope — tenant brand host helper, shell updates, motion behavior, stale public nav key removal, injected native fork/compare, replay scope checks.
- VERIFY: COMPLETE for changed focused scope — final candidate run: 6 files / 47 tests passed; locale JSON parse and `git diff --check` pass.
- DEBUG_FIX: COMPLETE — review exposed (a) `tenant=null` misclassified as SmartAIHub on unknown hosts, (b) unconfirmed reduced-motion state briefly permitting autoplay, (c) stale `navbar.workflows` translation contract, and (d) unguarded cross-tenant replay rows. Each was fixed and targeted regressions pass.
- REVIEW: COMPLETE — 10 targeted passes recorded in `review-findings.md`; 7 consecutive clean passes after the three material findings were repaired. Latest code gate is fresh.
- INTEGRATE: COMPLETE — `ec3e469ffff68ec7ee1a8299b8984e45063eddaa` is reachable from remote `origin/main` after a normal non-force fast-forward push.
- FINAL_VERIFY: BLOCKED — complete-spec acceptance needs external authorities, full typecheck runner, browser/live proof, and production evidence not present in this checkout. Repository-owned safe checkpoint is integrated.

## Gap ledger
- GAP-263-CLAIMS-ASSETS: BLOCKED / external authority — approved Spec 258 public claims, rights/provenance/withdrawal owner for Film assets; no safe code substitute. Resume when the source evidence is recorded.
- GAP-263-SEO-ANALYTICS-BROWSER: VERIFY_ONLY / external environment — route-specific canonical/noindex ownership, consent/analytics payload proof, browser viewport/screen-reader/reduced-motion review, crawl/RUM, and deployed-domain response. Not proven locally; no build/deploy requested.
- GAP-270-DURABLE-OWNER: BLOCKED / product-data authority — durable schema/store owner and retention, delete, backup/recovery, reference closure, atomic uniqueness semantics. No speculative DDL or UI added.
- GAP-270-LIVE-AUTHORITY: BLOCKED / cross-spec authority — callable Spec 224/256 lifecycle and approved catalog/digest publication are absent.
- GAP-270-PROVIDER: BLOCKED / external account/legal/evidence — provider terms/certification, credential binding, quota, retention, egress, and real provider proof absent; feature gates remain false.
- GAP-FULL-TYPECHECK: PENDING / resource gate — do not run repository-wide local typecheck in this shared implementation session under AGENTS; assign serialized CI/dedicated runner against integrated SHA. Prior broad typecheck diagnostics are not represented as cleared.

## Completion invariants
- No unresolved safe in-scope MUST_DO_NOW code gap remains for this checkpoint.
- Whole Specs 263 and 270 are not complete; external/authority and heavy proof gates remain open with owners/next actions in `progress.md`.
- Do not claim browser, build, deployment, production, provider, or full-typecheck success.
- This implementation delta is not stranded; it is integrated at `ec3e469ffff68ec7ee1a8299b8984e45063eddaa`. Keep remaining requirements assigned to external authority/evidence owners and do not claim whole-spec completion.
