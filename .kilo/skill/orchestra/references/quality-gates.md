# Quality Gates

Defines all 16 gate types that the orchestra conductor runs after each wave of agent work. Read by SKILL.md Step 6. Risk level terminology follows `task-analysis.md`. Commands below are repository example defaults. If the active plan or repository docs define explicit `typecheck`, `lint`, or `test` commands, those discovered commands override the defaults.

---

## Gate Inventory

| # | Gate | Command | Trigger | Blocking Level | Max Retries |
|---|------|---------|---------|----------------|-------------|
| 1 | TypeScript Check | `cd apps/web && pnpm check` | Any `.ts` or `.tsx` files changed | HIGH/CRITICAL: blocking; LOW/MEDIUM: warning | 3 |
| 2 | Python Lint | `cd python-backend && ruff check app/` | Any `.py` files changed | HIGH/CRITICAL: blocking; LOW/MEDIUM: warning | 3 |
| 3 | Unit Tests | `cd apps/web && pnpm test` and/or `cd python-backend && pytest` | Medium risk or higher; or when test files exist for changed code | HIGH/CRITICAL: blocking; MEDIUM: warning | 3 |
| 4 | E2E Browser Tests | Dispatch `e2e-playwright.md` or run discovered Playwright command | User workflow, routing, auth flow, or browser regression changed | HIGH/CRITICAL: blocking; MEDIUM: warning | 2 |
| 5 | Performance Gate | Dispatch `performance.md`; run load/benchmark command when available | Performance-sensitive endpoint, query, cache, or load-test change | CRITICAL: blocking; HIGH: warning unless latency budget is explicit | 2 |
| 6 | CI/Release Gate | Dispatch `ci-release.md`; run workflow validation scripts | `.github/workflows/*`, deployment, release, or rollback files changed | HIGH/CRITICAL: blocking; MEDIUM: warning | 3 |
| 7 | Dependency/Supply-Chain Gate | Dispatch `dependency-supply-chain.md`; run available audit/tree commands | Dependency manifests, lockfiles, Docker images, or Actions versions changed | HIGH/CRITICAL: blocking; MEDIUM: warning | 3 |
| 8 | Security Review (General) | Dispatch `security.md` agent (spot check only — not the full pre-merge gate) | Task risk level is HIGH | CRITICAL findings: blocking; HIGH findings: warning unless task is CRITICAL | 3 |
| 9 | Full Test Suite | `cd apps/web && pnpm test` AND `cd python-backend && pytest` | CRITICAL risk tasks | Always blocking | 3 |
| 10 | Pre-Merge Security Gate | Dispatch security-trpc + security-fastapi + security-frontend specialists in parallel, then route findings to security-review aggregator (see `security-review-protocol.md`) | Trigger conditions defined in `security-review-protocol.md` | Always blocking until verdict returned | 3 per specialist (managed by security-review-protocol.md) |
| 11 | Visual Polish Gate | Apply `visual-ui-enhancement/references/visual-polish-checklist.md`; dispatch `visual-ux-reviewer` when needed | UI visual polish, premium/modern UI, or major page/component layout changed | Warning for LOW/MEDIUM; blocking for HIGH/CRITICAL user-facing launch surfaces | 2 |
| 12 | Accessibility Gate | Apply `visual-ui-enhancement/references/accessibility-qa.md`; dispatch `accessibility-reviewer` | Interactive UI, forms, navigation, icon-only buttons, focus or keyboard behavior changed | Blocking for user-facing interactive changes; warning for read-only visual copy | 2 |
| 13 | Responsive Gate | Apply `visual-ui-enhancement/references/responsive-qa.md`; dispatch `responsive-reviewer` | Layout, grids, tables, forms, navigation, or dashboard surfaces changed | Blocking when mobile/tablet route is primary; otherwise warning | 2 |
| 14 | Component State Gate | Apply `visual-ui-enhancement/references/component-states.md` | New/modified UI with async data, forms, or actions | Warning for LOW; blocking for MEDIUM+ user workflows | 2 |
| 15 | Dark/Light Mode Gate | Inspect semantic tokens and dark-mode classes | UI surface uses color/surfaces or theme-aware components | Warning; blocking when contrast/readability fails on primary workflow | 2 |
| 16 | UI Screenshot/E2E Gate | Dispatch `e2e-playwright.md` or run discovered Playwright screenshot command | Browser-visible workflow, responsive behavior, or route-level UI changed | HIGH/CRITICAL blocking; MEDIUM warning unless explicitly requested | 2 |

---

## Blocking vs Warning Matrix

| Risk Level | TypeScript Check | Python Lint | Unit Tests | Security (General) | Full Test Suite |
|------------|-----------------|-------------|------------|-------------------|-----------------|
| low | warning | warning | skip | skip | skip |
| medium | warning | warning | warning | skip | skip |
| high | **blocking** | **blocking** | **blocking** | **blocking** | skip |
| critical | **blocking** | **blocking** | **blocking** | **blocking** | **blocking** |

Orchestra logs warnings and continues. Blocking gates must pass before proceeding to the
next wave or the final summary.

---

## Gate Details

### Gate 1: TypeScript Check

```bash
cd apps/web && pnpm check
```

Runs `tsc --noEmit` (configured in `apps/web/tsconfig.json`). Catches type errors, missing
imports, and schema shape mismatches across the full web app. This is the fastest signal
of a broken contract between frontend and backend.

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
cd apps/web && pnpm test

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
cd apps/web && pnpm test && cd ../../python-backend && pytest
```

Run both test suites end-to-end. Required for CRITICAL risk tasks. Blocking regardless of
outcome — if either suite fails, the conductor must fix and retry before proceeding.

### Gate 10: Pre-Merge Security Gate

See `security-review-protocol.md` for complete protocol. Summary:
1. Orchestra dispatches security-trpc, security-fastapi, and/or security-frontend agents
   in parallel (single message)
2. Collects findings from all specialists
3. Dispatches security-review aggregator with collected findings
4. Aggregator returns PASS / CONDITIONAL / FAIL verdict
5. Conductor applies verdict per `security-review-protocol.md` threshold policy

This gate is always blocking — no workflow-level bypass. Only the security-review aggregator
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

### Gate 15: Dark/Light Mode Gate

Prefer semantic tokens over raw colors. Verify foreground/background pairing, muted text,
borders, focus rings, destructive states, and status colors remain readable in both themes.

### Gate 16: UI Screenshot/E2E Gate

Use `e2e-playwright.md` or a discovered Playwright command for route-level UI changes,
responsive work, or when visual correctness cannot be inferred from code. Include viewport
coverage in the result.

---

## Gate Failure Protocol

When a gate fails:

1. **Identify the source** — read the error output to determine which agent's change caused
   the failure. Check file paths in the error against the wave's ownership boundaries.
2. **Construct a fix Task Packet** — include: exact error message, gate that failed, file
   paths involved, wave number, and the original task.
3. **Re-dispatch the same agent type** that produced the failing code.
4. **Increment the retry counter** for this (gate, wave) pair.
5. **If retry counter reaches 3** — STOP. Report to user with full error context and all 3
   attempts' error outputs. Do NOT attempt a 4th dispatch.

The retry counter resets per wave, per gate. A gate that fails in wave 2 and succeeds on
retry 1 starts fresh in wave 3.

---

## Gate Command Reference

```bash
# TypeScript type check (web app)
cd apps/web && pnpm check

# Python lint
cd python-backend && ruff check app/

# Node.js unit tests
cd apps/web && pnpm test

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
cd apps/web && pnpm test && cd ../../python-backend && pytest
```
