# SPEC-308 Progress

Loop policy:
  orchestra_id: fable_style_coding_orchestra
  purpose: coding webapp with an agent loop
  continuation_cycle: implementation-wave-5-20261010
  current_stage: VERIFY
  resume_from: VERIFY
  iteration: 5/12
  tool_call_batches: unknown/30
  estimated_cost_usd: unknown (not measured; soft ceiling 0.50)
  dispatch_waves: 1/6
  active_subagents: 0/4
  parallel_writers: 0/2
  parallel_writers_peak: 3/2 (policy overrun recorded; no further writer fan-out)
  required_subagent_wait: 0/10 minutes
  background_subagent_wait: <10 minutes
  repair_rounds: 2/5
  stop_conditions: lifecycle_converged, tests_passed, no_open_blockers
  stop_reason: focused_fixture_and_dock_assertions_repaired_on_f0fa060_and_exact_head_ci_running

## Baseline
- Latest refresh: `origin/main` `6dcd7934332db7929904f8da642915751a6bb79`; PR #399 head `f0fa060c55779beb6d55c7baeba727d9dd3a517c`; PR #403 `74a482e8fe38a131bdbe41bfee0e53ad90347e4c`; PR #405 `868a5600ff770be91885666b7f584835e03fc690`.
- Active implementation worktree: `/home/dev/worktrees/spec308-browser-ci-20261010`, branch `codex/spec308-browser-ci-20261010`; PR #399 was advanced through a normal fast-forward push to its existing branch. The older `/home/dev/worktrees/spec-308-dual-surface-20261009` is clean but stale and was not modified.
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
| WP3–WP7 | conductor | bell, launcher, settings, coordinator, responsive, QA | PARTIAL | source implementation advanced; focused exact-head CI is pending; authenticated runtime remains blocked |

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

## Implementation continuation — 2026-10-10 (deferred consolidated verification)
- Refreshed canonical refs: `origin/main` `002265277a4a8846167abc7aaa178d5911d3020d`; PR #399 `38945eef14f405e3606a068f457efb1820269254`; PR #403 `74a482e8fe38a131bdbe41bfee0e53ad90347e4c`; PR #405 `868a5600ff770be91885666b7f584835e03fc690`. PR #399 remains open and mergeable; no external approval or production action was taken.
- Implementation checkpoint committed locally as `cfaf435a87f528ca3360a4be99405641b8059ccf`; it is based on `origin/main` and is not yet the remote PR head. No tests were run on this checkpoint.
- Read exact PR #399 CI run `37971045023`: Browser Simulation failed on the test step only (12 passed, 4 failed) after install/schema/Chromium/Vite setup passed. The failures were normal Bell motion plus three missing reminder balloon assertions. Exact run metadata is saved in `evidence/pr-ci-37971045023.json`. The test fixture now waits for mascot readiness and authenticated notification baseline before dispatching events; the demo listener uses a layout effect so a ready Settings action is not lost before passive effect registration.
- Implemented identity-scope protection: `FeedbackButton` now exposes defaults until preferences match the current user+tenant key; scope changes advance reducer generation, reset seen IDs/cooldowns/pending episode, require a fresh baseline, and remap only events whose scope key matches the active identity. Settings uses the same loaded-identity guard. Reducer cases were added for stale generation and repeated row IDs across scopes; tests are source changes only and remain unrun.
- Localized the five Settings mascot names using normative SPEC-308 §4 labels in English and Thai while retaining internal IDs and stored values. Component and browser assertions now target the translated accessible names.
- Closed an additional animation preference gap: manual `motion: off` disables reminder and onboarding entrance animation; a browser assertion was added. The one consolidated verification round remains deferred as requested.
- Exact PR #399 MCP run `37971044599` is recorded in `evidence/pr-ci-37971044599.json`; it failed 44/120 focused tests due missing `DATABASE_URL` and removed retired `agencyMcpService` test imports. PR #403 contains the deterministic fixture repair but no newer CI exists. Live MCP gate fails closed without approved `MCP_SMOKE_URL` and `MCP_SMOKE_TOKEN`.
- Every canonical requirement remains OPEN/UNVERIFIED. Requirement-map rows were updated for scope isolation, localization and motion-off; no row was marked PASS. PR #405 still has the Moderate `sprintf-js@1.1.3` mandatory audit residual pending Security Owner disposition and any ONNX/WSL2 test approval. Approved non-production app runtime and authorized acceptance identity remain unavailable. Production flags stay OFF; no deployment.
- Handoff generation 22 records source checkpoint `cfaf435a8`, PARTIAL implementation, pending consolidated verification, current blockers, and exact PR/#main SHAs. `validate --all` and `index --check` pass after generation; this does not close ledger requirements.

