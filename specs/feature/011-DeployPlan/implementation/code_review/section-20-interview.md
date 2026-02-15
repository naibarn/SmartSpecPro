# Section 20 Code Review Interview

## Auto-fixes applied

1. **test-rollback.sh: Exit non-zero on failures** - exit 1 instead of exit 0 when deploy or traffic split fails
2. **validate-gcp-setup.sh: Remove duplicate secretAccessor check** - section 13 removed (already checked in section 4)
3. **validate-gcp-setup.sh: Fix TLS check** - use `status.certificateStatus` field instead of `status.conditions[0].status`
4. **validate-gcp-setup.sh: Use gcloud beta** - replace `gcloud alpha monitoring` with `gcloud beta monitoring` for stability
5. **test-rollback.sh: Use Artifact Registry** - switch from deprecated `gcr.io` to `${REGION}-docker.pkg.dev`
6. **Rollback runbook: Add --project flags** - all gcloud commands include explicit project
7. **Launch checklist: Inline rollback commands** - add rollback command at each abort point
8. **Launch checklist: Secret Manager for DB URL** - use `gcloud secrets versions access` instead of plaintext
9. **validate-gcp-setup.sh: Check scheduler job state** - verify ENABLED state not just existence
10. **Launch checklist: Add python-orchestrator** - include in canary deployment steps
11. **Rollback runbook: Add python-orchestrator** - mention both services

## User decision

### Rollback test failure handling
**Decision**: Exit non-zero on deploy/traffic-split failure. Operator must pre-build a broken image.
