# Quality Gates

Defines all 20 gate types that the orchestra conductor runs before and after agent work.
Read by SKILL.md Step 6. Risk level terminology follows `task-analysis.md`. Commands below
are repository example defaults. If the active plan or repository docs define explicit
`typecheck`, `lint`, or `test` commands, those discovered commands override the defaults.
The active repository's package manager and resource policy always override generic
examples below.

---

## Gate Inventory

| # | Gate | Command | Trigger | Blocking Level | Max Retries |
|---|------|---------|---------|----------------|-------------|
| 1 | TypeScript Check | Repository-defined changed-workspace command; full-repository command is explicit-only | Explicit user request, documented release gate, or a safe changed-scope check selected by policy | Blocking only when explicitly required and HIGH/CRITICAL | 3; no retry for resource failure |
| 2 | Python Lint | `cd python-backend && ruff check app/` | Any `.py` files changed | HIGH/CRITICAL: blocking; LOW/MEDIUM: warning | 3 |
| 3 | Unit Tests | Repository-defined focused unit/integration commands | Medium risk or higher; or when test files exist for changed code | HIGH/CRITICAL: blocking; MEDIUM: warning | 3 |
| 4 | E2E Browser Tests | Dispatch `e2e-playwright.md` or run discovered Playwright command | User workflow, routing, auth flow, or browser regression changed | HIGH/CRITICAL: blocking; MEDIUM: warning | 2 |
| 5 | Performance Gate | Dispatch `performance.md`; run load/benchmark command when available | Performance-sensitive endpoint, query, cache, or load-test change | CRITICAL: blocking; HIGH: warning unless latency budget is explicit | 2 |
| 6 | CI/Release Gate | Dispatch `ci-release.md`; run workflow validation scripts | `.github/workflows/*`, deployment, release, or rollback files changed | HIGH/CRITICAL: blocking; MEDIUM: warning | 3 |
| 7 | Dependency/Supply-Chain Gate | Dispatch `dependency-supply-chain.md`; run available audit/tree commands | Dependency manifests, lockfiles, Docker images, or Actions versions changed | HIGH/CRITICAL: blocking; MEDIUM: warning | 3 |
| 8 | Security Review (General) | Dispatch `security.md` agent (spot check only — not the full pre-merge gate) | Task risk level is HIGH | CRITICAL findings: blocking; HIGH findings: warning unless task is CRITICAL | 3 |
| 9 | Full Test Suite | All relevant repository-defined test suites | CRITICAL risk tasks or explicit exhaustive verification | Always blocking | 3 |
| 10 | Pre-Merge Security Gate | Dispatch `ssp-security-trpc` + `ssp-security-fastapi` + `ssp-security-frontend` in parallel when Task tooling exists; otherwise run the same specialist roles sequentially inline, then route findings to `ssp-security-review` aggregator (see `security-review-protocol.md`) | Trigger conditions defined in `security-review-protocol.md` | Always blocking until verdict returned | 3 per specialist (managed by security-review-protocol.md) |
| 11 | Visual Polish Gate | Apply `visual-ui-enhancement/references/visual-polish-checklist.md`; dispatch `visual-ux-reviewer` when needed | UI visual polish, premium/modern UI, or major page/component layout changed | Warning for LOW/MEDIUM; blocking for HIGH/CRITICAL user-facing launch surfaces | 2 |
| 12 | Accessibility Gate | Apply `visual-ui-enhancement/references/accessibility-qa.md`; dispatch `accessibility-reviewer` | Interactive UI, forms, navigation, icon-only buttons, focus or keyboard behavior changed | Blocking for user-facing interactive changes; warning for read-only visual copy | 2 |
| 13 | Responsive Gate | Apply `visual-ui-enhancement/references/responsive-qa.md`; dispatch `responsive-reviewer` | Layout, grids, tables, forms, navigation, or dashboard surfaces changed | Blocking when mobile/tablet route is primary; otherwise warning | 2 |
| 14 | Component State Gate | Apply `visual-ui-enhancement/references/component-states.md` | New/modified UI with async data, forms, or actions | Warning for LOW; blocking for MEDIUM+ user workflows | 2 |
| 15 | Dark/Light Mode Gate | Inspect semantic tokens and dark-mode classes | UI surface uses color/surfaces or theme-aware components | Warning; blocking when contrast/readability fails on primary workflow | 2 |
| 16 | UI Screenshot/E2E Gate | Dispatch `e2e-playwright.md` or run discovered Playwright screenshot command | Browser-visible workflow, responsive behavior, or route-level UI changed | HIGH/CRITICAL blocking; MEDIUM warning unless explicitly requested | 2 |
| 17 | Installed Skill Gate | Run the matching skill from `installed-skill-routing.md` | SEO, security, launch, deploy, release, content, analytics, generator, health, or docs tasks | Follows the selected skill's safety policy; CRITICAL security and deploy/release side effects block | 2 |
| 18 | Test Design Gate | Requirement-to-test matrix with RED/GREEN evidence and residual proof boundary | Any behavior change; mandatory before implementation for MEDIUM+ or HIGH/CRITICAL work | Blocking before implementation when required fields are missing | 3 review rounds |
| 19 | Review Convergence Gate | Apply `review-convergence.md`; dispatch relevant reviewers and rerun stale gates | Medium+ scope/risk, any review finding, or any fix after review/gate feedback | Blocking until convergence criteria pass or a stop condition is reached | 5/8/10 by scope |
| 20 | Lifecycle Convergence Gate | Apply `completion-loop.md`; reconcile seven stages, gaps, stale gates, and resume pointer | Every non-trivial implementation, debugging, review/repair, or skill-system task | Blocking until lifecycle invariants pass or a typed blocked/deferred stop is recorded | 1 per stage transition |

