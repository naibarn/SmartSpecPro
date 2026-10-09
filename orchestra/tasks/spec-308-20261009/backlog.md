# SPEC-308 Backlog

- Production rollout, staged cohort, and production acceptance are outside this request; no deployment. Keep as explicit non-completion gate if later required.
- Per-occurrence animation for grouped repeats is unsupported by current transport; keep suppressed unless the canonical owner provides a separately authorized occurrence identity contract.
- Cross-device preference sync is explicitly deferred by SPEC-308 MVP and does not block this task.
- PR #399 latest source checkpoint `7325a117b2f342ef54af82fdb9b52235ae81adbe` passed the isolated SPEC-308 browser workflow `37986151623`: 8 focused suites / 144 tests and 18/18 Chromium simulation cases. This is mocked auth/API on UI-only Vite, not live acceptance. The separate MCP/security workflow `37986151602` failed in baseline MCP server fixtures and its live smoke gate; see wave 7 evidence.
- Keep all 66 canonical requirement rows OPEN until implementation and exact-sha verification evidence are both recorded; partial source evidence does not close acceptance.
- Keep the lifecycle PARTIAL while PR #405's residual production audit, PR #403's MCP fixture/security/live endpoint, Feature-049 tenant/group occurrence authority, and approved authenticated non-production acceptance are unresolved.
