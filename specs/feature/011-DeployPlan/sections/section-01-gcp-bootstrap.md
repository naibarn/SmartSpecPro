Now I have all the context needed. Let me generate the section content.

# Section 01: GCP Project Bootstrap

## Overview

This section establishes the foundational Google Cloud Platform infrastructure for SmartSpecPro's MVP deployment. Every subsequent section depends on the resources created here: a GCP project with billing, enabled APIs, service accounts with least-privilege IAM roles, an Artifact Registry for Docker images, Cloud Tasks queues for job orchestration, and Secret Manager entries for all sensitive configuration.

No application code is written in this section. The deliverables are shell scripts and documentation that provision GCP resources via `gcloud` CLI commands. Terraform is intentionally deferred -- all provisioning uses documented `gcloud` commands for transparency and simplicity at MVP scale.

## Dependencies

None. This is the first section. All other sections (02 through 20) depend on the resources provisioned here.

## Target Architecture Context

SmartSpecPro deploys to Google Cloud Run with:
- **Compute:** Cloud Run services (Node.js API, Python orchestrator) and Cloud Run Jobs (video rendering)
- **Job orchestration:** Google Cloud Tasks (replacing Celery and BullMQ)
- **Periodic tasks:** Google Cloud Scheduler (replacing CeleryBeat)
- **Secrets:** GCP Secret Manager
- **Docker registry:** GCP Artifact Registry
- **Database:** Neon Postgres (external, not GCP-managed)
- **Cache/queue:** Upstash Redis + Google Memorystore (split strategy)
- **Storage:** Cloudflare R2 (external, accessed via S3-compatible API)
- **Domain:** `app.smartaihub.app` for the unified dashboard and API

The target scale is 100-1,000 users with 50-500 jobs/day at launch.

---

## Tests First

This section is infrastructure provisioning with no application code. Validation is performed via a shell script that checks all expected resources exist. Create the following file.

### File: `/home/dev/projects/SmartSpecPro/scripts/validate-gcp-setup.sh`

This script validates the GCP bootstrap is complete. It checks all APIs are enabled, service accounts exist with correct roles, Cloud Tasks queues are created with proper configuration, Artifact Registry repository exists, and Secret Manager secrets are populated.

```bash
#!/usr/bin/env bash
# validate-gcp-setup.sh
# Validates that all GCP bootstrap resources are correctly provisioned.
# Usage: ./scripts/validate-gcp-setup.sh [PROJECT_ID] [REGION]
# Returns: exit 0 if all checks pass, exit 1 with a list of missing/misconfigured resources.

set -euo pipefail

PROJECT_ID="${1:-smartspecpro-mvp}"
REGION="${2:-asia-southeast1}"
ERRORS=()

# --- Helper ---
check() {
  # Runs a gcloud command; if it fails or returns empty, records an error.
  # $1 = description, $2... = command to run
  ...
}

# --- 1. Project exists and billing is linked ---
# gcloud projects describe $PROJECT_ID
# gcloud billing projects describe $PROJECT_ID

# --- 2. Required APIs are enabled ---
# Loop over required API list, check each with gcloud services list --enabled

# --- 3. Service accounts exist ---
# Loop over expected SA emails, check with gcloud iam service-accounts describe

# --- 4. Service account IAM roles ---
# For each SA, verify expected roles are bound at project level

# --- 5. Artifact Registry repository exists ---
# gcloud artifacts repositories describe

# --- 6. Cloud Tasks queues exist with correct config ---
# Loop over 6 queues, check with gcloud tasks queues describe

# --- 7. Secret Manager secrets exist (not checking values) ---
# Loop over expected secret names, check with gcloud secrets describe

# --- Report ---
# Print all errors; exit 1 if any, exit 0 if none
```

The script should be runnable by any team member with `gcloud` authenticated to the target project. It should not require any secrets or credentials beyond read-only project access.

---

## Implementation Details

### Step 1: GCP Project and Billing

Create a new GCP project and link a billing account.

```bash
# Create the project
gcloud projects create smartspecpro-mvp \
  --name="SmartSpecPro MVP" \
  --organization=YOUR_ORG_ID  # omit if using personal account

# Set as active project
gcloud config set project smartspecpro-mvp

# Link billing (get billing account ID first)
gcloud billing accounts list
gcloud billing projects link smartspecpro-mvp \
  --billing-account=BILLING_ACCOUNT_ID
```

