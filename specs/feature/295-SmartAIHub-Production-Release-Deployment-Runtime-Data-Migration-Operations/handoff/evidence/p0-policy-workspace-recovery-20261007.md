# P0 policy and workspace recovery checkpoint

Canonical source: `origin/main` at `dc76f5423e039d117233889997dce73843907c7d`.

## Integrated checkpoints

- PR #220, merge SHA `4b572c75042d7ba1c22d8bb7dfdfe674a8e13798`: persisted provider deployment target table, exact authority resolver, migration receipt wrapper for `db:migrate` and `db:push`, and external debug artifact defaults.
- PR #221, merge SHA `8104541b5cd082f2218b27f251e0d67ae8f80eee`: remove the tracked finance OCR debug log; preserve the baseline and user workspace copy externally.
- PR #222, merge SHA `dc76f5423e039d117233889997dce73843907c7d`: explicitly prohibit force-push variants in normal lifecycle skills and add a policy regression test.

## Force-push incident recovery

The pre-amend commit `195ad29247c6d6c6e2454c04da4a09b7e1053457` was displaced from the PR branch when it was amended to `9f93c6405f79d289ecc9f66c0f6be8e46b0a27f6` and pushed with `--force-with-lease`. The old commit remained in local reflogs. It is now preserved on `recovery/p0-force-push-195ad2924`, pushed with a normal push. The amended commit contains the prior checkpoint plus the later Worker persisted-target resolver changes; the old commit has no unique intended implementation missing from `origin/main`.

`FORCE_PUSH_DATA_LOSS=FALSE`. The force-push itself was a policy violation and has been recorded; the recovery ref preserves the displaced commit object for audit and recovery.

## Canonical user workspace

Workspace Authority preserved the two dirty paths from the older checkout before artifact disposition. The recovery manifest is:

`/home/dev/projects/SmartSpecPro/.git/workspace-recovery/smartspecpro/workspace-63612604-a004-447e-b1c4-616de72d86b7/20261007T130343120727Z/manifest.json`

The modified finance OCR JSONL is retained at `/home/dev/.local/state/smartspecpro/artifacts/debug/finance-ocr-debug.jsonl`, SHA-256 `bd240b0f7b14b28fac9bf27ceb28bfbbfe39f5bce4ecdb9261485e11a5b19cd0`. The canonical baseline copy is retained at `/home/dev/.local/state/smartspecpro/artifacts/debug/finance-ocr-debug-baseline-8f3a0e37.jsonl`, SHA-256 `43968f5fbc5b2ec6db3ac85bc6ab022d9fe4a65dcfc8a3a5e0d5ece1c5388331`.

The audit archive is retained at `/home/dev/.local/state/smartspecpro/artifacts/audit/SmartSpecPro-True-Latest-Audit-2026-10-07.zip`, SHA-256 `06873c141463fd38e08538388e977934cbb0d4b79917093e403180aa45b80348`. Specs 302–304 provenance now use the stable `smartspec-artifact://audit/SmartSpecPro-True-Latest-Audit-2026-10-07.zip` reference.

The prior `/tmp/SmartSpecPro-enhanced-budget-fix` worktree had no active session, no dirty tracked or untracked files, and no commit unique to canonical history. Workspace Authority registered it as a task worktree. Its `main` checkout was detached at its existing SHA `ee702809ac05daf47df920c846a6ba418f79be84`, which is an ancestor of current `origin/main`; the ignored 54 MB virtualenv was preserved. It was not retired.

The canonical user workspace is now branch `main`, clean, and exactly at `origin/main` SHA `dc76f5423e039d117233889997dce73843907c7d`. Workspace Authority convergence receipt: `workspace-convergence:9bca0023-c140-44fa-acdf-fab4598362fe`; verification result `CANONICAL_CONVERGENCE_VERIFIED`.

## Policy repair and tests

`skills/development-lifecycle/SKILL.md`, `skills/session-finish/SKILL.md`, and `skills/integration-controller/SKILL.md` explicitly reject `git push --force`, `git push -f`, and `git push --force-with-lease` in ordinary workflows. Emergency/recovery authority requires recorded approval, before/after refs, a recovery ref, and rollback plan. `python3 -m unittest skills/development-lifecycle/tests/test_force_push_policy.py` passed. Installed skill copies were published and `verify-installed-skills-sync.sh` passed.

## Remaining internal work

- Complete target create/update/disable/list lifecycle and target-role identity uniqueness.
- Finish tenant/project/environment/caller authorization and credential revocation handling in the credential broker.
- Bind persisted authority for both Worker and Container, with explicit invalid Container configuration state and focused persisted-path tests.
- Reconcile durable migration receipts with current Drizzle state; cover idempotency, recovery, interrupted execution, and receipt/state disagreement.
- Inventory and wire remaining production-capable migration paths, including purpose-built migration workflows.
- Wire normalized production evidence into Mission Control and re-verify runtime health and SPEC-224 compatibility.
- Keep the P0 implementation outcome partial until these requirements have fresh passing evidence.

No Cloudflare production API or production database was contacted.
