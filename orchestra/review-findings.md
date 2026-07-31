# Review Findings - SocratiCode lifecycle hardening

## Convergence round 1 - code, config, and tests

Result: CLEAN after repair sequence.

- Ownership labels and cleanup eligibility are symmetric and fail closed.
- Wrapper traps can remove only the owned named container.
- Watcher timers, error paths, stdout bounds, and single-flight state are
  covered by focused tests.
- Index/watcher boot ordering prevents concurrent 6 GiB plus 4 GiB startup.
- Fresh cleanup, watcher, Bash, and Node gates pass.

## Convergence round 2 - security and installed runtime

Result: CLEAN.

- Installed hashes match repository source.
- Cleanup runs non-root with no capabilities, AF_UNIX-only socket access,
  private network/devices/temp, protected host surfaces, one writable lock path,
  and bounded CPU/RAM.
- `systemd-analyze verify` passes; exposure is 2.6 OK.
- Automatic timer run and live MCP initialize/status smoke pass without deleting
  active or legacy containers.

## Convergence round 3 - impact and live stability

Result: CLEAN.

- A live legacy client was preserved, then contained by its existing 4 GiB cap;
  the local OOM did not become host pressure.
- The crash monitor emitted the expected critical cgroup alert.
- Three fresh snapshots held agent-slice counters flat, PSI at zero, watcher
  restart count at zero, and Docker info children at zero.
- Public, local web, and backend health returned HTTP 200 in every snapshot.
- Database, volumes, application services, and unrelated dirty-tree work were
  untouched.

Convergence stop: three consecutive clean reviews; no blocking findings remain.

## Emergency-pause convergence - 2026-07-17

### Round 4 - Control-plane containment

Result: CLEAN.

- Watcher, index, and cleanup timer are disabled and inactive.
- The live MCP launcher is non-executable (`000`), preventing current Codex/Claude clients from spawning replacement containers.
- Managed SocratiCode MCP container count remained zero after shutdown.

### Round 5 - Data and application safety

Result: CLEAN.

- `socraticode-qdrant` is stopped with restart policy `no`.
- Named volume `socraticode_qdrant_data` remains attached in container metadata; no volume delete or recreate operation ran.
- SmartSpecPro public, local web, and backend health probes returned HTTP 200; web and backend restart counters remained zero; Postgres remained healthy.

### Round 6 - Stability and impact closure

Result: CLEAN.

- Three post-containment snapshots over about 25 seconds showed zero managed MCP containers and no SocratiCode process respawn.
- Host used memory fell from about 13 GiB to 8.2-8.3 GiB; available memory rose from about 17 GiB to 22 GiB.
- Agent-slice tasks fell from 137 to zero, memory PSI `avg10` stayed at zero, and no application runtime or data surface was touched.

Convergence stop: three consecutive clean targeted conductor reviews; no blocking finding or must-do-now gap remains for the requested temporary stop. Re-enabling the current one-container-per-client design remains intentionally deferred.

## Wizard no-seed convergence - 2026-07-19

### Round 1 - completeness and contract review

Result: FIXES APPLIED.

- Added the missing five-category client bound required by the router schema.
- Limited new basic-context fields to basics-only requests so established
  preset/premise service calls keep their prior parameter contract.
- Added sequel lineage forwarding and removed copy that still implied a preset
  was required.

### Round 2 - fresh targeted verification

Result: CLEAN.

- 126 targeted client/router/service/skill tests pass.
- `pnpm check`, `git diff --check`, and dual-case skill comparison pass.
- No auth, tenant-isolation, schema, migration, dependency, or destructive
  runtime surface changed.

Convergence stop: one clean standard-light review after fixes and fresh gates;
no must-do-now gap remains. Real-LLM and deploy verification remain external
side effects requiring a separate authorized runtime pass.

## Hermes Grok authorization convergence - 2026-07-19

### Round 1 - state-machine and authentication review

Result: FIXES APPLIED.

