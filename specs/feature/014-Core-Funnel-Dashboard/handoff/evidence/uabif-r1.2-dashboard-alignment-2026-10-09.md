# UABIF R1.2 Dashboard Alignment Evidence

**Audit baseline:** `origin/main` / `d00569c58e400a5e65991adf7ff3e3f2c924b27e`

**Source:** uploaded `SPEC-299-SmartAIHub-Unified-Analytics-BI-Fabric-R1.2-Dashboard-Alignment.md`, SHA-256 `62a3f65c095cb01e3da34fa8bc0487531d5549e0dda36a95cfe8d900da92288e`

**Workspace:** `/home/dev/worktrees/uabif-dashboard-align-20261009` (`TASK_WORKTREE`)

**Reconciled verification candidate:** `466e5332285814de8b289e19ea5ae8c90c3e3eed` (after merging latest `origin/main` `05ffe1c9640fda1e3324514daaa456cb3f0d020a`)
**Scope:** owner reconciliation and a bounded freshness-transparency improvement to Feature 014; this evidence does not claim general BI runtime completion.

## Canonical identity and implementation baseline

- `specs/_status/spec-id-registry.json` assigns canonical ID 299 to `specs/quick/299-presentation-ai-layout-intelligence/spec.md`. The uploaded BI document is a historical proposal, not a canonical SPEC-299. The repository candidate under `specs/feature/_candidates/` is not promoted or rewritten.
- Feature 014 is the canonical owner of `/admin/funnel`. Existing implementation is `apps/web/server/routers/funnelAnalytics.ts`, `apps/web/client/src/pages/AdminFunnelDashboard.tsx`, `apps/web/drizzle/schema.ts` (`funnelEvents`), and migrations `0026_add_funnel_events.sql` / `0027_add_funnel_milestone_unique_index.sql`.
- The event source has UTC `eventTime`, tenant/domain scope and event-key deduplication. It does not expose a source completeness watermark. Query code previously returned no as-of/computation provenance. A latest observed event cannot establish source completeness.
- No production database, migration, tenant data, or deployment was accessed or changed.

## Ten-pass gap audit

| Pass | Lens and evidence inspected | Finding and disposition |
|---|---|---|
| 1. Registry and handoff truth | `specs/_status/spec-id-registry.json`; Feature 014 and quick/299 handoff manifests; `origin/main` SHA above | ID collision confirmed. No new SPEC or index entry. Feature 014 remains `PARTIAL_INTEGRATED`; its existing open requirement is not closed by this work. |
| 2. Owner boundaries | SPEC-240 §96; SPEC-266 §§16.1–16.2; SPEC-265 §§2, Appendix A; SPEC-270 AC-270-070; SPEC-287 §§16–19; Feature 014 | Existing owners are unambiguous. SPEC-266 owns source/metric/freshness semantics; SPEC-265 decision interpretation; SPEC-270 design artifacts; SPEC-287 rendered conformance; SPEC-240 generated surfaces/actions; Feature 014 funnel. No duplicate engine or catalog added. |
| 3. Metric semantics and time | `funnelAnalytics.ts` (`bucketToSql`, `clampDateRange`); `funnelEvents` schema; Feature 014 §17 addition | Current buckets use UTC and event-time ranges. No certified general KPI catalog or source watermark was found. Display UTC and label freshness unknown; novel semantic query/catalog ownership remains for reconciliation. |
| 4. Security and privacy | `funnelAnalytics.ts` (`buildScopeFilter`, `scopeConditions`, `sanitizeEventProperties`, export limit); `funnelAnalytics.rbac.test.ts` | Reads are scoped to server-derived tenant and, for `domain_admin`, domain. Existing RBAC and raw property sanitization are retained. Added UI exposes only timestamps and does not add row-level data. Focused tests required below. |
| 5. Source health and transparency | Router response shape; `AdminFunnelDashboard.tsx`; Feature 014 §17; SPEC-266 source health/freshness contracts | Confirmed missing query-computed and latest-observed timestamps. Added provenance fields. Watermark remains explicitly unavailable; no “live/current” claim is made. |
| 6. Generated surface and interaction safety | SPEC-240 §§36, 67; Feature 014 page/route and router procedures | This dashboard remains its existing admin page. No generated SQL, new action, drill, or broader read was added. Freshness status is host-owned and informational. |
| 7. Lifecycle and portability | SPEC-240 persistent/ephemeral surface rules; SPEC-287 Mini App lifecycle; SPEC-261/281 references in source | No saved BI dashboard or portable semantic-query package is proven in current implementation. Those capabilities remain unclaimed and unresolved; no portability workaround was added. |
| 8. Performance, cost and failure | 90-day `MAX_RANGE_DAYS`, server-side aggregate queries, export row cap; current cache helper | The provenance uses existing aggregate query results and adds no table, query round-trip, provider call, job, cache, or charge. Missing DB responses report unknown freshness and computation time. |
| 9. UX and operator conformance | AdminFunnelDashboard existing loading/error states; SPEC-270 AC-270-070; SPEC-287 responsive/accessibility evidence contract | Added accessible labeled transparency section; keeps source freshness distinct from computation time. Browser/device conformance beyond the focused component test remains pending. |
| 10. Integration and evidence truth | Changed-scope diff, focused test commands, handoff validation and canonical integration evidence to be appended after execution | No migration/production action. PR/merge SHA and generator-produced handoff state remain pending until integration. BI end-to-end acceptance is not claimed. |

