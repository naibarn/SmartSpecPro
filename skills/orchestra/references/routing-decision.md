# Routing Decision

This reference defines when orchestra should stay in its normal wave model and when it should automatically chain into `deep-plan-quick`, `deep-plan`, `deep-project`, and `deep-implement`.

## Route Table

| Scope / Situation | Route | Behavior |
|---|---|---|
| `trivial` | `direct-edit` | Edit directly; no planning chain |
| `small` and implementation-ready | `single-agent` | Direct implementation |
| `medium` and implementation-ready | `multi-agent-waves` | Wave-based implementation |
| `small` or `medium` but under-specified / plan-beneficial | `quick-plan-chain` | Auto-run `deep-plan-quick`, then `deep-implement` |
| `large` | `deep-plan-chain` | Auto-run full `deep-plan`, then `deep-implement` |
| `project` | `full-pipeline` | Auto-run `deep-project`, then per-split `deep-plan`, then `deep-implement` |

## General Rule

Do not stop merely to ask the user to run another skill.

If orchestra determines that a deep-* skill is needed, it should:
1. create the required input artifact(s)
2. read the sibling deep-* `SKILL.md`
3. execute that workflow inline
4. verify the resulting files
5. continue automatically

Interrupt the user only for:
- destructive archival/reset
- ambiguous product intent
- critical blocker that cannot be resolved safely
- critical security acceptance

## Route: `quick-plan-chain`

Use this route when:
- the user provided only a short free-form request
- no `spec.md` exists
- the task is not large enough to justify the full heavy planning pipeline
- implementation would be safer with a compact written plan first

Execution:
1. Create `specs/quick/NNN-name/request.md`.
2. Read `../../deep-plan-quick/SKILL.md` and execute it.
3. Verify `implementation-plan.md`, `sections/index.md`, and `sections/section-*.md` exist.
4. If quick planning reveals hidden complexity, promote to `deep-plan-chain`.
5. Otherwise continue directly into `deep-implement`.

## Route: `deep-plan-chain`

Use this route when:
- scope is `large`
- a proper `spec.md` already exists
- the task spans multiple domains or needs a full planning package

Execution:
1. Create or refresh `specs/feature/NNN-name/spec.md`.
2. Auto-review the spec for completeness, clarity, scope boundary, and technical risk.
3. Apply planner-owned technical improvements automatically.
4. Ask the user only if product intent is still ambiguous.
5. Read `../../deep-plan/SKILL.md` and execute it.
6. Verify `claude-plan.md`, `claude-plan-tdd.md`, and `sections/index.md` exist.
7. Continue directly into `deep-implement`.

## Route: `full-pipeline`

Use this route when scope is `project` and decomposition is required first.

Execution:
1. Create or refresh `specs/project/NNN-name/requirements.md`.
2. Auto-review the requirements document for decomposability, shared contracts, dependency order, and missing scope.
3. Read `../../deep-project/SKILL.md` and execute it.
4. For each generated split spec, run the full `deep-plan-chain` automatically.
5. For each completed split plan, run `deep-implement` automatically.
6. Aggregate progress in the same `orchestra/` session.

## Plan-First Bias

If the task is not implementation-ready, prefer planning before coding.

Use `quick-plan-chain` by default for short/underspecified small-medium requests. Escalate to `deep-plan-chain` only when complexity warrants it.

## Resume Rule

On `/orchestra resume`, orchestra should resume the earliest incomplete automatic chain stage rather than asking the user to manually restart deep-* skills.
