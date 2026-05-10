# Request: Skill Maintenance Apply Failure

## Original User Request

Plan a practical fix for the failure shown on `/admin/skills?tab=maintenance`, where a legacy apply run for `intelligence-skill-creator` failed with an `Improvement failed` message and a deeply nested workspace path.

## Task Summary

Diagnose and plan a focused fix for skill maintenance apply runs that fail or remain marked failed when ISC improvement produces no patch, uses stale nested workspaces, or cannot surface actionable failure metadata.

## Assumptions

- The screenshot is from the Admin Skills maintenance tab for legacy upgrade/apply runs.
- The failure row is an apply run for `intelligence-skill-creator`, not a general UI rendering problem.
- Some no-change failures are already normalizable, but the screenshot's repeated `runs/workspaces/.../skills/intelligence-skill-creator/...` path indicates a real path hygiene/root resolution issue also needs coverage.
- The goal for this pass is a plan ready for implementation, not direct production data mutation.

## Non-Goals

- Do not redesign the whole Skill Maintenance Lifecycle feature.
- Do not auto-delete historical workspace artifacts.
- Do not change auth/RBAC semantics for admin skills.
- Do not run destructive database cleanup without a backup/export plan.