---

## Codex Standard Light Gate Policy

When Orchestra is in Codex standard light mode, use the smallest gate set that proves the
changed surface without turning routine work into a long-running orchestration session.

Defaults:
- `small` / low risk: run one targeted static or unit check when available; otherwise do a
  targeted file review and report skipped commands.
- `small` / medium risk: run focused lint/tests for changed behavior when they exist;
  do not infer permission to run a full-repository typecheck.
- implementation-ready `medium` / medium risk: run the Test Design Gate, focused
  lint/tests/E2E for the touched workflow, and a changed-workspace typecheck only when
  the repository resource policy permits it.
- Do not dispatch reviewer agents, visual reviewers, or full suites unless the user asked
  for that depth, the task is high/critical risk, or the touched surface requires it.

Long-running gates:
- Prefer focused commands over full suites.
- Apply `typecheck-resource-policy.md` to every TypeScript check: preflight available
  memory, run workspaces serially, capture logs, and use a session-survivable wrapper
  for explicitly requested long checks.
- Apply `completion-loop.md` after every gate and before each stage transition; a
  failed gate creates a gap and backtracks instead of becoming a skipped gate.
- If a low/medium non-blocking gate exceeds 10 minutes, stop waiting, record a lifecycle
  gap with residual risk, and continue recovery from the earliest affected stage; do not
  treat the timeout as a completed or silently skipped stage.
- If a high/critical blocking gate exceeds 10 minutes, stop and report the command,
  elapsed time, and next recommended command instead of silently waiting.

---

## Blocking vs Warning Matrix

| Risk Level | TypeScript Check | Python Lint | Unit Tests | Security (General) | Full Test Suite |
|------------|-----------------|-------------|------------|-------------------|-----------------|
| low | policy/resource status | warning | skip | skip | skip |
| medium | policy/resource status | warning | warning | skip | skip |
| high | **blocking only when explicitly required** | **blocking** | **blocking** | **blocking** | skip |
| critical | **blocking only when explicitly required** | **blocking** | **blocking** | **blocking** | **blocking** |

Orchestra logs warnings and continues. Blocking gates must pass before proceeding to the
next wave or the final summary.

---

## Gate Details

### Gate 1: TypeScript Check

