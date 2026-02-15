Now I have all the context. Let me extract the relevant content for section-20-prod-hardening from the main plan and TDD plan.

# Section 20: Production Hardening & Rollback

## Overview

This section covers the final hardening steps required before launch, including DNS and domain configuration, Cloud Run custom domains with managed TLS, comprehensive hardening verification checklist, rollback procedures, and the step-by-step launch sequence. This is the last section before production goes live.

**Prerequisites:** All sections 1-19 must be complete and validated via load testing.

**Deliverable:** Production environment ready for launch with verified rollback capability, all hardening items checked, and a battle-tested deployment procedure.

---

## Tests (from TDD Plan)

### DNS Configuration (Manual Verification)

**Test: `app.smartaihub.app` resolves to Cloud Run service**
- Manual verification step: `dig app.smartaihub.app` returns the correct CNAME or A record pointing to Google Cloud Run infrastructure (`ghs.googlehosted.com` or Cloud Run IP).

**Test: TLS certificate is valid for `app.smartaihub.app`**
- Manual verification: `curl -v https://app.smartaihub.app/healthz 2>&1 | grep "subject:"` shows the correct domain in the certificate.
- Certificate is managed by Google Cloud and auto-renewed.

### Rollback Procedure (Integration Test)

**Test: Deploying a broken revision and rolling back restores previous service**
- Deploy a deliberately broken revision (e.g., image with failing health check).
- Wait for Cloud Run to detect failure (health check timeout).
- Execute rollback: `gcloud run services update-traffic node-api --to-revisions=PREVIOUS_REVISION=100 --region=REGION`
- Verify traffic is served from the previous healthy revision.
- Verify no downtime longer than the health check grace period.

**Test: DLQ captures task that fails all retries**
- Force a Cloud Tasks task to fail by injecting an error in a task handler.
- Verify the task exhausts all retries (check `X-CloudTasks-TaskRetryCount` header).
- Verify a dead letter record is written to `cloud_task_events` table with `status='dead_letter'`.
- Verify admin email alert is sent (check SMTP logs or inbox).

### Hardening Checklist (Manual Verification)

No automated tests — verified via manual checklist execution documented below.

---

## DNS and Domain Configuration

### Cloud Run Custom Domain Mapping

Map the production domain `app.smartaihub.app` to the Node.js Cloud Run service using Google Cloud's managed domain mapping. This provides automatic TLS certificate provisioning and renewal via Google-managed certificates.

**Steps:**

1. **Create domain mapping:**
   ```bash
   gcloud run domain-mappings create \
     --service=node-api \
     --domain=app.smartaihub.app \
     --region=asia-southeast1 \
     --project=smartspecpro-mvp
   ```

2. **Verify DNS requirements:**
   - The command output will provide DNS record requirements.
   - Typically: `CNAME app.smartaihub.app → ghs.googlehosted.com`

3. **Configure DNS at domain registrar/Cloudflare:**
   - Add the CNAME record as instructed by gcloud.
   - Wait for DNS propagation (typically 5-15 minutes, up to 48 hours globally).

4. **Verify certificate issuance:**
   ```bash
   gcloud run domain-mappings describe \
     --domain=app.smartaihub.app \
     --region=asia-southeast1 \
     --format="value(status.resourceRecords, status.certificateStatus)"
   ```
   - Wait until `certificateStatus` shows `ACTIVE`.

### Python Orchestrator Service Domain

**Decision:** The Python orchestrator service does NOT need a custom domain. It is only accessed by:
- Cloud Tasks (using OIDC authentication to the `.run.app` URL)
- The Node.js service (server-to-server calls via the `.run.app` URL with internal authentication)

Keep the Python service on its default Cloud Run URL (e.g., `https://python-orchestrator-xxxxx-uc.a.run.app`).

### WebSocket Support

Cloud Run supports WebSocket connections natively. If the existing codebase uses a `/ws` endpoint for real-time communication (check `apps/web/server/index.ts` or router files):