## Notification authority fail-closed implementation — 2026-10-10
- Independent source audit confirmed SPEC-308 §6.2 does not permit treating parseable SSE JSON as authorization. Existing notification SSE/query are user-wide, not bound to the active tenant, and grouped rows lack a monotonic occurrence identity in the authorized query result.
- Removed SSE-driven Bell animation and mascot arrival dispatch. Existing SSE connection, query invalidations, job-completion toast, badge, Bell action, and Chat/Feedback/demo surfaces remain. The coordinator receives an empty baseline and stays quiet while Feature-049 authorization/revision proof is absent.
- Updated isolated Playwright assertions to expect static decorative surfaces for unverified SSE while preserving the Bell action and demo behavior. No tests/typecheck/build were run; they remain queued for the user's single consolidated round.
- Read-only security review confirmed no SSE/query arrival path remains in the four inspected components/libs. The custom same-origin event is still forgeable but carries no notification data; any future arrival producer must be connected to Feature-049's authorization contract.
- Added `evidence/attention-authority-fail-closed-20261010.md`; updated row-level requirement notes for exact trust-gate and static fallback. All 66 requirements remain OPEN/UNVERIFIED. Feature-049 owner confirmation, consolidated tests, and live authenticated acceptance remain open.
- Sub-agent: `attention_security_review2`, read-only review, useful, closed; requested GPT-5.6 Terra override was unavailable in host, so inherited model used.
- Independent gap scout found two small safe requirements outside the notification trust boundary. Implemented both: EN/TH Settings description now states preferences stay in this browser/device, and local preference loading rejects strings longer than 2,048 code units before `JSON.parse`. Added a focused oversized-value test source; it has not been run.
- Sub-agent: `spec308_gap_scout`, read-only audit, useful, final result received and closed; its proposed paths were locale strings and `assistantMascotPreferences.ts`, disjoint from the primary notification files.
- Follow-up parallel implementation audits were disjoint and made no edits: `settings_safe_gaps` found the Settings controls already complete for its bounded path; `feedback_safe_gaps` found the Chat/Feedback/mascot behavior and responsive/accessibility source already covers the inspected criteria. Both returned without tests. A third independent PR #405 agent dispatch was rejected by the host's total thread limit; dependency work remains on the conductor's existing WP405 evidence and needs owner authority for the residual Moderate.
- Reconciled this branch with refreshed `origin/main` `6dcd7934332db7929904f8da642915751a6bb79d` through merge commit `243aa5fdd3e26c7e66539e24e10a0b42ee9525ee`; latest SPEC-308 handoff generation 24 records that candidate, and registry `validate --all` / `index --check` pass. Branch HEAD is now documentation-only commit `9f0f74ce54d77d3f8b05e0bb0c9aefd9066b1e47`.
- Re-queried PR checks after refresh: #399 head `38945eef` still has Browser Simulation failure (12/16 Playwright) plus MCP contract and live-evidence failures; #403 head `74a482e8` still has contract/security and live-evidence failures; #405 head `868a5600` has compatibility regressions passed but mandatory production audit failed. These are existing remote-head results; no new workflow/test was run in this implementation turn.
- The first consolidated CI after publishing current implementation ran against PR #399 SHA `3dd9bd064a91bca5fd10fa8ef29bfcc31e128b28` (latest main base `6dcd7934`). Browser simulation setup passed; 15 tests passed and two failed: the mobile demo's exact 2,999ms boundary assertion expired early, and post-drag balloon alignment was 142px off. Added a scheduling margin to the fake-time assertion and post-layout/scroll remeasurement with center-alignment polling in source commit `0287181e53accb9303151a2ad0d42f890a22064a`. Exact run evidence is in `evidence/pr-ci-37974426321.json` and the failure analysis note.
- The same CI cycle confirms MCP focused tests still fail because `DATABASE_URL` is absent and the suite imports removed `agencyMcpService`; later contract/security and production audit steps were skipped after that failure. The live-contract gate fails closed on empty `MCP_SMOKE_URL`/`MCP_SMOKE_TOKEN`. These failures remain owned by PR #403 / CI runtime authority and were not bypassed. Evidence: `pr-ci-37974426476.json` and `pr-399-ci-failure-379744-20261010.md`.
- Browser fixes are not yet pushed or rerun. All requirement rows remain OPEN/UNVERIFIED pending fresh exact-head verification and external acceptance.
- Follow-up run 37975172614 on SHA `a3df3cbb703c45562705d45f01fa9e11ba419887` passed the 3s timing and post-drag positioning scenarios; the only remaining browser failure was the isolated demo test dispatching before the fixture baseline-ready signal. Added that readiness barrier in test source commit `d2ad4f240e8853c717583481e6c0b95d9ba7df3f`. Run metadata is recorded in the 379751 evidence JSON files; no local tests were run.