Apply `typecheck-resource-policy.md` before selecting a command. Map changed files to the
smallest affected workspace and use the repository-defined package manager. A root
aggregate such as `turbo run typecheck` is explicit-only. Run independent workspace
checks serially and capture the command, exit status, resource preflight, and log path.

Only a completed command with fresh exit-zero evidence is `PASS`. Record
`SKIPPED_POLICY`, `BLOCKED_RESOURCE`, `UNVERIFIED_OOM`, `UNVERIFIED_TIMEOUT`, and
`UNVERIFIED_SESSION_LOSS` as unverified statuses; none may be reported as passing.
Never blindly retry the same command after a resource or session failure.

### Gate 18: Test Design Gate

Read `test-design-contract.md` and `tdd-discipline.md`. For each behavior-changing
requirement, verify a requirement-to-test row with an observable behavior, test level,
exact location/command, RED evidence, GREEN evidence plan, and residual proof boundary.
Reject shallow call-only mocks, assertion-free tests, happy-path-only coverage for
failure-prone behavior, broad commands where focused evidence exists, and unit tests
that claim browser/provider/production/restart proof. Documentation-only and purely
visual work must record its accepted test-backed or manual-proof exception.

### Gate 2: Python Lint

```bash
cd python-backend && ruff check app/
```

Runs ruff with `E, W, F, I, B, C4, UP` rules (configured in `python-backend/pyproject.toml`).
Catches unused imports, undefined variables, and unsafe patterns. Does not run type checks.
For type safety, use `mypy app/` as a separate manual step.

### Gate 3: Unit Tests

```bash
# Node.js tests
# Use the repository-defined package manager and focused command.

# Python tests
cd python-backend && pytest
```

Run the relevant suite for the languages touched in the wave. Run both if the wave touched
both TypeScript and Python files.

### Gate 4: E2E Browser Tests

Dispatch `e2e-playwright.md` for browser workflow changes. If the repository exposes a
known Playwright command, run the narrow workflow first. This gate checks user-visible
flows, responsive states, and browser-only regressions that unit tests miss.

### Gate 5: Performance Gate

Dispatch `performance.md` when latency, load, query, cache, or bundle risk is in scope.
The gate must include a baseline, bottleneck evidence, and verification or a documented
blocker.

### Gate 6: CI/Release Gate

Dispatch `ci-release.md` for workflow, deployment, release, or rollback changes. Run
`.github/workflows/tests/workflow-validation.test.sh` or other discovered workflow
validation scripts when available.

### Gate 7: Dependency/Supply-Chain Gate

Dispatch `dependency-supply-chain.md` when dependency manifests, lockfiles, Docker images,
or GitHub Actions versions changed. Use installed scanners where available; otherwise
perform manifest/lockfile drift checks and usage searches.

### Gate 8: Security Review (General)

Dispatch `security.md` agent (from `../../sub-agents/agents/security.md`) as a
spot check. This is not the full pre-merge gate — it is a targeted review of high-risk
changes mid-workflow. The agent reads changed files and returns findings. Does not dispatch
specialist sub-agents.

### Gate 9: Full Test Suite

```bash
# Use all relevant repository-defined test suites only for CRITICAL risk or
# explicitly requested exhaustive verification.
```

Run both test suites end-to-end. Required for CRITICAL risk tasks. Blocking regardless of
outcome — if either suite fails, the conductor must fix and retry before proceeding.

### Gate 10: Pre-Merge Security Gate

See `security-review-protocol.md` for complete protocol. Summary:
1. Orchestra dispatches `ssp-security-trpc`, `ssp-security-fastapi`, and/or
   `ssp-security-frontend` agents in parallel (single message) when Task tooling exists, or
   executes those roles sequentially inline when it does not
2. Collects findings from all specialists
3. Dispatches `ssp-security-review` aggregator with collected findings
4. Aggregator returns PASS / CONDITIONAL / FAIL verdict
5. Conductor applies verdict per `security-review-protocol.md` threshold policy

This gate is always blocking — no workflow-level bypass. Only the `ssp-security-review` aggregator
can unblock it by returning a PASS or CONDITIONAL verdict.

### Gate 11: Visual Polish Gate

