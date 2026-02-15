# Section 20 Code Review

## High Issues
1. test-rollback.sh exits 0 on failure (false pass)
2. Duplicate secretAccessor check in validate-gcp-setup.sh
3. TLS cert check queries wrong field (conditions[0].status vs certificateStatus)
4. `gcloud alpha` may not be available in CI environments

## Medium Issues
5. Rollback runbook missing --project flags
6. Launch checklist missing Python orchestrator canary
7. Launch checklist shows DATABASE_URL in cleartext (shell history risk)
8. test-rollback.sh uses deprecated gcr.io instead of Artifact Registry

## Low Issues
9. Cloud Scheduler check doesn't verify enabled state
10. Missing inline rollback commands at abort points in checklist
11. Missing python-orchestrator in rollback runbook