1. **Enable session affinity** on the Node.js Cloud Run service to ensure WebSocket connections route to the same instance:
   ```bash
   gcloud run services update node-api \
     --session-affinity \
     --region=asia-southeast1
   ```

2. **Verify WebSocket upgrade works** through the custom domain:
   ```javascript
   // Test WebSocket connection
   const ws = new WebSocket('wss://app.smartaihub.app/ws');
   ws.onopen = () => console.log('Connected');
   ```

---

## Production Hardening Checklist

Execute this checklist before the launch sequence. Each item must be verified and documented.

### 1. All Secrets in Secret Manager

**Verification:**
- Run the GCP validation script:
  ```bash
  bash scripts/validate-gcp-setup.sh
  ```
- Manually check for plaintext secrets in:
  - Docker images: `docker run --entrypoint=cat node-api:latest /app/.env` should fail (no .env file in image).
  - Environment variables in Cloud Run: `gcloud run services describe node-api --region=REGION --format=yaml | grep -E "env:|value:"` should show no plaintext secrets (only references to Secret Manager).
  - Code repository: `git grep -E "(API_KEY|SECRET|PASSWORD|TOKEN).*=" | grep -v "process.env"` should return no hard-coded credentials.

**Expected result:** All sensitive configuration values reference Secret Manager secrets. No plaintext credentials in images, environment variables, or source code.

### 2. HTTPS Everywhere

**Verification:**
- Cloud Run enforces HTTPS by default. Verify all endpoints reject HTTP:
  ```bash
  curl -v http://app.smartaihub.app/healthz
  # Should redirect to https:// or return error
  ```
- Check that no internal service-to-service calls use HTTP:
  ```bash
  grep -r "http://" apps/web/server/ python-backend/app/ | grep -v "localhost" | grep -v "127.0.0.1"
  # Should return no results (or only comments/test files)
  ```

**Expected result:** All external endpoints are HTTPS-only. Internal calls to Cloud Run services use HTTPS.

### 3. Rate Limiting Active

**Verification:**
- Run rate limit tests from the load testing suite (Section 19) against production endpoints.
- Test each rate-limited endpoint:
  ```bash
  # Login rate limit (5 per minute per IP)
  for i in {1..6}; do curl -X POST https://app.smartaihub.app/api/auth/login -d '{"email":"test@example.com","password":"wrong"}' -H "Content-Type: application/json"; done
  # 6th request should return HTTP 429
  
  # Job creation rate limit (10 per minute per user)
  # Use authenticated session, submit 11 jobs rapidly, 11th should return 429
  ```
- Check Upstash Redis for rate limit keys:
  ```bash
  # Using Upstash CLI or REST API
  upstash-cli keys "ratelimit:*"
  # Should show active rate limit keys with TTLs
  ```

**Expected result:** Rate limits trigger on excess requests. HTTP 429 responses include `Retry-After` header. Redis keys have correct TTLs.

### 4. Lifecycle Rules Active

**Verification:**
- Check R2 bucket lifecycle configuration:
  ```bash
  # Using AWS CLI configured for R2
  aws s3api get-bucket-lifecycle-configuration --bucket smartspecpro-prod --endpoint-url https://{ACCOUNT_ID}.r2.cloudflarestorage.com
  ```
- Verify rules:
  - `temp/*` → 12-day expiration
  - `renders/preview/*` → 7-day expiration
  - Incomplete multipart uploads → 1-day abort
  - `gallery/*` → No expiration

**Expected result:** Lifecycle rules are applied and match the specification from Section 9.

### 5. Alerting Tested

**Verification:** Manually trigger each alert condition and verify email delivery.

**Test cases:**
- **High 5xx rate:** Deploy a broken revision that returns 500 errors. Wait 5 minutes. Check admin inbox for alert email.
- **Job failure rate:** Force 10 jobs to fail (e.g., submit jobs with invalid Kie AI parameters). Verify alert fires when >20% fail.
- **Queue backlog:** Enqueue 150 tasks to a single queue. Verify alert fires when depth >100.
- **Auth failure rate:** Submit 20 failed login attempts. Verify alert fires if failure rate >20%.