- The selector fix made authorization jobs claimable, exposing a second defect:
  desktop control jobs emitted neither valid positive sequence numbers nor
  running/terminal events.
- The central control handler also skipped `job.running` and returned
  capabilities under a field the settlement service did not consume.
- Repaired both execution paths and verified that xAI authentication is OAuth
  Device Authorization through a browser, not a Smart AI Hub password form.

### Round 2 - focused proof and release review

Result: CLEAN WITH EXTERNAL USER STEP.

- 207 focused web tests and 118 Worker App tests pass.
- A final 100-test server regression set proves the 0.1.131 desktop version
  gate while preserving central workers and unrelated claim paths.
- Worker App 0.1.131 is published and its production checksum and size match the
  built installer.
- Production health is OK and only one intended pending connection remains.
- The live Windows worker still reports 0.1.130, so no authorization or
  capability state was fabricated. Browser consent and the subsequent probe
  remain a user-controlled external step.

Convergence stop: all in-repository and production-server repairs are complete;
the remaining gate is installation and xAI consent on the user's Windows
machine.

## Hermes Windows OAuth and history convergence - 2026-07-20

### Round 1 - root-cause and sandbox review

Result: FIXES APPLIED.

- The failure occurred before OAuth, inside Hermes/Python home resolution under
  `env_clear()`, because all Windows home/app-data variables were absent.
- Kept the sandbox fail-closed and allow-listed only required OS path variables.
- Replaced unusable first-line traceback masking with a bounded final-exception
  diagnostic that redacts named OAuth values, URL query values, and Bearer tokens.

### Round 2 - UI state and accessibility review

Result: FIXES APPLIED.

- Terminal records are separated from actionable connections and collapsed by
  default.
- History shows five records at a time, newest-first, with a real disclosure
  button, ARIA state, Thai/English copy, and locale-appropriate timestamps.
- Terminal central rows are not duplicated in the admin controls; private rows
  never appear there.

### Round 3 - release and production proof

Result: CLEAN WITH EXTERNAL USER STEP.

- Worker App full suite passed 121 tests; focused web regression passed 133
  tests; Worker App typecheck passed.
- The 0.1.132 NSIS bundle was rebuilt after the final security repair, copied
  with mode 0644, atomically included in the web build, and downloaded from
  production with matching size and SHA-256.
- Web service is active and `/healthz` is OK.
- Production correctly demoted the still-running 0.1.131 Windows worker and
  exposed the minimum-version warning. Live device-code proof now requires the
  user to install 0.1.132 and approve xAI in their browser.

## Kie GPT Image 2 auto-routing convergence - 2026-07-20

### Round 1 - catalog and compatibility

Result: FIXES APPLIED.

- Unified the seed and migration around one enabled canonical row.
- Preserved the legacy image-to-image ID as an alias and disabled rather than
  deleted its old row.
- Added a focused selection test for stored/requested legacy IDs.

### Round 2 - runtime isolation and proof

Result: CLEAN.

- Variant switching occurs only when a model explicitly supplies
  `kie_model_id_with_references` and has a non-empty reference list.
- Models without that metadata retain their existing upstream model ID.
- Focused web tests, 28 Python provider tests, Ruff, and diff checks pass.

Convergence stop: one clean standard-light review after fixes; no must-do-now
gap remains. Migration apply and a paid live Kie smoke remain deployment steps.

## Kie GPT Image 2 database migration convergence - 2026-07-20

### Round 1 - live ledger ordering

Result: FINDING FIXED.

- The first Drizzle run skipped 0212 because its journal timestamp was older
  than the latest live ledger entry despite returning success.
- Raised only the 0212 timestamp above the live ledger watermark and reapplied.

### Round 2 - state and idempotence

Result: CLEAN.

- The latest live ledger hash matches migration 0212.
- Exactly one of the two retained GPT Image 2 rows is enabled.
- Canonical metadata contains the reference variant and `input_urls` key.
- A second migrate run created no duplicate ledger row.

### Round 3 - backup and regression

Result: CLEAN.

