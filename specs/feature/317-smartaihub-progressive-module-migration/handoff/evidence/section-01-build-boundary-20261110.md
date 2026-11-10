# SPEC-317 Section 01 — independent package build evidence

- Observed at: 2026-11-10 01:57 UTC
- Source repository: `/mnt/SmartSpecDev/projects/smartaihub-platform`
- Integrated source: `main` / `ebb264aa0151e97e9e463b7d4ca23290a48569db`
- Scope: root package scripts, `packages/saas-contracts`, `apps/saas-shell` package/build, `modules/chat` package/manifest/build.
- Result: `PASS` for the scoped package-boundary/build checks; this does not claim user-facing login/chat acceptance or deployment.

## Commands and outcomes

- `pnpm --filter @smartaihub/saas-contracts test` — PASS, 2 tests; manifest accepts the first-party versioned Chat metadata and rejects path traversal/external origins/non-independent flag.
- `pnpm run build:core` — PASS; Hono Worker dry-run reports 388.64 KiB total upload / 91.87 KiB gzip.
- `pnpm run build:shell` — PASS; Vite static assets build independently: entry JS 222.64 kB / 69.37 kB gzip, CSS 4.34 kB / 1.50 kB gzip. Wrangler static-asset dry-run succeeds; Worker code upload reports 0.40 KiB while assets remain outside that Worker code bundle.
- `pnpm run build:chat` — PASS; Turbo reports only `@smartaihub/saas-contracts` and `@smartaihub/chat` in scope. Chat assets: JS 222.63 kB / 69.39 kB gzip, CSS 4.28 kB / 1.46 kB gzip. Chat Worker reports 47.81 KiB total upload / 11.56 KiB gzip.
- `pnpm --filter @smartaihub/chat build` — PASS; builds the Chat package directly without invoking Shell, Core, or Legacy `apps/web`.
- Root `package.json` script inspection — PASS; there is no unqualified `build` script; named commands are `build:contracts`, `build:core`, `build:shell`, `build:chat`.
- `rg -n 'apps/web|Express|express' apps/saas-shell modules/chat packages/saas-contracts` — PASS; no Legacy runtime/Express references in the new package boundaries.
- `git diff --check` — PASS before commit.

## Boundaries

- The Chat route/API and Shell UI remain scaffolds. No login, real conversation persistence, model response, artifact service, browser pilot, or human UAT is claimed by this checkpoint.
- No target release, service restart, hostname routing, DNS, Cloudflare production resource, or database change occurred. Existing aimarkethubs.com traffic remains on its current runtime.
- Peak build RSS and elapsed wall time were not captured; the byte sizes above are tool-reported build evidence only.
