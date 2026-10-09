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
