# SPEC-308 Progress

Loop policy:
  orchestra_id: fable_style_coding_orchestra
  purpose: coding webapp with an agent loop
  current_stage: IMPLEMENTATION
  resume_from: IMPLEMENTATION
  iteration: 14/14
  tool_call_batches: unknown/30
  estimated_cost_usd: unknown <= 0.50
  dispatch_waves: 2/6
  active_subagents: 0/4
  parallel_writers: 0/2
  required_subagent_wait: 0/10 minutes
  background_subagent_wait: <10 minutes
  repair_rounds: 0/5
  stop_conditions: implementation_checkpoint_recorded
  stop_reason: partial_runtime_gate

## Baseline
- Configured canonical before refresh: `origin/main` `ccd4cd11c664cf81cc54fe1287c60ce7f5c36978`; latest fetched `origin/main` is `c7a4fbd1ff09214b462e8660b2626049d87f01c7`.
- Task worktree: `/home/dev/worktrees/spec-308-dual-surface-20261009`, branch `codex/spec-308-dual-surface-20261009`.
- Canonical workspace user-uploaded untracked files preserved in `/home/dev/projects/SmartSpecPro`; all implementation occurs in task worktree.
- WP0 scout: `/root/wp0_source_audit`, read-only, returned; no files changed.
- WP0 import checkpoint is `e6a7243fa871f1999f1e6f6e835d32d1df81135f`; implementation source checkpoint is `a430a747cf4991cbb7fbbdf5351dad984f29231b`; latest branch merge tip is `5ff91647b53d040ea93c59e90e208d27b645b568`.
- PR #399 is open and ready for review; latest `origin/main` was reconciled into the task branch through a normal merge.
- WP1 renderer and WP2 reducer returned and are closed; conductor integrated their exports with the existing Bell/Feedback owners.
- Focused regression rerun at `0bc15b68fa2c0ddc8a6b3bd182c14f4b6050887d`: 8 Vitest files / 83 tests pass under Happy DOM; EN/TH settings JSON parses.
- Twelve QA lenses and component screenshot measurements are recorded under `evidence/`.
- Server-backed authenticated browser gate remains blocked by missing worktree `DATABASE_URL`; no production rollout.

## Work Units
| ID | Owner | Scope | Status | Completion predicate |
|---|---|---|---|---|
| WP0 | conductor | canonical spec/handoff and source audit | CHECKPOINTED_PARTIAL | importer commit and handoff generated |
| WP1 | subagent A | mascot renderer/tests only | COMPLETE | five original variants + 5 focused tests |
| WP2 | subagent B | pure attention reducer/tests only | COMPLETE | trust-gated reducer + 7 fake-time tests |
| WP3–WP7 | conductor | bell, launcher, settings, coordinator, responsive, QA | PARTIAL | focused gates pass; authenticated runtime evidence is open |

## Dispatch batch 1
- Required: `wp0_source_audit` (read-only scout), returned at 2026-10-09 UTC.
- Result: canonical ID free; current SSE row identity supports only distinct newly seen notification IDs; no per-occurrence identity; no new data source.
- Result: integrated partial WP0 safe checkpoint and opened Draft PR #399.

## Dispatch batch 2
- Dispatched at 2026-10-09 UTC: `wp1_mascot_renderer` and `wp2_attention_reducer`, both required and scoped to disjoint new paths in the task worktree.
- Ownership: WP1 mascot renderer/assets/tests only; WP2 pure reducer/tests only. Each must return a Result Capsule; no shared Bell/Feedback/App/flags/handoff edits.
- `parallel_writers: 2/2`; no replacement agent until timeout/blocker is recorded.
- Next ready independent conductor work: fail-closed feature gate and UI integration design, without touching agent-owned paths.

## Implementation checkpoint
- WP3–WP6 implemented as an opt-in client-only projection: five mascot art styles, tenant/global fail-closed gate, scoped versioned preferences, generic balloon/demo, existing Bell open intent and new-row-only SSE attention projection.
- No backend/schema/dependency or production behavior change; no new SSE/poll/query is introduced.
- Browser captures use the Vite client, mocked tenant flag, guest route and component crops; they are explicitly not authenticated acceptance evidence.
- Required next: run final fast gate + handoff/index validation, update Draft PR, then request the real runtime authorization/dependency needed for authenticated acceptance. Do not mark COMPLETE.

