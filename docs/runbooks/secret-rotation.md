# Secret Rotation Runbook

## Overview

This document defines the procedures for rotating secrets in SmartSpecPro production. Regular secret rotation is a critical security practice, but must be done carefully to avoid service disruption.

**General Rotation Principles:**
1. Always test rotation procedure in staging first
2. Rotate during low-traffic periods (weekends, late night)
3. Have rollback plan ready before starting
4. Monitor service health continuously during rotation
5. Update documentation after rotation completes

---

## Rotation Schedule

| Secret | Rotation Frequency | Last Rotated | Next Due | Auto-Rotate? |
|--------|-------------------|--------------|----------|--------------|
| JWT_SECRET | Quarterly (every 3 months) | TBD | TBD | No |
| DATABASE_URL (password) | Annually | TBD | TBD | No |
| LLM_ENCRYPTION_KEY | **NEVER** | N/A | N/A | N/A |
| API Keys (external) | Per-provider policy | Varies | Varies | Some |
| Service Account Keys | Automated via Workload Identity | N/A | N/A | Yes |
| REDIS_URL (Upstash token) | Annually | TBD | TBD | No |
| R2_ACCESS_KEY_ID / SECRET | Annually | TBD | TBD | No |
| SMTP Password | Annually | TBD | TBD | No |
| Stripe Webhook Secret | On compromise only | N/A | N/A | No |

**Reminder:** Set calendar reminders 2 weeks before rotation due date to prepare.

---

## JWT_SECRET Rotation (Zero-Downtime)

**Frequency:** Every 3 months

**Risk Level:** HIGH (breaks all active user sessions if done wrong)

**Estimated Time:** 30 minutes

**Prerequisites:**
- Staging environment tested successfully
- On-call engineer available during rotation
- Rollback plan documented

### Phase 1: Add New Secret (Dual-Key Overlap)

The strategy is to use TWO JWT secrets simultaneously for 24 hours:
- Old secret: Validates existing tokens
- New secret: Issues new tokens

After 24 hours, all active tokens will have been refreshed with new secret.

```bash
# 1. Generate new JWT secret (256-bit random string)
NEW_JWT_SECRET=$(openssl rand -base64 32)
echo "New JWT secret generated (DO NOT LOG THIS): $NEW_JWT_SECRET"

# 2. Create new version in Secret Manager with dual-key format
# Format: OLD_SECRET,NEW_SECRET
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)
OLD_JWT_SECRET=$(gcloud secrets versions access latest --secret=JWT_SECRET --project=smartspecpro-mvp)

DUAL_JWT_SIGNING_KEYS="${OLD_JWT_SIGNING_KEY},${NEW_JWT_SIGNING_KEY}"

echo -n "$DUAL_JWT_SECRET" | gcloud secrets versions add JWT_SECRET \
  --data-file=- \
  --project=smartspecpro-mvp

# 3. Verify new version created
gcloud secrets versions list JWT_SECRET --project=smartspecpro-mvp --limit=3
```

### Phase 2: Deploy with Dual-Key Support

```typescript
// apps/web/server/middleware/auth.ts
// Ensure code supports dual-key validation:

const JWT_SECRET = process.env.JWT_SECRET!;
const secrets = JWT_SECRET.includes(',') ? JWT_SECRET.split(',') : [JWT_SECRET];

async function verifyToken(token: string) {
  // Try each secret until one works
  for (const secret of secrets) {
    try {
      return await jose.jwtVerify(token, new TextEncoder().encode(secret));
    } catch (err) {
      continue; // Try next secret
    }
  }
  throw new Error('Invalid token');
}

// When ISSUING new tokens, always use the LAST secret in the list
const signingSecret = secrets[secrets.length - 1];
```

**Deploy the dual-key code:**

```bash
# Deploy to production (will pick up new Secret Manager version automatically)
gcloud run deploy node-api \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp \
  --tag=jwt-rotation \
  --no-traffic

# Canary rollout (10% traffic for 15 minutes)
gcloud run services update-traffic node-api \
  --to-revisions=jwt-rotation=10,LATEST=90 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp

# Monitor for 15 minutes:
# - Check Sentry for JWT verification errors
# - Check Cloud Monitoring for error rate
# - Check login success rate in application logs

# If all good, shift to 100%
gcloud run services update-traffic node-api \
  --to-revisions=jwt-rotation=100 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp
```

