# Rollback Procedures

**Project:** smartspecpro-mvp
**Region:** asia-southeast1

Before any rollback, set your project:
```bash
gcloud config set project smartspecpro-mvp
```

## Cloud Run Service Rollback

**When to use:** A new deployment causes increased errors, crashes, or unexpected behavior.

**Timeline:** < 60 seconds from command to full rollback.

**Applies to:** `node-api` and `python-orchestrator` services.

### Steps

1. **Identify the previous healthy revision:**
   ```bash
   gcloud run revisions list --service=node-api --region=asia-southeast1 --project=smartspecpro-mvp
   ```
   Look for the revision that was serving 100% traffic before the latest deployment.

2. **Route 100% traffic to the previous revision:**
   ```bash
   # Node.js API
   gcloud run services update-traffic node-api \
     --to-revisions=<HEALTHY_REVISION>=100 \
     --region=asia-southeast1 \
     --project=smartspecpro-mvp

   # Python orchestrator (if also affected)
   gcloud run services update-traffic python-orchestrator \
     --to-revisions=<HEALTHY_REVISION>=100 \
     --region=asia-southeast1 \
     --project=smartspecpro-mvp
   ```

3. **Verify traffic shift:**
   ```bash
   # Check service is healthy
   curl -s https://app.smartaihub.app/healthz

   # Check Cloud Monitoring for request success rate
   gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" \
     --limit=10 --project=smartspecpro-mvp
   ```

4. **Investigate the broken revision:**
   ```bash
   # Check logs
   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.revision_name=<BROKEN_REVISION>" \
     --limit=50 --project=smartspecpro-mvp

   # Check Sentry for error details
   ```

5. **Optional: Delete the broken revision:**
   ```bash
   gcloud run revisions delete <BROKEN_REVISION> --region=asia-southeast1 --project=smartspecpro-mvp
   ```

### Automated Test

Run the rollback test script against staging:
```bash
./scripts/test-rollback.sh node-api asia-southeast1 smartspecpro-mvp
```

---

## Database Migration Rollback

**When to use:** A database migration causes schema errors or data corruption.

**Timeline:** 10-30 minutes depending on approach.

### Prevention: Expand-Migrate-Contract Pattern

Always follow this pattern for schema changes:
1. **Expand:** Add new columns as nullable. Deploy code that works with both schemas.
2. **Migrate:** Backfill data into new columns.
3. **Contract:** Add NOT NULL constraints, remove old columns. Deploy final code.

### Rollback Options

#### Option A: Code Rollback Only (Fastest, Preferred)

If the expand pattern was followed, the previous code version works with the new schema:
1. Roll back the Cloud Run service (see above).
2. The old code tolerates the new schema.

#### Option B: Manual Reverse Migration (Safer)

Write a reverse migration:
- **Drizzle:** Create a `.sql` file that undoes the changes.
- **Alembic:** `alembic downgrade -1`

Test on staging first, then apply to production:
```bash
# Fetch DATABASE_URL from Secret Manager (avoid shell history exposure)
export DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)
psql "$DATABASE_URL" < reverse-migration.sql
```

#### Option C: Neon Point-in-Time Recovery (Last Resort)

**WARNING:** Causes data loss for any writes after the restore point.

1. In Neon console: Create a branch from `main` at a pre-migration timestamp.
2. Update `DATABASE_URL` to the restored branch.
3. Verify data integrity.
4. Once confirmed, promote the restored branch.

---

## Cloud Tasks Rollback

**When to use:** A new task handler has a bug causing tasks to fail.

**Automatic recovery:** Cloud Tasks retries failed tasks. When the Cloud Run service is rolled back, retries hit the fixed handler.

**No special action needed** — service rollback handles it. Tasks are at-least-once delivery and idempotent.

If tasks are stuck:
```bash
# Check queue status
gcloud tasks queues describe media-jobs --location=asia-southeast1 --project=smartspecpro-mvp

# Pause queue while investigating
gcloud tasks queues pause media-jobs --location=asia-southeast1 --project=smartspecpro-mvp

# Resume after fix
gcloud tasks queues resume media-jobs --location=asia-southeast1 --project=smartspecpro-mvp
```

---

## Quick Reference

| Scenario | Action | Timeline |
|----------|--------|----------|
| Bad deployment | Traffic shift to previous revision | < 60s |
| Schema error (expand pattern used) | Code rollback only | < 60s |
| Schema error (no expand pattern) | Manual reverse migration | 10-30 min |
| Data corruption | Neon PITR | 15-30 min |
| Stuck Cloud Tasks | Service rollback + queue pause/resume | < 2 min |
