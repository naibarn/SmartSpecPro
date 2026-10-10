# GitHub Required-Check Gate Evidence

- Source revision verified: `890658e999cd3020d2944d5d7c898d5e52ec8f4f` (PR #504 squash merge; current `origin/main` at verification time).
- Targeted command: `pnpm exec vitest run server/jobs/workspaceAuthoritySafeActionJob.test.ts` from `apps/web`.
- Result: 1 file passed, 22 tests passed (2026-10-10 15:37 Asia/Bangkok).
- Coverage includes branch ruleset and legacy branch protection parsing, exact required check binding, omitted/`-1` any-app binding, skipped/failed/pending/missing required checks, commit statuses, no-required-check state preserving observed skipped status, and merge rejection when required checks are not passing.
- PR #504 (`fix(workspace): gate PR integration on required checks`) merged normally at `890658e999cd3020d2944d5d7c898d5e52ec8f4f`; verified as current canonical SHA and reachable from `origin/main`.
- GitHub reported `build-preview=SKIPPED` and `cleanup-preview=SKIPPED`. The repository had no branch protection required-check rule (404) and no rulesets (`[]`) at merge time; this merge did not bypass a configured rule. Skipped CI is not a test pass. The targeted local test passed; CI verification remains pending/unavailable.
- This proves the gate's focused policy behavior only. It does not prove CI failure repair, GitHub API behavior under every enterprise policy, branch cleanup ownership, full lifecycle automation, or production readiness.
