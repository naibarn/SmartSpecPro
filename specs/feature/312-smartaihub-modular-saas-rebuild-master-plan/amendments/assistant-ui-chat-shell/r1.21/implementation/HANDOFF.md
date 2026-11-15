# SPEC-312 R1.21 HandOff

- **Outcome:** PARTIAL / CONTINUATION_REQUIRED; do not close SPEC-312.
- **Baseline:** platform `dfa5eaf9a1fcfe6796d1fa8ac54c90341afed950`; SmartSpecPro baseline `08c73a27e2505e714b14b06afba92529cb75d79f` (verify integrated SHAs in release receipt).
- **Target:** `modular-debian-dev` / `aimarkethubs.com` only. No legacy or production deployment is in scope.
- **Implemented:** a real completed Chat provider answer is written to private dev R2 and registered in canonical `worker_artifacts` with job completion/credit settlement. Authorized metadata/content routes validate identity and object digest; expiry cleanup is scheduled. Chat lists and safely previews/downloads artifacts.
- **Task Control:** SPEC-277's owning SmartSpecPro router now exposes a versioned, scoped read-only projection over its existing Task Observability source. Modular Chat uses a separate Core-scoped adapter over canonical Modular Chat Jobs. These are compatible projections, not a bridge of the legacy cookie/session and not a second task store. Unsupported identity fields remain null.
- **Mission Control:** shared v1 contract/parser exists. The available SPEC-294 source is a platform project/spec-ingestion/run projection, not a tenant Mission authority. No tenant Mission adapter/navigation was fabricated. Dependency: Mission owner must provide canonical tenant-scoped Mission identity, workspace/thread/Job relationship, authorization and read API.
- **Checks:** Core focused tests 47/47; Chat focused tests 47/47; contracts 9/9; SmartSpecPro workerJobs tests 15/15. Scoped Core and Chat typechecks/builds must be captured in the release receipt. SQL integration test skipped because no dedicated disposable DB credentials are configured; it is not a pass. Authenticated browser UAT is pending a normal MFA-authorized browser session.
- **Database:** migration 0439 is task-owned. Do not replay/modify 0437. Inspect migration runner and pending sequence before applying; preserve unrelated 0440 Seedream migration and its journal entry.
- **Remaining:** integrate both repositories on main; apply and verify only the applicable dev migration path; deploy the exact platform SHA to `modular-debian-dev`; verify Core/Chat/Shell health, artifact capability, auth denials and served asset parity; record rollback and receipt. Keep R1.21 PARTIAL until evidence exists.

See [traceability](IMPLEMENTATION_TRACEABILITY.md) and [release evidence](r1.21-dev-release.md).
