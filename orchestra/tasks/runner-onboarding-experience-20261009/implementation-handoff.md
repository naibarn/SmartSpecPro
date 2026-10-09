# Runner onboarding UX implementation handoff

## Outcome

- Requirement 1: the newest Desktop review build remains visible and marked Latest; up to four older versions are in a native disclosure that starts collapsed.
- Requirement 2: bilingual Help Center guides cover Windows, macOS, Linux/Debian, WSL2, pairing approval, update/uninstall on Linux, and common connection errors.
- Requirement 3: the codebase already discovers supported Harness tools, but installation automation is not implemented here. Recommended follow-up: a local Runner Setup MCP with bounded inspect/prepare/install/status operations, signed package verification, and a user approval step before local changes. Do not expose arbitrary remote shell execution.

## Changed scope

- `apps/web/client/src/features/runner-releases/RunnerReleasePanel.tsx`
- `apps/web/client/src/locales/en/dashboard.json`
- `apps/web/client/src/locales/th/dashboard.json`
- `apps/web/docs/help/en/runner-connection.md`
- `apps/web/docs/help/th/runner-connection.md`

## Verification evidence

- `pnpm exec esbuild client/src/features/runner-releases/RunnerReleasePanel.tsx --loader:.tsx=tsx --format=esm --outfile=/tmp/runner-release-panel-check.js` — PASS (syntax/transform).
- Parse both dashboard locale JSON files with Node — PASS.
- Load `runner-connection` through `getHelpManifest` and `getHelpTopic` for `th` and `en`; verify WSL2 and systemd sections — PASS.
- `git diff --check` — PASS.
- Tests and browser screenshots were not run. Repository instructions prohibit running tests unless requested; the source was manually reviewed, but rendered UI acceptance remains unverified until deployment/browser review.

## Canonical integration

- Implementation commit: `3290a8333d35404cd4536dc48e75c98334c87cbb` (`feat(runner): simplify releases and add install guide`).
- Promoted with a normal push to `origin/main`; the commit was reachable from `origin/main` after push.
- `workspace_authority.py converge --integrated-sha 3290a8333` and `verify --integrated-sha 3290a8333` returned `USER_WORKSPACE_CONVERGED` and `CANONICAL_CONVERGENCE_VERIFIED`.
- This is an integrated source change, not a deployment or live-site acceptance claim.

## Lifecycle and gap closure

- Planning: COMPLETE — user approved collapsed old versions, cross-platform guide, and secure Harness setup direction.
- Test design: COMPLETE — narrow source/document checks recorded; no tests run per repository-session instruction.
- Implement: COMPLETE — requested UI and guide are integrated.
- Verify: COMPLETE for syntax, translations, Help Center loading, whitespace, and canonical reachability; rendered UI/runtime acceptance is pending deployment.
- Debug/fix: COMPLETE — corrected a malformed JSX wrapper during manual inspection; the final syntax/transform check passed before integration.
- Review: COMPLETE — manual review found no remaining must-fix source or documentation gaps.
- Final verify: COMPLETE for canonical source/workspace state.
- Gap closure: no must-do-now source gaps remain. Safely deferred: browser screenshot/production deployment acceptance; Harness Setup MCP implementation requires a separate scoped feature and local consent design.

## Next action

No implementation continuation is required for this checkpoint. If the user requests zero-touch Harness setup, plan a separate local MCP setup flow with explicit consent and package provenance verification, then implement and validate it as its own outcome.

## Runner acceptance routing update — 2026-10-09

- Use the Windows Runner as the primary acceptance baseline because it is the
  most ready environment, per the user's direction. Latest Windows Desktop
  screenshots show Runner `0.2.24`, 5/11 tools ready, and a successful real
  Codex prompt through the Runner (`codex-cli 0.161.0`). This establishes a
  passing smoke check, not persistent session acceptance.
- The Windows Desktop also reports automatic token refresh failure
  (`RUNNER_CONNECT_REQUEST_FAILED`), with access token expiry shown as
  `2026-10-09 06:28:18`. Verify refresh/reconnect and Control Plane session
  continuity. Resume `orchestra/runner-codex-shim-fix-20261008` at
  `FINAL_VERIFY`, rerun its pending Windows-hosted workflow with publication
  disabled, and continue independent implementation work against the Windows
  baseline while platform verification runs.
- Keep Windows, WSL2, and Debian Linux acceptance evidence separate. WSL2's
  successful direct Codex CLI smoke does not prove Runner-bound readiness; its
  Runner still reports `auth_probe_required`. Debian Linux has no new evidence
  in this update.
- Canonical Spec 205 evidence and the full continuation checklist are in
  `specs/feature/205-smartaihub-runner-cross-platform/handoff/evidence/windows-first-runner-routing-20261009.md`.
- A backend route defect in bounded refresh-token replay was fixed and integrated
  at `326d3a9bf31a23a48ba5f3d2eb2b9341b14a2b0e`; the focused route regression
  test passed. The server deployment and live Windows refresh-boundary check
  remain pending, so the screenshot's specific runtime failure is not yet
  confirmed resolved.