## Verification state
- PASS: `tools.spec_handoff index --check` (315 canonical / 473 records, no drift).
- PASS: target SPEC handoff structurally valid; completion correctly false.
- PASS: `git diff --check`; zip integrity and extracted contents verified.
- PASS: 8 focused test files / 83 tests, responsive component crops, twelve-lens QA log, JSON locale parsing.
- PENDING/BLOCKED: authenticated app runtime, settings UI/balloon interaction under signed-in tenant, full responsive/browser acceptance, canonical merge and post-merge verification.

## PR verification continuation (2026-10-09)
- PR #399 head `0bc15b68fa2c0ddc8a6b3bd182c14f4b6050887d`; configured `origin/main` remains `c7a4fbd1ff09214b462e8660b2626049d87f01c7`.
- Repaired MCP workflow's duplicated pnpm version. CI then reached focused tests and exposed a second baseline workflow issue: tests import `@smartspec/remotion-render/render-video-schema`, but CI did not build that workspace package. Added its explicit package build before those tests; CI rerun is pending on the next push.
- MCP live-contract CI fails closed because `MCP_SMOKE_URL` and `MCP_SMOKE_TOKEN` are absent. No credentials or substitute endpoint were invented.
- CI evidence at `evidence/pr-ci-37884628652.json`: pnpm setup, install, and workspace schema build pass; MCP tests still fail in existing server suites without `DATABASE_URL`, with one stale test import. Live contract fails closed because the endpoint/token are not configured.
- Immediate next: repair the pre-existing MCP test fixture/import without weakening the security gate; configure the live endpoint through secure CI settings; provision the approved non-production app runtime and authorized test identity for browser acceptance.
- The unrelated manual migration workflow run reports failure with zero jobs and no check rollup entry; it is not part of this PR's required checks and was not modified.

## Responsive correction checkpoint
- Source commit `64dc5fb3c9c2fec61b909a1c956346d7476258ef`; corrected the QA-discovered mobile width and label gaps, added the optional dismissible mobile Chat onboarding hint, one-shot reduced-motion-aware mascot/balloon motion, and renewed component screenshots across 320/360/375/390/767/768/1024/1440px.
- Focused regression at exact SHA: 8 files / 83 tests pass; EN/TH settings JSON parses; screenshot capture confirmed 216px mobile balloons/hints, 44px launcher hit target, hidden label below 768px and visible label from 768px.
- Playwright guest-browser check at 320px confirmed explicit onboarding CTA opens the existing Chat dialog; no authenticated backend/tenant acceptance is implied.
- Fresh CI run 37885591534 is recorded at `evidence/pr-ci-37885591534.json`; same external live secret and existing MCP suite baseline blockers remain.

## Continuation from PR #399 — 2026-10-09
- Refreshed `origin/main` at `c7a4fbd1ff09214b462e8660b2626049d87f01c7`, PR #399 head at `5cfa6e0987934163389187b8a515f11d47035942`, canonical SPEC digest `81477c8f…`, and handoff generation 7. Handoff validates, canonical index check passes (315 specs / 473 records), and completion remains false.
- Read actual failed workflow logs for run `37885769725`. MCP focused suite failures compare as baseline: both MCP test files are unchanged from `origin/main`; they retained Redis session assertions after persistence moved to the PostgreSQL owner and imported PostgreSQL state indirectly through production mocks, while the unavailable module reference existed only in a stale test block. Live-contract evidence fails closed because CI has no `MCP_SMOKE_URL`/`MCP_SMOKE_TOKEN` configured. No security gate was skipped or lowered.
- Isolated the unrelated MCP workflow/test-fixture repair into PR #403 at `a297cda23326e92ffb2e586d0f26a2d214957759`. It uses a deterministic in-memory fixture for PostgreSQL-backed MCP session/idempotency state, keeps active route/security tests, removes the unavailable test-only import, and preserves the live evidence job. The exact 11-file CI-focused test command passed: 118 tests. PR #403 CI is queued; live endpoint/token remains an external CI secret-setting authority.
- Read-only runtime/identity inventory found no approved non-production runtime or authorized SPEC-308 browser identity. The app, DB/control-plane and authenticated live acceptance were not exercised; production environment files and credentials were not read or used.
- Added a deterministic isolated Playwright simulation for a synthetic test identity. Seven browser tests passed for Chat, Feedback, unsaved Chat/Feedback drafts, reduced-motion media preference, and six viewport widths; six responsive screenshots are recorded. This is explicitly simulated evidence, not live acceptance. Bell visual data flow and authenticated Settings remain unproven in browser.
- Added `evidence/requirement-map.md` with all 66 exact ledger IDs mapped to source, tests/evidence, current OPEN state, and specific missing evidence. All 66 remain OPEN; no bulk PASS updates and no row has enough exact-head integrated/runtime evidence to close.
- Current independent gaps: (1) mergeable CI PRs and exact-head post-integration verification; (2) approved non-production app URL plus DB/control-plane test configuration and authorized user/tenant; (3) GitHub Actions secret authority for MCP live smoke endpoint/token; (4) remaining SPEC-308 browser/security/accessibility/performance/rollback evidence.