**Rollback after each test:** Remove the broken code/restore normal state before testing the next alert.

**Expected result:** All alert emails are delivered to admin users within the specified alert duration window (5-10 minutes). Alert deduplication prevents re-sending within 1 hour.

### 6. Sentry Verified

**Verification:**
- Throw a test error in each service:
  
  **Frontend:**
  ```typescript
  // Add to a development-only route
  if (import.meta.env.MODE === 'development') {
    throw new Error('Sentry frontend test error');
  }
  ```
  
  **Node.js backend:**
  ```typescript
  // Add a test endpoint
  app.get('/test-sentry', (req, res) => {
    throw new Error('Sentry Node.js test error');
  });
  ```
  
  **Python backend:**
  ```python
  @app.get("/test-sentry")
  def test_sentry():
      raise Exception("Sentry Python test error")
  ```

- Trigger each error endpoint/route.
- Check Sentry dashboard for all three projects.
- Verify each error includes:
  - Correct release tag (git commit SHA)
  - Environment tag (`production` or `staging`)
  - Correlation ID (`request_id`, `user_id`, `job_id` as applicable)
  - PII scrubbing (no plaintext passwords, authorization headers, or sensitive fields)

**Expected result:** All three Sentry projects receive test errors with correct metadata and PII scrubbing.

### 7. PostHog Verified

**Verification:**
- Fire test events from both client and server:
  
  **Client-side:**
  ```typescript
  posthog.capture('test_event_client', { test: true, timestamp: Date.now() });
  ```
  
  **Server-side (Node.js):**
  ```typescript
  posthog.capture({
    distinctId: 'test-user-123',
    event: 'test_event_server',
    properties: { test: true, timestamp: Date.now() }
  });
  ```

- Wait 1-2 minutes for batch delivery.
- Check PostHog dashboard:
  - Events appear in the live events stream.
  - Events have correct `distinct_id` (user ID for server-side, PostHog cookie ID for client-side).
  - Server-side events include properties defined in Section 14 event schema.

**Expected result:** Both client-side and server-side events appear in PostHog with correct identity correlation.

### 8. Cloud Monitoring Verified

**Verification:**
- Open Cloud Monitoring dashboards (Services Dashboard, Jobs Dashboard) in the GCP console.
- Verify all widgets show data:
  - Request count, latency, error rate for Cloud Run services
  - Queue depth for Cloud Tasks queues
  - Job execution counts and durations
- Generate some traffic (login, submit a job, trigger a video render) and verify metrics update within 1-2 minutes.
- Check alert policies are armed:
  ```bash
  gcloud alpha monitoring policies list --project=smartspecpro-mvp
  ```
- Verify notification channels are configured:
  ```bash
  gcloud alpha monitoring channels list --project=smartspecpro-mvp
  ```

**Expected result:** All dashboard widgets populate with live data. Alert policies are enabled. Notification channels include admin emails.

### 9. DLQ Tested

**Verification:**
- Force a Cloud Tasks task to fail all retries:
  ```python
  # Modify a task handler to always raise an exception
  @app.post("/tasks/test-dlq")
  async def test_dlq_handler():
      raise Exception("Forced failure for DLQ test")
  ```
- Enqueue the task:
  ```python
  enqueue_task(
      queue_name='periodic-tasks',
      handler_path='/tasks/test-dlq',
      payload={'test': True}
  )
  ```
- Wait for all retries to exhaust (check queue configuration for max attempts — typically 3-5 retries over 5-10 minutes).
- Verify the final retry writes to the `cloud_task_events` table:
  ```sql
  SELECT * FROM cloud_task_events WHERE status = 'dead_letter' ORDER BY created_at DESC LIMIT 1;
  ```
- Verify the daily dead letter processing job (Section 5: `process-dead-letters` Cloud Scheduler job) sends an email alert.

**Rollback:** Remove the test handler and clean up the dead letter record.

