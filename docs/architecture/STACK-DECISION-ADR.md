# ADR — SmartAIHub Modular Core stack, R0.5

**Decision date:** 2026-11-01<br>
**Scope:** NEW first-party Modular SaaS platform; this does not modify the existing Debian legacy runtime.<br>
**Status:** Proposed technical decision, no implementation/deployment claimed.

## Decision table

| Layer | Baseline stack | Rationale / boundaries |
|---|---|---|
| New Core API | Cloudflare Workers + Hono 4.x + strict TypeScript ESM | Tiny Fetch-native API, independent deployment; no old Express/tRPC/Node server import |
| SaaS Shell | React 19 + Vite 7 + TypeScript + Tailwind CSS 4, static-first | Small modern UI, lazy routes, no SSR requirement; independent asset release |
| Module UI | Same baseline, independently built static route bundles | No requirement to share giant UI client bundle |
| Module APIs | Hono Worker only where API is needed | Static-only module needs no custom API Worker |
| Existing DB | PostgreSQL `smartspec`, exact existing schema and records | No migration to D1, no re-created identity/wallet |
| SQL driver | `pg`/node-postgres >= 8.16.3 + Hyperdrive (Cloudflare); direct PostgreSQL (Debian) | Worker-compatible, official recommended driver; narrow SQL and per-domain repository adapters |
| ORM | Thin typed SQL mapping; selective Drizzle only if measured advantageous | No legacy full schema import or request-time DDL |
| API validation | Small scoped Zod schemas and versioned contracts | Avoid giant runtime schema barrels |
| Build | Node 22 LTS, pnpm 10, Turborepo 2, Wrangler/workerd, locked versions | Affected-only build and deterministic artifact receipt |
| Files/assets | CF Static Assets + R2 object storage | No binary/images/large files in Worker JS bundle |
| Long compute | Specialized on-demand provider/executor, existing `worker_jobs` authority | No always-on application Container; FFmpeg/GPU/render jobs not in Core |
| Routing | Core + Shell + per-module distinct Worker/static asset release | Shared hostname UI, independent deploy/rollback |

## Architectural distinctions

1. **Core fresh implementation** — reverse engineer the existing behavior and schema without copying the old application architecture. Reuse only audited pure helpers if required for exact account/hash compatibility.
2. **Business Modules selective migration** — Copy → Isolate → Slim → Modernize only useful parts; no `apps/web` runtime dependency.
3. **Single database and authority** — Canonical user/tenant/ledger/jobs and schema unchanged. Business rule parity on `aimarkethubs.com` and `smartsihub.com`.
4. **Performance baseline, not an approval gate** — Measure bundle and startup, query counts, CPU, p95 latency, browser payload, build peak RSS and Cloudflare spending. Improve on real regressions; expose safe UAT early.
5. **Security compatibility** — no homemade password/MFA cryptography; no stale auth/ledger caches; no dual financial writer; preserve server-side tenant enforcement.

## Current source constraints

Cloudflare Worker upload limit as of 2026-10-29: **64 MiB uncompressed** on Free and Paid, gzip shown only for information; **128 MB** isolate memory; **1 second** startup. New code should be far below platform maxima. Use `wrangler deploy --dry-run --outdir ...` to inspect upload contents. Hyperdrive query cache may be stale after writes; Core-sensitive queries use a cache-disabled config. References:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/changelog/post/2026-09-04-increased-worker-size-limit/
- https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/
- https://developers.cloudflare.com/hyperdrive/concepts/query-caching/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/

## User-facing development flow

`NEW Core code -> Debian aimarkethubs.com / local workerd UAT -> Cloudflare real binding smoke -> restricted beta smartsihub.com -> iterative measurable optimization`, preserving legacy `smartaihub.app`. New technical choices are defaults and may be amended on measured evidence; changes require documenting the substitution, not an unrelated gate/approval board.

## R0.5 background-execution stack extension

Long-running work does NOT run inside the Core or a Cloudflare Push Queue Worker. Default queue transport = TypeScript Worker; native Rust is the preferred external job supervisor/long-running executor (Go remains an optional compatible alternative) on Debian/Runner/approved host, subject to workload evidence, and Python/FFmpeg/GPU remain specializations. Canonical `worker_jobs` and financial authority are unchanged. See SPEC-318 and BACKGROUND-EXECUTION-ADR.md.


## R1.4 clarification (overrides broad R0.5 database summary)

`smartspec` is the **Core control-plane** existing PostgreSQL database and exceptional host for *already registered legacy data*. New stateful Mini Apps do **not** use it for domain records; they use separate D1 / independent PostgreSQL / BYOC / self-hosted stores under SPEC-323. Rust remains native executor, TypeScript/Hono remains Worker Core. The three concept mockups do not imply full UI is already rendered. See `R1.4-OWNER-DECISION-PRECEDENCE.md`.
