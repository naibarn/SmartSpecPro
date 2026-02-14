# Staging Deployment Guide - Silence Detection Feature

## Overview

This guide provides step-by-step instructions for deploying the silence detection feature to staging environment for beta testing.

## Pre-Deployment Checklist

### Code Readiness
- [x] All unit tests passing (58 tests)
- [x] Integration tests passing (7 tests)
- [x] TypeScript check passing
- [x] Code review complete
- [x] Documentation complete
- [ ] Security audit complete
- [ ] Load testing complete

### Infrastructure Readiness
- [ ] Staging environment provisioned
- [ ] FFmpeg 4.4+ installed on all workers
- [ ] Celery workers configured and running
- [ ] Database migrations ready
- [ ] Redis configured for job queue
- [ ] Monitoring/logging configured

## Deployment Plan

### Phase 1: Database Migrations (if needed)

**Note**: This feature doesn't require schema changes, but verify existing tables are ready.

```bash
cd /home/dev/projects/SmartSpecPro

# Check current schema
psql $STAGING_DATABASE_URL -c "\d media_tasks"

# Verify media_job_worker handler is registered
# No migrations needed for this feature
```

### Phase 2: Backend Deployment

#### Step 1: Deploy Python Backend

```bash
cd python-backend

# Activate virtual environment
source .venv/bin/activate

# Run tests one final time
pytest tests/test_dead_air_cut.py -v
pytest tests/test_dead_air_cut_integration.py -v --no-cov

# Check FFmpeg availability on staging
ssh staging-worker-1 "ffmpeg -version"

# Build and deploy
# (Adjust for your deployment method: Docker, systemd, etc.)

# Option A: Docker
docker build -t smartspec-backend:silence-v1 .
docker push your-registry/smartspec-backend:silence-v1

# Update staging deployment
kubectl set image deployment/backend backend=your-registry/smartspec-backend:silence-v1

# Option B: Direct deploy
rsync -avz app/ staging-server:/opt/smartspec-backend/app/
ssh staging-server "sudo systemctl restart smartspec-backend"

# Verify deployment
curl -X POST https://staging.smartaihub.app/api/v1/media/jobs \
  -H "Authorization: Bearer $STAGING_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "specVersion": "0.1",
    "jobId": "health-check-001",
    "jobType": "dead_air_cut",
    "inputs": {"assets": [{"assetId": "test", "kind": "video", "uri": "https://staging.smartaihub.app/test.mp4"}]},
    "params": {"segments": [], "mode": "remove", "softeningBufferMs": 0, "crossfade": false},
    "output": {"mode": "file", "target": "output.mp4"}
  }'
```

#### Step 2: Restart Celery Workers

```bash
# Restart all workers to load new code
ssh staging-worker-1 "sudo systemctl restart celery-worker"
ssh staging-worker-2 "sudo systemctl restart celery-worker"

# Verify workers are running
celery -A app.core.celery_app inspect active --broker=redis://staging-redis:6379/0

# Check worker logs
ssh staging-worker-1 "sudo journalctl -u celery-worker -f"
```

### Phase 3: Frontend Deployment

#### Step 1: Build Frontend

```bash
cd /home/dev/projects/SmartSpecPro/apps/web

# Run tests
npm test -- mediaJobClient.test.ts

# Type check
npm run check

# Build for staging
NODE_ENV=staging npm run build

# Verify build
ls -lh dist/
```

#### Step 2: Deploy to Staging

```bash
# Option A: Static hosting (S3, Cloudflare Pages)
aws s3 sync dist/ s3://staging-smartspec-web/
aws cloudfront create-invalidation --distribution-id XXX --paths "/*"

# Option B: Container
docker build -t smartspec-web:silence-v1 .
docker push your-registry/smartspec-web:silence-v1
kubectl set image deployment/web web=your-registry/smartspec-web:silence-v1

# Option C: Direct deploy
rsync -avz dist/ staging-server:/var/www/smartspec/
ssh staging-server "sudo systemctl reload nginx"
```

### Phase 4: Smoke Tests

#### Test 1: Health Check
```bash
# Backend health
curl https://staging.smartaihub.app/api/health

# Frontend
curl https://staging.smartaihub.app/

# Expected: 200 OK
```

#### Test 2: Basic Export Flow