**Region selection:** Choose the region closest to the target user base. Primary candidate is `asia-southeast1` (Singapore). Ensure Neon Postgres offers a region nearby (Neon supports `aws-ap-southeast-1` which is also Singapore). All GCP resources (Artifact Registry, Cloud Tasks, Cloud Scheduler, Memorystore) should be in the same region to minimize cross-region latency.

Store the chosen region as a project-level variable for consistency:

```bash
REGION="asia-southeast1"
```

### Step 2: Enable Required APIs

Enable all GCP APIs needed by the deployment. Run these as a batch:

```bash
gcloud services enable \
  run.googleapis.com \
  cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  redis.googleapis.com \
  --project=smartspecpro-mvp
```

The `redis.googleapis.com` API is for Google Memorystore, used in the split Redis strategy (Section 10). The `iamcredentials.googleapis.com` API is required for Workload Identity Federation in CI/CD (Section 17).

### Step 3: Artifact Registry

Create a Docker repository to store all Cloud Run images.

```bash
gcloud artifacts repositories create smartspecpro \
  --repository-format=docker \
  --location=$REGION \
  --description="SmartSpecPro Docker images" \
  --project=smartspecpro-mvp
```

Configure Docker authentication for pushing images:

```bash
gcloud auth configure-docker ${REGION}-docker.pkg.dev
```

The resulting image path pattern will be:
```
${REGION}-docker.pkg.dev/smartspecpro-mvp/smartspecpro/{image-name}:{tag}
```

### Step 4: Service Accounts (Least-Privilege)

Create four service accounts, each with only the IAM roles it needs.

#### 4a. Cloud Run API Service Account

Used by the Node.js and Python Cloud Run services.

```bash
gcloud iam service-accounts create cloud-run-api \
  --display-name="Cloud Run API Services" \
  --project=smartspecpro-mvp

# Bind roles
for ROLE in \
  roles/run.invoker \
  roles/secretmanager.secretAccessor \
  roles/cloudtasks.enqueuer \
  roles/logging.logWriter \
; do
  gcloud projects add-iam-policy-binding smartspecpro-mvp \
    --member="serviceAccount:cloud-run-api@smartspecpro-mvp.iam.gserviceaccount.com" \
    --role="$ROLE"
done
```

#### 4b. Cloud Run Jobs Service Account

Used by Cloud Run Jobs (video rendering). Needs Cloud Tasks permissions if jobs enqueue follow-up tasks.

```bash
gcloud iam service-accounts create cloud-run-jobs \
  --display-name="Cloud Run Jobs (Video/Media)" \
  --project=smartspecpro-mvp

for ROLE in \
  roles/secretmanager.secretAccessor \
  roles/logging.logWriter \
  roles/cloudtasks.enqueuer \
; do
  gcloud projects add-iam-policy-binding smartspecpro-mvp \
    --member="serviceAccount:cloud-run-jobs@smartspecpro-mvp.iam.gserviceaccount.com" \
    --role="$ROLE"
done
```

Note: R2 storage access uses external S3-compatible credentials (stored in Secret Manager), not GCP IAM roles.

#### 4c. Cloud Scheduler Service Account

Used by Cloud Scheduler to create tasks in Cloud Tasks queues.

```bash
gcloud iam service-accounts create cloud-scheduler \
  --display-name="Cloud Scheduler" \
  --project=smartspecpro-mvp

gcloud projects add-iam-policy-binding smartspecpro-mvp \
  --member="serviceAccount:cloud-scheduler@smartspecpro-mvp.iam.gserviceaccount.com" \
  --role="roles/cloudtasks.enqueuer"
```

#### 4d. GitHub Deploy Service Account

Used by GitHub Actions to push images and deploy Cloud Run services.

```bash
gcloud iam service-accounts create github-deploy \
  --display-name="GitHub Actions Deploy" \
  --project=smartspecpro-mvp

for ROLE in \
  roles/artifactregistry.writer \
  roles/run.admin \
  roles/iam.serviceAccountUser \
; do
  gcloud projects add-iam-policy-binding smartspecpro-mvp \
    --member="serviceAccount:github-deploy@smartspecpro-mvp.iam.gserviceaccount.com" \
    --role="$ROLE"
done
```

The `iam.serviceAccountUser` role allows the deploy SA to act as other service accounts when deploying Cloud Run services (required by `gcloud run deploy --service-account`).

**No JSON key is created** for this service account. Authentication is handled via Workload Identity Federation with GitHub OIDC (configured in Section 17: CI/CD).