**Expected result:** Failed task is recorded in the database with `status='dead_letter'`. Admin receives email alert.

### 10. Rollback Tested

**Verification:**
- Deploy a deliberately broken revision:
  ```bash
  # Build a Docker image with a failing health check
  # (e.g., comment out the /healthz endpoint)
  docker build -t gcr.io/smartspecpro-mvp/node-api:broken .
  docker push gcr.io/smartspecpro-mvp/node-api:broken
  
  gcloud run deploy node-api \
    --image=gcr.io/smartspecpro-mvp/node-api:broken \
    --region=asia-southeast1 \
    --no-traffic  # Deploy without shifting traffic
  ```
- Shift 10% traffic to the broken revision:
  ```bash
  gcloud run services update-traffic node-api \
    --to-revisions=node-api-broken=10,node-api-healthy=90 \
    --region=asia-southeast1
  ```
- Monitor error rate spike in Cloud Monitoring (should see 10% of requests failing).
- Execute rollback:
  ```bash
  gcloud run services update-traffic node-api \
    --to-revisions=node-api-healthy=100 \
    --region=asia-southeast1
  ```
- Verify traffic is fully restored and error rate returns to baseline.
- Measure rollback time (from detection to 100% healthy traffic).

**Expected result:** Rollback completes within 60 seconds. No data loss or stuck jobs. Previous revision serves all traffic successfully.

---

## Rollback Procedures

### Cloud Run Service Rollback

**Scenario:** A new deployment causes increased errors, crashes, or unexpected behavior.

**Steps:**

1. **Identify the previous healthy revision:**
   ```bash
   gcloud run revisions list --service=node-api --region=asia-southeast1
   ```
   - Look for the revision with `TRAFFIC: 100%` before the latest deployment.
   - Note the revision name (e.g., `node-api-00042-xyz`).

2. **Route 100% traffic to the previous revision:**
   ```bash
   gcloud run services update-traffic node-api \
     --to-revisions=node-api-00042-xyz=100 \
     --region=asia-southeast1
   ```

3. **Verify traffic shift:**
   - Check Cloud Monitoring for request success rate.
   - Test the service manually: `curl https://app.smartaihub.app/healthz`

4. **Investigate the broken revision:**
   - Check logs for the broken revision:
     ```bash
     gcloud logging read "resource.type=cloud_run_revision AND resource.labels.revision_name=node-api-00043-abc" --limit=50
     ```
   - Check Sentry for error reports.
   - Reproduce locally using the same Docker image.

5. **Delete or keep the broken revision:**
   - Keep it for debugging: leave it deployed with 0% traffic.
   - Delete it: `gcloud run revisions delete node-api-00043-abc --region=asia-southeast1`

**Timeline:** Rollback should complete within 60 seconds of executing the traffic shift command.

### Database Migration Rollback

**Scenario:** A database migration introduced in a new deployment causes schema-related errors.

**Prevention (Expand → Migrate → Contract pattern):**
- New code should work with both old and new schema during the "expand" phase.
- Example: Adding a new column? Make it nullable first, backfill data, then enforce NOT NULL in a later migration.

**Rollback if migration fails:**

1. **Code rollback:** Deploy the previous Cloud Run revision (as above). The old code should tolerate the new schema if the expand pattern was followed.

2. **Schema rollback (if necessary):**
   - Neon Postgres supports point-in-time recovery (PITR).
   - Restore to a timestamp before the migration:
     - In Neon console: Create a new branch from the main branch at the pre-migration timestamp.
     - Update `DATABASE_URL` to point to the restored branch.
     - Verify data integrity.
   - **Warning:** PITR causes data loss for any writes after the restore point. Only use if the migration corrupted critical data.

3. **Manual schema rollback (safer):**
   - Write a reverse migration:
     - For Drizzle: manually create a `.sql` file that undoes the changes (e.g., `DROP COLUMN` if the migration added a column).
     - For Alembic: use `alembic downgrade -1`.
   - Test the reverse migration on staging first.
   - Apply to production.