**Automated smoke test:**
```bash
#!/bin/bash
# smoke-test.sh

set -e

BASE_URL="https://staging.smartaihub.app"
TOKEN="$STAGING_TOKEN"

echo "=== Smoke Test: Silence Detection ==="

# 1. Upload test video
echo "Uploading test video..."
VIDEO_URL=$(curl -X POST "$BASE_URL/api/v1/assets/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@test-video.mp4" \
  | jq -r '.url')

echo "Video URL: $VIDEO_URL"

# 2. Submit dead_air_cut job
echo "Submitting job..."
JOB_ID=$(curl -X POST "$BASE_URL/api/v1/media/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "specVersion": "0.1",
    "jobId": "smoke-test-'$(date +%s)'",
    "jobType": "dead_air_cut",
    "inputs": {
      "assets": [{"assetId": "test", "kind": "video", "uri": "'$VIDEO_URL'"}]
    },
    "params": {
      "segments": [{"startMs": 5000, "endMs": 10000}],
      "mode": "remove",
      "softeningBufferMs": 200,
      "crossfade": true
    },
    "output": {"mode": "file", "target": "output.mp4"}
  }' | jq -r '.jobId')

echo "Job ID: $JOB_ID"

# 3. Poll for completion
echo "Waiting for completion..."
for i in {1..60}; do
  STATUS=$(curl -s "$BASE_URL/api/v1/media/jobs/$JOB_ID" \
    -H "Authorization: Bearer $TOKEN" \
    | jq -r '.status')

  echo "[$i] Status: $STATUS"

  if [ "$STATUS" = "completed" ]; then
    echo "✅ Smoke test PASSED"
    exit 0
  elif [ "$STATUS" = "failed" ]; then
    echo "❌ Smoke test FAILED"
    exit 1
  fi

  sleep 2
done

echo "❌ Smoke test TIMEOUT"
exit 1
```

**Run smoke test:**
```bash
chmod +x smoke-test.sh
./smoke-test.sh
```

#### Test 3: Frontend UI Test

**Manual steps:**
1. Open https://staging.smartaihub.app
2. Login with test account
3. Upload a video
4. Click "Silence Detection" button
5. Verify settings panel appears
6. Click "Detect Silence"
7. Verify regions appear in list
8. Toggle preview mode
9. Click "Export to Timeline"
10. Wait for completion
11. Verify output plays correctly

**Expected**: All steps complete without errors

### Phase 5: Configuration

#### Feature Flag (if applicable)

```javascript
// apps/web/client/src/config/features.ts
export const FEATURES = {
  silenceDetection: {
    enabled: process.env.VITE_FEATURE_SILENCE_DETECTION === 'true',
    betaUsers: ['user1@example.com', 'user2@example.com'], // Optional whitelist
  },
};
```

**Enable for staging:**
```bash
# Set environment variable
VITE_FEATURE_SILENCE_DETECTION=true npm run build
```

#### Monitoring Setup

**Backend metrics (Prometheus):**
```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'smartspec-backend'
    static_configs:
      - targets: ['staging-backend:8000']
    metrics_path: '/metrics'
```

**Logging (structured logs):**
```python
# Ensure logs include job_type for filtering
logger.info("Job started", extra={
    "job_id": job_id,
    "job_type": "dead_air_cut",
    "user_id": user_id,
    "segments": len(segments)
})
```

**Alerts (Grafana/Alertmanager):**
```yaml
# alerts.yml
groups:
  - name: silence_detection
    rules:
      - alert: HighFailureRate
        expr: |
          sum(rate(media_job_failures{job_type="dead_air_cut"}[5m]))
          / sum(rate(media_job_total{job_type="dead_air_cut"}[5m])) > 0.1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Dead air cut failure rate > 10%"

      - alert: SlowProcessing
        expr: |
          histogram_quantile(0.95,
            rate(media_job_duration_seconds_bucket{job_type="dead_air_cut"}[5m])
          ) > 300
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "P95 processing time > 5 minutes"
```

## Beta Testing Plan

### Beta User Selection

**Criteria:**
- Active users (>10 videos edited/month)
- Diverse use cases (podcasts, tutorials, interviews)
- Willing to provide feedback
- Available for support

**Target**: 10-20 beta users

**Invitation email template:**
```
Subject: Try Our New Silence Detection Feature (Beta)

Hi [Name],

We've built a new feature that automatically detects and removes silence
from your videos. You're invited to try it in our staging environment!

What it does:
- Automatically finds long pauses in audio
- Preview silence removal before committing
- Export with smooth transitions and audio crossfade

How to access:
1. Go to https://staging.smartaihub.app
2. Login with your regular credentials
3. Look for the "Silence Detection" button in the video editor

What we need:
- Try it on 2-3 of your real videos
- Fill out this feedback form: [link]
- Report any bugs: [link]

Beta period: 2 weeks (Feb 13 - Feb 27)

Questions? Reply to this email.

Thanks for helping us build better tools!
- The SmartSpec Team
```