### Step 5: Cloud Tasks Queues

Create six queues with specific rate limits and retry policies. Each queue is tailored to a specific workload pattern.

```bash
# media-jobs: Image/media generation processing
gcloud tasks queues create media-jobs \
  --location=$REGION \
  --max-dispatches-per-second=5 \
  --max-concurrent-dispatches=10 \
  --max-attempts=5 \
  --min-backoff=1s \
  --max-backoff=300s \
  --project=smartspecpro-mvp

# video-jobs-short: Video renders < 2 min, no overlays
gcloud tasks queues create video-jobs-short \
  --location=$REGION \
  --max-dispatches-per-second=2 \
  --max-concurrent-dispatches=10 \
  --max-attempts=3 \
  --min-backoff=5s \
  --max-backoff=600s \
  --project=smartspecpro-mvp

# video-jobs-long: Complex video renders
gcloud tasks queues create video-jobs-long \
  --location=$REGION \
  --max-dispatches-per-second=1 \
  --max-concurrent-dispatches=3 \
  --max-attempts=3 \
  --min-backoff=10s \
  --max-backoff=600s \
  --project=smartspecpro-mvp

# workflow-tasks: LLM and workflow orchestration
gcloud tasks queues create workflow-tasks \
  --location=$REGION \
  --max-dispatches-per-second=10 \
  --max-concurrent-dispatches=20 \
  --max-attempts=5 \
  --min-backoff=1s \
  --max-backoff=60s \
  --project=smartspecpro-mvp

# polling-tasks: External API status polling (Kie AI)
gcloud tasks queues create polling-tasks \
  --location=$REGION \
  --max-dispatches-per-second=2 \
  --max-concurrent-dispatches=5 \
  --max-attempts=10 \
  --min-backoff=30s \
  --max-backoff=600s \
  --project=smartspecpro-mvp

# periodic-tasks: Scheduled maintenance/cleanup jobs
gcloud tasks queues create periodic-tasks \
  --location=$REGION \
  --max-dispatches-per-second=1 \
  --max-concurrent-dispatches=5 \
  --max-attempts=3 \
  --min-backoff=5s \
  --max-backoff=300s \
  --project=smartspecpro-mvp
```

**Queue design rationale:**
- `media-jobs` has moderate throughput (5/s) because media processing is IO-bound but each job uses external API credits.
- `video-jobs-long` is heavily throttled (1/s, 3 concurrent) because video rendering is CPU-intensive and expensive.
- `polling-tasks` has the most retries (10) because polling needs to keep checking until the external job completes.
- `periodic-tasks` is low-throughput (1/s) because periodic tasks are background maintenance.

### Step 6: Secret Manager

Create Secret Manager entries for all sensitive configuration values. Values are set during deployment or manually for initial setup -- the bootstrap step only creates the secret resources (placeholders).

```bash
# List of all secrets to create
SECRETS=(
  "DATABASE_URL"
  "REDIS_UPSTASH_URL"
  "REDIS_MEMORYSTORE_URL"
  "LLM_ENCRYPTION_KEY"
  "JWT_SECRET"
  "KIE_AI_API_KEY"
  "KIE_AI_WEBHOOK_SECRET"
  "SENTRY_DSN_FRONTEND"
  "SENTRY_DSN_NODE"
  "SENTRY_DSN_PYTHON"
  "POSTHOG_API_KEY"
  "R2_ACCESS_KEY"
  "R2_SECRET_KEY"
  "R2_ACCOUNT_ID"
)

for SECRET_NAME in "${SECRETS[@]}"; do
  gcloud secrets create "$SECRET_NAME" \
    --replication-policy="automatic" \
    --project=smartspecpro-mvp
done
```

To set a secret value (done manually or in CI):

```bash
echo -n "your-secret-value" | gcloud secrets versions add SECRET_NAME \
  --data-file=- \
  --project=smartspecpro-mvp
```

**Grant access** to the service accounts that need to read secrets:

```bash
for SECRET_NAME in "${SECRETS[@]}"; do
  # Cloud Run API SA needs access to all secrets
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --member="serviceAccount:cloud-run-api@smartspecpro-mvp.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=smartspecpro-mvp

  # Cloud Run Jobs SA also needs access (for R2 creds, DB URL, etc.)
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --member="serviceAccount:cloud-run-jobs@smartspecpro-mvp.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project=smartspecpro-mvp
done
```

