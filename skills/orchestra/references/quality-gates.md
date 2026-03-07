# Quality Gates

Defines all 6 gate types that the orchestra conductor runs after each wave of agent work. Read by SKILL.md Step 6. Risk level terminology follows `task-analysis.md`. Commands below are SmartSpecPro defaults. If the active plan or repository docs define explicit `typecheck`, `lint`, or `test` commands, those discovered commands override the defaults.

---

## Gate Inventory

| # | Gate | Command | Trigger | Blocking Level | Max Retries |
|---|------|---------|---------|----------------|-------------|
| 1 | TypeScript Check | `cd apps/web && pnpm check` | Any `.ts` or `.tsx` files changed | HIGH/CRITICAL: blocking; LOW/MEDIUM: warning | 3 |
| 2 | Python Lint | `cd python-backend && ruff check app/` | Any `.py` files changed | HIGH/CRITICAL: blocking; LOW/MEDIUM: warning | 3 |
| 3 | Unit Tests | `cd apps/web && pnpm test` and/or `cd python-backend && pytest` | Medium risk or higher; or when test files exist for changed code | HIGH/CRITICAL: blocking; MEDIUM: warning | 3 |
| 4 | Security Review (General) | Dispatch `security.md` agent (spot check only — not the full pre-merge gate) | Task risk level is HIGH | CRITICAL findings: blocking; HIGH findings: warning unless task is CRITICAL | 3 |
| 5 | Full Test Suite | `cd apps/web && pnpm test` AND `cd python-backend && pytest` | CRITICAL risk tasks | Always blocking | 3 |
| 6 | Pre-Merge Security Gate | Dispatch security-trpc + security-fastapi + security-frontend specialists in parallel, then route findings to security-review aggregator (see `security-review-protocol.md`) | Trigger conditions defined in `security-review-protocol.md` | Always blocking until verdict returned | 3 per specialist (managed by security-review-protocol.md) |

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

### Gate 4: Security Review (General)

Dispatch `security.md` agent (from `../../sub-agents/agents/security.md`) as a
spot check. This is not the full pre-merge gate — it is a targeted review of high-risk
changes mid-workflow. The agent reads changed files and returns findings. Does not dispatch
specialist sub-agents.

### Gate 5: Full Test Suite

```bash
cd apps/web && pnpm test && cd ../../python-backend && pytest
```

Run both test suites end-to-end. Required for CRITICAL risk tasks. Blocking regardless of
outcome — if either suite fails, the conductor must fix and retry before proceeding.

### Gate 6: Pre-Merge Security Gate

See `security-review-protocol.md` for complete protocol. Summary:
1. Orchestra dispatches security-trpc, security-fastapi, and/or security-frontend agents
   in parallel (single message)
2. Collects findings from all specialists
3. Dispatches security-review aggregator with collected findings
4. Aggregator returns PASS / CONDITIONAL / FAIL verdict
5. Conductor applies verdict per `security-review-protocol.md` threshold policy

This gate is always blocking — no workflow-level bypass. Only the security-review aggregator
can unblock it by returning a PASS or CONDITIONAL verdict.

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

# Full test suite (both SmartSpecPro defaults)
cd apps/web && pnpm test && cd ../../python-backend && pytest
```
