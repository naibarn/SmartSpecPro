# Production Migration Authority Recheck — 2026-10-28

## Status: BLOCKED before Production database access

Repository: `naibarn/SmartSpecPro` (public personal-account repository).

### Live GitHub state

- The authenticated GitHub identity is `naibarn` (numeric user ID `214854693`) and has repository `admin` permission.
- `production` environment currently has no protection rules and no deployment branch policy. The branch-policy endpoint returns 404 because custom branch policies are not configured.
- Repository Actions variables are empty; `SPEC224_DATABASE_OWNER_TEAM_ID` is absent. The repository has no Teams and one direct collaborator, `naibarn`.
- The repository has no separate GitHub App/automation dispatch credential among the configured Actions secret names. No credential values were read.
- `main` does not have branch protection configured (GitHub branch-protection endpoint returns 404).
- Prior 0415 workflow run `40684866061` was initiated by `naibarn` as `workflow_dispatch` from `main`. It stopped at the environment gate before Production database access.
- None of these checks accessed the Production database or its secret.

### Single-operator identity and policy

- GitHub's environment API supports an individual `User` required reviewer as well as a `Team`; the verifier had unnecessarily hard-coded `Team` plus `SPEC224_DATABASE_OWNER_TEAM_ID`.
- The additive code correction now accepts exactly one configured Database Owner identity: either `SPEC224_DATABASE_OWNER_TEAM_ID` or `SPEC224_DATABASE_OWNER_USER_ID`. It still requires exactly one matching environment reviewer, `prevent_self_review=true`, and a deployment branch allowlist containing only `main`. Both variables set, neither set, invalid IDs, wrong reviewer type/ID, self-review enabled, extra reviewers, and extra branches fail closed.
- `naibarn` is currently both the only repository collaborator and the actor that dispatched the migration workflow. GitHub self-review prevention means that same account cannot approve a deployment it initiated. No different authorized workflow initiator is configured. Setting the sole reviewer to `naibarn` would therefore not make this current dispatch usable and is not a safe route to Production execution.
- SmartAIHub application code has `admin`, `domain_admin`, and `system_agent` role checks, and its OAuth registration path grants initial admin role to the first user. There is no authenticated Production application session or live Production identity readback proving that the GitHub owner is the active SmartAIHub admin; the two identities must not be assumed equivalent.

### Configuration required to continue

For an individual owner reviewer, the repository owner can configure:

1. Repository variable `SPEC224_DATABASE_OWNER_USER_ID=214854693`.
2. The existing `production` environment with exactly one required reviewer: GitHub User ID `214854693`, `prevent_self_review=true`.
3. A custom deployment branch policy allowing only `main`.
4. A distinct already-authorized workflow dispatch identity, separate from reviewer `naibarn`, so the owner can approve the run without self-review. No such identity is presently configured. Provisioning a new GitHub App/bot credential is outside the currently available credential set and has not been done.

The safe gate correction is integrated and unit-tested, but no Production environment/variable setting was changed and no 0415 run was retried. Production migration remains blocked until the owner provides or configures the distinct authorized dispatcher. Do not set `prevent_self_review=false`, substitute a fabricated Team ID, or treat a workflow input/reference as a substitute for the environment review.

### Development acceptance

DEV 0415 remains applied and must not be replayed. The prior evidence in `migration-0415-environment-results.md` records the schema receipt. Authenticated DEV and Production RPC/UI acceptance remains incomplete because this session has no real owner browser session; the public RPC routes returned 401 without authentication. No claim is made that authenticated RPC queries or workspace selection pass.

### Focused verification for the additive gate correction

- `pnpm exec vitest run scripts/__tests__/spec224-migration-environment.test.ts scripts/__tests__/workspace-bindings-0415-migration.test.ts` — PASS, 29 tests.
- Both migration workflow YAML files parsed successfully.
- `git diff --check` — PASS.
