# P0-WU-4C safe-action execution authority test design

| Requirement | Observable behavior | Test level | Test location | RED evidence | GREEN evidence | Residual boundary |
|---|---|---|---|---|---|---|
| A queued safe action may execute only while its registered Runner authority remains fresh and unchanged | Worker re-resolves tenant/actor/project/repository/workspace authority and rejects a stale or changed runner revision before local authority or mutation commands run | Unit/contract | apps/web/server/jobs/workspaceAuthoritySafeActionJob.test.ts | RED: changed snapshot revision still ran RETIRE_SAFE_WORKTREE and returned a success-shaped receipt | GREEN: focused suite proves unchanged authority permits execution and changed or stale authority prevents all local commands | Does not prove a remote Runner remains reachable after the check or that production authorization configuration is correct |
