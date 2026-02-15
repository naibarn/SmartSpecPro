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

### 11. Incident Response Ready
- [ ] Incident Response Plan reviewed by team (`docs/incident-response-plan.md`)
- [ ] On-call schedule established (PagerDuty/Slack rotations)
- [ ] Escalation contacts identified and verified (phone numbers tested)
- [ ] Alert response runbooks reviewed (`docs/runbooks/alert-response.md`)
- [ ] Incident channel naming convention agreed (`#incident-YYYYMMDD-HHmm-description`)
- [ ] Postmortem template ready for use
- [ ] Team trained on rollback procedures (simulated in staging)

### 12. Backup & Recovery Verified
- [ ] Backup restore test completed on staging (`docs/runbooks/backup-restore-testing.md`)
- [ ] PostgreSQL PITR restore tested (Neon branch restore < 30 min)
- [ ] RTO target (30 min) achievable and documented
- [ ] RPO target (1 hour) verified with Neon PITR granularity
- [ ] Application connectivity tested with restored database
- [ ] Encrypted data decryptable after restore (LLM_ENCRYPTION_KEY verified)
- [ ] Monthly backup test scheduled (first Tuesday of each month)

### 13. Auto-Rollback Configured
- [ ] Canary monitoring script created (`scripts/canary-monitor.sh`)
- [ ] Auto-rollback thresholds documented and agreed (5% error rate, 2000ms latency)
- [ ] Rollback triggers tested in staging (forced errors, forced latency)
- [ ] Manual override procedure documented (`docs/runbooks/auto-rollback.md`)
- [ ] Slack webhook configured for rollback alerts
- [ ] PagerDuty integration tested (alert fires on rollback)
- [ ] GitHub Actions workflow includes canary stages (10% → 50% → 100%)

### 14. Secret Rotation Schedule
- [ ] Secret rotation schedule documented (`docs/runbooks/secret-rotation.md`)
- [ ] JWT_SECRET rotation procedure tested (dual-key overlap)
- [ ] DATABASE_URL rotation procedure tested (password change + service restart)
- [ ] Calendar reminders set for quarterly JWT rotation
- [ ] LLM_ENCRYPTION_KEY backup stored offline (encrypted USB drive)
- [ ] External API key rotation contacts identified (OpenAI, Anthropic, etc.)

### 15. SLA Monitoring Active
- [ ] SLA targets documented and published (`docs/sla-targets.md`)
- [ ] Uptime target: 99.5% monthly (allows 3.65 hours downtime)
- [ ] Latency targets: p95 < 500ms, p99 < 2000ms
- [ ] Error rate target: < 1% (5xx errors, 1-hour window)
- [ ] Cloud Monitoring dashboard tracks SLA metrics in real-time
- [ ] Weekly SLA report scheduled (Cloud Function + email)
- [ ] Monthly SLA review meeting scheduled (first Monday of month)
- [ ] Customer SLA credit calculation procedure documented

## Post-Launch Monitoring

**Real-Time (During Launch):**
- Cloud Monitoring dashboard (error rate, latency, instance count)
- Sentry real-time errors (filter by release tag)
- PostHog live events (user activity, client errors)
- Slack #alerts channel (Cloud Monitoring notifications)

**Daily (First Week):**
- Admin dashboard review
- Sentry error trends (group by error type)
- Alert email summary
- Support ticket volume
- SLA metrics (uptime %, error rate, p95 latency)

**Weekly (Ongoing):**
- PostHog dashboards (user engagement, feature usage)
- R2 storage usage and costs
- Cloud Monitoring trends (7-day view)
- Queue performance (backlog, failure rate)
- Database growth rate

**Monthly (Ongoing):**
- Database size and query performance
- Sentry/PostHog usage vs. quota
- Cloud costs analysis (Cloud Run, Neon, Upstash, R2)
- SLA review meeting (see `docs/sla-targets.md`)
- Backup test execution (see `docs/runbooks/backup-restore-testing.md`)
- Incident retrospective (review all P1/P2 incidents)

**Quarterly (Strategic Review):**
- Disaster recovery simulation (full restore test)
- Infrastructure capacity planning
- Secret rotation (JWT_SECRET)
- Security audit and penetration testing
- Dependency updates and vulnerability scanning