**Timeline:** Code rollback (immediate). Schema rollback (10-30 minutes depending on database size).

### Cloud Tasks Rollback

**Scenario:** A new task handler version has a bug causing tasks to fail.

**Rollback:**
- Cloud Tasks retries failed tasks automatically.
- When the Cloud Run service is rolled back to a previous revision, the retries will hit the fixed handler.
- Tasks are at-least-once delivery and idempotent, so replayed tasks should not cause data corruption.

**No special Cloud Tasks rollback needed** — service rollback handles it.

---

## Launch Sequence

Follow this step-by-step sequence to launch the production environment. Each step includes verification criteria and abort conditions.

### Pre-Launch Checklist

- [ ] All sections 1-19 are complete and tested.
- [ ] Load testing (Section 19) passed with target metrics.
- [ ] All hardening checklist items (above) verified.
- [ ] Rollback procedure tested and documented.
- [ ] Admin team briefed on monitoring dashboards and alert response.
- [ ] Incident response runbook prepared (who to contact, escalation paths).

### Step 1: Deploy to Staging

**Actions:**
1. Merge the feature branch to `main`.
2. GitHub Actions automatically builds and deploys to staging.
3. Run full test suite against staging:
   ```bash
   pnpm test              # Node.js tests
   pytest                 # Python tests
   pnpm test:e2e          # End-to-end tests (if available)
   ```
4. Verify staging database migrations:
   ```bash
   cd apps/web && pnpm db:push         # Drizzle
   cd python-backend && alembic upgrade head  # Alembic
   ```
5. Smoke test critical flows on staging:
   - User signup and login
   - Job submission (image generation)
   - Video render (short clip)
   - Admin dashboard access

**Verification:**
- All tests pass.
- Staging environment is fully functional.
- No errors in Sentry staging project.

**Abort condition:** Any test failures or critical flow broken → fix before proceeding.

### Step 2: Migrate Production Database

**Actions:**
1. Take a manual Neon snapshot (production safety net):
   - In Neon console: Create a branch from `main` at current timestamp. Name it `pre-launch-backup-YYYY-MM-DD`.
2. Run Drizzle migrations:
   ```bash
   DATABASE_URL="<PRODUCTION_NEON_URL>" pnpm db:push
   ```
3. Run Alembic migrations:
   ```bash
   DATABASE_URL="<PRODUCTION_NEON_URL>" alembic upgrade head
   ```
4. Verify migrations:
   ```bash
   psql "$DATABASE_URL" -c "\d cloud_task_events"   # New table exists
   psql "$DATABASE_URL" -c "\d media_tasks"         # cloud_task_id column exists
   ```
5. Run production seed script (one-time only):
   ```bash
   DATABASE_URL="<PRODUCTION_NEON_URL>" tsx apps/web/server/scripts/seed-production.ts
   ```

**Verification:**
- All migrations apply cleanly.
- Seed data exists (admin user, default tenant, system settings).

**Abort condition:** Migration fails → restore from Neon snapshot, investigate, retry.

### Step 3: Deploy to Production with 10% Canary

**Actions:**
1. Tag the release:
   ```bash
   git tag v1.0.0-prod
   git push origin v1.0.0-prod
   ```
2. GitHub Actions builds and pushes production Docker images.
3. Deploy with 10% canary traffic:
   ```bash
   gcloud run deploy node-api \
     --image=gcr.io/smartspecpro-mvp/node-api:v1.0.0-prod \
     --region=asia-southeast1 \
     --tag=canary \
     --no-traffic
   
   gcloud run services update-traffic node-api \
     --to-revisions=canary=10,LATEST=90 \
     --region=asia-southeast1
   ```

**Verification (Monitor for 30 minutes):**
- Cloud Monitoring dashboard:
  - Error rate (target: <1%)
  - p95 latency (target: <500ms)
  - Instance count stable
- Sentry:
  - No new critical errors
  - Error volume comparable to staging
- PostHog:
  - Events flowing from production users
  - No anomalies in conversion funnels