### Phase 3: Wait for Old Tokens to Expire (24 hours)

**During this 24-hour overlap period:**
- Old tokens continue to work (validated by old secret)
- New tokens are issued with new secret
- Users who login/refresh will automatically get new tokens

**Monitoring during overlap:**
```bash
# Check JWT validation metrics (if instrumented)
# Expected: Gradual shift from old secret to new secret validations

# Check for JWT errors in Sentry
# Expected: Zero JWT verification errors
```

### Phase 4: Remove Old Secret (After 24 Hours)

```bash
# 1. Update Secret Manager to only contain new secret
NEW_JWT_SIGNING_KEY="<value from Phase 1>"
echo -n "$NEW_JWT_SIGNING_KEY" | gcloud secrets versions add JWT_SECRET \
  --data-file=- \
  --project=smartspecpro-mvp

# 2. Deploy to remove dual-key code (optional, or keep for next rotation)
# Code will now use single secret again

# 3. Verify all users can still authenticate
# Test a few user accounts across different devices

# 4. Invalidate all sessions older than 24 hours (if needed)
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)
psql "$DATABASE_URL" -c "
  DELETE FROM user_sessions
  WHERE created_at < NOW() - INTERVAL '24 hours';
"
```

### Rollback (If Issues Detected)

**If JWT errors spike during overlap period:**

```bash
# 1. Immediate rollback to old secret only
OLD_JWT_SIGNING_KEY="<original value before rotation>"
echo -n "$OLD_JWT_SIGNING_KEY" | gcloud secrets versions add JWT_SECRET \
  --data-file=- \
  --project=smartspecpro-mvp

# 2. Rollback service to previous revision
gcloud run services update-traffic node-api \
  --to-revisions=LATEST=100 \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp

# 3. Investigate why rotation failed
# - Check dual-key validation logic
# - Check for code bugs in token signing/verification
# - Test in staging more thoroughly
```

---

## DATABASE_URL Rotation (Password Change)

**Frequency:** Annually

**Risk Level:** MEDIUM (brief connection errors during restart)

**Estimated Time:** 15 minutes

**Prerequisites:**
- Database backup taken (Neon automatic backups should exist)
- Staging tested successfully
- Low-traffic period

### Step 1: Change Password in Neon

```bash
# 1. Log into Neon console
# Navigate to: Project > Settings > Database Users

# 2. Change password for database user (e.g., "smartspec_prod")
# Generate strong password:
NEW_DB_PASSWORD=$(openssl rand -base64 24)
echo "New DB password (DO NOT LOG): $NEW_DB_PASSWORD"

# Copy to clipboard, update in Neon console

# 3. Construct new DATABASE_URL
# Format: postgresql://USER:PASSWORD@HOST/DB?sslmode=require
NEON_HOST="ep-xxx-xxx.us-east-2.aws.neon.tech"
NEON_USER="smartspec_prod"
NEON_DB="smartspecpro"
NEW_DATABASE_URL="postgresql://${NEON_USER}:${NEW_DB_PASSWORD}@${NEON_HOST}/${NEON_DB}?sslmode=require"
```

### Step 2: Update Secret Manager

```bash
# Update DATABASE_URL secret
echo -n "$NEW_DATABASE_URL" | gcloud secrets versions add DATABASE_URL \
  --data-file=- \
  --project=smartspecpro-mvp

# Verify new version
gcloud secrets versions list DATABASE_URL --project=smartspecpro-mvp --limit=3
```

### Step 3: Restart Services to Pick Up New Secret

**Note:** Cloud Run services with Secret Manager volume mounts may take up to 5 minutes to pick up new version. Restart forces immediate pickup.

```bash
# Restart node-api (will cause brief connection errors)
gcloud run services update node-api \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp \
  --update-env-vars=FORCE_RESTART=$(date +%s)

# Restart python-orchestrator
gcloud run services update python-orchestrator \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp \
  --update-env-vars=FORCE_RESTART=$(date +%s)

# Monitor for 5 minutes:
# - Check Sentry for database connection errors
# - Check Cloud Monitoring for error rate
# - Test login/signup flow manually
```

