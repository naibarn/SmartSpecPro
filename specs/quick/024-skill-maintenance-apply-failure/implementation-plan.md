# Implementation Plan: Skill Maintenance Apply Failure

## Objective

Fix the maintenance apply failure pattern shown in Admin Skills by preventing ISC from launching out of nested workspace copies, aligning web apply logic with ISC proposal outputs, and making apply-run recovery truthful and actionable.

## Current-Codebase Fit

The system already has most of the needed pieces:

- Admin UI can list, retry, and normalize legacy apply runs.
- `skills.ts` has server procedures for retry and normalization.
- `skillUpgradeApplier.ts` already finalizes success, failure, no-change, proposal, and auto-apply paths.
- ISC runner already has tests for nested root detection and skipping copied `runs`.

The plan should tighten contracts around these pieces rather than replacing the maintenance lifecycle.

## Affected Files

Likely modifications:

- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/services/skillUpgradeApplier.ts`
- `apps/web/server/routers/skills.ts`
- `apps/web/client/src/pages/AdminSkills.tsx`
- `apps/web/skills/intelligence-skill-creator/python/skill.py`
- `apps/web/skills/intelligence-skill-creator/isc/runner.py`

Likely tests:

- `apps/web/server/services/__tests__/skillExecutor.sandbox.test.ts`
- `apps/web/server/services/__tests__/skillUpgradeApplier.test.ts`
- `apps/web/server/routers/__tests__/skills.legacy-upgrade-queue.test.ts`
- `apps/web/client/src/pages/__tests__/AdminSkills.test.tsx`
- `apps/web/skills/intelligence-skill-creator/tests/test_runner_paths.py`

## Implementation Approach

### 1. Stop Launching ISC From Workspace Copies

Add a path hygiene helper in `skillExecutor.ts`:

- Reject candidate Python skill dirs whose normalized path contains `/runs/workspaces/`.
- Prefer canonical skill roots over `skill.skillFilePath` when the skill id is `intelligence-skill-creator`.
- Preserve normal behavior for user-created Python skills, but still skip workspace artifact paths.

Acceptance:

- A skill definition with `skillFilePath` inside `runs/workspaces/.../skills/intelligence-skill-creator/SKILL.md` resolves to canonical `apps/web/skills/intelligence-skill-creator/python/skill.py`.
- A non-ISC skill with a valid local folder path still resolves normally.

### 2. Make ISC Runtime Roots Canonical

In `python/skill.py` and/or `isc/runner.py`:

- Compute `repo_root` via `resolve_repo_root(Path(__file__))`.
- Derive canonical `skills_root = repo_root / "apps" / "web" / "skills"`.
- For proposal output intended for the web UI, write under canonical `skills_root / "intelligence-skill-creator" / "runs" / "proposals"`.
- Include both `entrypointRoot` and `canonicalIscRoot` in metadata when they differ.

Acceptance:

- Running ISC from a nested copied entrypoint still produces workspace/proposal metadata rooted at the outer repo/canonical ISC path.
- Metadata makes copied entrypoint detection visible for operators.

### 3. Align Proposal Format Handling

Update `skillStudioService.ts`:

- Rename `applyIscProposalDiff` or add a new helper such as `applyIscProposal`.
- Support `.json` payload proposals using ISC's safe JSON payload applier.
- Keep `.diff` support only as a legacy fallback.
- Update `extractSavedProposalFiles` fallback to recognize `.json` proposals, excluding `.meta.json`.
- Ensure path validation rejects traversal and proposals outside canonical ISC proposal root.

Acceptance:

- Saved JSON proposals can be applied.
- Legacy `.diff` proposals still work if present.
- `.meta.json` files are never treated as apply payloads.

### 4. Harden Apply Finalization and Diagnostics

Update `skillUpgradeApplier.ts`:

- Always persist `taskId` before async execution can finish.
- In finalizers, preserve `repoRoot`, `workspaceRoot`, `proposalRoot`, `canonicalIscRoot`, `entrypointRoot`, and `resultError`.
- If result is successful with zero proposals, finalize as completed no-change.
- If result failed because of a copied workspace path, store a specific failure code such as `isc_workspace_root_pollution`.

Update `skills.ts`:

- Expand `isLegacyUpgradeNoChangeRunCandidate` only for true no-change cases.
- Add a separate classifier for workspace-root pollution so UI can recommend retry after code fix, not normalize.
- Keep normalization limited to rows that have no-change evidence.

Acceptance:

- No-change rows become completed.
- Real workspace-path failures remain failed/retryable with a clear reason.
- The queue counts no longer mix path failures into no-change normalization.

### 5. Improve Admin Maintenance Recovery UX

Update `AdminSkills.tsx`:

- Show a compact diagnostic badge for `workspace root issue` when logs contain nested `runs/workspaces` evidence.
- Keep the existing retry action available for these rows.
- Keep normalize button disabled for workspace-root failures unless they also satisfy no-change classification.
- Surface `taskId`, `workspaceRoot`, and `proposalRoot` in a wrapped/monospace diagnostic line without making the table horizontally unusable.

Acceptance:

- Operators can distinguish:
  - no-change failure that can be normalized
  - real failed apply that should be retried
  - blocked compatibility case

### 6. Historical Recovery Procedure

After code changes pass tests:

1. Refresh the maintenance queue.
2. Run no-change normalization for rows that qualify.
3. Retry only the remaining workspace-root failed runs.
4. Verify `intelligence-skill-creator` no longer creates nested workspace paths under its own `runs/workspaces`.

Do not bulk-update old failed rows outside the existing admin mutation unless a backup/export is added first.

## Security and Boundary Concerns

- Proposal apply must enforce canonical proposal-root containment.
- JSON payload apply must reject absolute paths and `..` traversal.
- Admin-only mutations must stay admin-only.
- Do not trust path strings from `logsJson` for writes.
- Do not allow retry to target runs without a linked recommendation.

## Acceptance Criteria

- Maintenance apply run for ISC launches from the canonical ISC entrypoint even if DB/cache has a stale workspace path.
- No-change ISC improve results finalize as `completed`, not `failed`.
- JSON proposal payloads are supported by web apply logic.
- Workspace-root failures are visible and retryable, not hidden as no-change.
- Existing maintenance queue filters and counts stay stable.
- Tests cover server path resolution, finalization, router normalization, UI recovery labels, and ISC runner roots.

## Verification Commands

Run the narrow gates first:

```bash
cd apps/web/skills/intelligence-skill-creator && python -m unittest tests.test_runner_paths
```

```bash
npm --prefix apps/web test -- server/services/__tests__/skillUpgradeApplier.test.ts
```

```bash
npm --prefix apps/web test -- server/routers/__tests__/skills.legacy-upgrade-queue.test.ts
```

```bash
npm --prefix apps/web test -- client/src/pages/__tests__/AdminSkills.test.tsx
```

Then run the broader web gate:

```bash
npm --prefix apps/web test --
```

