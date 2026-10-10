# SPEC-308 continuation wave 16 — metrics harness output boundary

## Evidence ledger

- Source: GitHub browser workflow log, exact run `38012581430`, source SHA `6907bdf4bc0c8ca4f36e11e2e2fedb5abad0f499`.
- Result: 22/23 mocked Chromium cases passed. Focused component regressions, generated schema build, browser setup, and 22 UI simulations passed. The remaining metrics case failed inside `helpers/spec308-metrics.ts:255` with `Objects are not valid as a React child (found: object with keys {__pw_type, type, props, key})`.
- Cause: Playwright's test transform represented JSX children in the imported React component as test-runner descriptors, then `react-dom/server` attempted to render them as React children. Exact stack is in run `38012581430`; production browser rendering and the other 22 simulations passed.
- A read-only review independently confirmed the transform-boundary cause and recommended measuring the live rendered SVG preview markup.

## Implemented

- Removed the E2E helper's React server-render and direct component imports.
- The helper now opens the existing Settings preview, reads the five already-rendered `svg[data-mascot-style]` `outerHTML` values and calculates deterministic raw/gzip byte counts in Node.
- This is test/evidence code only; no product behavior, dependency, authority, or security gate changed.

## Verification and state

- TypeScript `transpileModule` syntax-only parsing passed for the helper and callsite, and `git diff --check` passed. No local test suite was run. The next CI is the consolidated candidate verification.
- The browser run above is simulated UI-only Vite evidence; it is not live authenticated or physical-device acceptance and does not close a requirement row.
- MCP focused suite on the same PR candidate still fails on baseline PostgreSQL-session fixture defects and tests importing retired `agencyMcpService`; downstream check/security/audit were skipped. Live MCP smoke still fails closed because authorized endpoint/token are absent. Do not modify PR #403's separate worktree or infer these are SPEC-308 regressions.
- The requirement ledger remains 66/66 OPEN, completion eligibility false, integration SHA unset, and production flags OFF.
- Required sequencing remains #405 owner disposition and mandatory audit first, then #403 refresh/gates, then SPEC-308 exact-SHA acceptance.
