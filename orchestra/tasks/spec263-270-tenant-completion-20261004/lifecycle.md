# Lifecycle — Spec 263/270 Tenant Public Completion

Task: close source/runtime gaps behind a public homepage still showing the old SmartAIHub hero.
Current stage: VERIFY
Resume from: VERIFY
Stop reason: implemented_with_deferred_gap / heavy verification required

| Stage | Status | Evidence |
|---|---|---|
| PLANNING | COMPLETE | Existing Specs 263/270 section plans, live screenshot, public/local HTTP evidence, and task plan |
| TDD_DESIGN | COMPLETE | `test-design.md`; focused tenant page/cache/API checks mapped |
| IMPLEMENT | COMPLETE | Tenant-aware page query/cache/fallback/sitemap/schema contracts and Astryx renderer implemented on this branch |
| VERIFY | BLOCKED_HEAVY_PENDING | `git diff HEAD --check` passed; build/test/typecheck/browser and DB compatibility intentionally not run (no build requested, shared-host/change-risk policy) |
| DEBUG_FIX | COMPLETE | Source review found and fixed payload acceptance without exact tenant/page/published ownership; first-section heading now falls back to page title |
| REVIEW | COMPLETE_WITH_DEFERRED_GAPS | Fourteen evidence-backed rounds recorded in `audit-rounds.md`; no owner-gated design/provider outputs fabricated |
| FINAL_VERIFY | PENDING_HANDOFF | Requires session-finish branch publication, then serialized integration/heavy verification and runtime deployment proof |

## Gaps
- GAP-1 (HIGH, FIXED_ON_BRANCH): tenant-aware implementation is based on `origin/main` in an isolated worktree; it has not been integrated or deployed.
- GAP-2 (HIGH, FIXED_IN_SOURCE): null/mismatched tenant page payload cannot be cached or rendered as tenant content; exact tenant/page/published checks are applied.
- GAP-3 (HIGH, DEFERRED_DATA/RUNTIME): prior local runtime returned a global `tenantId:null` page despite the tenant filter in source. The implementation fails closed; runtime DB/query plan provenance and row ownership still require serialized post-integration verification. No backfill performed.
- GAP-4 (MEDIUM, DEFERRED): public high-fidelity homepage/Film proof requires approved design, claims, assets, and route owner.
- GAP-5 (HIGH, DEFERRED): Spec 270 authoring/provider activation requires durable storage and live authorities; maintain fail-closed state.

## Gap closure triage

- must_do_now: none in source scope after renderer and response-contract review.
- should_offer_next: browser visual validation after build in an approved resource window.
- safely_deferred: approved homepage/Film design and claims/assets; Spec 270 authority/provider activation; production database ownership verification and tenant-content provisioning. These require external owners/data and/or serialized deployment gates.
- no_action_needed: globally owned legacy page with `tenantId=null` is intentionally excluded by the new tenant filter.