## Implementation checkpoint — 2026-10-10 (wave 2)
- Refreshed `origin/main` at `6dcd7934332db7929904f8da642915751a6bb79` and PR #399 at `596fcdbfc656f62c7a3b9205c44d252849f5e859`; PR #403/#405 and their owned worktrees were left untouched.
- CI run `37975735432` on `596fcdb` passed 16/17 browser tests; the remaining motion-off balloon case dispatched its demo before the baseline-ready signal. The source already keeps the static balloon visible and disables its animation; the browser fixture now awaits readiness.
- Read-only review found an authorization-scope gap in Chat/Task Control: an in-flight conversation creation could install a conversation ID after a user/tenant transition. `FeedbackButton` now fences conversation state and late task prompts by user+tenant (including desktop identities with no tenant), closes/clears the prior scoped dialog on identity change, and ignores stale prompt completion.
- Added EN/TH fallback copy for launcher-owned Chat startup/retry and Feedback upload/submit error states. Existing server error messages are preserved.
- Source commit: `dd6a42f82ba1452dcc7a58a7626455b31970ee4d`. Canonical handoff generation 28 records PARTIAL source progress; all 66 requirements remain OPEN/UNVERIFIED.
- `git diff --check`, both chat-locale JSON parses, registry validation and index check passed. No tests/typecheck were run for the candidate. Local ESLint/Prettier were unavailable in this worktree; full typecheck remains prohibited by shared RAM policy.
- Next: publish the checkpoint on PR #399 and collect its exact-head consolidated CI once source implementation is frozen. Keep PR #399 unmerged until PR #405/#403 mandatory gates clear; live Feature-049 and approved non-production identity/runtime are still required for acceptance.


## Implementation checkpoint — 2026-10-10 (wave 3)
- PR #399 source commit `a5093fdcf2641939deb8afd1891cb4a9b05d8608` localized Chat/Task Control/Feedback surfaces and file-state copy in EN/TH, and fenced delayed urgent confirmation across user/tenant transitions.
- Browser harness commit `da4d7d8214ffa0e144ccf89988e503663956a9f0` installs the EventSource baseline fixture for manual-motion coverage, requires visible balloon before measurement, asserts Thai dialog/form localization, and advances the mocked rAF clock before post-drag measurement. The <=24px alignment threshold is retained.
- Static locale parity/key coverage and `git diff --check` pass. No tests/build/typecheck run; one consolidated exact-head verification is queued.
- Requirement rows AC-308-026 and AC-308-035 are individually mapped to PARTIAL implementation with verification pending; no row is PASS. Other ledger rows remain OPEN/UNVERIFIED.
- Next: update generated canonical handoff, push this checkpoint to PR #399, and review the exact-SHA consolidated CI.