- Admin dashboard:
  - Jobs completing successfully
  - Queue depths normal

**Abort condition:**
- Error rate >5% on canary traffic → rollback immediately.
- Critical Sentry errors (auth failures, database errors) → rollback.
- Job failures >20% → rollback.

**Rollback if needed:**
```bash
gcloud run services update-traffic node-api \
  --to-revisions=LATEST=100 \
  --region=asia-southeast1
```

### Step 4: Shift to 50% Traffic

**Actions:**
```bash
gcloud run services update-traffic node-api \
  --to-revisions=canary=50,LATEST=50 \
  --region=asia-southeast1
```

**Verification (Monitor for 15 minutes):**
- Same metrics as Step 3.
- Increased traffic volume (50% of production load).
- No queue backlogs.
- No database connection pool exhaustion.

**Abort condition:** Same as Step 3 → rollback to 100% previous revision.

### Step 5: Shift to 100% Traffic

**Actions:**
```bash
gcloud run services update-traffic node-api \
  --to-revisions=canary=100 \
  --region=asia-southeast1
```

**Verification (Monitor for 60 minutes):**
- Full production traffic on the new revision.
- All metrics stable.
- No alerts fired.
- User-reported issues: none or minimal.

**Abort condition:** Any critical errors or user-facing outages → rollback.

### Step 6: Announce Launch

**Actions:**
1. Update status page (if available): "SmartSpecPro MVP is live."
2. Send announcement to early access users (if applicable).
3. Monitor support channels for user feedback.
4. Enable public signup (if gated during testing).

**Post-launch monitoring:**
- First 24 hours: Active monitoring (admin on-call).
- First week: Daily review of Sentry errors, PostHog funnels, admin dashboard metrics.
- First month: Weekly review, iterate based on user feedback.

---

## Post-Launch Maintenance

### Regular Monitoring

**Daily:**
- Check admin dashboard for anomalies.
- Review Sentry errors (triage and assign).
- Check alert emails (investigate any alerts fired).

**Weekly:**
- Review PostHog dashboards (conversion rates, user retention).
- Check R2 storage growth (ensure lifecycle rules are working).
- Review Cloud Monitoring dashboards (latency trends, cost trends).

**Monthly:**
- Review Neon database size and connection pool utilization.
- Review Cloud Tasks queue performance (identify bottlenecks).
- Review Sentry and PostHog usage (adjust sampling rates if needed for cost).

### Incident Response

**On alert:**
1. Check the alert email for the specific condition (5xx rate, queue backlog, etc.).
2. Open Cloud Monitoring and Sentry dashboards.
3. If the issue is deployment-related: rollback to previous revision.
4. If the issue is external (Kie AI outage, Neon downtime): check vendor status pages, wait for recovery, monitor queue backlog.
5. If the issue is abuse (rate limiting): check admin dashboard security panel, block offending IPs if necessary.

**Postmortem:**
- After any incident: write a postmortem (what happened, root cause, mitigation, prevention).
- Update runbooks and monitoring thresholds based on learnings.

---

## Files Created/Modified

### Files Modified
- `scripts/validate-gcp-setup.sh` — Extended with Cloud Run health, custom domain TLS (`status.certificateStatus`), Cloud Scheduler enabled state, and Cloud Monitoring alert policy checks. Uses `gcloud beta` for monitoring stability.

### Files Created
- `scripts/test-rollback.sh` — Automated rollback test: deploys broken revision, shifts 10% traffic, rolls back, verifies. Exits non-zero on any failure. Requires pre-built broken Docker image in Artifact Registry.
- `docs/runbooks/rollback-procedure.md` — Covers Cloud Run rollback (node-api + python-orchestrator), database migration rollback (expand-contract, reverse migration, Neon PITR), and Cloud Tasks rollback. All commands include explicit `--project` flags.
- `docs/launch-checklist.md` — Step-by-step launch sequence with inline rollback commands at each abort point. Canary deployment for both node-api and python-orchestrator. Uses Secret Manager for DATABASE_URL instead of plaintext.

