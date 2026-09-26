# Plan completeness audit — 10 rounds

Audit scope: `spec.md`, `claude-spec.md`, `claude-plan.md`,
`claude-plan-tdd.md`, `gap-matrix.md`, `sections/index.md` and all eight
section files. The audit was repeated after each identified documentation gap
was corrected.

## Round results

| Round | Review lens | Result | Evidence / correction |
|---|---|---|---|
| 1 | User requirement coverage | PASS | All seven reported gaps map to `gap-matrix.md` and Sections 01–08 |
| 2 | Dependency and delivery order | PASS | Section 03 is critical path; Section 06 starts after 03 and integrates after 05; graph/index aligned |
| 3 | Authority and retired-system boundary | PASS | Feature 195, Spec 207 and Runner/provider ownership are explicit; no `/workflows`, Agency/workpacks or OpenSandbox |
| 4 | Durable data and idempotency | PASS | Tenant, exact version/hash, input fingerprint, checkpoint digest, revision, event key and idempotency are required |
| 5 | API and authorization contracts | PASS | Library/Marketplace, dependency, entitlement, run/invoke, lifecycle and result contracts are named with server-derived authority |
| 6 | Real worker execution path | PASS | Plan now requires outbox → canonical envelope → unified consumer → registered executor → approved Runner/provider adapter |
| 7 | Lifecycle and recovery | PASS | Approval expiry, retry classification, attempt preservation, cancel unknown finality, resume and fencing are covered |
| 8 | Output, artifacts and observability | PASS | Output manifest, authorized proxy serving, redaction, cursor replay/rebuild and unknown-event quarantine are covered |
| 9 | Mockup-led UI/UX | PASS | Dashboard-to-Run route, supplied mockups, responsive matrix, accessibility, Thai/English copy and browser evidence are explicit |
| 10 | TDD, migration and release proof | PASS | Tests-first, focused integration, real Job/provider/artifact/economic proof, additive canary and active-run-safe rollback are required |

## Gaps found and fixed during audit

1. The dependency diagram did not show Section 03 as a prerequisite for
   Section 06. The graph and ordering text were corrected.
2. The plan stopped at Job admission without explicitly describing the worker
   execution path. The registered executor and canonical consumer contract were
   added to the spec, plan, TDD plan and Section 03.
3. Catalog/control/result APIs were described too generally. Explicit procedure
   names, access boundaries, decision revisions and durable operation results
   were added.
4. Projection rebuild and unknown-event handling were implicit. Durable cursor,
   quarantine and bounded replay/rebuild requirements were added.
5. Migration rollback safety was not sufficiently operational. Additive
   expand/migrate/contract, tenant canary, active-run drain/fencing and
   reconciliation/rebuild gates were added.
6. Adding the explicit mode contract caused Section 04 to become UI-affecting;
   its mockup-led UI/UX contract, responsive states and browser evidence were
   added before the final checker run.

## Final decision

The plan passes the ten-round completeness audit and is ready for sequential
deep-implement. Runtime implementation must still pass the section acceptance
and real-environment evidence gates; mocked UI or local Job doubles are not
production completion evidence.