Use `skills/visual-ui-enhancement/references/visual-polish-checklist.md` to check hierarchy,
composition, typography, color/surfaces, and premium restraint. For substantial UI changes,
dispatch `visual-ux-reviewer.md` and include its verdict in the wave result.

### Gate 12: Accessibility Gate

Use `skills/visual-ui-enhancement/references/accessibility-qa.md` and dispatch
`accessibility-reviewer.md` for interactive UI changes. Check semantic controls, labels,
keyboard access, focus visibility, icon-only accessible names, contrast risk, and reduced
motion.

### Gate 13: Responsive Gate

Use `skills/visual-ui-enhancement/references/responsive-qa.md` and dispatch
`responsive-reviewer.md` when layouts, dashboards, tables, navigation, or forms change.
Check mobile, tablet, laptop, and desktop behavior plus overflow and touch targets.

### Gate 14: Component State Gate

Use `skills/visual-ui-enhancement/references/component-states.md`. Any async, form, or
action-oriented UI should cover loading, empty, error, disabled, success, hover, active,
selected, and focus states as applicable.

Frontend behavior/data-fetching work is still subject to this gate even when the writer is
`frontend` instead of `ui-builder`. Routing and writer ownership do not remove state coverage.

### Gate 15: Dark/Light Mode Gate

Prefer semantic tokens over raw colors. Verify foreground/background pairing, muted text,
borders, focus rings, destructive states, and status colors remain readable in both themes.

### Gate 16: UI Screenshot/E2E Gate

Use `e2e-playwright.md` or a discovered Playwright command for route-level UI changes,
async/data-fetching UI, responsive work, or when visual correctness cannot be inferred from
code. Include viewport coverage in the result.

Also apply `ui-browser-verification.md`. The gate result must include either:
- screenshot/Playwright evidence for required mobile, tablet, and desktop viewports, plus
  extended viewports when risk requires them, or
- explicit skipped entries with blockers and manual inspection notes.

When comparing before/after screenshots or using `visual-diff`, apply
`visual-regression-policy.md` for artifact naming, viewport coverage, and pass/fail
criteria.

Do not mark missing browser tooling, missing dev server access, or unavailable screenshots
as pass.

### Gate 17: Installed Skill Gate

Use `installed-skill-routing.md` to select a specialized installed skill as a gate or
sub-check. Common examples:

- Launch readiness: `ship`, `security-audit`, `migration-checker`, `bundle-tracker`, `api-smoke-test`, `health-check`.
- Security: `security-audit`, `secret-scanner`, `pentest`, `dep-doctor`.
- SEO/content: `seo-audit`, `content-scorer`, `og-validator`, `sitemap-generator`, `robots-generator`, `llms-txt-generator`, `structured-data-generator`.
- Deploy/release: `deploy`, `release`, `health-check`, `redirect-checker`.
- Image: `gpt-image-2` with Codex-native execution when available.
- UI: `visual-ui-enhancement`, `web-design-engineer`, `visual-diff`.
- Knowledge/video: `kb-retriever`, `web-video-presentation`.

For code-aware help/tutorial/video work, Gate 17 must also verify:
- Source-grounding: the help/tutorial/script claims are traceable to discovered
  route/page/component/API files or observed behavior.
- Image routing: illustrative assets use `gpt-image-2` first and Codex-native
  image execution when available.
- Video readiness: `script.md` and `outline.md` from `web-video-presentation`
  reflect the real feature flow and user states.
- Side-effect safety: scaffolding, npm installs, TTS, and external audio calls
  were confirmed immediately before execution.
- Product polish: in-product help UI also runs Visual Polish, Accessibility, and
  Responsive gates.

Record skipped checks explicitly with reasons. Never mark missing credentials, missing
browser tooling, or missing build artifacts as pass.

---

## Gate Failure Protocol

When a gate fails:

1. **Identify the source** — read the error output to determine which agent's change caused
   the failure. Check file paths in the error against the wave's ownership boundaries.
