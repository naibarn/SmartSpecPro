# Section 16 Code Review Interview

## Auto-fixes Applied

### Fix 1: Missing p99 dataset in jobs dashboard
- **Applied:** Added p99 percentile dataset to Job Execution Duration widget

### Fix 2: Validation script exit codes
- **Applied:** Script now exits with code 1 if dashboards/policies are missing

## Items Let Go

- Python StructuredFormatter: Existing structlog already outputs JSON via JSONRenderer in production
- Python HTTP middleware: Not adding to avoid modifying core server startup
- Node.js middleware integration into server/index.ts: Existing logging handles this
- Alert policy creation scripts: These are gcloud commands per plan, run during deployment
- CI/CD env var injection: Belongs in Section 17 (CI/CD)
- Log-based metrics: Cloud Console configuration task
- Dashboard positioning: Mosaic layout handles overlap resolution
