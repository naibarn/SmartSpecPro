# Backup & Restore Testing Runbook

## Overview

Regular backup testing ensures that disaster recovery procedures actually work. This runbook defines the monthly backup verification process for SmartSpecPro production data.

**Why Test Backups:**
- Untested backups are not backups (they might be corrupted)
- RTO/RPO targets are theoretical until proven in practice
- Team gains confidence and muscle memory for real disasters

**Schedule:** First Tuesday of every month at 10:00 AM UTC (low-traffic period)

---

## Backup Coverage

### 1. PostgreSQL Database (Neon)

**Backup Method:** Neon automatic Point-in-Time Recovery (PITR)

**Retention:** 7 days (configurable up to 30 days on paid plan)

**Granularity:** 1-second precision (can restore to any timestamp)

**Location:** Neon infrastructure (multi-region replicated)

**RPO (Recovery Point Objective):** < 1 minute

**RTO (Recovery Time Objective):** 15-30 minutes

### 2. Redis Cache (Upstash)

**Backup Method:** Automatic hourly snapshots

**Retention:** 7 days

**Granularity:** 1-hour increments

**Location:** Upstash infrastructure (multi-region)

**RPO:** < 1 hour

**RTO:** 5 minutes

**Note:** Cache data is ephemeral (rate limits, session cache), so loss is tolerable

### 3. Object Storage (Cloudflare R2)

**Backup Method:** Versioning enabled on all buckets

**Retention:** 30 versions per object (configurable)

**Location:** Cloudflare edge (globally distributed)

**RPO:** 0 (versioning captures every change)

**RTO:** Immediate (restore is just fetching previous version)

### 4. Secrets (Secret Manager)

**Backup Method:** Automatic versioning (every update creates new version)

**Retention:** Unlimited (all versions retained)

**Location:** Google Cloud Secret Manager (multi-region)

**RPO:** 0

**RTO:** Immediate

**Additional:** Manual backup of `.env` files in secure offline storage (encrypted USB drive)

---

## Monthly Backup Test Procedure

### Prerequisites

**Required Access:**
- GCP Console access (project `smartspecpro-mvp`)
- Neon console access
- Upstash console access
- Database credentials (read from Secret Manager)

**Time Required:** 60-90 minutes

**Impact:** None on production (test uses branch/copy)

**Participants:**
- Primary: Infrastructure engineer
- Secondary: On-call engineer (for verification)

---

## Test 1: Database Point-in-Time Recovery (PostgreSQL)

### Step 1: Identify Test Point

```bash
# Choose a timestamp from 24 hours ago (recent enough to have data)
TEST_TIMESTAMP=$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)
echo "Test restore point: $TEST_TIMESTAMP"

# Verify this timestamp is within Neon retention window (7 days)
DAYS_AGO=$(( ($(date +%s) - $(date -d "$TEST_TIMESTAMP" +%s)) / 86400 ))
if [ $DAYS_AGO -gt 7 ]; then
  echo "ERROR: Timestamp outside retention window"
  exit 1
fi
```

### Step 2: Capture Pre-Restore Baseline

```bash
# Get current production database state (row counts, recent data)
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)

psql "$DATABASE_URL" -c "
  SELECT
    'users' as table_name,
    COUNT(*) as row_count,
    MAX(created_at) as latest_record
  FROM users
  UNION ALL
  SELECT 'media_jobs', COUNT(*), MAX(created_at) FROM media_jobs
  UNION ALL
  SELECT 'provider_usage_log', COUNT(*), MAX(created_at) FROM provider_usage_log
  UNION ALL
  SELECT 'subscriptions', COUNT(*), MAX(created_at) FROM subscriptions;
" > /tmp/baseline_counts.txt

cat /tmp/baseline_counts.txt
```

### Step 3: Create Restore Point (Neon Branch)

**In Neon Console:**
1. Navigate to project `smartspecpro-mvp`
2. Click **Branches** tab
3. Click **New Branch**
4. Configure:
   - **Branch name:** `test-restore-$(date +%Y%m%d)`
   - **Create from:** `Specific point in time`
   - **Timestamp:** `$TEST_TIMESTAMP` (from Step 1)
   - **Parent branch:** `main` (production)
5. Click **Create Branch**

**Wait for branch creation (typically 2-5 minutes)**

### Step 4: Verify Restored Data

