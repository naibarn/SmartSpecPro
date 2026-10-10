# SPEC-308 continuation — wave 17 (2026-10-10)

## Candidate and browser evidence

- Refreshed `origin/main` to `2b497268f5a5c76c45d277cb162f59d10137f97d`; reconciled the PR #399 branch and pushed candidate `bacfeab4daacaa3da8ab31cb5a002b890e22ca85`.
- Browser Simulation run [38013182833](https://github.com/naibarn/SmartSpecPro/actions/runs/38013182833) completed SUCCESS on that exact SHA: 23/23 mocked Chromium tests passed, including mascot preview byte metrics, bell/balloon CTA, reminder positioning after drag, mobile surfaces, and demo side-effect boundaries. The workflow uses mocked identity/APIs on UI-only Vite; it is simulated UI evidence, not live authenticated or tenant-runtime acceptance.
- Exact run JSON: `evidence/pr-ci-38013182833.json`; uploaded report/artifact ID `11655301739`.

## Independent gates

- MCP Compatibility run [38013182832](https://github.com/naibarn/SmartSpecPro/actions/runs/38013182832) on the same SHA failed at focused tests: 76 passed / 44 failed across 11 files. The proven cause remains the mainline test baseline: session-oriented MCP tests still inspect Redis although `mcpPostgresState` now owns sessions, and security tests still import retired `agencyMcpService`. Consequently `check:mcp146`, `security:mcp146`, and production audit did not run. The live smoke job failed closed because authorized `MCP_SMOKE_URL` and `MCP_SMOKE_TOKEN` are absent. This is not a SPEC-308 source regression.
- PR #403 already carries the PostgreSQL fixture repair on exact head `74a482e8fe38a131bdbe41bfee0e53ad90347e4c`; its focused MCP tests/check/security passed (118/118). Do not create a duplicate fixture PR. PR #403 still awaits the earlier #405 security gate and authorized live MCP endpoint/token.
- Read-only authority inventory found the repository exposes only the `production` GitHub environment and no `MCP_SMOKE_URL`/`MCP_SMOKE_TOKEN` repository secret names; the `staging` environment lookup returned 404. No secret values were read. This confirms there is no approved non-production MCP runtime configured through the repository.
- PR #405 remains OPEN+DRAFT on `868a5600ff770be91885666b7f584835e03fc690`; compatibility regressions passed 18 files / 238 tests, but mandatory production audit fails on Moderate `sprintf-js@1.1.3` through `hyperframes > onnxruntime-node > global-agent > roarr`. Reachability is unknown. Security and Media/Runtime owners must authorize isolated ONNX 1.30 WSL2 compatibility validation or a scoped, expiring risk acceptance; no policy bypass is allowed.

## Requirement and runtime state

- Requirement ledger remains 66/66 OPEN (63 PARTIAL implementation rows, 3 UNVERIFIED). Browser simulation adds verification evidence but closes no row because integrated-SHA evidence and live authenticated acceptance are still missing.
- Approved non-production runtime/test identity and Feature-049 owner confirmation for tenant/occurrence authorization remain unavailable. Production flags remain OFF; no deployment performed.
- A short-lived parallel MCP fixture branch based on `2b49726` was reviewed and not promoted: its changes overlap PR #403's existing repair and would duplicate work.

## Next actions

1. Obtain Security + Media/Runtime owner decision for the `sprintf-js` disposition; then refresh #405 onto current main and rerun mandatory gates on its exact head.
2. Reconcile #403 after #405 clears; obtain authorized MCP smoke URL/token independently.
3. After both dependencies, run the consolidated exact-SHA SPEC-308 suite and pursue approved live authenticated acceptance. Keep all requirement rows OPEN until evidence satisfies the contract.
