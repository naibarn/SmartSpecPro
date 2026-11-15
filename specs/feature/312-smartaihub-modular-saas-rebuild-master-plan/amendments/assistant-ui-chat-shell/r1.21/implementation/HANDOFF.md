# SPEC-312 R1.21 HandOff

- **Outcome:** PARTIAL / CONTINUATION_REQUIRED; do not close SPEC-312.
- **Integrated source:** platform `main@9008529c2b81c75e3c83884b8616922de7ae025e`; SmartSpecPro `main@0b70d26d7b1feb954d9629355264a926e5039a9a`; both were fetched and equal to `origin/main` after push.
- **Target:** `modular-debian-dev` / `aimarkethubs.com` only. No legacy or production deployment is in scope.
- **Implemented:** a real completed Chat provider answer is written to private dev R2 and registered in canonical `worker_artifacts` with job completion/credit settlement. Authorized metadata/content routes validate identity and object digest; expiry cleanup is scheduled. Chat lists and safely previews/downloads artifacts.
- **Task Control:** SPEC-277's owning SmartSpecPro router now exposes a versioned, scoped read-only projection over its existing Task Observability source. Modular Chat uses a separate Core-scoped adapter over canonical Modular Chat Jobs. These are compatible projections, not a bridge of the legacy cookie/session and not a second task store. Unsupported identity fields remain null.
- **Mission Control:** shared v1 contract/parser exists. The available SPEC-294 source is a platform project/spec-ingestion/run projection, not a tenant Mission authority. No tenant Mission adapter/navigation was fabricated. Dependency: Mission owner must provide canonical tenant-scoped Mission identity, workspace/thread/Job relationship, authorization and read API.
- **Checks:** Core focused tests 47/47; Chat focused tests 47/47; contracts 9/9; SmartSpecPro workerJobs tests 15/15; Core/Chat typecheck and build pass. SQL integration test skipped because no dedicated disposable DB credentials are configured; it is not a pass.
- **Database:** migration 0439 applied to dev `smartspec` from the integrated immutable source. Ledger SHA/timestamp and four `SECURITY DEFINER` function ACLs were verified. Migration 0437 was not changed. Concurrent migration 0440 Seedream and its local journal entry were not staged or applied.
- **Release:** exact platform SHA deployed to `modular-debian-dev`; target health, public shell/chat health, anonymous 401 boundaries, served Chat asset parity and rollback config are recorded in the R1.21 receipt. Authenticated artifact/Task UAT remains pending a normal MFA-authorized browser session.
- **Remaining:** obtain the SPEC-294-owned tenant-scoped Mission contract/source and complete authenticated browser UAT. Keep R1.21/SPEC-312 PARTIAL until required acceptance evidence exists.

See [traceability](IMPLEMENTATION_TRACEABILITY.md) and [release evidence](r1.21-dev-release.md).