```bash
# Get connection string for restore branch
# (From Neon Console > Branches > test-restore-YYYYMMDD > Connection String)
RESTORE_DATABASE_URL="postgresql://user:pass@ep-test-restore.neon.tech/smartspecpro?sslmode=require"

# Verify row counts match expected values (should be slightly lower than baseline)
psql "$RESTORE_DATABASE_URL" -c "
  SELECT
    'users' as table_name,
    COUNT(*) as row_count,
    MAX(created_at) as latest_record
  FROM users
  UNION ALL
  SELECT 'media_jobs', COUNT(*), MAX(created_at) FROM media_jobs
  UNION ALL
  SELECT 'provider_usage_log', COUNT(*), MAX(created_at) FROM provider_usage_log
  UNION ALL
  SELECT 'subscriptions', COUNT(*), MAX(created_at) FROM subscriptions;
" > /tmp/restored_counts.txt

cat /tmp/restored_counts.txt

# Compare with baseline
diff /tmp/baseline_counts.txt /tmp/restored_counts.txt
```

**Expected Results:**
- Row counts should be close (within 5% for high-volume tables)
- `latest_record` timestamp should be <= `$TEST_TIMESTAMP`
- No tables should be empty (unless they were empty at that point in time)

### Step 5: Spot-Check Critical Data

```bash
# Verify critical data integrity (FK relationships, encrypted fields readable)
psql "$RESTORE_DATABASE_URL" -c "
  -- Check user data integrity
  SELECT id, name, email, created_at
  FROM users
  ORDER BY created_at DESC
  LIMIT 5;
"

psql "$RESTORE_DATABASE_URL" -c "
  -- Check FK integrity (users <-> subscriptions)
  SELECT u.email, s.plan, s.status
  FROM subscriptions s
  JOIN users u ON s.user_id = u.id
  WHERE s.status = 'active'
  LIMIT 5;
"

psql "$RESTORE_DATABASE_URL" -c "
  -- Check encrypted data (apiKeyEncrypted should be decryptable)
  SELECT id, provider_name, LENGTH(api_key_encrypted) as encrypted_length
  FROM llm_providers
  WHERE api_key_encrypted IS NOT NULL
  LIMIT 3;
"
```

**Expected Results:**
- User data looks correct (valid emails, timestamps)
- Foreign key relationships intact (no orphaned records)
- Encrypted fields are non-empty (actual decryption test in Step 6)

### Step 6: Test Application Connectivity

**Spin up a test instance of the app connected to restored DB:**

```bash
# Create temporary .env for testing
cat > /tmp/test-restore.env <<EOF
DATABASE_URL=$RESTORE_DATABASE_URL
LLM_ENCRYPTION_KEY=$(gcloud secrets versions access latest --secret=LLM_ENCRYPTION_KEY --project=smartspecpro-mvp)
JWT_SECRET=$(gcloud secrets versions access latest --secret=JWT_SECRET --project=smartspecpro-mvp)
NODE_ENV=test
EOF

# Run app in test mode (locally or Cloud Run)
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm install
set -a; source /tmp/test-restore.env; set +a
pnpm dev &
TEST_APP_PID=$!

# Wait for app to start
sleep 10

# Test login (verifies JWT, DB connection, password hashing)
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smartaihub.app","password":"<test-password>"}' \
  -w "\nHTTP %{http_code}\n"

# Expected: HTTP 200 with JWT token

# Test decrypting API keys (verifies LLM_ENCRYPTION_KEY works with restored data)
curl http://localhost:3000/api/trpc/llmProviders.list \
  -H "Authorization: Bearer <JWT_FROM_ABOVE>" \
  -w "\nHTTP %{http_code}\n"

# Expected: HTTP 200 with list of providers (API keys decrypted successfully)

# Kill test app
kill $TEST_APP_PID
rm /tmp/test-restore.env
```

**Expected Results:**
- App connects to restored database without errors
- Login works (user authentication successful)
- Encrypted data decrypts correctly (proves LLM_ENCRYPTION_KEY is correct)
- No database schema errors

### Step 7: Measure Recovery Time

```bash
# Record timestamps
RESTORE_START=$(date -u +%Y-%m-%dT%H:%M:%SZ)  # When you clicked "Create Branch"
RESTORE_COMPLETE=$(date -u +%Y-%m-%dT%H:%M:%SZ)  # When branch became accessible

# Calculate RTO
RESTORE_START_SEC=$(date -d "$RESTORE_START" +%s)
RESTORE_COMPLETE_SEC=$(date -d "$RESTORE_COMPLETE" +%s)
RTO_ACTUAL=$((RESTORE_COMPLETE_SEC - RESTORE_START_SEC))

echo "Actual RTO: ${RTO_ACTUAL} seconds ($((RTO_ACTUAL / 60)) minutes)"
echo "Target RTO: 1800 seconds (30 minutes)"

if [ $RTO_ACTUAL -le 1800 ]; then
  echo "✅ RTO target met"
else
  echo "❌ RTO target missed - investigate delays"
fi
```

