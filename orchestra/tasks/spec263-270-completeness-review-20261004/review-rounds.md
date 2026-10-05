# Spec 263 / 270 completeness review — 2026-10-04

This records ten distinct source/contract review rounds. Each round checked source against the canonical section plans, acceptance criteria, or invariants; this is not a claim of production or browser certification. No build, deployment, migration, or service restart was performed.

## Ten review rounds

1. **Spec 263 route truth and retired claims** — `getTenantSeo` supplied retired Workflow Swarms/virtual workflow claims; configured SEO could repeat them. Replaced defaults with neutral copy and recursively sanitized tenant SEO overrides, including `/api/tenant/seo` metadata. Removed stale phrases from public pricing/docs/admin defaults where found and extended the public truth guard.
2. **Spec 263 tenant bootstrap and home authority** — `Home` selected the SmartAIHub page by mutable slug and could render before tenant resolution. It now waits for tenant identity and checks the resolved tenant's canonical primary domain. Added loading and slug-change regressions.
3. **Spec 263 tenant page SEO authority** — tenant-authored homepage metadata could be overridden by remote tenant-wide defaults. `TenantHomePage` now opts out of the competing SEO fetch/default merge so published page metadata remains authoritative.
4. **Spec 263 sitemap isolation and route existence** — secondary tenant sitemaps inherited SmartAIHub static links and arbitrary tenant slugs. They now start empty, include only published home/docs keys with matching public route families, and retain SmartAIHub static links only for the canonical SmartAIHub tenant. Added secondary-domain assertions.
5. **Spec 263 initial HTML and canonical domain** — Vite applied SmartAIHub's static SEO snapshot to every tenant host. Non-primary tenants now receive tenant identity metadata and a canonical URL based on the tenant's configured primary domain; primary SmartAIHub continues through its existing snapshot. This prevents cross-tenant SmartAIHub SEO leakage, but does not server-render tenant-authored content.
6. **Spec 263 analytics privacy** — page-view capture retained query and fragment data even after share-token path redaction. Analytics now sends pathname only and redacts share bearer-token segments. Added direct privacy regressions.
7. **Spec 263 tenant public-page cache contract** — the tenant-owned published page response lacked a cache policy. The route now sets `Cache-Control: private, no-store` before lookup; the route regression checks the response header.
8. **Spec 263 accessibility, media, and client-render proof** — reviewed `TenantHomePage` semantics/media handling and client rendering. The source still lacks full reduced-motion, captions/poster fallback, and browser/responsive evidence; these are recorded as partial, not silently claimed complete.
9. **Spec 270 version contract and approval freshness** — the artifact-version schema omitted `schemaVersion`; appended versions inherited approved status, rights clearance, and action bindings. Added schema version 1, made every appended version a draft, cleared prior asset rights and action bindings, and added a regression with an approved predecessor.
10. **Spec 270 G0, ownership, authority, provider, and authoring closure** — cross-checked the implementation ledgers and section plans. Durable persistence/recovery/retention ownership, callable Spec 224/256 authorities, certified provider credentials, worker/outbox action contract, product catalog authority, and authenticated authoring UI remain blocked or partial. No mock route, migration, provider, or flag activation was introduced to mask those blockers.

## Section disposition after remediation

### Spec 263

- §01 route inventory and truth map: **partial** — route inventory exists; per-tenant route ownership/canonical/indexability and external production crawl proof remain open.
- §02 shell and retired claims: **improved; still partial** — the identified SEO defaults and public seeds were corrected. Full browser, localization, consent, and all-dynamic-content review remains open.
- §03 homepage hierarchy: **partial / externally blocked** — tenant-aware published homepage rendering is source-backed; approved SmartAIHub design artifact, claim set, conversion owner, and rights-cleared proof media are absent.
- §04 Film route/handoff: **blocked** — no approved route, Film claim/asset rights, or handoff authority. The private drama route is not treated as public acceptance.
- §05 crawl, SEO, accessibility, operations: **partial** — tenant sitemap and shell identity isolation improved; tenant-content SSR, accessibility/media fallback, browser, production crawl, analytics-provider, and operational proof remain open.

### Spec 270

- §01 contract baseline: **partial** — schema version and version freshness gaps fixed; product catalog authority and complete lifecycle still open.
- §02 durable storage: **partial / blocked** — injected repository boundary only; durable owner, database adapter/migration, recovery, retention, delete/restore, and asset closure remain unapproved.
- §03 product component resolution: **partial** — pinned resolver exists; SmartAIHub product catalog ownership and deprecation lifecycle remain open.
- §04 handoff: **partial / blocked** — injected boundary exists; no callable Spec 224/256 authority.
- §05 provider: **partial, safely disabled** — fail-closed adapter only; provider certification, credential binding, idempotency/reconciliation, and cleanup remain open.
- §06 authoring UI: **blocked** — no durable owner/handoff route, so no save-capable UI was fabricated.
- §07 verification: **partial** — focused source tests pass; browser, durable-storage, provider, and production evidence remain open.

## Verification performed

- Focused Vitest: 10 files, 60 tests passed (2026-10-04).
- `git diff --check`: passed.
- Build/typecheck: not run; the user's no-build instruction was preserved, and repository instructions prohibit typecheck unless explicitly requested.
- Production/browser/provider/database proof: not performed.

## Final assessment

The source is **not fully complete against all Spec 263 and 270 acceptance criteria**. Repository-actionable tenant isolation, public claim, analytics privacy, cache, and artifact-version gaps found in this review were fixed. External-authority and production-proof gates remain explicitly open in the section ledger above.