## Owner reconciliation

| Owner | Disposition |
|---|---|
| SPEC-240 | No normative change: §§36 and 67 already cover result provenance/freshness, deterministic visual alternatives, and authorized server-bound reads/actions. Feature 014's existing admin surface is not a SPEC-240 generated surface. |
| SPEC-266 | No normative change: MetricDefinition, source health/freshness, provenance/lineage and evidence receipts already cover the assigned foundation. Future analytics-specific grain/dimensions/aggregation extension needs an identity/owner reconciliation. |
| SPEC-265 | No normative change: consumes SPEC-266 metric/evidence/ResearchRun receipts and explicitly does not own a parallel source/provenance system. It has no proven BI query backend. |
| SPEC-270 | No normative change: data visualization accessibility, privacy, design artifacts and provider-neutral design are already covered; no metric/query truth ownership. |
| SPEC-287 | No normative change: responsive/browser/accessibility/rendered evidence and evidence freshness are already covered; no semantic-query ownership. |
| Feature 014 | Updated: records current owner, actual schema/migration as implementation authority, UTC event-time semantics and honest unknown-watermark behavior. No schema migration. |
| Novel BI semantic query planner, cross-domain analytical catalog, saved-dashboard/refresh lifecycle, and provider adapters | `PENDING_RECONCILIATION`: no canonical owner proven; no SPEC-299 identity, implementation or completion claim. |

## Verification results

**Focused verification at the pre-merge candidate:**

- `pnpm --dir apps/web exec vitest run server/routers/funnelAnalytics.test.ts server/routers/funnelAnalytics.rbac.test.ts server/__tests__/funnelEvents.schema.test.ts server/__tests__/funnelEvents.migration.test.ts client/src/pages/__tests__/AdminFunnelDashboard.test.tsx` — PASS, 5 files / 56 tests.
- `python3 -m tools.spec_handoff --repo . validate --spec-dir specs/feature/014-Core-Funnel-Dashboard` — PASS; completion eligibility remains false and all five Feature 014 requirements remain OPEN.
- `python3 -m tools.spec_handoff --repo . index --check` — PASS, 472 records / 314 canonical Specs, no drift after generator write.
- `git diff --check` — PASS.
- Changed TypeScript files are not Prettier-clean at baseline. The same check against unmodified `funnelAnalytics.ts` also fails; this work does not reformat unrelated existing code.

These tests prove helper/API empty-database response shape, RBAC denial and scope helper behavior, schema/index shape, migration non-destructiveness, and rendered component content. The RBAC suite mocks the database, so **real cross-tenant query isolation is source-reviewed but not DB-backed verified**. No browser/device matrix, full TypeScript check, production migration, live tenant query, deployment, or acceptance was run.

## Remaining canonical reconciliation items

- `PENDING_RECONCILIATION`: canonical owner and versioned contract for cross-domain analytical semantic query planning (grain, dimensions, join safety, FX/time semantics, and normalized result receipts).
- `PENDING_RECONCILIATION`: saved-dashboard identity/version/share/refresh lifecycle beyond Feature 014's existing funnel page; do not infer SPEC-299 ownership.
- `PENDING_RECONCILIATION`: connector/provider capability inventory and certification. Provider names in the draft are not implementation evidence.
- `PENDING_VERIFICATION`: DB-backed two-tenant negative tests, full browser/device accessibility evidence, and any native Chat/Mini App vertical slice.

Each item remains open; none is represented as completed by this documentation or focused test run.

No repository-wide typecheck, production migration, live tenant query, deployment, or acceptance is implied.