### Beta Feedback Collection

**Survey questions:**
1. How many videos did you process? _____
2. Did the feature save you time? YES / NO / UNSURE
3. How accurate was the detection? (1-5)
4. How easy was it to use? (1-5)
5. Did you encounter any bugs? Describe: _____
6. What would make this better? _____
7. Would you use this in production? YES / NO / MAYBE

**Bug report template:**
```
Title: [Brief description]

Steps to reproduce:
1.
2.
3.

Expected: _____
Actual: _____

Video details:
- Duration: _____
- Format: _____
- Size: _____

Browser: _____
Screenshot: [attach if possible]
```

### Beta Metrics to Track

| Metric | Target | Actual | Notes |
|--------|--------|--------|-------|
| Beta users invited | 20 | _____ | |
| Beta users active | >15 | _____ | At least 1 video processed |
| Videos processed | >50 | _____ | |
| Success rate | >90% | _____% | |
| Bug reports | <10 | _____ | |
| Survey responses | >12 | _____ | |
| Satisfaction score | >4.0 | _____ | |

## Rollback Plan

**If critical issues are found during beta:**

### Immediate Rollback

```bash
# Option 1: Feature flag
# Disable feature flag in environment
VITE_FEATURE_SILENCE_DETECTION=false npm run build
# Redeploy frontend

# Option 2: Code rollback
git revert <deployment-commit>
npm run build
# Redeploy

# Option 3: Infrastructure rollback
kubectl rollout undo deployment/backend
kubectl rollout undo deployment/web
```

### Partial Rollback

**If only backend has issues:**
```bash
# Rollback backend only
kubectl rollout undo deployment/backend

# Frontend still works, but export button disabled
```

**If only frontend has issues:**
```bash
# Rollback frontend only
kubectl rollout undo deployment/web

# Backend API still works for API clients
```

## Post-Deployment Checklist

### Day 1 (Deployment Day)

- [ ] Deployment complete
- [ ] Smoke tests passed
- [ ] Monitoring dashboards show green
- [ ] No errors in logs
- [ ] Beta invitations sent
- [ ] Support team notified

### Week 1

- [ ] Daily log review (errors, warnings)
- [ ] Monitor performance metrics
- [ ] Track beta user activity
- [ ] Respond to bug reports within 24h
- [ ] Collect feedback survey responses

### Week 2

- [ ] Review all feedback
- [ ] Analyze metrics vs targets
- [ ] Identify improvements needed
- [ ] Decide: Go to production / Fix issues / Cancel feature
- [ ] Plan production rollout (if approved)

## Production Promotion Criteria

**Feature can be promoted to production if:**

### Must Have (All Required)
- [ ] Beta period complete (2 weeks minimum)
- [ ] No P0/P1 bugs outstanding
- [ ] Success rate >90% in beta
- [ ] User satisfaction >4.0/5.0
- [ ] Security audit passed
- [ ] Load testing passed (10+ users)
- [ ] Documentation complete

### Nice to Have
- [ ] >50 videos processed in beta
- [ ] Positive feedback from majority
- [ ] No rollbacks during beta
- [ ] Performance metrics within targets

## Contact List

**For issues during deployment:**
- **DevOps Lead**: [name] - [email] - [phone]
- **Backend Owner**: [name] - [email] - [phone]
- **Frontend Owner**: [name] - [email] - [phone]
- **Product Manager**: [name] - [email] - [phone]
- **On-Call Engineer**: [rotation] - [pagerduty link]

## Deployment Sign-Off

**Pre-Deployment Approval:**
- [ ] Tech Lead: _______________ Date: _____
- [ ] DevOps Lead: _______________ Date: _____
- [ ] Product Manager: _______________ Date: _____

**Deployment Verification:**
- [ ] Deployed by: _______________ Date: _____
- [ ] Smoke tests: PASS / FAIL
- [ ] Monitoring: GREEN / YELLOW / RED
- [ ] Logs: CLEAN / WARNINGS / ERRORS

**Beta Completion:**
- [ ] Beta period complete: _______________ Date: _____
- [ ] Metrics reviewed: PASS / FAIL
- [ ] Promotion approved: YES / NO / NEEDS FIXES

**Signed**: _______________ **Date**: ___________
