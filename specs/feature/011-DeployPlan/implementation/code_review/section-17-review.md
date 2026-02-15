# Section 17: CI/CD Pipeline - Code Review

## CRITICAL Issues

1. **BROKEN ROLLBACK LOGIC** - deploy-staging.yml: Missing `continue-on-error: true` on smoke-test step. Without it, job fails immediately on smoke test failure and rollback step never executes.

2. **PRODUCTION NO ROLLBACK** - deploy-production.yml has no rollback step. If smoke test fails, broken canary stays at 10% traffic.

3. **PROD SMOKE TEST WRONG URL** - Tests against main domain `https://smartaihub.app` which hits OLD revision 90% of time. Should target canary-tagged URL.

4. **`github.TOKEN` case error** - deploy-production.yml uses `${{ github.TOKEN }}` but correct is `${{ github.token }}` or `${{ secrets.GITHUB_TOKEN }}`.

## HIGH Issues

5. **PR PREVIEW RESOURCE LEAK** - No cleanup workflow for closed PRs.
6. **PR PREVIEW SECURITY** - No service-account specified, publicly accessible.
7. **DB MIGRATION BEFORE DEPLOY** - No rollback mechanism for migrations if smoke test fails.

## MEDIUM Issues

8. **STAGING ROLLBACK SEMANTIC ERROR** - `--to-revisions=LATEST=100` routes to the broken revision, not the previous good one.
9. **NO BUILD CACHE** - Docker builds from scratch every run, will be slow.
10. **DOCKERIGNORE NOT UPDATED** - Plan required updates, implementation skipped.
11. **ALEMBIC STEP DROPPED** - Plan included Alembic migrations but implementation skipped.

## LOW Issues

12. **WORKFLOW VALIDATION SILENTLY PASSES** - Exits 0 when actionlint not installed.
13. **VITEST TESTS ARE SELF-CONTAINED** - Test functions defined inline, not connected to production code.