## Implementation Deviations from Plan

1. **TLS certificate check**: Plan used `status.conditions[0].status`. Implementation uses `status.certificateStatus` which is the correct field for TLS status specifically.
2. **Artifact Registry**: Plan used deprecated `gcr.io`. Implementation uses `${REGION}-docker.pkg.dev` consistent with the rest of the infrastructure.
3. **Test rollback exits non-zero**: Plan script used `|| true` to suppress failures. Implementation exits 1 on deploy or traffic-split failure to avoid false-pass results.
4. **Python orchestrator included**: Plan focused on node-api only. Launch checklist and runbook now include canary deployment for python-orchestrator as well.
5. **Secret Manager for DB URL**: Plan showed `DATABASE_URL="<PROD_URL>"` in shell commands. Implementation uses `gcloud secrets versions access` to avoid shell history exposure.
6. **Cloud Scheduler state**: Plan only checked existence. Implementation verifies ENABLED state.
7. **Duplicate secretAccessor check removed**: Plan had a section 13 check that duplicated section 4 (line 88-91). Removed.

### Scripts to Create

**1. `scripts/validate-gcp-setup.sh`**

Extend the existing validation script (from Section 1) to include:
- Check Cloud Run services exist and are healthy.
- Check custom domain mapping status and TLS certificate.
- Check Cloud Scheduler jobs are enabled.
- Check Secret Manager secrets are accessible from Cloud Run (via service account permissions).

Stub:
```bash
#!/bin/bash
# Validates full GCP production setup

set -e

PROJECT_ID="${GCP_PROJECT_ID:-smartspecpro-mvp}"
REGION="${GCP_REGION:-asia-southeast1}"

echo "Validating GCP setup for project: $PROJECT_ID"

# Check Cloud Run services
echo "Checking Cloud Run services..."
gcloud run services describe node-api --region=$REGION --project=$PROJECT_ID > /dev/null
gcloud run services describe python-orchestrator --region=$REGION --project=$PROJECT_ID > /dev/null

# Check custom domain
echo "Checking custom domain mapping..."
DOMAIN_STATUS=$(gcloud run domain-mappings describe --domain=app.smartaihub.app --region=$REGION --project=$PROJECT_ID --format="value(status.certificateStatus)" || echo "NOT_FOUND")
if [ "$DOMAIN_STATUS" != "ACTIVE" ]; then
  echo "ERROR: Domain mapping not active. Status: $DOMAIN_STATUS"
  exit 1
fi

# Check Cloud Tasks queues
echo "Checking Cloud Tasks queues..."
for QUEUE in media-jobs video-jobs-short video-jobs-long workflow-tasks polling-tasks periodic-tasks; do
  gcloud tasks queues describe $QUEUE --location=$REGION --project=$PROJECT_ID > /dev/null
done

# Check Secret Manager secrets
echo "Checking Secret Manager secrets..."
for SECRET in DATABASE_URL REDIS_UPSTASH_URL REDIS_MEMORYSTORE_URL LLM_ENCRYPTION_KEY JWT_SECRET KIE_AI_API_KEY; do
  gcloud secrets describe $SECRET --project=$PROJECT_ID > /dev/null
done

echo "All checks passed!"
```

**2. `scripts/test-rollback.sh`**

Automate rollback testing (for use in staging environment):