## Implementation continuation — 2026-10-10 (wave 4)
- Reconciled PR heads and `origin/main` before edits: canonical `6dcd7934332db7929904f8da642915751a6bb79`; PR #399 current candidate `583f65404dddc9b722d9abc4b63b41e10c44c728`; PR #403 `74a482e8fe38a131bdbe41bfee0e53ad90347e4c`; PR #405 `868a5600ff770be91885666b7f584835e03fc690`.
- Parallel implementation packets returned for Bell, Settings, and mascot paths. The dispatch briefly exceeded the recorded two-writer cap (three scoped writers); this is recorded and no further writer fan-out is planned in this cycle. All agents returned and were closed without committing.
- Integrated source checkpoint `2d554f2097d230d957cbfbacfcd822bdb62b9568`: Bell Recent summary now uses the existing bounded polling rows; unverified SSE remains silent; Settings validates preference patches and waits for identity hydration; invalid mascot runtime values fall back to the chat/32px/calm renderer; Chat/Task Control/Feedback tabs now have tab-panel relationships and manual keyboard navigation that does not create a conversation merely on focus.
- Added focused SPEC-308 unit suites to `.github/workflows/spec-308-browser.yml`; corrected the Bell test path before its test step ran. Latest candidate is `583f65404dddc9b722d9abc4b63b41e10c44c728`.
- The local focused test command did not execute because this isolated worktree has no `node_modules`; no dependency installation was attempted because shared disk capacity was low. Focused unit tests and mocked browser simulation are queued together on exact PR #399 SHA `583f65404dddc9b722d9abc4b63b41e10c44c728`, workflow run `37981327003`.
- The concurrent PR #399 workflow `37981327020` confirms only the pre-existing PR #403 MCP fixture defects (`DATABASE_URL` dependent tests and stale retired `agencyMcpService` import) and missing live `MCP_SMOKE_URL`/`MCP_SMOKE_TOKEN`; mandatory security and live gates were not skipped. PR #403/#405 worktrees were not changed.
- Remaining authority blockers are unchanged: approved non-production authenticated app/runtime identity, Feature-049 tenant authorization plus grouped occurrence revision authority, MCP live smoke secrets/endpoint, and Security/Runtime Owner disposition for residual `sprintf-js` Moderate.

## Implementation continuation — 2026-10-10 (wave 5)
- Added local Bell popover viewport clamping, visualViewport resize/scroll repositioning, safe-area-aware dock padding, translated truthful unread/recent/empty status, and focus management on open/Escape/close. Added local mascot error isolation and privacy-safe discoverability metric definitions without telemetry collection.
- Source commit `eee0fa4cc389590d378307fff3af5a15f74c42e0` was tested by run `37984108309`: 120 passed / 20 failed in two of eight focused suites; browser stage skipped. Log analysis identified stale test mock translations/aria selectors plus jsdom unsupported safe-area `max()` values. Source/test follow-up `f0fa060c55779beb6d55c7baeba727d9dd3a517c` corrects these; exact-head run `37984601979` is pending.
- Current PR #399 head is `f0fa060c55779beb6d55c7baeba727d9dd3a517c`; canonical `origin/main` remains `6dcd7934332db7929904f8da642915751a6bb79`. PR #403/#405 heads are unchanged; all their worktrees remain untouched.
- Requirement rows AC-308-007, -021, -022, -024 and -033 now have individually recorded PARTIAL source evidence at the current source SHA. They remain OPEN and await exact-head verification; all 66 requirements remain unresolved.

## Implementation continuation — 2026-10-10 (wave 6)
- Refreshed canonical `origin/main` at `6dcd7934332db7929904f8da642915751a6bb79`; PR #399 now points to `7325a117b2f342ef54af82fdb9b52235ae81adbe`. PR #403 (`74a482e8fe38a131bdbe41bfee0e53ad90347e4c`) and PR #405 (`868a5600ff770be91885666b7f584835e03fc690`) remain unchanged; their worktrees were not modified.
- Added viewport-aware assistant hint geometry, localized Bell detail/action and empty-list copy, a user-facing `prefers-reduced-motion` override note, and deterministic tests for all five styles, dialog tabs, balloon side effects, and draft preservation while decorative hints are suppressed.
- Run `37985593546` on `f4f3733` failed 3/144 focused tests; `37985921704` on `c8be83e7` passed 143/144 and identified duplicated Bell empty-state content. Fixed the UI copy and assertion in `7325a117`. Current exact-SHA workflows `37986151623` (SPEC-308) and `37986151602` (MCP) are queued; no local tests/typecheck/build were run.
- MCP run `37985921716` failed 44/120 due missing `DATABASE_URL`-backed MCP state and the obsolete retired `agencyMcpService` test import; the live smoke job also lacks authorized `MCP_SMOKE_URL`/`MCP_SMOKE_TOKEN`. These are PR #403-owned gates, not altered here.
- The canonical requirement ledger now evaluates all 66 rows individually: 63 `PARTIAL`, 3 `UNVERIFIED`, all 66 `OPEN`; no verification evidence or PASS is recorded. Production flags remain OFF. Approved non-production runtime/test identity and Feature-049 tenant/occurrence authority remain unavailable; PR #405 residual `sprintf-js` Moderate still needs Security/Runtime Owner disposition.

