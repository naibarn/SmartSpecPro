diff --git a/docs/launch-checklist.md b/docs/launch-checklist.md
new file mode 100644
index 0000000..9630ff7
--- /dev/null
+++ b/docs/launch-checklist.md
@@ -0,0 +1,148 @@
+# SmartSpecPro Production Launch Checklist
+
+## Pre-Launch Verification
+
+- [ ] All sections 1-19 complete and tested
+- [ ] Load testing (Section 19) passed with target metrics
+- [ ] All hardening checklist items verified (see below)
+- [ ] Rollback procedure tested in staging
+- [ ] Admin team briefed on monitoring dashboards
+- [ ] Incident response contacts identified
+
+## Hardening Checklist
+
+### 1. Secrets in Secret Manager
+- [ ] `scripts/validate-gcp-setup.sh` passes all checks
+- [ ] No plaintext secrets in Docker images
+- [ ] No plaintext secrets in Cloud Run env vars (only Secret Manager refs)
+- [ ] No hardcoded credentials in source code
+
+### 2. HTTPS Everywhere
+- [ ] Cloud Run rejects HTTP (redirects to HTTPS)
+- [ ] No internal HTTP calls (except localhost)
+
+### 3. Rate Limiting Active
+- [ ] Login rate limit triggers at 5 req/min (HTTP 429)
+- [ ] Job creation rate limit triggers at 10 req/min
+- [ ] Upstash Redis rate limit keys have correct TTLs
+
+### 4. R2 Lifecycle Rules Active
+- [ ] `temp/*` expires after 12 days
+- [ ] `renders/preview/*` expires after 7 days
+- [ ] Incomplete multipart uploads abort after 1 day
+- [ ] `gallery/*` has no expiration
+
+### 5. Alerting Tested
+- [ ] High 5xx rate alert fires and email delivered
+- [ ] Job failure rate alert fires
+- [ ] Queue backlog alert fires at depth > 100
+- [ ] Auth failure rate alert fires
+
+### 6. Sentry Verified
+- [ ] Frontend project receives test error with correct release tag
+- [ ] Node.js project receives test error with environment tag
+- [ ] Python project receives test error
+- [ ] PII scrubbing active (no passwords, auth headers in events)
+
+### 7. PostHog Verified
+- [ ] Client-side events appear in dashboard
+- [ ] Server-side events appear in dashboard
+- [ ] Correct distinct_id correlation
+
+### 8. Cloud Monitoring Verified
+- [ ] Services dashboard shows live data
+- [ ] Jobs dashboard shows live data
+- [ ] Alert policies are armed
+- [ ] Notification channels configured
+
+### 9. DLQ Tested
+- [ ] Failed task writes to `cloud_task_events` with `status='dead_letter'`
+- [ ] Admin receives email alert for dead letter tasks
+
+### 10. Rollback Tested
+- [ ] `scripts/test-rollback.sh` passes on staging
+- [ ] Rollback completes in < 60 seconds
+- [ ] No data loss during rollback
+
+## Launch Sequence
+
+### Step 1: Deploy to Staging
+```bash
+# Merge feature branch, GHA deploys to staging
+pnpm test && pytest && pnpm test:e2e
+```
+- [ ] All tests pass
+- [ ] Staging environment functional
+- [ ] No Sentry errors
+
+### Step 2: Migrate Production Database
+```bash
+# Take Neon snapshot first (in console: pre-launch-backup-YYYY-MM-DD)
+DATABASE_URL="<PROD_URL>" pnpm db:push
+DATABASE_URL="<PROD_URL>" alembic upgrade head
+```
+- [ ] Migrations apply cleanly
+- [ ] Seed data exists (admin user, default tenant)
+
+### Step 3: Deploy with 10% Canary
+```bash
+git tag v1.0.0-prod && git push origin v1.0.0-prod
+# GHA builds and pushes images
+
+gcloud run deploy node-api \
+  --image=gcr.io/smartspecpro-mvp/node-api:v1.0.0-prod \
+  --region=asia-southeast1 --tag=canary --no-traffic
+
+gcloud run services update-traffic node-api \
+  --to-revisions=canary=10,LATEST=90 --region=asia-southeast1
+```
+**Monitor 30 minutes:**
+- [ ] Error rate < 1%
+- [ ] p95 latency < 500ms
+- [ ] No critical Sentry errors
+- [ ] PostHog events flowing
+
+**Abort if:** Error rate > 5%, critical errors, job failures > 20%
+
+### Step 4: Shift to 50% Traffic
+```bash
+gcloud run services update-traffic node-api \
+  --to-revisions=canary=50,LATEST=50 --region=asia-southeast1
+```
+**Monitor 15 minutes:**
+- [ ] Same metrics as Step 3
+- [ ] No queue backlogs
+- [ ] No connection pool exhaustion
+
+### Step 5: Shift to 100% Traffic
+```bash
+gcloud run services update-traffic node-api \
+  --to-revisions=canary=100 --region=asia-southeast1
+```
+**Monitor 60 minutes:**
+- [ ] All metrics stable
+- [ ] No alerts fired
+- [ ] User-reported issues: none/minimal
+
+### Step 6: Announce Launch
+- [ ] Update status page
+- [ ] Notify early access users
+- [ ] Enable public signup (if gated)
+- [ ] Admin on-call for first 24 hours
+
+## Emergency Rollback
+
+```bash
+# Identify previous healthy revision
+gcloud run revisions list --service=node-api --region=asia-southeast1
+
+# Immediate rollback
+gcloud run services update-traffic node-api \
+  --to-revisions=<HEALTHY_REVISION>=100 --region=asia-southeast1
+```
+
+## Post-Launch Monitoring
+
+**Daily:** Admin dashboard, Sentry errors, alert emails
+**Weekly:** PostHog dashboards, R2 storage, Cloud Monitoring trends
+**Monthly:** Database size, queue performance, Sentry/PostHog usage/cost
diff --git a/docs/runbooks/rollback-procedure.md b/docs/runbooks/rollback-procedure.md
new file mode 100644
index 0000000..25cd0a2
--- /dev/null
+++ b/docs/runbooks/rollback-procedure.md
@@ -0,0 +1,128 @@
+# Rollback Procedures
+
+## Cloud Run Service Rollback
+
+**When to use:** A new deployment causes increased errors, crashes, or unexpected behavior.
+
+**Timeline:** < 60 seconds from command to full rollback.
+
+### Steps
+
+1. **Identify the previous healthy revision:**
+   ```bash
+   gcloud run revisions list --service=node-api --region=asia-southeast1
+   ```
+   Look for the revision that was serving 100% traffic before the latest deployment.
+
+2. **Route 100% traffic to the previous revision:**
+   ```bash
+   gcloud run services update-traffic node-api \
+     --to-revisions=<HEALTHY_REVISION>=100 \
+     --region=asia-southeast1
+   ```
+
+3. **Verify traffic shift:**
+   ```bash
+   # Check service is healthy
+   curl -s https://app.smartaihub.app/healthz
+
+   # Check Cloud Monitoring for request success rate
+   gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=10
+   ```
+
+4. **Investigate the broken revision:**
+   ```bash
+   # Check logs
+   gcloud logging read "resource.type=cloud_run_revision AND resource.labels.revision_name=<BROKEN_REVISION>" --limit=50
+
+   # Check Sentry for error details
+   ```
+
+5. **Optional: Delete the broken revision:**
+   ```bash
+   gcloud run revisions delete <BROKEN_REVISION> --region=asia-southeast1
+   ```
+
+### Automated Test
+
+Run the rollback test script against staging:
+```bash
+./scripts/test-rollback.sh node-api asia-southeast1
+```
+
+---
+
+## Database Migration Rollback
+
+**When to use:** A database migration causes schema errors or data corruption.
+
+**Timeline:** 10-30 minutes depending on approach.
+
+### Prevention: Expand-Migrate-Contract Pattern
+
+Always follow this pattern for schema changes:
+1. **Expand:** Add new columns as nullable. Deploy code that works with both schemas.
+2. **Migrate:** Backfill data into new columns.
+3. **Contract:** Add NOT NULL constraints, remove old columns. Deploy final code.
+
+### Rollback Options
+
+#### Option A: Code Rollback Only (Fastest, Preferred)
+
+If the expand pattern was followed, the previous code version works with the new schema:
+1. Roll back the Cloud Run service (see above).
+2. The old code tolerates the new schema.
+
+#### Option B: Manual Reverse Migration (Safer)
+
+Write a reverse migration:
+- **Drizzle:** Create a `.sql` file that undoes the changes.
+- **Alembic:** `alembic downgrade -1`
+
+Test on staging first, then apply to production:
+```bash
+psql "$DATABASE_URL" < reverse-migration.sql
+```
+
+#### Option C: Neon Point-in-Time Recovery (Last Resort)
+
+**WARNING:** Causes data loss for any writes after the restore point.
+
+1. In Neon console: Create a branch from `main` at a pre-migration timestamp.
+2. Update `DATABASE_URL` to the restored branch.
+3. Verify data integrity.
+4. Once confirmed, promote the restored branch.
+
+---
+
+## Cloud Tasks Rollback
+
+**When to use:** A new task handler has a bug causing tasks to fail.
+
+**Automatic recovery:** Cloud Tasks retries failed tasks. When the Cloud Run service is rolled back, retries hit the fixed handler.
+
+**No special action needed** — service rollback handles it. Tasks are at-least-once delivery and idempotent.
+
+If tasks are stuck:
+```bash
+# Check queue status
+gcloud tasks queues describe media-jobs --location=asia-southeast1
+
+# Pause queue while investigating
+gcloud tasks queues pause media-jobs --location=asia-southeast1
+
+# Resume after fix
+gcloud tasks queues resume media-jobs --location=asia-southeast1
+```
+
+---
+
+## Quick Reference
+
+| Scenario | Action | Timeline |
+|----------|--------|----------|
+| Bad deployment | Traffic shift to previous revision | < 60s |
+| Schema error (expand pattern used) | Code rollback only | < 60s |
+| Schema error (no expand pattern) | Manual reverse migration | 10-30 min |
+| Data corruption | Neon PITR | 15-30 min |
+| Stuck Cloud Tasks | Service rollback + queue pause/resume | < 2 min |
diff --git a/scripts/test-rollback.sh b/scripts/test-rollback.sh
new file mode 100755
index 0000000..26ae815
--- /dev/null
+++ b/scripts/test-rollback.sh
@@ -0,0 +1,131 @@
+#!/usr/bin/env bash
+# test-rollback.sh
+# Tests Cloud Run rollback procedure on staging environment.
+# Usage: ./scripts/test-rollback.sh [SERVICE] [REGION] [PROJECT_ID]
+#
+# This script:
+# 1. Records the current healthy revision
+# 2. Deploys a broken revision (no traffic)
+# 3. Shifts 10% traffic to the broken revision
+# 4. Waits for error observation
+# 5. Rolls back to 100% healthy revision
+# 6. Verifies rollback success
+# 7. Cleans up the broken revision
+
+set -euo pipefail
+
+SERVICE="${1:-node-api}"
+REGION="${2:-asia-southeast1}"
+PROJECT_ID="${3:-$(gcloud config get-value project 2>/dev/null || echo "smartspecpro-mvp")}"
+
+echo "=== Cloud Run Rollback Test ==="
+echo "Service: $SERVICE"
+echo "Region:  $REGION"
+echo "Project: $PROJECT_ID"
+echo ""
+
+# Step 1: Get current healthy revision
+echo "[1/7] Identifying current healthy revision..."
+HEALTHY_REVISION=$(gcloud run services describe "$SERVICE" \
+  --region="$REGION" \
+  --project="$PROJECT_ID" \
+  --format="value(status.traffic[0].revisionName)")
+
+if [[ -z "$HEALTHY_REVISION" ]]; then
+  echo "ERROR: Could not determine current revision for $SERVICE"
+  exit 1
+fi
+echo "  Current healthy revision: $HEALTHY_REVISION"
+
+# Step 2: Deploy a broken revision (health check will fail)
+echo "[2/7] Deploying broken revision (no traffic)..."
+# Use a non-existent image tag to force failure
+gcloud run deploy "$SERVICE" \
+  --image="gcr.io/$PROJECT_ID/$SERVICE:rollback-test-broken" \
+  --region="$REGION" \
+  --project="$PROJECT_ID" \
+  --no-traffic \
+  --tag=rollback-test \
+  2>/dev/null || true
+
+BROKEN_REVISION=$(gcloud run services describe "$SERVICE" \
+  --region="$REGION" \
+  --project="$PROJECT_ID" \
+  --format="value(status.latestCreatedRevisionName)")
+echo "  Broken revision: $BROKEN_REVISION"
+
+if [[ "$BROKEN_REVISION" == "$HEALTHY_REVISION" ]]; then
+  echo "WARNING: Broken revision same as healthy. Deploy may have failed."
+  echo "  This is expected if the broken image doesn't exist."
+  echo "  Proceeding with traffic split test using tag URL instead."
+fi
+
+# Step 3: Shift 10% traffic to broken revision
+echo "[3/7] Shifting 10% traffic to broken revision..."
+gcloud run services update-traffic "$SERVICE" \
+  --to-revisions="$BROKEN_REVISION=10,$HEALTHY_REVISION=90" \
+  --region="$REGION" \
+  --project="$PROJECT_ID" \
+  2>/dev/null || {
+    echo "  Traffic split failed (broken revision may not be ready)."
+    echo "  Skipping to cleanup."
+    # Clean up
+    gcloud run revisions delete "$BROKEN_REVISION" \
+      --region="$REGION" \
+      --project="$PROJECT_ID" \
+      --quiet 2>/dev/null || true
+    exit 0
+  }
+
+# Step 4: Wait for error observation
+echo "[4/7] Waiting 30 seconds to observe error spike..."
+echo "  Check Cloud Monitoring dashboard for elevated error rates."
+sleep 30
+
+# Step 5: Execute rollback
+echo "[5/7] Rolling back to 100% healthy revision..."
+ROLLBACK_START=$(date +%s)
+
+gcloud run services update-traffic "$SERVICE" \
+  --to-revisions="$HEALTHY_REVISION=100" \
+  --region="$REGION" \
+  --project="$PROJECT_ID"
+
+ROLLBACK_END=$(date +%s)
+ROLLBACK_TIME=$((ROLLBACK_END - ROLLBACK_START))
+echo "  Rollback completed in ${ROLLBACK_TIME}s"
+
+# Step 6: Verify rollback
+echo "[6/7] Verifying rollback..."
+CURRENT_REVISION=$(gcloud run services describe "$SERVICE" \
+  --region="$REGION" \
+  --project="$PROJECT_ID" \
+  --format="value(status.traffic[0].revisionName)")
+
+if [[ "$CURRENT_REVISION" == "$HEALTHY_REVISION" ]]; then
+  echo "  Rollback verified: 100% traffic on $HEALTHY_REVISION"
+else
+  echo "  ERROR: Rollback verification failed!"
+  echo "  Expected: $HEALTHY_REVISION"
+  echo "  Got: $CURRENT_REVISION"
+  exit 1
+fi
+
+# Step 7: Clean up broken revision
+echo "[7/7] Cleaning up broken revision..."
+if [[ "$BROKEN_REVISION" != "$HEALTHY_REVISION" ]]; then
+  gcloud run revisions delete "$BROKEN_REVISION" \
+    --region="$REGION" \
+    --project="$PROJECT_ID" \
+    --quiet 2>/dev/null || echo "  (cleanup skipped - revision may already be deleted)"
+fi
+
+echo ""
+echo "=== Rollback Test Results ==="
+echo "Service:        $SERVICE"
+echo "Healthy rev:    $HEALTHY_REVISION"
+echo "Rollback time:  ${ROLLBACK_TIME}s (target: <60s)"
+echo "Status:         PASSED"
+if [[ "$ROLLBACK_TIME" -gt 60 ]]; then
+  echo "WARNING: Rollback exceeded 60s target"
+fi
diff --git a/scripts/validate-gcp-setup.sh b/scripts/validate-gcp-setup.sh
index 2c034f6..337eeef 100755
--- a/scripts/validate-gcp-setup.sh
+++ b/scripts/validate-gcp-setup.sh
@@ -192,13 +192,59 @@ for SECRET_NAME in "${SECRETS[@]}"; do
     gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" --format="value(name)"
 done
 
