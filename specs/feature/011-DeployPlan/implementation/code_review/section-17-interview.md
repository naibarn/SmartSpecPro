# Section 17: CI/CD - Code Review Interview

## Auto-fixes Applied

1. **CRITICAL: Added `continue-on-error: true` to smoke-test steps** (both staging and production)
   - Without this, job fails immediately on smoke test failure and rollback never executes
   - Fix: Added `continue-on-error: true` to smoke-test steps in both workflows

2. **CRITICAL: Fixed `github.TOKEN` to `github.token`** (production workflow)
   - GitHub Actions context is case-sensitive, `github.TOKEN` resolves to empty string
   - Fix: Changed to `${{ github.token }}`

3. **CRITICAL: Fixed staging rollback logic**
   - `--to-revisions=LATEST=100` would route traffic to the broken canary
   - Fix: Changed to `--clear-tags --to-latest` to remove canary tag and route to previous stable

## User-Approved Fixes

4. **Production rollback step added** (User: Fix both)
   - Added rollback step with `continue-on-error: true` on smoke-test
   - On failure: clears canary tags and routes traffic to latest stable revision
   - On success: proceeds to 50% traffic shift

5. **Production smoke test URL fixed** (User: Fix both)
   - Was testing `https://smartaihub.app` which hits old code 90% of time
   - Now dynamically resolves canary revision URL via `gcloud run services describe`

6. **PR preview cleanup workflow added** (User: Add cleanup)
   - New `.github/workflows/pr-preview-cleanup.yml`
   - Triggers on `pull_request: types: [closed]`
   - Deletes Cloud Run service and Artifact Registry image for the PR

## Let Go (Not Fixed)

- PR preview security (no service-account): acceptable for preview environments
- DB migration ordering: inherent to pattern, plan says use expand/contract
- Build cache: optimization, can be added later
- .dockerignore: already comprehensive
- Alembic step: no migrations exist yet
- Workflow validation script: graceful skip is acceptable
- Tests being self-contained: standard for config validation
