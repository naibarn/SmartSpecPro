# Deep Plan Self-Review — Round 2 (2026-09-28)

## Scope

Reconciled the current working Spec 245 amendment against the existing research, interview, implementation plan, TDD plan, and four section files. The current source change adds the final background-execution inventory rule under §11. The plan was also checked against the master spec's mandatory migration compatibility compiler in §§2.1–2.2.

## Scorecard

| Category | Result | Evidence |
|---|---|---|
| Structural integrity | PASS | Section 01 now owns the read-only five-command compiler; Sections 03/04 consume its inventory; all four sections remain in dependency order. |
| Completeness vs spec | PASS WITH EXTERNAL GATES | Added detached/in-process, callback, scheduled-occurrence, startup/reconciliation, and listener-triggered work to the plan, TDD matrix, and Sections 01/04. Unknown runtime and host callers remain blocked instead of inferred absent. |
| Implementability | PASS | Compiler module/CLI paths, outputs, fail-closed rules, fixture test file, and focused command are specified. It may not execute hooks, read secret values, or access production. |
| Internal consistency | PASS | Feature 186/195 `worker_jobs` and outbox remain the only durable job authority; Spec 232 owns Redis mechanics; local/target/production evidence are distinct. |
| Edge cases and failure modes | PASS WITH EXTERNAL GATES | Fixture cases include unknown owners, unsupported compatibility claims, side effects before durable job/outbox records, secret leakage, and detached trigger classes. Real host inventory and runtime probes cannot be proven by fixtures. |

## Findings integrated

1. The current Spec 245 §11 async-execution requirement was absent from the old plan/TDD/sections. Added explicit requirement and negative verification cases.
2. Spec 245 §§2.1–2.2 require a reusable compatibility compiler with five commands and a defined output set. Existing repository readiness scripts cover narrower contracts; added this missing local implementation to Section 01.
3. Preserved the distinction between historical target evidence and fresh target proof. No deployment or production change is authorized by this plan update.

## Residual gates

- Codebase index tools are unavailable in this runtime; targeted `rg` and bounded reads were used. Static search results do not prove process reachability or production ownership.
- Cloudflare account state, current target bindings, authenticated beta Search hit/miss traces, exhaustive systemd/container/scheduler/callback ownership, managed-PostgreSQL cutover and Debian retirement require fresh environment evidence.
- The plan is ready for section implementation; Spec 245 cannot be called production-complete until its external gates pass.

## Decision

Plan self-review passes for implementation readiness. Proceed with Sections 01–04 in manifest order. Keep live deployment, guarded data mutation, credential changes, service unmask/restart, and Debian power-off outside local implementation unless separately authorized and gated.
