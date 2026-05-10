# Section 01: Runtime Path Hygiene

## Goal

Prevent `intelligence-skill-creator` and other Python skills from executing out of stale `runs/workspaces` copies.

## Files

- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/__tests__/skillExecutor.sandbox.test.ts`
- `apps/web/skills/intelligence-skill-creator/python/skill.py`
- `apps/web/skills/intelligence-skill-creator/isc/runner.py`
- `apps/web/skills/intelligence-skill-creator/tests/test_runner_paths.py`

## Steps

1. Add resolver tests for workspace-path rejection.
2. Add a small helper in `skillExecutor.ts` to identify workspace artifact paths.
3. Skip candidate Python skill dirs under `runs/workspaces`.
4. Prefer canonical ISC path for `intelligence-skill-creator`.
5. Update ISC metadata/root helpers so canonical root and copied entrypoint root are distinguishable.

## Acceptance

- Stale workspace `skillFilePath` cannot become the execution root.
- ISC workspace output is rooted at outer repo workspace, not nested under ISC's own copied folder.