## Implementation-first continuation — 2026-10-10
- Refreshed and updated PR #405, then #403, then #399 against canonical `origin/main` `338adeb0605d160081a2ee995d0f639ad3850d9a` using the normal PR update-branch path. PR #399 head is `6146063781ac3fb2b060e48b4892fdc870d000d2`.
- PR #399 browser harness now builds the generated `@smartspec/remotion-render` schema needed by lazy Settings routes, reads the pnpm pin from the repository manifest, and captures the tenant-flag rollback scenario through SPA navigation while keeping the global dialog mounted.
- Browser run `37966934201` passed 12/12 on source SHA `214f3d04c8b615609d6da3c18444357fd1d5a363`; after canonical refresh, run `37967564075` passed 12/12 again on exact PR #399 SHA `6146063781ac3fb2b060e48b4892fdc870d000d2`. Six responsive authenticated-mock screenshots are committed under `evidence/screenshots/`. This is simulated evidence, not live acceptance.
- Requirement map and evidence note were updated for only the requirements covered by the run. All 66 canonical ledger rows remain `OPEN` / `UNVERIFIED`; verification remains partial.
- PR #403 focused CI exposes a remaining stale MCP fixture/import failure and its live gate fails closed without approved endpoint/token. PR #405 compatibility regressions pass, while the refreshed mandatory audit still fails on Moderate `sprintf-js@1.1.3`; Security Owner disposition and any ONNX/WSL2 Runtime Owner approval remain required. Approved non-production app runtime/test identity remains unavailable. Production flags remain off and no deployment occurred.

## Implementable UI gap closure — 2026-10-10
- Two read-only SPEC-308 scouts independently found local implementation gaps. Closed the verified gaps in this worktree: Bell and launcher minimum 44px touch targets; separate `subtle` and `normal` Bell/mascot animations with reduced-motion overrides; localized EN/TH launcher labels; one-hint arbitration so notification arrival suppresses demo/onboarding during coalescing and live presentation; measured/clamped balloon positioning that follows the draggable launcher and viewport; mobile demo timeout aligned to 3 seconds.
- Extended the isolated Playwright spec for 44px targets, tablet label, both motion levels, reduced motion, mobile demo timeout, notification-over-demo priority, mascot-to-Chat click while a reminder is visible, balloon bounds/drag anchoring, Thai labels and existing no-egress enforcement. These tests are queued for the next exact-source CI run; they have not been run locally.
- Investigated failed browser run `37968435625` on `930dd6dde05e036745e595d7016e90c296cb90c7`: the workflow install, schema build, Chromium and Vite startup all passed; the shared `afterEach` assertion failed because static `client/index.html` loaded Google Fonts. Updated only the isolated browser fixture to strip remote font links from its local document response while continuing to abort all non-loopback requests. The run is harness-isolation evidence, not a feature regression; final suite remains pending.
- The parallel MCP workflow on PR #399 head `930dd6d` failed on the current main baseline's server suites: `mcpPublicServer.test.ts` and `mcpPublicServerSecurity.test.ts` failed with missing `DATABASE_URL`, Redis/session assertions and an obsolete test-only import of retired `agencyMcpService`. This is separate from UI changes; PR #403 owns the fixture repair. The live MCP gate remains fail-closed without its approved endpoint/token. PR #405 still requires Security Owner disposition for the residual Moderate `sprintf-js@1.1.3` and Runtime Owner authority for ONNX/WSL2 compatibility testing.
- All 66 canonical ledger rows remain `OPEN`; browser simulation is not live acceptance. Production flags remain off; no production runtime, secrets, or deployment were used.
- Final pre-checkpoint refresh found `origin/main` advanced to `002265277a4a8846167abc7aaa178d5911d3020d` (#425). Targeted comparison from the previously recorded `338adeb0605d160081a2ee995d0f639ad3850d9a` found no changes to canonical SPEC-308, its handoff, or the touched Bell/Feedback/attention/browser workflow paths. The PR branch is still at `930dd6d`; the implementation checkpoint will include the new canonical base through a normal non-force merge before CI.
