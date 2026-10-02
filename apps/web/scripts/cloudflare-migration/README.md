# Spec 245 Compatibility Compiler

The `smartaihub:migrate` command compiles an owner-maintained JSON evidence manifest into the artifacts named by Spec 245 §2.1. It is a local planning and verification tool; it does not deploy, contact Cloudflare, connect to production, execute package hooks, inspect secret files, or certify a production inventory.

## Commands

```bash
npm --workspace @smartspec/web run smartaihub:migrate -- inspect --manifest ops/feature-245/compatibility-manifest.json
npm --workspace @smartspec/web run smartaihub:migrate -- classify --manifest ops/feature-245/compatibility-manifest.json
npm --workspace @smartspec/web run smartaihub:migrate -- verify --manifest ops/feature-245/compatibility-manifest.json
npm --workspace @smartspec/web run smartaihub:migrate -- plan --manifest ops/feature-245/compatibility-manifest.json
npm --workspace @smartspec/web run smartaihub:migrate -- report --manifest ops/feature-245/compatibility-manifest.json
```

Commands write the same deterministic artifact set to `migration/` by default; pass `--out-dir` to write elsewhere. `inspect` scans declared source roots for file paths and candidate source signals, including PostgreSQL advisory locks and `LISTEN`/`NOTIFY` session features that Hyperdrive does not support. It never emits matched source lines. Candidate findings require owner/runtime reconciliation and are not proof of live production callers. `verify` exits nonzero when blockers remain or a requested retirement claim lacks complete evidence.

## Evidence rules

- Start from [`compatibility-manifest.example.json`](../../../../ops/feature-245/compatibility-manifest.example.json); copy it to the governed manifest path and add facts only with a named owner and evidence timestamp.
- Do not place secrets, credentials, personal data, or environment-file contents in the manifest. Secret bindings are names only; generated values are always `[REDACTED]`.
- Package import or bundle success alone is not runtime compatibility evidence. A compatible placement requires a method-level runtime probe recorded by the owner.
- Every bounded business operation triggered by detached async work, callbacks, scheduled occurrences, startup/reconciliation, or a long-lived listener must map to canonical `worker_jobs` and an outbox intent before its first side effect.
- Every active component must set `triggerInventoryComplete` only after those trigger classes have been reviewed. Business job components require at least one trigger; source-scan findings in `verify` need an exact `{path,line,code}` reconciliation with owner and evidence. A `business_job` disposition must point to a declared active component trigger whose canonical job and outbox proof are all true.
- Duplicate schedule identifiers across active components block verification. The command reports source path/line/rule for every unreconciled finding, while printing only the first 20 diagnostics to the terminal; the complete blocker list stays in `compatibility-inventory.json`.
- Unknown processes, schedules, routes, side effects, or owners remain blocked. An empty or static-only scan cannot establish retirement readiness.
- The source scanner skips environment/key files, generated directories, tests, and symlinks. It reads bounded source files only for candidate-pattern matching and records path/line/rule without source snippets.

The generated files are local evidence artifacts. Target bindings, live provider behavior, production traffic, database restoration, and Debian retirement require separate current environment proof.
