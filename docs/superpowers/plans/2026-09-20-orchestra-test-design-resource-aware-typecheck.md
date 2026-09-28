# Orchestra Test Design and Resource-Aware Typecheck Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen Orchestra test design and prevent automatic full-repository TypeScript checks from exhausting the development host.

**Architecture:** Keep Orchestra as the conductor and retain `deep-plan` → `deep-implement` as the implementation chain. Add a requirement-to-test contract and risk-based test adequacy gate, then make TypeScript verification explicit-only and resource-aware.

**Tech Stack:** Markdown skill references, JSON behavior scenarios, Bash skill audit/sync scripts.

**Spec:** `docs/portable-skill-pack/specs/2026-09-20-orchestra-test-design-resource-aware-typecheck-design.md`

## Global Constraints

- Do not modify product code, runtime `orchestra/` state, or unrelated dirty-worktree files.
- Do not run `npm run typecheck` or any full-repository TypeScript check during this implementation.
- Preserve `deep-plan` → `deep-implement` routing.
- Full typecheck is explicit-only; resource failures are unverified, never pass, and never blindly retried.
- Use the repository package manager (`npm`) in gate examples.

---

### Task 1: Define the test-design contract

**Files:**
- Modify: `skills/orchestra/references/tdd-discipline.md`
- Modify: `skills/orchestra/SKILL.md`
- Modify: `skills/orchestra/references/skill-behavior-tests.md`
- Modify: `skills/orchestra/references/skill-behavior-scenarios.json`

**Interfaces:**
- Produces: a requirement-to-test matrix contract and a pre-implementation test-design gate used by deep planning and implementation.

- [x] **Step 1: Add failing behavior scenarios** for missing requirement-to-test mapping and weak-test rejection.
- [x] **Step 2: Run the skill audit** and confirm the new scenarios are detected as structurally valid while the policy text is not yet present.
- [x] **Step 3: Add the TDD/test-design policy** covering behavior mapping, negative/boundary/error/security/concurrency cases, RED evidence, and anti-patterns.
- [x] **Step 4: Add the Orchestra lifecycle hook** requiring test design before deep-plan/deep-implement execution.
- [x] **Step 5: Run the skill audit**; new scenario routing and reference checks pass. The audit remains blocked by pre-existing retired-browser-agent registry drift.

### Task 2: Make TypeScript verification resource-aware

**Files:**
- Modify: `skills/orchestra/references/quality-gates.md`
- Modify: `skills/orchestra/references/routing-decision.md`
- Modify: `skills/orchestra/references/verification-before-completion.md`
- Modify: `skills/orchestra/SKILL.md`
- Modify: `skills/orchestra/references/skill-behavior-scenarios.json`

**Interfaces:**
- Consumes: changed-file scope, repository package-manager policy, and explicit user authorization for full typecheck.
- Produces: explicit-only, serial, resource-preflighted TypeScript verification with non-pass status for OOM/session/resource failures.

- [x] **Step 1: Add failing scenarios** asserting that ordinary TypeScript changes do not trigger root `turbo run typecheck` and that explicit typecheck uses a bounded route.
- [x] **Step 2: Update gate and routing policy** with changed-scope checks, memory/session preflight, serial execution, evidence logs, and no blind retry.
- [x] **Step 3: Update completion verification** so skipped/resource-blocked typecheck is reported as residual risk rather than pass.
- [x] **Step 4: Run the skill audit**; the new routing scenarios validate, with only pre-existing baseline failures remaining.

### Task 3: Sync and validate the installed skill

**Files:**
- Modify: installed copy under `/home/dev/.codex/skills/orchestra/` through the repository sync script only.

- [x] **Step 1: Run the focused Orchestra audit and scenario validation.**
- [x] **Step 2: Run the installed-skill sync script.**
- [x] **Step 3: Verify source and installed files match.**
- [x] **Step 4: Run `git diff --check` for owned source and documentation paths.**
- [ ] **Step 5: Commit only the owned source, design, and plan files.**
