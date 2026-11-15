# SPEC-312 R1.20 HandOff

- **Outcome:** PARTIAL; do not close R1.20 or SPEC-312.
- **Platform source:** `smartaihub-platform/main@dfa5eaf9a1fcfe6796d1fa8ac54c90341afed950` (integrated and deployed).
- **SmartSpecPro source:** `main@b537915eaa4c3dc08f4d5881814de94c78946277` (integrated; migration 0438 applied to dev `smartspec`).
- **Target:** `modular-debian-dev` / `aimarkethubs.com`; no production target touched.
- **Implemented:** versioned authorized conversation → canonical Job/Attempt/Event-cursor projection; Chat proxy and Inspector selection/refresh consumption with explicit null upstream IDs.
- **Verification:** contracts 7/7; Core 121/121, typecheck/build pass; Chat 49/49, typecheck/build pass; exact-SHA Core/Shell/Chat immutable build; target controller `DEPLOYED_AND_VERIFIED`; local/public smoke passed; anonymous Core and Chat projection routes returned 401; served Chat entry hash matched artifact.
- **Database:** migration 0438 applied and hash/timestamp matched. Its disposable SQL fixture was skipped because dedicated test DB credentials were not configured. Migration 0437 owner review remains open.
- **Not complete:** no genuine Chat output producer/private object resolver, so `artifacts=false`; Agent/Harness/Run/Executor/Machine source identities are unavailable; no Modular Task Control/Mission Control DTO or adapter; authenticated rendered Inspector/data-path UAT pending normal MFA session.
- **Dependency ownership:** SPEC-277 owns the Task Control read-model foundation; SPEC-294 defines Mission Control projection semantics. SmartSpecPro legacy task store/read model are not a Modular API and are not used by this release. SPEC-277/SPEC-294 implementers must publish tenant-scoped DTO and authorization contracts; Modular Core owns compatible adapters; Chat owns navigation/rendering.

## Continue

1. Trace a real authorized Chat/job tool output to canonical `worker_artifacts` and its private storage binding. Implement registration, scoped metadata/content retrieval, safe previews and negative tenant tests only against a verified producer. Keep artifacts disabled until end-to-end evidence passes.
2. Obtain versioned Task Control and Mission Control DTO/authorization contracts from SPEC-277/SPEC-294 implementers; then add read-only Core adapters and Chat navigation without a second dispatch path.
3. Perform authenticated Inspector, send/replay and responsive UAT through a normal authorized MFA browser session.
4. Review migration 0437 receipt and SECURITY DEFINER ownership with registered migration authority. Do not replay it or alter migration ownership based on missing runtime ledger access.

See [implementation traceability](IMPLEMENTATION_TRACEABILITY.md) and [exact DEV release evidence](r1.20-dev-release-20261115-dfa5eaf.md).