- The verified custom-format backup contains both affected table datasets.
- Seven focused catalog/selection tests and `git diff --check` pass.

Convergence stop: two consecutive clean reviews after the timestamp repair; no
database readiness gap remains.

## GPT Image 2 production routing incident convergence - 2026-07-20

### Round 1 - runtime evidence and repair

Result: FINDINGS FIXED.

- The media worker process was stale and demonstrably submitted text-to-image
  with three `input_urls`.
- Drained the queue before restart so no active generation was interrupted.
- Found that History would still show the canonical ID after provider routing.

### Round 2 - persisted effective model

Result: CLEAN.

- Async image task creation changes model only when non-empty references and
  explicit Kie variant metadata are both present.
- No-reference and non-opt-in model behavior remains unchanged.
- Thirty-one focused tests pass.

### Round 3 - live runtime readiness

Result: CLEAN.

- Media worker is healthy, subscribed to `media`, and responds to ping.
- Backend restarted successfully and `/health` returns HTTP 200.
- No paid provider smoke was issued automatically.

Convergence stop: two consecutive clean rounds after fixes; no must-do-now gap
remains.

## Media polling and rate-limit incident convergence - 2026-07-20

### Round 1 - correctness and security

Result: CLEAN.

- MCP ownership is checked with `ctx.user.id` before returning a task.
- Direct provider tasks retain the existing authenticated Python path.
- Rate-limit identity uses only cryptographically verified JWT payloads.
- Raw `openId`, bearer tokens, and provider credentials are not logged.
- Scheduler reserves cooldown before awaiting, preventing rerender re-entry.

### Round 2 - integration and production

Result: CLEAN.

- Forty focused web tests and 36 focused Python tests pass.
- Full TypeScript check and focused Ruff checks pass.
- Backend/web/public health checks pass after restart.
- Two production polling windows show no request burst, 404, limiter event, or
  429; pending MCP tasks are zero.

Convergence stop: two consecutive clean rounds; no critical, high, in-scope
medium, verify-only, or must-do-now finding remains.

### Round 3 - artifact tracking

Result: FINDING FIXED, CLEAN AFTER RECHECK.

- The first Python test path was ignored by the repository's generic `core`
  ignore rule.
- Moved the test to `python-backend/tests/unit/test_rate_limit_middleware_identity.py`.
- Re-ran all five identity tests and Ruff; both pass, and the file is now
  visible to Git.

Final convergence stop: clean recheck after the artifact fix; no must-do-now
gap remains.
## Hermes reference forwarding - 2026-07-20

Round 1:
- Confirmed tenant/user predicates remain on every expanded lookup.
- Confirmed worker jobs still persist asset ids and checksums, never URLs.
- Confirmed optional generic references keep best-effort behavior.
- Finding: full workspace typecheck is already red from dependency/type drift;
  saved output at `/tmp/hermes-reference-tsc.log` and verified no changed
  Hermes service error.

Round 2:
- Rechecked changed call sites and normalized URL candidates.
- Re-ran 87 focused tests and the 2-test Episode Hermes subset.
- Verified production assets resolve in prompt order and produce complete
  checksum-backed contracts.
- Clean: no material finding or missing in-scope coverage remains.
# Hermes reference download and Media History review - 2026-07-20

## Round 1 - clean after fixture repair

- Intent check: required; fixes the reported reference-download failure and
  makes Hermes image/video jobs visible in the existing history contract.
- Evidence: worker job `08e15bee-8ca7-47d5-9c33-6ca87d34bc6a` failed with
  HTTP 404 at `downloading_references`; its three assets now download with
  HTTP 200 after storage-key canonicalization.
- Contract review: `getHermesMediaTask` and list projection share one mapper;
  ownership remains enforced by `requestedByUserId` and asset tenant/user
  lookup.
- History review: Hermes tasks are merged before global sort/filter/limit and
  included in the aggregate total without duplicating `media_tasks`.