### Step 4: Verify Connectivity

```bash
# Test new DATABASE_URL
NEW_DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)
psql "$NEW_DATABASE_URL" -c "SELECT version();"

# Expected: PostgreSQL version output

# Verify application logs show successful DB connections
gcloud logging read "resource.type=cloud_run_revision \
  AND (jsonPayload.message=~\"Database connected\" OR textPayload=~\"Database connected\") \
  AND timestamp>\"$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=5 \
  --project=smartspecpro-mvp
```

### Rollback (If Issues)

```bash
# 1. Revert password in Neon console to old password

# 2. Rollback Secret Manager to previous version
gcloud secrets versions list DATABASE_URL --project=smartspecpro-mvp --limit=3
# Note the previous version number (e.g., 42)

OLD_DATABASE_URL=$(gcloud secrets versions access 42 --secret=DATABASE_URL --project=smartspecpro-mvp)
echo -n "$OLD_DATABASE_URL" | gcloud secrets versions add DATABASE_URL \
  --data-file=- \
  --project=smartspecpro-mvp

# 3. Restart services again
gcloud run services update node-api --region=asia-southeast1 --project=smartspecpro-mvp --update-env-vars=FORCE_RESTART=$(date +%s)
gcloud run services update python-orchestrator --region=asia-southeast1 --project=smartspecpro-mvp --update-env-vars=FORCE_RESTART=$(date +%s)
```

---

## LLM_ENCRYPTION_KEY — NEVER ROTATE

**Frequency:** NEVER

**Why:** This key encrypts sensitive data in the database (API keys, SMTP passwords, TOTP secrets). If rotated, ALL encrypted data becomes permanently unrecoverable.

**Security Mitigation (Instead of Rotation):**
- Store in Secret Manager with strict IAM (only service accounts can read)
- Enable Secret Manager audit logging to detect unauthorized access
- Backup `.env` file with encryption key in secure offline storage
- Use encryption key versioning ONLY if re-encrypting all data with new key

**If Encryption Key Compromised:**

**CRITICAL: This is a P1 security incident. Follow these steps immediately.**

1. **Assess Blast Radius:**
   - Determine what data is encrypted with this key
   - Check audit logs to see who accessed the key
   - Assume all encrypted secrets (API keys, passwords) are compromised

2. **Rotate ALL Encrypted Secrets:**
   - Rotate all LLM provider API keys
   - Rotate SMTP password
   - Invalidate all TOTP secrets (users must re-enroll)
   - Rotate Stripe API keys
   - Rotate R2 access keys

3. **Generate New Encryption Key:**
   ```bash
   NEW_ENCRYPTION_KEY=$(openssl rand -base64 32)
   echo "New encryption key (BACKUP OFFLINE): $NEW_ENCRYPTION_KEY"
   ```

4. **Re-encrypt All Data (Downtime Required):**
   ```typescript
   // apps/web/scripts/re-encrypt-all-data.ts
   // This script must:
   // 1. Read all encrypted fields with OLD key
   // 2. Decrypt with OLD key
   // 3. Encrypt with NEW key
   // 4. Update database
   // 5. Verify decryption works with NEW key
   ```

   ```bash
   # Run re-encryption script
   DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)
   OLD_LLM_ENCRYPTION_KEY=$(gcloud secrets versions access latest --secret=LLM_ENCRYPTION_KEY --project=smartspecpro-mvp)
   NEW_LLM_ENCRYPTION_KEY="$NEW_ENCRYPTION_KEY"

   tsx apps/web/scripts/re-encrypt-all-data.ts
   ```

5. **Update Secret Manager:**
   ```bash
   echo -n "$NEW_LLM_ENCRYPTION_KEY" | gcloud secrets versions add LLM_ENCRYPTION_KEY \
     --data-file=- \
     --project=smartspecpro-mvp
   ```

6. **Restart All Services:**
   ```bash
   gcloud run services update node-api --region=asia-southeast1 --project=smartspecpro-mvp --update-env-vars=FORCE_RESTART=$(date +%s)
   gcloud run services update python-orchestrator --region=asia-southeast1 --project=smartspecpro-mvp --update-env-vars=FORCE_RESTART=$(date +%s)
   ```

