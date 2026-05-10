# Research Notes

## SocratiCode Status

- Project index: green.
- Indexed chunks: 85653.
- Watcher: active.
- Code graph: available.

## User-Visible Failure

The screenshot shows:

- Route: `/admin/skills?tab=maintenance`.
- One failed apply run.
- Skill: `intelligence-skill-creator`.
- Task column: no task ID on the visible failed row.
- Result: `Improvement failed` with a repeated nested path under `apps/web/skills/intelligence-skill-creator/runs/workspaces/.../skills/intelligence-skill-creator/...`.

## Relevant Code Paths

- `apps/web/client/src/pages/AdminSkills.tsx`
  - Renders the maintenance tab and legacy apply-run monitor.
  - Exposes retry and no-change normalization actions.
  - Computes retryable and normalizable run IDs.

- `apps/web/server/routers/skills.ts`
  - `getLegacyUpgradeApplyRuns`
  - `retryLegacyUpgradeApplyRuns`
  - `normalizeLegacyUpgradeApplyRuns`
  - `isLegacyUpgradeNoChangeRunCandidate`
  - Currently recognizes no-change failures via `completionMode`, result message, summary, and selected error text.

- `apps/web/server/services/skillUpgradeApplier.ts`
  - `applySkillUpgradeRecommendation`
  - `finalizeStudioProposal`
  - `finalizeStudioApply`
  - Starts the apply run, launches ISC improve, then finalizes recommendation/run state after the async task returns.

- `apps/web/server/services/skillStudioService.ts`
  - `launchSkillStudioTask`
  - `applyIscProposalDiff`
  - Extracts saved proposals from metadata/message.
  - Still has legacy `.diff` assumptions in some paths even though ISC improve now stores JSON proposal payloads in newer flows.

- `apps/web/server/services/skillExecutor.ts`
  - `resolvePythonSkillPaths`
  - `executePythonSkill`
  - `startPythonSkillTask`
  - Resolves Python skill script candidates from `skill.skillFilePath` first, then root candidates.
  - If a DB skill path points inside a previous workspace, ISC can execute from a copied workspace.

- `apps/web/skills/intelligence-skill-creator/python/skill.py`
  - Runtime entrypoint for ISC.
  - Uses `Path(__file__).resolve().parent.parent` as `ISC_ROOT`.
  - Calls `resolve_repo_root(Path(__file__))` before `iterate_improve`.
  - Saves proposals under `ISC_ROOT / "runs" / "proposals" / skill_name`.

- `apps/web/skills/intelligence-skill-creator/isc/runner.py`
  - `resolve_repo_root` finds the outer repo root by walking parents.
  - `make_workspace(project_root, skill_name)` now writes under `project_root / "runs" / "workspaces" / skill_name / ts`.
  - `copytree` ignores `runs`, `__pycache__`, venvs, `.git`, and `node_modules`.

- `apps/web/skills/intelligence-skill-creator/tests/test_runner_paths.py`
  - Already covers outer repo root discovery from a nested copied ISC path.
  - Already covers skipping nested `runs` during workspace copy.

## Current Good Signals

- `finalizeStudioProposal` correctly marks successful no-proposal outcomes as `completed` with `completionMode: "no_changes"`.
- `normalizeLegacyUpgradeApplyRuns` can repair old failed no-change rows.
- Tests already exist for:
  - no-change normalization in `apps/web/server/routers/__tests__/skills.legacy-upgrade-queue.test.ts`
  - UI normalize action in `apps/web/client/src/pages/__tests__/AdminSkills.test.tsx`
  - path regression basics in `apps/web/skills/intelligence-skill-creator/tests/test_runner_paths.py`

## Likely Root Causes

1. Stale or polluted skill path:
   - If the skill registry/cache/DB returns a `skillFilePath` inside `runs/workspaces`, `resolvePythonSkillPaths` may execute copied ISC instead of the canonical `apps/web/skills/intelligence-skill-creator/python/skill.py`.

2. Runtime root split:
   - Python ISC computes `ISC_ROOT` from `__file__`, so if it runs from a copied workspace, proposals/logs can be written under copied workspace roots while web services expect canonical `apps/web/skills/intelligence-skill-creator/runs`.

3. Proposal format drift:
   - Web apply helper still applies `.diff` files with `patch`, while newer ISC CLI/proposal helpers use JSON payloads.
   - `extractSavedProposalFiles` only falls back to `.diff` message parsing, so JSON proposal metadata must be the reliable contract.

4. Async task metadata loss:
   - Queue rows can show no task ID or poor failure reason if the failure happened before `logsJson.taskId` was persisted or if the async finalizer stores only a generic error.

5. Historical data:
   - Existing failed rows may need safe normalization or retry, but only after code no longer produces the same path failure.

## Impact Preflight

- `skillStudioService.ts` blast radius includes:
  - `apps/web/server/routers/skills.ts`
  - `apps/web/server/services/skillUpgradeApplier.ts`
  - `apps/web/server/services/workpackLearningService.ts`
  - related service/router tests

- `python/skill.py` has no static TS graph dependents, but it is runtime-critical through `skillExecutor.ts`.

## Risk Surfaces

- Admin-only tRPC procedures and maintenance actions.
- File path resolution and path traversal safety.
- Async job state consistency.
- Proposal application writes to skill files.
- Historical data repair must be non-destructive and auditable.