- Finding fixed: an existing list test used nondeterministic timestamps and
  became order-sensitive; fixture now uses a fixed timestamp.
- Fresh gates: 64 focused tests pass, TypeScript check passes, diff check
  passes, local/public health checks pass after restart.
- New impact surfaces: none.
- Status: clean; no material findings remain.

## Marketplace Auto Review legacy surface review - 2026-07-26

### Round 1 - data contract and UX correction

Result: CLEAN.

- The screenshot's `Legacy` badge matches the route guard that bypasses the staged checkpoint surface.
- Historical Legacy runs do not contain enough persisted data to synthesize nine editable shots safely; the UI now says so and routes the user to a new staged job.
- Aggregate timeline cards are hidden by default and remain available through an explicit accessible disclosure.
- Existing legacy sequential-shot data, output links, and history rendering are unchanged when the user opens the legacy history or when actual sequential data exists.
- Focused Marketplace Auto Review tests pass (19 tests), the production build passes, and no changed-file TypeScript error was introduced.

Convergence stop: one clean targeted review; no in-scope finding remains.
## Vertical Drama rapid prompt plus image timeout - round 1

- Changed surfaces reviewed: per-shot page handler, prompt mutation missing-frame path, row-lock merge, focused tests.
- Finding fixed during implementation: the first patch matched the similar `repairShotImage` precondition; it was reverted and reapplied under the exact `generateShotStartFramePrompt` procedure anchor before verification.
- Final review: no remaining in-scope correctness finding; existing whole-episode action remains available and unchanged.
- Gates: 19 focused tests pass; `git diff --check` passes; repository typecheck remains red only on pre-existing router lines 1709-1765, with no errors in touched ranges.
- Stop reason: one clean targeted conductor review after the repair round.

## SmartAIHub layered loading resilience - 2026-08-01

### Round 1 - root-cause and contract review

Result: CLEAN.

- Evidence remains data-first: the blank route is caused by the shared auth gate
  returning `null` while raw `auth.me` is unresolved; the local shell, backend,
  DB, and Redis were responsive during the incident window.
- Auth behavior is fail-safe for UX without changing authorization: positive
  401/403 results still redirect, while timeout/network/5xx errors preserve the
  user state and render a retryable error instead of clearing the session.
- Tenant feature failures remain distinct from disabled flags. Shared route
  guards now expose loading and retry states after bounded query retries.
- The Vertical Drama detail page already had an explicit AppPage loading/error
  state and retry action; no duplicate page-specific change was needed.
- All five analytics transaction filters use the live `usage` enum, with a query
  contract regression test; no data or migration change was introduced.
- SSE retains the existing per-user cap and cleanup behavior; eviction logs now
  include tenant/user/active-count context and are bounded per user by a
  time-window limiter with stale-entry pruning.
- Accessibility review: retry UI uses semantic `main`/`section`/`button`, an
  alert role, keyboard focus styling, and focused component coverage.
- Findings: none requiring code changes.

### Round 2 - stale-gate and impact recheck

Result: CLEAN.

- Fresh web focused tests pass (12/12), Python analytics tests pass (24/24),
  production web/widget build passes, targeted diff check is clean, and local
  route/auth/tenant/backend probes return HTTP 200.
- Full TypeScript check remains red only on unrelated pre-existing files; no
  error points to a touched file. The protected-state browser E2E gate is not
  claimed as pass because no authenticated test fixture is available in this
  session.
- The broader Vertical Drama detail test group has 50 passing tests; its 11
  `finalRenderSuite` failures are caused by that fixture not mocking
  `verticalDramaEpisodes.deleteEpisode` at render time, before the changed
  route state, and are unrelated to this patch.
- New impact surfaces: shared `AuthContext`, `main.tsx` auth recheck, tenant
  feature guards, analytics Python service, and notification SSE diagnostics;
  all have focused verification or build coverage.
- No material finding or in-scope must-do-now gap remains.

Convergence stop: two consecutive clean conductor review rounds; production
deploy/restart remains intentionally deferred pending explicit approval.
