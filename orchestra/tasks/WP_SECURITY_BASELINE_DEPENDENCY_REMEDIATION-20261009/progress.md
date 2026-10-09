# Progress — WP_SECURITY_BASELINE_DEPENDENCY_REMEDIATION

## 2026-10-09 discovery

- Refreshed `origin/main` to `aae75ee4a18574fa67421a7688f28f7ce8adc715`.
- PR #399: open, head `8b6918a2a220fd2dac7cf81d367d1e5975d794f5`, base `c7a4fbd1ff09214b462e8660b2626049d87f01c7`; contract/security and live-contract-evidence failed in run `37898677320`; preview skipped.
- PR #403: open, head `779532c22af916f5da0ba47f44c19e1a051c4bf5`, base `c7a4fbd1ff09214b462e8660b2626049d87f01c7`; focused MCP tests (11 files/118 tests), `check:mcp146`, and `security:mcp146` passed; production audit failed with 85 advisories; live smoke failed closed because authorized endpoint/token were absent; preview skipped.
- PR #403 changes are confined to MCP workflow fixtures/tests and `mcpRegistry.ts`; manifests and lockfile are byte-identical to current `origin/main`.
- Critical proxy-addr analysis confirms production request IP flows into trust-proxy, auth/MCP rate limiting and logging. Narrow patched version is `2.0.8`; behavior tests are required before adoption.
- Three read-only parallel dependency analyses are in progress. No dependency files have been changed.
- Full baseline `pnpm audit --prod --json` completed: exit 1, 85 advisories across 28 packages (1 Critical, 38 High, 37 Moderate, 9 Low); evidence is in `advisories.json` and `advisory-ledger.md`.
- Remediated the Critical `proxy-addr` advisory with narrow override `express>proxy-addr: 2.0.8`, preserving Express 4.22.2. Lockfile delta changes only the override and proxy-addr package resolution.
- Added `apps/web/server/_core/__tests__/proxyAddrTrustRegression.test.ts` for short-prefix mapped IPv6 trust rejection, correctly scoped mapped subnet, and production numeric one-hop behavior.
- Isolated Express 4.22.2 + proxy-addr 2.0.8 behavior check passed 7 assertions. Post-change full production audit exits 1 as expected with 84 advisories (0 Critical, 38 High, 37 Moderate, 9 Low).
- Repository Vitest test and repository typecheck have not run locally because this isolated worktree has no project dependencies installed; remote CI is required.

## Next

1. Complete compatibility and runtime review for the remaining 84 advisories.
2. Select minimal coherent patch sets; only the primary owner edits manifests/lockfile.
3. Run focused regressions per patch set, then mandatory full production audit and required CI gates on exact PR SHA.
4. Keep the separate dependency-security PR open until all mandatory gates pass; document missing fixes and obtain owner approval before accepting residual risk.