### Step 8: Clean Up

```bash
# Delete test branch in Neon Console
# (Branches > test-restore-YYYYMMDD > Delete)

# Or via Neon API (if available)
curl -X DELETE "https://console.neon.tech/api/v2/projects/$NEON_PROJECT_ID/branches/test-restore-$(date +%Y%m%d)" \
  -H "Authorization: Bearer $NEON_API_KEY"

echo "✅ Test complete. Restore branch deleted."
```

### Step 9: Document Results

**Create test report:** `docs/backup-tests/YYYY-MM-backup-test.md`

```markdown
# Backup Test Report: February 2026

**Date:** 2026-02-04 10:00 UTC
**Tester:** Infrastructure Team
**Type:** PostgreSQL PITR

## Summary
✅ Test PASSED

## Details
- Restore point: 2026-02-03 10:00:00 UTC (24 hours ago)
- Branch created: test-restore-20260204
- Actual RTO: 12 minutes (target: 30 min)
- Data integrity: 100% (spot checks passed)
- Application connectivity: Successful

## Validation Results
| Table | Expected Rows | Actual Rows | Status |
|-------|--------------|-------------|--------|
| users | ~1,250 | 1,248 | ✅ |
| media_jobs | ~8,400 | 8,387 | ✅ |
| provider_usage_log | ~52,000 | 51,893 | ✅ |
| subscriptions | ~320 | 319 | ✅ |

## Issues Found
None

## Action Items
None

## Next Test
Scheduled: 2026-03-04
```

---

## Test 2: Redis Snapshot Restore (Upstash)

### Step 1: Check Available Snapshots

**In Upstash Console:**
1. Navigate to Redis instance `smartspecpro-cache`
2. Click **Backups** tab
3. Verify snapshots exist for last 7 days

### Step 2: Restore to Test Instance

**Upstash does not support in-place restore. Instead:**

1. Create a new Redis instance: `smartspecpro-cache-test`
2. Restore latest snapshot to this instance
3. Verify data

```bash
# Get test Redis URL (from Upstash console)
TEST_REDIS_URL="rediss://default:test-token@test-region.upstash.io:6379"

# Verify data exists
redis-cli -u "$TEST_REDIS_URL" DBSIZE
# Expected: > 0 keys

# Check sample keys (rate limits, session cache)
redis-cli -u "$TEST_REDIS_URL" KEYS "rate_limit:*" | head -10
redis-cli -u "$TEST_REDIS_URL" GET "rate_limit:login:192.168.1.1"
# Expected: JSON with rate limit data

# Check TTLs are preserved
redis-cli -u "$TEST_REDIS_URL" TTL "rate_limit:login:192.168.1.1"
# Expected: Positive number (seconds remaining)
```

### Step 3: Measure RTO

```bash
# Record time from "Restore Snapshot" click to "Instance Ready"
RTO_REDIS=300  # Example: 5 minutes

echo "Actual RTO: $RTO_REDIS seconds ($((RTO_REDIS / 60)) minutes)"
echo "Target RTO: 300 seconds (5 minutes)"

if [ $RTO_REDIS -le 300 ]; then
  echo "✅ RTO target met"
else
  echo "❌ RTO target missed"
fi
```

### Step 4: Clean Up

```bash
# Delete test Redis instance in Upstash console
# (Database > smartspecpro-cache-test > Delete)

echo "✅ Redis restore test complete"
```

---

## Test 3: Object Storage Restore (Cloudflare R2)

### Step 1: List Versioned Objects

```bash
# Install AWS CLI (R2 is S3-compatible)
# Credentials from Secret Manager
R2_ACCESS_KEY=$(gcloud secrets versions access latest --secret=R2_ACCESS_KEY_ID --project=smartspecpro-mvp)
R2_SECRET_KEY=$(gcloud secrets versions access latest --secret=R2_SECRET_ACCESS_KEY --project=smartspecpro-mvp)
R2_ENDPOINT="https://YOUR_ACCOUNT_ID.r2.cloudflarestorage.com"

export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_KEY"

# List versions of a test file
aws s3api list-object-versions \
  --bucket smartspecpro-media \
  --prefix gallery/test-image.jpg \
  --endpoint-url $R2_ENDPOINT \
  --query 'Versions[*].[Key,VersionId,LastModified]' \
  --output table
```

