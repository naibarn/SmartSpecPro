# TDD Plan: Skill Maintenance Apply Failure

## Test First

### 1. Python Skill Path Resolution

File:

- `apps/web/server/services/__tests__/skillExecutor.sandbox.test.ts`

Add tests that fail before implementation:

- `resolvePythonSkillPaths` skips candidate dirs containing `runs/workspaces`.
- `intelligence-skill-creator` resolves to canonical `apps/web/skills/intelligence-skill-creator/python/skill.py` even when `skillFilePath` points to a copied workspace.

Expected failure before fix:

- Resolver picks the stale workspace path first.

### 2. ISC Canonical Root Metadata

File:

- `apps/web/skills/intelligence-skill-creator/tests/test_runner_paths.py`

Add tests:

- Nested entrypoint root still resolves canonical repo root.
- Workspace output is not under `apps/web/skills/intelligence-skill-creator/runs/workspaces`.
- Copied entrypoint metadata records both copied and canonical roots when available.

Expected failure before fix:

- Runtime proposal or workspace metadata can use copied ISC root.

### 3. Proposal Payload Handling

File:

- `apps/web/server/services/__tests__/skillStudioService.test.ts` or a new colocated service test.

Add tests:

- `extractSavedProposalFiles` recognizes `.json` proposal payloads and ignores `.meta.json`.
- Apply helper applies JSON payload proposals through safe path checks.
- Legacy `.diff` apply remains supported.
- Traversal payloads are rejected.

Expected failure before fix:

- `.json` proposals are ignored or sent through legacy patch flow.

### 4. Apply Finalization

File:

- `apps/web/server/services/__tests__/skillUpgradeApplier.test.ts`

Add tests:

- Successful ISC result with no saved proposals finalizes the run as completed/no-change.
- Failed result with nested workspace path stores actionable metadata and remains failed.
- Completion metadata preserves `taskId`, `workspaceRoot`, `proposalRoot`, and `resolvedLlmModelId`.

Expected failure before fix:

- Some no-proposal or path-pollution outcomes are stored as generic failed proposal generation.

### 5. Router Classification

File:

- `apps/web/server/routers/__tests__/skills.legacy-upgrade-queue.test.ts`

Add tests:

- `normalizeLegacyUpgradeApplyRuns` normalizes no-change failed rows.
- It does not normalize workspace-root pollution rows unless no-change evidence is also present.
- `getLegacyUpgradeApplyRuns` exposes enough logs/result fields for UI diagnostics.

Expected failure before fix:

- Path failure may be treated as generic failure with poor diagnostics.

### 6. Admin UI

File:

- `apps/web/client/src/pages/__tests__/AdminSkills.test.tsx`

Add tests:

- A no-change row shows normalize action eligibility.
- A workspace-root issue row shows a clear diagnostic and retry action.
- Normalize button count excludes workspace-root failures.
- Long paths wrap without requiring horizontal scroll in the primary table cell.

Expected failure before fix:

- UI cannot distinguish root pollution from other failures.

## Regression Gates

Run:

```bash
cd apps/web/skills/intelligence-skill-creator && python -m unittest tests.test_runner_paths
```

```bash
npm --prefix apps/web test -- server/services/__tests__/skillUpgradeApplier.test.ts server/routers/__tests__/skills.legacy-upgrade-queue.test.ts client/src/pages/__tests__/AdminSkills.test.tsx
```

Risk-based broader gate:

```bash
npm --prefix apps/web test --
```

