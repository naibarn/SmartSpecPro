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

## 2026-10-09 remediation waves and QA

- Wave 1: Critical proxy-addr 2.0.7→2.0.8; full audit 85→84; isolated trust-proxy behavior passed.
- Wave 2: exact compatible dependency updates for fast-uri, brace-expansion, PostCSS, Browserslist, source-map-js, and related schema/bundler dependencies; full audit 84→62.
- Wave 3: direct web updates for axios 1.20, multer 2.4, sharp 0.35.5, the complete Tiptap 3.30.5 family, js-yaml 4.3.2, Mermaid 11.16.1, and sanitize-html 2.17.7; reviewed overrides for Hono, undici, qs, ProseMirror, fflate, markdown-it, grpc-js and others; full audit 62→10.
- Wave 4: Nodemailer 10.0.13 (major update; Node 22 meets v10's Node 20 floor) and DOMPurify 3.4.16; audit 10→3.
- Wave 5: Sentry Vite plugin 5.4.1 removed the braces 3.x path; KaTeX 0.18.2 resolved the Markdown math advisory. First audit found five newly exposed `brace-expansion@5.0.7` findings. Fixed that new path to 5.0.12; final audit 6→1.
- Exact current audit: `pnpm audit --prod --json` exit 1 with 1 Moderate (`sprintf-js@1.1.3`), 0 High, 0 Critical. Mandatory `pnpm audit --prod --audit-level=high` exits 0. Full audit is not green.
- The remaining advisory has no published patch (`patched_versions: <0.0.0`). `decision-sprintf-js.md` records dependency path, exploit condition, alternatives, artifact/runtime impact, and required approval. No advisory was suppressed.

### QA evidence (10 checks)

1. Baseline full production audit captured 85 advisories across 28 packages.
2. Post-Critical full audit confirmed Critical count 0.
3. Bundler/path patch wave full audit confirmed reduction to 62.
4. Direct/API/editor patch wave full audit confirmed reduction to 10.
5. Nodemailer/DOMPurify wave confirmed reduction to 3.
6. Sentry/KaTeX wave re-audit exposed new `brace-expansion@5.0.7` findings; repaired immediately.
7. Post-repair full audit confirmed only the single unpatched Moderate remains.
8. Mandatory high-threshold audit passed with 0 High/Critical.
9. `pnpm install --lockfile-only --frozen-lockfile --ignore-scripts` passed; lock check confirmed 21 fixed package families at or above reviewed targets; `git diff --check` passed.
10. Isolated runtime checks: proxy-addr/Express 7 assertions PASS; KaTeX/rehype math render PASS; Nodemailer JSON transport PASS; Sentry Vite plugin export PASS. Repository Vitest, typecheck, live upload/media/editor integration tests remain pending CI after canonical integration.

- Current production audit result is preserved in `audit-current.json`; baseline output and package/path detail remain in `advisories.json` and `advisory-ledger.md`.
- Security PR #405 is still a draft partial checkpoint. CI has not run repository test/typecheck jobs for dependency-only paths; PR Preview is skipped and an unrelated migration workflow fails with zero jobs. Do not call the security baseline complete.

## External decision and next action

- Required authority: accountable media/runtime owner and security owner must either authorize an isolated ONNX Runtime 1.30.0 + WSL2 artifact compatibility build/test or explicitly accept the single Moderate residual with scope/expiry. No owner identity or approval record was found in repository policy.
- Next: obtain that decision; if runtime update is authorized, update the package/artifact chain and run exact media/Remotion regressions. If residual is accepted, keep the full audit visible as failing and do not change audit policy; remediation remains open.
- After resolving the last finding/approved disposition, run the full audit and focused package tests in CI, then recheck PR #403, PR #399, exact integrated SHA, and authorized non-production SPEC-308 acceptance.

## Refreshed checkpoint — 2026-10-09

- Refreshed `origin/main`: still `aae75ee4a18574fa67421a7688f28f7ce8adc715`; primary checkout remains behind and has the uploaded SPEC-308 archive/tree untracked, preserved untouched.
- PR #399 remains open at `8b6918a2a220fd2dac7cf81d367d1e5975d794f5` on base `c7a4fbd1ff09214b462e8660b2626049d87f01c7`. Actual failed log: focused MCP tests 44 failed / 76 passed, concentrated in two DB-backed files with obsolete imports/setup; live smoke explicitly reports missing `MCP_SMOKE_URL` and `MCP_SMOKE_TOKEN`; preview skipped.
- PR #403 remains open at `779532c22af916f5da0ba47f44c19e1a051c4bf5` on the same stale base. Actual CI: focused MCP suite 118/118, `check:mcp146`, and `security:mcp146` passed; mandatory high-threshold audit failed on the unchanged 85-item baseline (1 Critical, 38 High, 37 Moderate, 9 Low); live smoke fails closed for missing `MCP_SMOKE_URL`/`MCP_SMOKE_TOKEN`.
- PR #405 remains open/draft at `630a3664394f996913acf86623f772e37d631ed9` before this checkpoint update. PR CI ran no test/audit job for dependency paths; preview was skipped. This draft must be refreshed after the new dependency commit and its CI interpreted as evidence only for jobs actually run.
- Mandatory commands were rerun on the exact current dependency candidate: `pnpm audit --prod --audit-level=high` exits 0; full `pnpm audit --prod --json` exits 1 with 1 Moderate `sprintf-js@1.1.3`, 0 High, 0 Critical, 0 Low. Exact output is `audit-current.json`. No advisory suppression or policy change.
- `pnpm install --lockfile-only --frozen-lockfile --ignore-scripts` and `git diff --check` pass. Prior scoped isolated compatibility checks are recorded above; repo focused suite/typecheck/media and editor integration are not run on this unintegrated dependency SHA. AGENTS.md prohibits local repository typecheck in this shared session.
- Safe same-major updates/overrides remove 84/85 baseline findings; Nodemailer 9→10 and Sentry plugin 4→5 were specifically reviewed and have isolated transport/plugin smoke evidence, but full application delivery/build integration remains pending CI. Auth/trust-proxy has isolated Express regression evidence; upload/media, SSRF/Remotion, and content/editor suites remain pending.
- No authorized media/runtime owner, security approver, non-production app, or authorized test identity was discovered. Required next dependency decision remains the single no-patch Moderate advisory: approve a dedicated ONNX Runtime 1.30.0/WSL2 artifact compatibility test, or approve a scoped/expiring residual-risk disposition while retaining the red full audit. Do not merge or claim baseline complete before recorded authority and mandatory gates.
- Dependency PR #405 was refreshed to head `3f287862dcbac4fded8240fc7f99b2ffa8c99b6c`, remains draft/open on base `aae75ee4a18574fa67421a7688f28f7ce8adc715`; only PR Preview ran and was skipped. No dependency test/audit workflow was triggered for this path, so local audit evidence does not become CI evidence.
- PR #399 and #403 were rechecked and are unchanged at their prior heads/base. Do not rebase/update either until the dependency gate is resolved; #399 remains blocked by 44 MCP test failures and missing live smoke authority, while #403's MCP fixture repair passed focused/security checks but still fails its mandatory audit and live smoke.
- WorkUnit checkpoint commit: `3f287862dcbac4fded8240fc7f99b2ffa8c99b6c`; branch `codex/security-baseline-dependency-remediation-20261009`; PR #405. This is a preserved draft checkpoint, not an integrated or complete security baseline.

## Exact-SHA CI continuation

- Existing `CI` workflow dispatched as run `37904941954` on `b48c4c084cc9e801e20f3884bc134baa9a036ae1`; its app-source SHA matches the following security checkpoint except for workflow/test harness changes. `MCP v2 Compatibility Gates` run `37904941998` on the same SHA failed before tests/audit because `pnpm/action-setup@v4` declared 10.4.1 while `packageManager` also declared the integrity-pinned 10.4.1. This is the established workflow defect addressed on PR #403; its live smoke also failed closed because MCP endpoint/token secrets are absent.
- Existing full CI on `b48c4c0` repeated baseline failures from exact `origin/main` run `37899681642`: web tests stop at `Unsupported URL Type "workspace:"`, extension build lacks React JSX declarations, desktop job points to missing `apps/desktop`, api-generator tests fail, and Turbo typecheck lacks Node type definitions. Same failing job steps are present on main. `control_plane` and `skill_pack` passed on both. Python/local-AI jobs were still running at this checkpoint and are not claimed as passed.
- Added `.github/workflows/dependency-security-compatibility.yml` without changing audit threshold or suppressing findings. The first exact-head run `37906031186` on `1e817aebeb464d7b99391bc820488c7a23677118` reported 125 passed / 72 failed across 14 suites. Failure causes were: missing generated Remotion render-schema package before server suites; proxy test over-constrained mapped IPv4 string formatting; billing email fixture lacked runtime config; and `GlobalAlerts` requires browser `localStorage` in a Node test environment. The production-audit job independently found only `sprintf-js` Moderate and exited 1 as required.
- Repair applied for the next exact-SHA run: build `@smartspec/remotion-render` before the focused suites; assert spoof rejection while accepting IPv4-mapped socket notation; mock billing runtime config at its existing test boundary; exclude `GlobalAlerts` from this security branch because the browser-only test belongs to SPEC-308/#399 acceptance. No `GlobalAlerts` or SPEC-308 source/test files were modified here.
- Local exact-head audit on `1e817aebeb464d7b99391bc820488c7a23677118`: full production audit exit 1 with one Moderate `sprintf-js`; high-threshold audit exit 0; frozen lockfile check exit 0. No policy change.
- Next: commit/push the bounded harness repairs, let the PR-triggered focused workflow re-run against the new exact SHA, inspect full CI run logs after all jobs complete, and keep the residual owner decision open.
- Follow-up exact-head regression run `37906430800` on `3584e42a22e56c851b475e164d9d269b6b79e5ec`: 178 passed, 1 failed plus worker startup errors; audit still only the Moderate `sprintf-js`. Root cause confirmed in lock graph: global `undici@6.28.1` override also forced `jsdom@28` (which imports an undici 7-only internal subpath) to major 6, causing `MODULE_NOT_FOUND`. Correct by scoping 6.28.1 to `discord.js>undici` and `@discordjs/rest>undici`, preserving jsdom's declared major. Raise only this focused suite's workerRuntime timeout from Vitest default 5s to 20s because parallel suites caused a timeout; no production timeout changes.

## Canonical refresh and exact-head verification — 2026-10-09

- Refreshed `origin/main` to `37247e42fc780fd9278193f14430eab99a1103af` (includes #406 and #407). Merged that canonical SHA into this dependency branch as `2c849a83baae2af727c4ed33d7230bc1e823352f`; the merge touched SPEC-224 paths only and `git diff --check` passed. The PR branch has not been integrated into main.
- PR heads refresh: #405 `cd61233ce9c98bee5fec254e1f657c7ab3c1cd07` before the canonical merge; #403 `779532c22af916f5da0ba47f44c19e1a051c4bf5`; #399 `8b6918a2a220fd2dac7cf81d367d1e5975d794f5`. The #399/#403 worktrees and branches were not modified. Both remain based on stale canonical `c7a4fbd1ff09214b462e8660b2626049d87f01c7` pending the security gate.
- Dependency Compatibility run `37906717763` on exact SHA `cd61233ce9c98bee5fec254e1f657c7ab3c1cd07`: compatibility regressions passed 17 files / 219 tests; full `pnpm audit --prod` failed with the one documented Moderate `sprintf-js` advisory, without suppressions. `audit-level=high` remains passing.
- Full CI run `37906485425` is on exact earlier SHA `3584e42a22e56c851b475e164d9d269b6b79e5ec` and remains in progress (`local_ai_runtime` is still running). Completed jobs repeat the baseline failures seen on main at `aae75ee4a18574fa67421a7688f28f7ce8adc715`: `marketplace_extension`, `desktop_app`, `smartspecweb`, `api_generator`, `turbo_build`, and `python` fail; `control_plane` and `skill_pack` pass. This run predates the scoped Undici fix and canonical merge; it cannot verify the latest SHA.
- Next verification: let run `37906485425` finish, then dispatch existing `CI` workflow `221065303` on the latest pushed PR #405 SHA. Compare failed exact steps with the main control run; do not interpret baseline failures as dependency regressions.
- Current production audit and compatibility result are stable across the dependency fix: 84/85 baseline advisories removed; only unpatched `sprintf-js@1.1.3` remains. Neither approved ONNX Runtime compatibility authority nor scoped/expiring security risk acceptance is recorded. Repository secret inspection read names only; no non-production environment or authorized MCP test identity is configured (the only GitHub environment listed is `production`).
- #403 retains prior evidence of 118/118 focused MCP tests and passing `check:mcp146` / `security:mcp146`, but full audit and live MCP remain blocked. #399 remains 66/66 OPEN/UNVERIFIED; prior deterministic browser simulation is not live acceptance. This WorkUnit did not change their source or acceptance evidence.

## Main-control comparison and current gate state — 2026-10-09

- Canonical control CI run `37906781001` completed on exact `origin/main` SHA `37247e42fc780fd9278193f14430eab99a1103af` with the same failing jobs as candidate CI `37906485425` on `3584e42a22e56c851b475e164d9d269b6b79e5ec`: `marketplace_extension`, `desktop_app`, `smartspecweb`, `api_generator`, `turbo_build`, `python`, and `local_ai_runtime`. `control_plane` and `skill_pack` passed in both runs.
- Actual logs show shared failure signatures: extension's missing React declarations; absent `apps/desktop`; `Unsupported URL Type "workspace:*"`; Turbo missing Node type definitions and Remotion executor typecheck; legacy Python imports/modules; Local AI tests running without `document`, `HTMLDialogElement`, and `Storage`, plus absent built Remotion render schema. These are baseline CI/test configuration/source failures because they also occur on current main. They are not attributable to this dependency change based on exact control comparison.
- Latest candidate `9981205dde384ffb068438c517552ccaea0148de` has Dependency Compatibility run `37907307554`: 17 files / 219 tests pass; full production audit fails only for `sprintf-js` Moderate as expected. This candidate includes the handoff update and canonical merge.
- Current main CI has completed, so existing `CI` workflow may now be dispatched once on the latest candidate SHA after this handoff record is pushed. Keep this full run separate from baseline comparison and do not repair unrelated failures in this WorkUnit.
- No owner approval has arrived for either residual-risk option. No non-production MCP endpoint/identity is available. PR #403 and #399 remain unchanged; their existing evidence is not current integrated acceptance.
