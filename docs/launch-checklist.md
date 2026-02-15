# SmartSpecPro Production Launch Checklist

## Pre-Launch Verification

- [ ] All sections 1-19 complete and tested
- [ ] Load testing (Section 19) passed with target metrics
- [ ] All hardening checklist items verified (see below)
- [ ] Rollback procedure tested in staging
- [ ] Admin team briefed on monitoring dashboards
- [ ] Incident response contacts identified

## Hardening Checklist

### 1. Secrets in Secret Manager
- [ ] `scripts/validate-gcp-setup.sh` passes all checks
- [ ] No plaintext secrets in Docker images
- [ ] No plaintext secrets in Cloud Run env vars (only Secret Manager refs)
- [ ] No hardcoded credentials in source code

### 2. HTTPS Everywhere
- [ ] Cloud Run rejects HTTP (redirects to HTTPS)
- [ ] No internal HTTP calls (except localhost)

### 3. Rate Limiting Active
- [ ] Login rate limit triggers at 5 req/min (HTTP 429)
- [ ] Job creation rate limit triggers at 10 req/min
- [ ] Upstash Redis rate limit keys have correct TTLs

### 4. R2 Lifecycle Rules Active
- [ ] `temp/*` expires after 12 days
- [ ] `renders/preview/*` expires after 7 days
- [ ] Incomplete multipart uploads abort after 1 day
- [ ] `gallery/*` has no expiration

### 5. Alerting Tested
- [ ] High 5xx rate alert fires and email delivered
- [ ] Job failure rate alert fires
- [ ] Queue backlog alert fires at depth > 100
- [ ] Auth failure rate alert fires

### 6. Sentry Verified
- [ ] Frontend project receives test error with correct release tag
- [ ] Node.js project receives test error with environment tag
- [ ] Python project receives test error
- [ ] PII scrubbing active (no passwords, auth headers in events)

### 7. PostHog Verified
- [ ] Client-side events appear in dashboard
- [ ] Server-side events appear in dashboard
- [ ] Correct distinct_id correlation

### 8. Cloud Monitoring Verified
- [ ] Services dashboard shows live data
- [ ] Jobs dashboard shows live data
- [ ] Alert policies are armed
- [ ] Notification channels configured

### 9. DLQ Tested
- [ ] Failed task writes to `cloud_task_events` with `status='dead_letter'`
- [ ] Admin receives email alert for dead letter tasks

### 10. Rollback Tested
- [ ] `scripts/test-rollback.sh` passes on staging
- [ ] Rollback completes in < 60 seconds
- [ ] No data loss during rollback

## Launch Sequence

### Step 1: Deploy to Staging
```bash
# Merge feature branch, GHA deploys to staging
pnpm test && pytest && pnpm test:e2e
```
- [ ] All tests pass
- [ ] Staging environment functional
- [ ] No Sentry errors

### Step 2: Migrate Production Database
```bash
# Take Neon snapshot first (in console: pre-launch-backup-YYYY-MM-DD)

# Fetch DATABASE_URL from Secret Manager (avoid shell history exposure)
export DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)

cd apps/web && pnpm db:push
cd python-backend && alembic upgrade head
```
- [ ] Migrations apply cleanly
- [ ] Seed data exists (admin user, default tenant)

### Step 3: Deploy with 10% Canary
```bash
git tag v1.0.0-prod && git push origin v1.0.0-prod
# GHA builds and pushes images

# Deploy node-api canary
gcloud run deploy node-api \
  --image=asia-southeast1-docker.pkg.dev/smartspecpro-mvp/smartspecpro/node-api:v1.0.0-prod \
  --region=asia-southeast1 --project=smartspecpro-mvp --tag=canary --no-traffic

gcloud run services update-traffic node-api \
  --to-revisions=canary=10,LATEST=90 --region=asia-southeast1 --project=smartspecpro-mvp

# Deploy python-orchestrator canary
gcloud run deploy python-orchestrator \
  --image=asia-southeast1-docker.pkg.dev/smartspecpro-mvp/smartspecpro/python-orchestrator:v1.0.0-prod \
  --region=asia-southeast1 --project=smartspecpro-mvp --tag=canary --no-traffic

gcloud run services update-traffic python-orchestrator \
  --to-revisions=canary=10,LATEST=90 --region=asia-southeast1 --project=smartspecpro-mvp
```
**Monitor 30 minutes:**
- [ ] Error rate < 1%
- [ ] p95 latency < 500ms
- [ ] No critical Sentry errors
- [ ] PostHog events flowing

**Abort if:** Error rate > 5%, critical errors, job failures > 20%
```bash
# ROLLBACK: Route all traffic to previous revision
gcloud run services update-traffic node-api --to-revisions=LATEST=100 --region=asia-southeast1 --project=smartspecpro-mvp
gcloud run services update-traffic python-orchestrator --to-revisions=LATEST=100 --region=asia-southeast1 --project=smartspecpro-mvp
```

### Step 4: Shift to 50% Traffic
```bash
gcloud run services update-traffic node-api \
  --to-revisions=canary=50,LATEST=50 --region=asia-southeast1 --project=smartspecpro-mvp
gcloud run services update-traffic python-orchestrator \
  --to-revisions=canary=50,LATEST=50 --region=asia-southeast1 --project=smartspecpro-mvp
```
**Monitor 15 minutes:**
- [ ] Same metrics as Step 3
- [ ] No queue backlogs
- [ ] No connection pool exhaustion

**Abort if:** Same criteria as Step 3
```bash
# ROLLBACK
gcloud run services update-traffic node-api --to-revisions=LATEST=100 --region=asia-southeast1 --project=smartspecpro-mvp
gcloud run services update-traffic python-orchestrator --to-revisions=LATEST=100 --region=asia-southeast1 --project=smartspecpro-mvp
```

### Step 5: Shift to 100% Traffic
```bash
gcloud run services update-traffic node-api \
  --to-revisions=canary=100 --region=asia-southeast1 --project=smartspecpro-mvp
gcloud run services update-traffic python-orchestrator \
  --to-revisions=canary=100 --region=asia-southeast1 --project=smartspecpro-mvp
```
**Monitor 60 minutes:**
- [ ] All metrics stable
- [ ] No alerts fired
- [ ] User-reported issues: none/minimal

### Step 6: Announce Launch
- [ ] Update status page
- [ ] Notify early access users
- [ ] Enable public signup (if gated)
- [ ] Admin on-call for first 24 hours

## Emergency Rollback

```bash
# Identify previous healthy revision
gcloud run revisions list --service=node-api --region=asia-southeast1

# Immediate rollback
gcloud run services update-traffic node-api \
  --to-revisions=<HEALTHY_REVISION>=100 --region=asia-southeast1
```

## Post-Launch Monitoring

**Daily:** Admin dashboard, Sentry errors, alert emails
**Weekly:** PostHog dashboards, R2 storage, Cloud Monitoring trends
**Monthly:** Database size, queue performance, Sentry/PostHog usage/cost