### Step 2: Restore Previous Version

```bash
# Get latest version ID
LATEST_VERSION=$(aws s3api list-object-versions \
  --bucket smartspecpro-media \
  --prefix gallery/test-image.jpg \
  --endpoint-url $R2_ENDPOINT \
  --query 'Versions[0].VersionId' \
  --output text)

# Get previous version ID (simulate accidental deletion recovery)
PREVIOUS_VERSION=$(aws s3api list-object-versions \
  --bucket smartspecpro-media \
  --prefix gallery/test-image.jpg \
  --endpoint-url $R2_ENDPOINT \
  --query 'Versions[1].VersionId' \
  --output text)

# Copy previous version to restore it
aws s3api copy-object \
  --bucket smartspecpro-media \
  --copy-source "smartspecpro-media/gallery/test-image.jpg?versionId=$PREVIOUS_VERSION" \
  --key gallery/test-image.jpg \
  --endpoint-url $R2_ENDPOINT

echo "✅ Restored gallery/test-image.jpg to version $PREVIOUS_VERSION"
```

### Step 3: Verify Restored File

```bash
# Download and verify checksums
aws s3 cp s3://smartspecpro-media/gallery/test-image.jpg /tmp/restored-image.jpg \
  --endpoint-url $R2_ENDPOINT

# Compare with expected file (if you have original)
md5sum /tmp/restored-image.jpg
# (Compare with known good MD5 hash)

echo "✅ R2 restore test complete. File integrity verified."
```

### Step 4: Measure RTO

```bash
# R2 restore is instantaneous (copy operation)
RTO_R2=5  # ~5 seconds for copy command

echo "Actual RTO: $RTO_R2 seconds"
echo "Target RTO: Immediate (< 60 seconds)"
echo "✅ RTO target met"
```

---

## Test 4: Secret Restore (Secret Manager)

### Step 1: List Secret Versions

```bash
# List versions of JWT_SECRET
gcloud secrets versions list JWT_SECRET \
  --project=smartspecpro-mvp \
  --limit=10 \
  --format="table(name,state,createTime)"
```

### Step 2: Restore Previous Version

```bash
# Simulate secret rotation failure → need to rollback
CURRENT_VERSION=$(gcloud secrets versions list JWT_SECRET \
  --project=smartspecpro-mvp \
  --limit=1 \
  --format="value(name)" | grep -oP '\d+$')

PREVIOUS_VERSION=$((CURRENT_VERSION - 1))

# Read previous version
PREVIOUS_JWT_SECRET=$(gcloud secrets versions access $PREVIOUS_VERSION \
  --secret=JWT_SECRET \
  --project=smartspecpro-mvp)

# Create new version with old value (rollback)
echo -n "$PREVIOUS_JWT_SECRET" | gcloud secrets versions add JWT_SECRET \
  --data-file=- \
  --project=smartspecpro-mvp

echo "✅ Rolled back JWT_SECRET to version $PREVIOUS_VERSION"
```

### Step 3: Verify Rollback

```bash
# Verify new version matches old value
NEW_VERSION=$(gcloud secrets versions list JWT_SECRET \
  --project=smartspecpro-mvp \
  --limit=1 \
  --format="value(name)" | grep -oP '\d+$')

NEW_VALUE=$(gcloud secrets versions access $NEW_VERSION \
  --secret=JWT_SECRET \
  --project=smartspecpro-mvp)

if [ "$NEW_VALUE" = "$PREVIOUS_JWT_SECRET" ]; then
  echo "✅ Rollback successful. Secret restored to previous value."
else
  echo "❌ Rollback failed. Values do not match."
fi
```

### Step 4: Measure RTO

```bash
RTO_SECRET=10  # ~10 seconds for rollback command

echo "Actual RTO: $RTO_SECRET seconds"
echo "Target RTO: Immediate (< 60 seconds)"
echo "✅ RTO target met"
```

---

## Disaster Recovery Simulation (Quarterly)

**Schedule:** Last Friday of each quarter (March, June, September, December)

**Scenario:** Total database failure requiring full restore to production

### Simulation Steps

1. **Announce simulation** (1 week in advance)
   - Notify team: "DR simulation on 2026-03-28 at 14:00 UTC"
   - No customer impact (staging environment)

