# Requirement-to-Test Matrix

| Requirement | Observable behavior | Test level/location | RED target | Residual boundary |
|---|---|---|---|---|
| Chat sections bind same Runner workspace | Binding survives reload and resolves same workspace identity | Router + conversation persistence tests | Existing chat schema has no binding | Does not prove deployed migration |
| Workspace access is tenant/owner scoped | Cross-tenant conversation/workspace binding denied | Router/service tests | No workspace binding API | Live role/provider permissions need runtime proof |
| Safe multi-file/ZIP ingest | Valid .md/.json package accepted; malformed/unsafe ZIP rejected | SpecSet service tests | No importer | Does not prove object-store durability unless used |
| Immutable Spec Set revisions | Re-ingest/update creates new revision/digest; old run pin unchanged | DB integration test | No revision persistence | Requires supported database baseline/replay |
| Incremental compilation | Independent packages runnable while dependent/underspecified packages blocked | Compiler tests using closure graph | No multi-spec compiler | Does not prove executor actually follows DAG |
| Prompt/Spec only prepares | No worker job until explicit start mutation | Router/client tests | Existing create dispatch-adjacent API is manual | Does not prove end-to-end external agent execution |
| Explicit Start is server-derived and idempotent | Start pins trusted workspace and SpecSet metadata, stages bytes, and enters pending authorization | Router/client + service/compiler/staging contract tests | No workspace-scoped run request | Dirty source fingerprint and live Runner session certification remain separate |
| Build/test/run ownership | Prompt/Spec actions never imply build/test/application-run; those remain separate user-owned work | UI behavior + canonical authorization path inspection | Previously implicit scope treated build/test/run API as part of this slice | No platform-level build/test/run receipt is claimed |
| Prevent DB-size late failure | Escaped merged manifest over persistence limit fails with typed validation before insert | SpecSet service boundary test | SQL JSONB check can reject accepted upload as 500 | PostgreSQL JSONB rendering has a safety margin over JS serialization |
| Prompt privacy | Prompt prepare uses mutation payload, never URL query/cache key | Router/client tests | Raw prompt was sent through GET query | Logs at other middleware layers still require live audit |
| Same-key concurrent ingest | Two same-key/same-content requests return one immutable revision result; mismatched payload conflicts | Store/service concurrency test | Preflight idempotency check races before revision-head lock | Database unique/row locks need PostgreSQL integration proof |
| Runner workspace fact type safety | gitHead/gitBranch/dirty are validated and propagated with workspace identity only | Runner contract/service unit tests | Validator rejected facts emitted by Runner and helper return type was too narrow | No live Runner registration/check-in certification |
| Scoped completion wording | Partial package verified is not whole project complete | Closure/finality tests | No workspace aggregate projection | Requires full verification runtime for broad claims |

## Completion Roadmap Test-Design Addendum

| Requirement | Observable behavior | Test level/location | RED evidence | GREEN evidence required | Residual boundary |
|---|---|---|---|---|---|
| A run reads a pinned workspace revision | Change tracked, untracked, ignored, symlink and metadata files between prepare/start and dispatch; Runner rejects mismatch before provider spawn | Runner unit/contract + server start contract | `WorkspaceSnapshotFacts` contains only HEAD/branch/dirty; no content fingerprint is sent or revalidated before `start_external_agent` | Runner source-manifest digest is emitted, pinned in Start, and mismatch prevents spawn | Hash cost on large repos needs bounded scheduling/cache |
| Shared workspace is protected from provider mutation | Provider edits candidate then exits/fails/cancels; original workspace stays unchanged until validated apply | Runner filesystem integration test | `start_external_agent` uses registered workspace path as `current_dir` | Candidate is under Runner data root, provider sandbox is rooted there, and failure preserves the source | Codex/Claude sandbox capability must be detected and unavailable sandbox must fail closed |
| Package write set is enforced | Create/edit/delete/rename/symlink attempts outside normalized allowed paths never enter accepted result | Runner isolation/change-set contract tests | `allowedWriteSet` is compiler metadata/goal text; Runner receives no enforced path boundary | Runner validates actual candidate delta; forbidden changes cannot be published | This is a change-set filter, not a hard OS sandbox against reading files |
| Concurrent user edits are preserved | User edits a candidate-touched source path after candidate starts; apply detects the path mismatch, keeps both user and candidate versions | Runner/CAS service integration | No source fingerprint/CAS at candidate apply because there is no candidate apply path | Path-level baseline check retains candidate and leaves conflicts untouched; unrelated paths are preserved | Apply journal recovery after process restart is required |
| Markdown-only spec can declare runnable packages | Explicit Markdown package metadata yields READY; missing/invalid metadata gives actionable BLOCKED reason | Compiler unit test + UI preview test | Compiler runnable package declarations were only read from JSON `spec224.workPackages` | Bounded `spec224-work-packages` code fence is parsed deterministically; malformed/multiple metadata is rejected | Schema evolution must preserve older SpecSet revisions; UI behavior is source-tested |
| Staged input bytes have safe lifecycle | Failed Start, duplicate Start, live run, terminal run and cleanup races preserve referenced immutable input and reclaim only eligible orphan bytes | Staging/retention service unit + disposable PostgreSQL integration | Migration 0385 stored bytes without lifecycle fields/cleanup contract | workerJobId binding, bounded reconciliation, 24h orphan grace, 30d terminal retention and canonical scheduler implemented; unit tests pass | PostgreSQL locking/FK/runtime scheduling remain unverified; grants remain one-time/lease-bound |
| Final Verify reports only scoped evidence | Exact candidate/work package revisions are verified; stale or missing runtime evidence remains unverified/fail-closed | Executor contract + verifier tests | Current verifier throws `FULL_VERIFICATION_RUNTIME_NOT_CONFIGURED` | Configured verifier emits evidence bound to exact workspace/spec/plan/package digest | Provider/runtime execution still requires external certification |
| Chat sections reconnect to the same project state | Multiple authorized sections see same workspace identity and durable package/run status after late spec addition and restart | Router integration + focused UI reconnect test | Source-only tests exist; no live multi-section database/restart proof | Workspace-scoped state and pinned history reconcile after reconnect | Requires disposable DB and authenticated live Runner test |

## Expected gate order

1. Establish candidate isolation and fingerprint contract; write negative tests before implementation.
2. Establish write-set/delta and conflict-apply contract; prove the shared workspace does not change on failure.
3. Add Markdown package declaration tests and only then expose the format in help/UI.
4. Design staged-source lifecycle and concurrency tests before conductor-owned schema/migration edits.
5. Configure scoped verification against the isolated candidate.
6. Run focused code gates, disposable DB migration/replay, and non-production Runner/provider certification separately.

Full-repository typecheck is prohibited by repository policy. Full build/E2E is deferred on this shared host; do not treat either as passed.