Stub:
```bash
#!/bin/bash
# Tests Cloud Run rollback procedure

set -e

SERVICE="node-api"
REGION="asia-southeast1"
PROJECT_ID="${GCP_PROJECT_ID:-smartspecpro-mvp}"

echo "Testing rollback for service: $SERVICE"

# Get current healthy revision
HEALTHY_REVISION=$(gcloud run services describe $SERVICE --region=$REGION --project=$PROJECT_ID --format="value(status.traffic[0].revisionName)")
echo "Current healthy revision: $HEALTHY_REVISION"

# Deploy a broken revision (health check fails)
echo "Deploying broken revision..."
gcloud run deploy $SERVICE \
  --image=gcr.io/$PROJECT_ID/$SERVICE:broken-test \
  --region=$REGION \
  --project=$PROJECT_ID \
  --no-traffic

BROKEN_REVISION=$(gcloud run services describe $SERVICE --region=$REGION --project=$PROJECT_ID --format="value(status.latestReadyRevisionName)")
echo "Broken revision: $BROKEN_REVISION"

# Shift 10% traffic to broken revision
echo "Shifting 10% traffic to broken revision..."
gcloud run services update-traffic $SERVICE \
  --to-revisions=$BROKEN_REVISION=10,$HEALTHY_REVISION=90 \
  --region=$REGION \
  --project=$PROJECT_ID

# Wait 30 seconds to observe error spike
echo "Waiting 30 seconds to observe error spike..."
sleep 30

# Rollback to 100% healthy revision
echo "Rolling back to 100% healthy revision..."
gcloud run services update-traffic $SERVICE \
  --to-revisions=$HEALTHY_REVISION=100 \
  --region=$REGION \
  --project=$PROJECT_ID

# Verify rollback
echo "Verifying rollback..."
CURRENT_REVISION=$(gcloud run services describe $SERVICE --region=$REGION --project=$PROJECT_ID --format="value(status.traffic[0].revisionName)")
if [ "$CURRENT_REVISION" == "$HEALTHY_REVISION" ]; then
  echo "Rollback successful!"
else
  echo "ERROR: Rollback failed. Current revision: $CURRENT_REVISION"
  exit 1
fi

# Clean up broken revision
echo "Cleaning up broken revision..."
gcloud run revisions delete $BROKEN_REVISION --region=$REGION --project=$PROJECT_ID --quiet

echo "Rollback test completed successfully!"
```

**3. `docs/runbooks/rollback-procedure.md`**

Document all rollback scenarios and exact commands. Stub:

```markdown
# Rollback Procedures

## Cloud Run Service Rollback

**When to use:** Deployment causes errors, crashes, or unexpected behavior.

**Steps:**
1. Identify previous healthy revision: `gcloud run revisions list --service=node-api --region=asia-southeast1`
2. Route 100% traffic: `gcloud run services update-traffic node-api --to-revisions=REVISION_NAME=100 --region=asia-southeast1`
3. Verify: Check Cloud Monitoring and test endpoints.

**Timeline:** <60 seconds.

## Database Migration Rollback

**When to use:** Migration causes schema errors or data corruption.

**Steps:**
1. Code rollback (as above).
2. If needed: Neon PITR restore (data loss) or manual reverse migration (safer).

**Timeline:** 10-30 minutes.

## Cloud Tasks Rollback

**Automatic:** Service rollback fixes task handlers. Retries hit the fixed version.
```

**4. `docs/launch-checklist.md`**

Operational checklist for launch day. Copy of the launch sequence section formatted as a checklist.

---

## Dependencies

This section depends on all previous sections (1-19) being complete. Specifically:

- **Section 1:** GCP project and infrastructure must exist.
- **Section 2:** Docker images must build successfully and deploy to Cloud Run.
- **Section 3:** Database schema must be finalized and migrated.
- **Section 16:** CI/CD pipeline must support canary deployments.
- **Section 17:** Cloud Monitoring dashboards and alerts must be configured.
- **Section 18:** Load testing must validate the system can handle target scale.
- **Section 12, 13, 14:** Sentry, PostHog, and admin dashboard must be functional for launch monitoring.

---

## Success Criteria

- [ ] Custom domain `app.smartaihub.app` is mapped to Cloud Run with active TLS certificate.
- [ ] All 10 hardening checklist items verified and documented.
- [ ] Rollback procedure tested in staging (broken revision → rollback → healthy state).
- [ ] DLQ tested and verified (failed task → dead letter record → admin alert).
- [ ] Launch sequence executed successfully (10% → 50% → 100% canary with no critical errors).
- [ ] Production environment is live and serving traffic.
- [ ] Incident response runbook created and team briefed.