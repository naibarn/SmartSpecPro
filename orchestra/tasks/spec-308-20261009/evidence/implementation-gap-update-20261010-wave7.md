# SPEC-308 implementation and gate reconciliation — wave 7

Date: 2026-10-10 (Asia/Bangkok)

## Refreshed refs

| Ref | SHA | State |
|---|---|---|
| `origin/main` | `6dcd7934332db7929904f8da642915751a6bb79` | canonical development base |
| PR #399 | `7325a117b2f342ef54af82fdb9b52235ae81adbe` | open; based on current main |
| PR #403 | `74a482e8fe38a131bdbe41bfee0e53ad90347e4c` | open; base `338adeb0605d160081a2ee995d0f639ad3850d9a` is stale |
| PR #405 | `868a5600ff770be91885666b7f584835e03fc690` | open; base `338adeb0605d160081a2ee995d0f639ad3850d9a` is stale |

PR #403 and #405 were not rebased, pushed, or otherwise modified in this wave.

## Exact PR #399 SPEC-308 CI

- Run: [37986151623](https://github.com/naibarn/SmartSpecPro/actions/runs/37986151623)
- Checked-out head: `7325a117b2f342ef54af82fdb9b52235ae81adbe`
- Result: **SUCCESS**. Eight focused Vitest files / 144 tests passed. Chromium Playwright simulation passed **18/18**, with zero unexpected or flaky cases (61.1 seconds).
- The job used a synthetic authenticated identity, mocked tRPC/tenant APIs, and UI-only Vite. It blocked external requests. This is simulated browser evidence, not live authenticated acceptance, tenant isolation in the real runtime, or production evidence.
- GitHub artifact ID `11643651233` was downloaded under `evidence/ci-artifacts/37986151623/`. It includes the Playwright JSON report and Vite log. Its 37 PNGs are copies of repository screenshots included by the workflow upload; they are not new screenshots captured by this CI run.
- Evidence files: `pr-ci-37986151623.json`, `ci-artifacts/37986151623/home/runner/work/SmartSpecPro/SmartSpecPro/apps/web/test-results/production-director/playwright-evidence.json`, and `ci-artifacts/37986151623/home/runner/work/SmartSpecPro/SmartSpecPro/apps/web/test-results/production-director/`.

The run gives partial simulated support to the tested portions of `AC-308-002`, `003`, `004`, `005`, `006`, `007`, `008`, `014`, `015`, `016`, `017`, `019`, `021`, `022`, `023`, `025`, `026`, `027`, `035`, and `036`. See the individual requirement rows for their remaining gaps. It does not cover full Bell authorization/actions/grouping, all zoom/rotation/safe-area/keyboard cases, guest/auth policy, editor/map/media routes, performance budgets, complete CSP/a11y audit, or live tenant isolation.

No ledger row is closed by this run: the candidate is not integrated, `integration.canonical_sha` remains null, and each supported requirement still has untested subcriteria or live-authority evidence pending.

## MCP and dependency gates

- PR #399 MCP workflow [37986151602](https://github.com/naibarn/SmartSpecPro/actions/runs/37986151602), head `7325a117`: focused suite failed at 76/120 pass / 44 fail. Logs show failures only in MCP public-server test suites: tests expect Redis-backed `mockRedisData` although production persists sessions via PostgreSQL (`saveMcpSession`); DB is unavailable in this fixture. Three stale test cases import the retired, absent `agencyMcpService`. The same defects exist on canonical main and are unrelated to SPEC-308 production changes. Later `check:mcp146`, `security:mcp146`, and audit steps were skipped after the test failure. The separate live smoke job failed closed because `MCP_SMOKE_URL` and `MCP_SMOKE_TOKEN` are empty.
- PR #403 workflow [37967358012](https://github.com/naibarn/SmartSpecPro/actions/runs/37967358012), head `74a482e8`: MCP focused tests, `check:mcp146`, and `security:mcp146` passed; mandatory audit failed on the older dependency set (85 advisories including Critical/High), and live smoke failed closed without endpoint/token. This audit is stale relative to the #405 dependency candidate.
- PR #405 workflow [37967353996](https://github.com/naibarn/SmartSpecPro/actions/runs/37967353996), head `868a5600`: compatibility regressions passed (18 files / 238 tests); mandatory full production audit failed on one Moderate `sprintf-js@1.1.3` advisory with no patched version. No suppression or threshold change is authorized. `37967346595` has no jobs/logs and is not classifiable as a candidate regression.

## Remaining gates and next work

1. Security/media-runtime owner must authorize an isolated ONNX 1.30.0 + WSL2 compatibility test, or give a documented scoped/expiring residual-risk disposition under actual policy. Reachability remains unknown. No native runtime change or gate suppression was made.
2. After the #405 disposition/remediation, refresh and verify #405 against latest main, then reconcile #403. The current #403 source has a passing focused MCP result on its old base, but no current-base full gate result.
3. Reconcile #399 after #403's applicable gates clear, and run required checks on the exact integrated SHA.
4. Obtain approved MCP smoke endpoint/token, approved non-production SmartSpecPro URL and authorized test identity, and Feature-049 tenant authorization plus grouped-occurrence revision contract for live acceptance.

Current lifecycle remains PARTIAL. All 66 SPEC-308 requirements remain OPEN (63 PARTIAL implementation / 3 UNVERIFIED); production feature flags remain OFF. No production deployment or acceptance is claimed.