## Reconciliation and exact-head evidence — 2026-10-10 (wave 7)
- Refreshed remote refs with REST/API after GitHub GraphQL rate limiting. Canonical `origin/main` is `6dcd7934332db7929904f8da642915751a6bb79`. PR #399 is open/mergeable at `7325a117b2f342ef54af82fdb9b52235ae81adbe` and based on current main. PR #403 (`74a482e8fe38a131bdbe41bfee0e53ad90347e4c`) and #405 (`868a5600ff770be91885666b7f584835e03fc690`) remain open/mergeable but based on `338adeb0605d160081a2ee995d0f639ad3850d9a`; neither was rebased or modified.
- Exact PR #399 SPEC-308 workflow `37986151623` checked out `7325a117` and passed: 8 Vitest files / 144 tests, Chromium 18/18 (61.1s), 0 unexpected / flaky. Artifact ID `11643651233` is saved in the CI evidence note; the workflow used mocked identity/API against UI-only Vite and is not live authenticated acceptance. Screenshot files in that artifact are repository evidence files, not evidence of live runtime captures.
- The separate PR #399 MCP workflow `37986151602` failed: 76/120 MCP tests passed and 44 failed in baseline MCP server suites due absent DB-backed session state and three stale imports of retired `agencyMcpService`; logs confirm no SPEC-308 production-source delta causes these. Its live smoke gate failed closed because `MCP_SMOKE_URL`/`MCP_SMOKE_TOKEN` are unset. `check:mcp146`, `security:mcp146`, and audit steps were skipped after the focused-test failure.
- PR #403 run `37967358012` on its older base passed focused MCP tests, `check:mcp146`, and `security:mcp146`; its mandatory production audit failed on the old dependency set and live smoke lacked authorized endpoint/token. PR #405 run `37967353996` passed compatibility regressions (18 files / 238 tests), while the full audit correctly failed on one Moderate `sprintf-js@1.1.3` with no patched version. The old-base audit on #403 is not a verdict on the #405 candidate.
- Sub-agent read-only reconciliation found no safe dependency/native-runtime change without Security and media/runtime owner authority. The decision remains: approved ONNX 1.30.0/WSL2 compatibility test or a documented scoped/expiring residual-risk disposition; no advisory suppression, gate reduction, or runtime change.
- Exact run `37986151623` gives partial mocked support only to tested portions of `AC-308-002/003/004/005/006/007/008/014/015/016/017/019/021/022/023/025/026/027/035/036`. No row closes because integrated-SHA freshness and broader/live evidence remain missing. The ledger stays 63 `PARTIAL`, 3 `UNVERIFIED`, 66 `OPEN`; production flags remain OFF.
- Primary checkout `/home/dev/projects/SmartSpecPro` remains behind canonical and contains the user's untracked SPEC-308 ZIP/extracted folder; it was not changed. Work continued only in this SPEC-308 worktree. Existing handoff documents had stale pending-run references and are being reconciled via `tools.spec_handoff`; no source behavior changed in this evidence wave.
- A separate docs-only worktree attempt from `origin/main` failed during checkout with `No space left on device` (filesystem had 462 MB free); Git removed the partial directory, leaving no uncommitted work there. No files in the primary checkout or other task worktrees were touched. The safe evidence checkpoint will stay on the existing PR #399 branch pending required gates rather than attempting a second checkout on the full disk.
- Next: prepare/record the external security disposition without contacting owners or changing runtime; after a valid disposition/remediation, refresh #405 and its mandatory gates, then reconcile #403 and #399 in sequence. Live MCP and SPEC-308 authenticated runtime still require approved authority.