**Important notes on secret values:**
- `DATABASE_URL` comes from Neon Postgres setup (Section 03). Use the pooled connection string with `?pgbouncer=true`.
- `REDIS_UPSTASH_URL` comes from Upstash dashboard (Section 10).
- `REDIS_MEMORYSTORE_URL` comes from Memorystore provisioning (Section 10).
- `LLM_ENCRYPTION_KEY` must match the existing key used to encrypt data in the current database. Copy from the current `apps/web/.env` file. Losing this key makes all encrypted data unrecoverable.
- `JWT_SECRET` must match the existing key for session continuity. Copy from current `apps/web/.env`.
- Sentry DSNs are created in Section 13. PostHog API key in Section 14.
- R2 credentials come from Cloudflare dashboard (Section 09).

### Step 7: Create the Bootstrap Script

Combine all the above into a single executable bootstrap script.

#### File: `/home/dev/projects/SmartSpecPro/scripts/bootstrap-gcp.sh`

```bash
#!/usr/bin/env bash
# bootstrap-gcp.sh
# One-shot script to provision all GCP resources for SmartSpecPro MVP.
# Usage: ./scripts/bootstrap-gcp.sh PROJECT_ID REGION BILLING_ACCOUNT_ID
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Billing account ID available
#   - Organization ID (optional, omit for personal accounts)
#
# This script is idempotent -- safe to re-run. Existing resources are skipped.

set -euo pipefail

PROJECT_ID="${1:?Usage: $0 PROJECT_ID REGION BILLING_ACCOUNT_ID}"
REGION="${2:?Usage: $0 PROJECT_ID REGION BILLING_ACCOUNT_ID}"
BILLING_ACCOUNT="${3:?Usage: $0 PROJECT_ID REGION BILLING_ACCOUNT_ID}"

echo "=== SmartSpecPro GCP Bootstrap ==="
echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo ""

# Step 1: Project + billing (documented above)
# Step 2: Enable APIs (documented above)
# Step 3: Artifact Registry (documented above)
# Step 4: Service accounts + IAM (documented above)
# Step 5: Cloud Tasks queues (documented above)
# Step 6: Secret Manager (documented above)
# Step 7: Validate
echo ""
echo "=== Running validation ==="
./scripts/validate-gcp-setup.sh "$PROJECT_ID" "$REGION"
```

The full script body contains all the `gcloud` commands from Steps 1-6 in sequence, with error handling around each step. Each step checks if the resource already exists before creating it (idempotent). The script finishes by running the validation script.

### Step 8: Document Configuration Constants

Create a configuration reference file that other sections use to look up GCP resource names.

#### File: `/home/dev/projects/SmartSpecPro/deploy/gcp-config.env`

```bash
# GCP Project Configuration
# Referenced by deploy scripts, CI/CD, and Cloud Run service definitions.
# Do NOT put actual secret values here -- only resource names and IDs.

GCP_PROJECT_ID=smartspecpro-mvp
GCP_REGION=asia-southeast1

# Artifact Registry
AR_REPO=smartspecpro
AR_HOST=${GCP_REGION}-docker.pkg.dev

# Service Account Emails
SA_CLOUD_RUN_API=cloud-run-api@${GCP_PROJECT_ID}.iam.gserviceaccount.com
SA_CLOUD_RUN_JOBS=cloud-run-jobs@${GCP_PROJECT_ID}.iam.gserviceaccount.com
SA_CLOUD_SCHEDULER=cloud-scheduler@${GCP_PROJECT_ID}.iam.gserviceaccount.com
SA_GITHUB_DEPLOY=github-deploy@${GCP_PROJECT_ID}.iam.gserviceaccount.com

# Cloud Tasks Queue Names
QUEUE_MEDIA_JOBS=media-jobs
QUEUE_VIDEO_SHORT=video-jobs-short
QUEUE_VIDEO_LONG=video-jobs-long
QUEUE_WORKFLOW=workflow-tasks
QUEUE_POLLING=polling-tasks
QUEUE_PERIODIC=periodic-tasks

# Secret Manager Secret Names
SECRET_DATABASE_URL=DATABASE_URL
SECRET_REDIS_UPSTASH=REDIS_UPSTASH_URL
SECRET_REDIS_MEMORYSTORE=REDIS_MEMORYSTORE_URL
SECRET_LLM_KEY=LLM_ENCRYPTION_KEY
SECRET_JWT=JWT_SECRET
SECRET_KIE_API=KIE_AI_API_KEY
SECRET_KIE_WEBHOOK=KIE_AI_WEBHOOK_SECRET
SECRET_SENTRY_FE=SENTRY_DSN_FRONTEND
SECRET_SENTRY_NODE=SENTRY_DSN_NODE
SECRET_SENTRY_PY=SENTRY_DSN_PYTHON
SECRET_POSTHOG=POSTHOG_API_KEY
SECRET_R2_ACCESS=R2_ACCESS_KEY
SECRET_R2_SECRET=R2_SECRET_KEY
SECRET_R2_ACCOUNT=R2_ACCOUNT_ID
```