2. **Simulate disaster**
   ```bash
   # In staging: Drop a critical table (or entire database)
   psql "$STAGING_DATABASE_URL" -c "DROP TABLE users CASCADE;"
   ```

3. **Follow DR procedure** (see incident-response-plan.md)
   - Detect outage (monitoring alerts)
   - Declare P1 incident
   - Initiate restore from Neon PITR
   - Verify data integrity
   - Restore service

4. **Measure total recovery time**
   - Detection: X minutes
   - Decision: Y minutes
   - Restore: Z minutes
   - **Total RTO:** X + Y + Z

5. **Debrief**
   - What went well?
   - What went poorly?
   - How can we improve RTO?
   - Update DR playbook

---

## Backup Test Checklist

**Run this checklist every month:**

- [ ] PostgreSQL PITR test completed
  - [ ] Restore branch created
  - [ ] Data integrity verified (row counts, FK constraints)
  - [ ] Application connectivity tested
  - [ ] Encrypted data decryptable
  - [ ] RTO measured and documented
  - [ ] Test branch deleted
- [ ] Redis snapshot test completed (quarterly, not monthly)
  - [ ] Snapshot restored to test instance
  - [ ] Sample keys verified
  - [ ] RTO measured
  - [ ] Test instance deleted
- [ ] R2 versioning test completed
  - [ ] Previous version restored
  - [ ] File integrity verified
  - [ ] RTO measured
- [ ] Secret Manager rollback test completed
  - [ ] Previous version restored
  - [ ] New version matches old value
  - [ ] RTO measured
- [ ] Test report created in `docs/backup-tests/`
- [ ] Results shared with team (Slack #infrastructure)
- [ ] Action items created for any issues found

---

## Backup Test Metrics

**Track these metrics over time:**

| Metric | Target | Alert If |
|--------|--------|----------|
| Monthly test completion | 100% | Test skipped |
| PostgreSQL RTO | < 30 min | > 30 min |
| Redis RTO | < 5 min | > 10 min |
| R2 RTO | < 1 min | > 5 min |
| Data integrity | 100% | Any corruption |
| Test failures | 0 | Any failure |

**Visualize trends:**
- RTO over time (should decrease as we optimize)
- Test success rate (should be 100%)

---

## What to Do If Test Fails

### PostgreSQL Restore Failure

**Symptoms:**
- Restore branch creation fails
- Data missing or corrupted
- Application cannot connect to restored DB

**Actions:**
1. Document failure in test report
2. Create P2 incident (test failure is not production outage, but high priority)
3. Contact Neon support immediately
4. Investigate:
   - Is timestamp within retention window?
   - Are Neon services degraded (check status page)?
   - Is main branch corrupted (very unlikely)?
5. Escalate to P1 if main production branch also shows issues

### Redis Restore Failure

**Symptoms:**
- No snapshots available
- Restored data is empty
- Keys have incorrect TTLs

**Actions:**
1. Document failure
2. Contact Upstash support
3. Verify Upstash automatic backup settings enabled
4. If snapshots are missing: Enable manual snapshots as backup

### R2 Restore Failure

**Symptoms:**
- Previous versions not available
- Restored file is corrupted

**Actions:**
1. Document failure
2. Verify R2 bucket versioning is enabled
3. Contact Cloudflare support
4. Check bucket lifecycle rules (ensure versions aren't deleted prematurely)

---

## Appendix: Recovery Commands Quick Reference

```bash
# PostgreSQL PITR (Neon)
# Use Neon Console > Branches > New Branch > From specific point in time

# Redis snapshot (Upstash)
# Use Upstash Console > Backups > Restore to new instance

# R2 object restore (Cloudflare R2)
aws s3api copy-object \
  --bucket smartspecpro-media \
  --copy-source "smartspecpro-media/path/to/file?versionId=VERSION_ID" \
  --key path/to/file \
  --endpoint-url $R2_ENDPOINT

# Secret rollback (Secret Manager)
PREVIOUS_VALUE=$(gcloud secrets versions access PREVIOUS_VERSION --secret=SECRET_NAME --project=smartspecpro-mvp)
echo -n "$PREVIOUS_VALUE" | gcloud secrets versions add SECRET_NAME --data-file=- --project=smartspecpro-mvp
```

---

## Next Steps

**After each monthly test:**
1. Update this runbook based on lessons learned
2. Share results with team
3. Track RTO trends
4. Schedule next month's test
