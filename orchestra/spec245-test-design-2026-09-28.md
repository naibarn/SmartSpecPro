# Test Design — Spec 245 Full-System Migration

This is a task-scoped matrix; the existing `orchestra/test-design.md` belongs to another active/dirty task and is preserved.

| Requirement | Observable behavior | Test level/location | RED evidence | GREEN command/evidence | Residual boundary |
|---|---|---|---|---|---|
| Compatibility compiler's five commands | `inspect`, `classify`, `verify`, `plan`, and `report` produce deterministic, schema-valid artifacts from a fixture | Unit/contract: `apps/web/scripts/__tests__/cloudflare-migration-compiler.test.ts` | New module/CLI does not exist; add missing/negative fixture assertions first | `npm --workspace @smartspec/web exec vitest run scripts/__tests__/cloudflare-migration-compiler.test.ts` | Fixture only; no runtime/deployment completeness |
| Fail closed on unowned asynchronous business effects | Detached, callback, schedule, startup, or listener-triggered operation missing owner or canonical `worker_jobs`+outbox-before-effect is BLOCKED | Unit/contract: same compiler tests; independent inventory rows | Add a fixture with each trigger class and assert stable blockers | Same focused Vitest command | Requires exhaustive real host, schedule, callback and listener inventory |
| Reject unsupported runtime claims and redact secrets | Import/bundle-only evidence cannot classify compatible; configured secret value never appears in output | Unit: compiler tests with import-only evidence and unique secret canary | Assert each is rejected/redacted before implementation | Same focused Vitest command | Does not authorize actual probing or guarantee deployment secret inventory |
| Section 02 KV behavior | Tenant/user separation and cache outage remains a safe miss; active KV path avoids Redis | Unit/contract: existing Worker, `searchResultCache`, `responsesRoutes`, and cloudflare cache service tests | Existing tests and historical local proof are prior baseline | Focused suites described by Section 02; rerun after any changed caller | Does not refresh prior target deployment or beta hit/miss traces |
| Section 03 quota/lease and remaining group ownership | Concurrent requests respect quota; stale lease cannot cause a durable side effect; remaining groups preserve authority | Integration/contract: quota multiprocess, delegated worker lease multiprocess, PostgreSQL semaphore tests and Spec 232 family tests | Existing committed G3/G4 tests are baseline; new failures should assert real process/DB semantics | Focused commands from their package docs/sections; capture exact command per run | Local DB proof is not production migration/cutover proof |
| Section 04 background operation ingress | Webhook/callback/schedule/listener-triggered bounded business operation persists job and outbox before side effects | Unit/integration at owning route/producer tests identified during section implementation | Add regression tests before editing each identified producer | Focused package tests per producer; no full suite as substitute | Cannot prove every host process, rare schedule, or callback is inventoried |
| External retirement claims | Full migration remains blocked without fresh target identity/bindings, one-writer data evidence, full journey and Debian deny/power-off evidence | Manual/runtime: signed evidence artifacts/runbook, not local unit tests | Not applicable; unavailable environment is an explicit blocked gate | Run only with separately authorized target/production session | Never infer from local build, static scan, test fixture, or historic dated evidence |

## Test policy

- Repo typecheck is prohibited by AGENTS RAM rule and will not be run.
- Do not run broad suites; use exact focused commands after checking package syntax.
- No production state mutation or live provider test is included in this authorization.
- Every unrun external test remains an explicit open gate, not a pass.
