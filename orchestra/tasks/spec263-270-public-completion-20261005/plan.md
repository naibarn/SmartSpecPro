# Execution Plan — Specs 263 and 270

## Objective
Close all repository-owned implementation gaps that can be completed safely, keep public tenant content isolated, and update section states from current source/test evidence. Do not claim external evidence or deployment.

## Active closeout continuation — pasted user authority (2026-10-05)
- Baseline: Spec 263 revision 263.8; initial candidate base `3fe45a3c9155115804c58e23e42a84e41e09cd5e`; reconciled latest canonical `origin/main` SHA `aaaec097b218d2e426861690ceff42b7b12f449c`; production frontend source `a484c8717637f7f643a6eb699e1d1cdc80dab421`.
- Classification: scope `large`; risk `high` due tenant-isolation, production deploy and multi-route public content surfaces; domains: public UX, Spec 270 design authority, asset/content truth, SEO/crawl/privacy, browser/a11y/performance, deployment.
- Route: resume current Spec 263 sections and implementation artifacts; do not create another spec. Produce the required Spec 270 public design package and route/content/asset traceability before high-fidelity implementation, then use focused tests, review/repair, canonical integration, exact-SHA build/deploy, and production acceptance.
- User explicitly authorized choosing UI/UX, sub-agent parallel work with path ownership, downgrading/removing unverifiable claims, replacing uncertain media with traceable generated/repo-owned assets, creating the public design package, canonical integration, and production deploy after gates. No extra approval is needed for these actions.
- Known safe boundaries: retain exact-tenant Home/content/crawler rules and validated `/login?returnUrl=%2Fdrama-series`; do not invent `/film`, customer/security/pricing claims, or private-gallery marketing proof; no DB changes. Replace unsupported content/assets and mark absent optional features `NOT_APPLICABLE` only when the Spec 263 requirement permits it.
- Independent workstreams: (A) route/locale/redirect/requirements inventory docs, (B) source-backed public claim/media registry and truth-map update, (C) conductor-owned design package + homepage/shell implementation, (D) post-implementation browser/a11y/SEO/privacy/performance verification. A/B may run in parallel; C consumes both outputs; D follows C.
- Discovery: SocratiCode/codebase index tools are unavailable in this runtime; targeted `rg` and bounded reads are the documented fallback. Astryx CLI exists only in the shared primary checkout's node_modules; invoked read-only from repo root. `astryx build` recommends existing `AppShell`/TopNav and primitives. A nonexistent `landing-page` template was rejected; use discovered `shell-top-nav`/`TopNavCenteredNavigation` and inspect the exact components before implementation. No template scaffold was retained.
- Loop policy for this continuation: max 12 iterations, 30 tool-call batches (soft), 6 dispatch waves, 4 concurrent agents, 2 writers, 5 repair rounds; require at least 10 distinct review rounds and 2 consecutive clean rounds, without stopping on count while safe fixes remain. Current review-round count starts at 0 for this pasted closeout request.

## Workstreams
1. **Public homepage (263.03/04):** outcome-led bilingual hero; immediately visible vertical-series product entry; use SmartAIHub's installed Astryx components; preserve established public shell and supported signed-out auth handoff; do not ship unapproved imagery or unsupported film promises.
2. **Tenant isolation and entry contracts (263.01/02/05):** preserve exact tenant-owned published pages and tenant-scoped cache; prove public URLs/auth return path/crawl exclusions; keep unresolved production crawl/browser evidence explicit.
3. **Design runtime correctness (270.05/07):** reject external requests without an immutable catalog snapshot before policy/provider calls; make valid provider candidates conform to canonical schema; retain default-off boundary.
4. **Section reconciliation:** update current worktree paths and section status/implementation evidence; mark only repository-closed items complete and name external gates precisely.

## Out of scope / gated
- Do not add speculative persistence DDL or enable feature flags while G0 lacks a verified artifact owner, retention/deletion policy, backup/recovery owner, and reference closure.
- Do not add a mock-only authoring route while durable API/auth and Spec 224/256 live authorities are absent.
- Do not invent a public Film route, claim, visual asset, customer proof, or rights provenance.
- No production DB write or migration; no provider/credential call, DDL, native-authoring enablement, or new design resolver.
- Do not build or deploy this isolated candidate. After safe integration, run the canonical exact-SHA build and repository-authorized post-integration checks; production deployment remains behind exact-SHA acceptance/rollback gates already authorized by the user.
- Do not run repository-wide typecheck in the shared implementation session. Use the Spec 224 worker/outbox/CI or dedicated-runner process after integration; no such enqueue capability is exposed in this session.

## Acceptance
- Current focused suites pass on the candidate revision.
- Home leads with an outcome and supported vertical-series entry in Thai/English.
- Published page selection/cache remains tenant-scoped; cross-tenant content is rejected.
- Provider path fails before external invocation when required catalog context is missing, and accepted candidate schema validates.
- Section records distinguish code complete, partial, externally blocked, and unverified evidence.