2. **Capture bounded evidence** — if output is longer than about 80 lines or 12 KB, save
   the full output to an artifact path such as `orchestra/logs/<gate>-wave-<N>-attempt-<N>.log`
   and redact secrets before sharing excerpts.
3. **Construct a fix Task Packet** — include: command, exit code, decisive error lines,
   a short first/last excerpt, artifact/log path for full output, file paths involved,
   wave number, and the original task. Do not paste full logs, stack traces, or test
   transcripts into CONTEXT.
4. **Re-dispatch the same agent type** that produced the failing code.
5. **Increment the retry counter** for this (gate, wave) pair.
6. **If retry counter reaches 3** — create/update a lifecycle gap, mark downstream
   evidence stale, and run `completion-loop.md` recovery. Do not mark the stage
   skipped or complete. Stop only as a typed blocked state when safe recovery is
   impossible or a loop policy limit is reached.

Resource failures are a separate class from code failures. If a process is killed by OOM,
the host loses SSH/session, or a bounded resource timeout expires, record the typed status
and evidence path, do not dispatch the same command again, and use focused proof or stop
when the explicit gate is blocking.

The retry counter resets per wave, per gate. A gate that fails in wave 2 and succeeds on
retry 1 starts fresh in wave 3.

## Stale Gate Protocol

A passing gate becomes stale when a later fix changes any file, contract, runtime path, UI
surface, schema, route, dependency, or config that the gate covered.

After every review/gate-driven fix:

1. Identify which earlier gates covered the changed surface.
2. Mark those gates as stale in `orchestra/progress.md`.
3. Rerun stale gates before the next review round or final summary.
4. If a gate cannot run, record it as skipped with a blocker and residual risk. Do not count
   it as a clean convergence signal.

In standard light mode, rerun only stale gates that cover the changed files/runtime path.
Do not upgrade to full-suite reruns unless risk is high/critical, a broad shared contract
changed, or the user requested exhaustive verification.

## Gate 19: Review Convergence Gate

Read `review-convergence.md`. This gate prevents Orchestra from completing after only one
post-completion review when fixes may have created second-order issues.

The gate must prove:
- required review rounds ran for the task's scope/risk
- no material findings remain
- all stale gates were rerun after the last relevant change
- impact closure found no new required work
- optional deferred items are documented with rationale

If the gate finds new material issues, dispatch the owning sub-agent or fix wave, rerun
stale gates, and repeat until the stop rules in `review-convergence.md` are satisfied.

## Gate 20: Lifecycle Convergence Gate

Read `completion-loop.md` and verify `orchestra/lifecycle.md` after every wave,
gate, repair, and review round. Confirm:

- `PLANNING`, `TDD_DESIGN`, `IMPLEMENT`, `VERIFY`, `DEBUG_FIX`, `REVIEW`, and
  `FINAL_VERIFY` are each `COMPLETE` or explicitly justified `NOT_APPLICABLE`;
- every open gap has an owner, action, evidence, earliest affected stage, and
  `resume_from`;
- no `MUST_FIX`, `MUST_DO_NOW`, or `VERIFY_ONLY` gap remains open;
- every repair made downstream evidence stale and the affected gates were rerun;
- `current_stage` equals `resume_from` while recovery is active;
- final verification is fresh and all completion invariants are true.

If any condition fails, leave the lifecycle open and continue from the earliest
affected stage. If safe recovery is impossible, record a typed blocked/deferred
stop with residual risk; never report a successful completion.

---

## Gate Command Reference

```bash
# TypeScript type check
# Select the repository-defined changed-workspace command only after applying
# skills/orchestra/references/typecheck-resource-policy.md.

# Python lint
cd python-backend && ruff check app/

# Node.js unit tests
cd apps/web && npm test

# Python unit tests
cd python-backend && pytest

# Workflow validation
bash .github/workflows/tests/workflow-validation.test.sh

# Skill pack validation
bash skills/audit-skills.sh

# Installed skill publication and sync
bash skills/publish-to-installed-skills.sh
bash skills/verify-installed-skills-sync.sh

# Full test suite (both repository example defaults)
cd apps/web && npm test && cd ../../python-backend && pytest
```