7. **Notify Users:**
   - Inform users of security incident (if API keys were customer-owned)
   - Force password reset for all users (out of caution)
   - Require 2FA re-enrollment

**Estimated Downtime:** 30-60 minutes (during re-encryption)

---

## External API Key Rotation

**Keys to Rotate:**
- OpenAI API Key
- Anthropic API Key
- Kie.ai API Key
- Cloudflare R2 Access Key / Secret Key
- Stripe API Keys (if compromised)
- Postmark SMTP Token
- Sentry DSN (on compromise only)
- PostHog API Key (on compromise only)

### General Procedure (Per-Provider)

```bash
# 1. Generate new API key in provider console
# (e.g., OpenAI Dashboard > API Keys > Create new key)

# 2. Update Secret Manager
NEW_OPENAI_KEY="sk-proj-xxxxx"
echo -n "$NEW_OPENAI_KEY" | gcloud secrets versions add OPENAI_API_KEY \
  --data-file=- \
  --project=smartspecpro-mvp

# 3. Update encrypted database records (if key is also stored in DB)
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)
LLM_ENCRYPTION_KEY=$(gcloud secrets versions access latest --secret=LLM_ENCRYPTION_KEY --project=smartspecpro-mvp)

# Use application script to re-encrypt:
tsx apps/web/scripts/update-encrypted-api-key.ts \
  --provider="openai" \
  --key="$NEW_OPENAI_KEY"

# 4. Restart services
gcloud run services update node-api --region=asia-southeast1 --project=smartspecpro-mvp --update-env-vars=FORCE_RESTART=$(date +%s)
gcloud run services update python-orchestrator --region=asia-southeast1 --project=smartspecpro-mvp --update-env-vars=FORCE_RESTART=$(date +%s)

# 5. Verify API calls work with new key
# Test by creating a test LLM request

# 6. Delete old API key in provider console
# ONLY after verifying new key works
```

---

## Service Account Key Rotation (Workload Identity - Automated)

**Frequency:** Automatic (GCP rotates automatically)

**Action Required:** NONE (already using Workload Identity)

SmartSpecPro uses Workload Identity for GCP service authentication, which does NOT require manual key rotation.

**Verification:**

```bash
# Verify Workload Identity is configured
gcloud run services describe node-api \
  --region=asia-southeast1 \
  --project=smartspecpro-mvp \
  --format="value(spec.template.spec.serviceAccountName)"

# Should output: node-api@smartspecpro-mvp.iam.gserviceaccount.com

# Verify no JSON key files exist in Docker images
# (Should be zero)
gcloud artifacts docker images list \
  asia-southeast1-docker.pkg.dev/smartspecpro-mvp/smartspecpro/node-api \
  --project=smartspecpro-mvp \
  --limit=1
```

**If Using JSON Key Files (WRONG - needs migration):**

```bash
# MIGRATE to Workload Identity instead of rotating JSON keys
# See: https://cloud.google.com/run/docs/securing/service-identity

# 1. Remove JSON key from Secret Manager
# 2. Update Cloud Run service to use Workload Identity
# 3. Remove JSON key file from Docker image
```

---

## Session Cookie Invalidation (Force Re-Login)

**When to Use:**
- Security incident (credential leak)
- JWT secret rotation (as a precaution)
- Suspicious activity detected

**Procedure:**

```bash
# 1. Invalidate all sessions in database
DATABASE_URL=$(gcloud secrets versions access latest --secret=DATABASE_URL --project=smartspecpro-mvp)
psql "$DATABASE_URL" -c "DELETE FROM user_sessions;"

# 2. Clear Redis session cache (if used)
REDIS_URL=$(gcloud secrets versions access latest --secret=REDIS_URL --project=smartspecpro-mvp)
redis-cli -u "$REDIS_URL" FLUSHDB

# 3. Rotate JWT_SECRET (see above section)

# 4. Users will be forced to re-login on next request
```

**User Impact:** All users logged out immediately, must re-authenticate

---

## Verification After Any Rotation

**Run these checks after EVERY secret rotation:**