This file is checked into the repository (it contains no secrets, only resource names). Other sections' deploy scripts source this file for consistent naming.

---

## Files to Create or Modify

| File Path | Action | Description |
|-----------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/scripts/bootstrap-gcp.sh` | Create | One-shot GCP provisioning script with all `gcloud` commands |
| `/home/dev/projects/SmartSpecPro/scripts/validate-gcp-setup.sh` | Create | Validation script that checks all bootstrap resources exist |
| `/home/dev/projects/SmartSpecPro/deploy/gcp-config.env` | Create | Configuration constants (project ID, region, SA emails, queue names, secret names) |

---

## Key Decisions

1. **No Terraform for MVP.** All provisioning uses `gcloud` CLI commands documented in shell scripts. Terraform can be introduced later for multi-environment management, but adds unnecessary complexity at MVP scale.

2. **Region selection: `asia-southeast1`.** This is the primary candidate based on proximity to the target user base. The final choice should consider Neon Postgres region availability (`aws-ap-southeast-1` is the closest Neon region). All GCP resources must reside in the same region.

3. **IAM follows least-privilege.** Each service account has only the roles it needs. No service account has `roles/owner` or `roles/editor`. Secret access is granted per-secret, not project-wide.

4. **No long-lived service account keys.** The `github-deploy@` service account uses Workload Identity Federation (Section 17) instead of JSON key files stored in GitHub Secrets. This follows Google's recommended practice.

5. **Secrets are created as empty placeholders.** Actual secret values are populated during the setup of each dependent section (database URL from Section 03, Redis URLs from Section 10, Sentry DSNs from Section 13, etc.). The bootstrap only creates the Secret Manager resource entries.

6. **Cloud Tasks queues are designed for specific workloads.** Queue rate limits and retry policies are tuned to the expected load patterns. These can be adjusted post-launch based on load testing results (Section 19).

---

## Verification Checklist

After running the bootstrap script, verify these conditions:

- [ ] `gcloud projects describe smartspecpro-mvp` returns successfully
- [ ] `gcloud services list --enabled` includes all 10 required APIs
- [ ] `gcloud iam service-accounts list` shows all 4 service accounts
- [ ] `gcloud artifacts repositories describe smartspecpro --location=$REGION` returns the Docker repo
- [ ] `gcloud tasks queues list --location=$REGION` shows all 6 queues
- [ ] `gcloud secrets list` shows all 14 secrets
- [ ] `./scripts/validate-gcp-setup.sh` exits with code 0

---

## Implementation Notes (Actual Build)

**Enhancements applied during code review:**

1. **Pre-flight checks added** - Bootstrap script now validates gcloud CLI is installed and user is authenticated before provisioning.

2. **Cost estimate prompt** - Bootstrap script displays estimated monthly costs (~$5-15/month) with confirmation prompt. Can be skipped via `SKIP_CONFIRM=true` environment variable for automation.

3. **Service account propagation delays** - Added 3-second sleep after each SA creation to avoid race conditions with IAM eventual consistency.

4. **Enhanced IAM validation** - Validation script now checks all 11 critical IAM role bindings (not just 3), preventing silent misconfigurations.

5. **Queue configuration validation** - Validation script verifies rate limits for key queues (media-jobs: 5/s, workflow-tasks: 10/s).

6. **Docker auth validation** - Validation script checks `~/.docker/config.json` for Artifact Registry authentication.

7. **Error visibility** - Removed `--no-user-output-enabled` flag from all IAM/secret bindings to ensure errors are visible.

8. **User warnings** - Added warnings for: Docker global config impact, empty secret placeholders requiring manual population.

9. **Improved defaults** - Validation script infers PROJECT_ID from `gcloud config` if not provided.

All files created as specified. No deviations from planned architecture.