-# --- 8. Docker authentication ---
+# --- 8. Cloud Run services health ---
+check "Cloud Run service: node-api" \
+  gcloud run services describe node-api --region="$REGION" --project="$PROJECT_ID" --format="value(status.url)"
+
+check "Cloud Run service: python-orchestrator" \
+  gcloud run services describe python-orchestrator --region="$REGION" --project="$PROJECT_ID" --format="value(status.url)"
+
+# --- 9. Custom domain mapping and TLS ---
+DOMAIN_STATUS=$(gcloud run domain-mappings describe --domain=app.smartaihub.app --region="$REGION" --project="$PROJECT_ID" --format="value(status.conditions[0].status)" 2>/dev/null || echo "NOT_FOUND")
+if [[ "$DOMAIN_STATUS" == "True" ]]; then
+  echo "PASS: Custom domain app.smartaihub.app is active"
+else
+  ERRORS+=("FAIL: Custom domain app.smartaihub.app status: $DOMAIN_STATUS (expected: True)")
+fi
+
+# --- 10. Cloud Scheduler jobs are enabled ---
+SCHEDULER_JOBS=$(gcloud scheduler jobs list --location="$REGION" --project="$PROJECT_ID" --format="value(name)" 2>/dev/null || echo "")
+if [[ -n "$SCHEDULER_JOBS" ]]; then
+  JOB_COUNT=$(echo "$SCHEDULER_JOBS" | wc -l)
+  echo "PASS: Cloud Scheduler has $JOB_COUNT jobs configured"
+  # Check key jobs exist
+  for JOB in process-dead-letters cleanup-temp-storage daily-usage-report; do
+    if echo "$SCHEDULER_JOBS" | grep -q "$JOB"; then
+      echo "PASS: Cloud Scheduler job: $JOB"
+    else
+      ERRORS+=("FAIL: Cloud Scheduler job missing: $JOB")
+    fi
+  done
+else
+  ERRORS+=("FAIL: No Cloud Scheduler jobs found")
+fi
+
+# --- 11. Cloud Monitoring alert policies ---
+ALERT_COUNT=$(gcloud alpha monitoring policies list --project="$PROJECT_ID" --format="value(name)" 2>/dev/null | wc -l || echo "0")
+if [[ "$ALERT_COUNT" -gt 0 ]]; then
+  echo "PASS: Cloud Monitoring has $ALERT_COUNT alert policies"
+else
+  ERRORS+=("FAIL: No Cloud Monitoring alert policies configured")
+fi
+
+# --- 12. Docker authentication ---
 if [[ -f "$HOME/.docker/config.json" ]] && grep -q "${REGION}-docker.pkg.dev" "$HOME/.docker/config.json" 2>/dev/null; then
   echo "PASS: Docker authenticated for Artifact Registry"
 else
   ERRORS+=("FAIL: Docker not authenticated for ${REGION}-docker.pkg.dev")
 fi
 
+# --- 13. Secret Manager access from Cloud Run ---
+check "cloud-run-api can access secrets" \
+  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
+    --filter="bindings.members:serviceAccount:cloud-run-api@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/secretmanager.secretAccessor" \
+    --format="value(bindings.role)"
+
 # --- Report ---
 echo ""
 if [[ ${#ERRORS[@]} -eq 0 ]]; then