```bash
# 1. Service health check
gcloud run services describe node-api --region=asia-southeast1 --project=smartspecpro-mvp \
  --format="value(status.conditions[0].status)"
# Expected: True

gcloud run services describe python-orchestrator --region=asia-southeast1 --project=smartspecpro-mvp \
  --format="value(status.conditions[0].status)"
# Expected: True

# 2. Check error rate (should be < 1%)
gcloud logging read "resource.type=cloud_run_revision \
  AND httpRequest.status>=500 \
  AND timestamp>\"$(date -u -d '10 minutes ago' +%Y-%m-%dT%H:%M:%SZ)\"" \
  --limit=50 \
  --project=smartspecpro-mvp | wc -l

# 3. Test critical user flows manually
# - Login
# - Create media job
# - Access API with API key

# 4. Check Sentry for new errors
# Visit: https://sentry.io/organizations/smartspecpro/issues/?query=is:unresolved+firstSeen:-15m

# 5. Check Cloud Monitoring dashboards
# Visit: https://console.cloud.google.com/monitoring/dashboards?project=smartspecpro-mvp
```

---

## Rotation Playbook Summary

| Secret | Downtime? | Dual-Key? | Wait Period | Rollback Time |
|--------|-----------|-----------|-------------|---------------|
| JWT_SECRET | No | Yes (24h) | 24 hours | 2 minutes |
| DATABASE_URL | Brief (~30s) | No | None | 5 minutes |
| LLM_ENCRYPTION_KEY | **NEVER ROTATE** | N/A | N/A | N/A |
| External API Keys | No | No | None | 2 minutes |
| Service Account | Auto | N/A | N/A | N/A |

---

## Emergency Contact

**If rotation goes wrong:**
1. Follow rollback procedure immediately
2. Alert on-call engineer
3. Create incident in Slack: `#incident-YYYYMMDD-secret-rotation-failed`
4. Document what went wrong for postmortem

**Escalation:** If rollback fails, escalate to P1 incident (see incident-response-plan.md)

---

## Certification Diagnostics: Never Dump Environment Values

During certification, incident response, and Runner pairing work, raw
environment dumps are prohibited. Do not use `cat`, `tail`, `printenv`,
`env`, `systemctl show ... -p Environment`, or equivalent commands against
secret-bearing environment files or process environments.

Use an allowlisted, value-free inspection instead. Record only:

```text
variable name
present|empty
source file or service
consumer
non-secret provider/version identifier, when available
length or a non-reversible fingerprint only when the incident record requires it
```

For local `.env` key-name inventory, use a projection that emits only names
from lines whose first token is an environment variable name. Never use a raw
search over the file:

```bash
for env_file in apps/web/.env python-backend/.env; do
  printf '%s: ' "$env_file"
  grep -Eo '^[A-Za-z_][A-Za-z0-9_]*=' "$env_file" | cut -d= -f1
done
```

The command above is a name-only inventory. It must not be changed to include
line numbers, matching context, values, or process-environment output. If a
consumer or parser cannot guarantee value-free output, do not run it against a
live secret-bearing file; use the authoritative secret manager or a redacted
fixture instead.

Never record a secret value, a partial token, a private key, a cookie, a
session credential, or a command line containing one. Diagnostic output must
render secret values as `[REDACTED]`; tests and smoke scripts must assert that
known secret-shaped fields are not emitted.

If a one-off command exposes a value:

1. stop certification and mark the earliest affected lifecycle stage blocked;
2. classify every exposed key and consumer without printing the value again;
3. rotate or revoke at the authoritative provider, update all consumers, and
   prove the new credential works and the old credential fails closed;
4. inspect project-controlled evidence files for copies, redact only known
   copies, and preserve safe incident metadata;
5. restart/reload managed services and rerun stale gates from the earliest
   affected stage.

An immutable external tool transcript cannot be edited; credential
rotation/revocation is the containment boundary. Do not claim containment is
complete from a local `.env` edit alone.

### Secret-leak regression gate

Before reopening certification, run a fixture-only diagnostic test that proves
all of the following:

- key-name inventory emits names and `PRESENT`/`REDACTED` state only;
- known secret-shaped values, private-key material, cookies, and session
  credentials do not appear in stdout, stderr, logs, or evidence artifacts;
- multiline values and values containing `=` are never emitted by the
  name-only projection;
- the diagnostic fails closed when a safe projection cannot be guaranteed.

The gate is not satisfied by inspecting a live `.env` file manually. Record
only the fixture name, command result, and redacted output shape.
