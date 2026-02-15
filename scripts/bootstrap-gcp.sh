#!/usr/bin/env bash
# bootstrap-gcp.sh
# One-shot script to provision all GCP resources for SmartSpecPro MVP.
# Usage: ./scripts/bootstrap-gcp.sh PROJECT_ID REGION BILLING_ACCOUNT_ID [ORG_ID]
#
# Prerequisites:
#   - gcloud CLI installed and authenticated
#   - Billing account ID available
#   - Organization ID (optional, omit for personal accounts)
#
# This script is idempotent -- safe to re-run. Existing resources are skipped.

set -euo pipefail

# Pre-flight checks
if ! command -v gcloud &>/dev/null; then
  echo "ERROR: gcloud CLI not found. Install from https://cloud.google.com/sdk/docs/install"
  exit 1
fi

if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &>/dev/null; then
  echo "ERROR: No active gcloud authentication. Run 'gcloud auth login' first."
  exit 1
fi

# Parse arguments
PROJECT_ID="${1:?Usage: $0 PROJECT_ID REGION BILLING_ACCOUNT_ID [ORG_ID]}"
REGION="${2:?Usage: $0 PROJECT_ID REGION BILLING_ACCOUNT_ID [ORG_ID]}"
BILLING_ACCOUNT="${3:?Usage: $0 PROJECT_ID REGION BILLING_ACCOUNT_ID [ORG_ID]}"
ORG_ID="${4:-}"
SKIP_CONFIRM="${SKIP_CONFIRM:-false}"

echo "=== SmartSpecPro GCP Bootstrap ==="
echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo "Billing: $BILLING_ACCOUNT"
if [[ -n "$ORG_ID" ]]; then
  echo "Organization: $ORG_ID"
else
  echo "Organization: (none - personal account)"
fi
echo ""

# Cost estimate (skip if --yes or SKIP_CONFIRM=true)
if [[ "$SKIP_CONFIRM" != "true" ]] && [[ "${1:-}" != "--yes" ]] && [[ "${1:-}" != "-y" ]]; then
  echo "⚠️  This will provision GCP resources with estimated costs:"
  echo "    - Artifact Registry: ~\$0.10/GB/month"
  echo "    - Secret Manager: ~\$0.06 per 10k accesses"
  echo "    - Cloud Tasks: Free tier (1M ops/month)"
  echo "    Total estimated cost (before compute): ~\$5-15/month"
  echo ""
  read -p "Continue? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# --- Step 1: Project + Billing ---
echo "=== Step 1: Creating project ==="
if gcloud projects describe "$PROJECT_ID" &>/dev/null; then
  echo "Project $PROJECT_ID already exists. Skipping creation."
else
  if [[ -n "$ORG_ID" ]]; then
    gcloud projects create "$PROJECT_ID" \
      --name="SmartSpecPro MVP" \
      --organization="$ORG_ID"
  else
    gcloud projects create "$PROJECT_ID" \
      --name="SmartSpecPro MVP"
  fi
  echo "Project created: $PROJECT_ID"
fi

# Set as active project
gcloud config set project "$PROJECT_ID"

# Link billing
echo "Linking billing account..."
if gcloud billing projects describe "$PROJECT_ID" --format="value(billingAccountName)" &>/dev/null; then
  echo "Billing already linked. Skipping."
else
  gcloud billing projects link "$PROJECT_ID" \
    --billing-account="$BILLING_ACCOUNT"
  echo "Billing linked."
fi

# --- Step 2: Enable APIs ---
echo ""
echo "=== Step 2: Enabling required APIs (this may take 1-2 minutes) ==="
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
  --project="$PROJECT_ID"
echo "APIs enabled."

# --- Step 3: Artifact Registry ---
echo ""
echo "=== Step 3: Creating Artifact Registry repository ==="
if gcloud artifacts repositories describe smartspecpro --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  echo "Artifact Registry repository already exists. Skipping."
else
  gcloud artifacts repositories create smartspecpro \
    --repository-format=docker \
    --location="$REGION" \
    --description="SmartSpecPro Docker images" \
    --project="$PROJECT_ID"
  echo "Artifact Registry repository created."
fi

# Configure Docker authentication
echo "Configuring Docker authentication for ${REGION}-docker.pkg.dev (global config)..."
echo "Note: This affects all GCP projects on this machine."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# --- Step 4: Service Accounts + IAM ---
echo ""
echo "=== Step 4: Creating service accounts ==="

# 4a. Cloud Run API Service Account
SA_NAME="cloud-run-api"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  echo "Service account $SA_NAME already exists. Skipping."
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Cloud Run API Services" \
    --project="$PROJECT_ID"
  echo "Created: $SA_NAME"
  echo "Waiting for service account to propagate..."
  sleep 3
fi

# Bind roles
for ROLE in \
  roles/run.invoker \
  roles/secretmanager.secretAccessor \
  roles/cloudtasks.enqueuer \
  roles/logging.logWriter \
; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --condition=None > /dev/null
done
echo "Roles bound for $SA_NAME"

# 4b. Cloud Run Jobs Service Account
SA_NAME="cloud-run-jobs"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  echo "Service account $SA_NAME already exists. Skipping."
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Cloud Run Jobs (Video/Media)" \
    --project="$PROJECT_ID"
  echo "Created: $SA_NAME"
  echo "Waiting for service account to propagate..."
  sleep 3
fi

for ROLE in \
  roles/secretmanager.secretAccessor \
  roles/logging.logWriter \
  roles/cloudtasks.enqueuer \
; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --condition=None > /dev/null
done
echo "Roles bound for $SA_NAME"

# 4c. Cloud Scheduler Service Account
SA_NAME="cloud-scheduler"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  echo "Service account $SA_NAME already exists. Skipping."
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="Cloud Scheduler" \
    --project="$PROJECT_ID"
  echo "Created: $SA_NAME"
  echo "Waiting for service account to propagate..."
  sleep 3
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA_EMAIL" \
  --role="roles/cloudtasks.enqueuer" \
  --condition=None > /dev/null
echo "Roles bound for $SA_NAME"

# 4d. GitHub Deploy Service Account
SA_NAME="github-deploy"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  echo "Service account $SA_NAME already exists. Skipping."
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="GitHub Actions Deploy" \
    --project="$PROJECT_ID"
  echo "Created: $SA_NAME"
  echo "Waiting for service account to propagate..."
  sleep 3
fi

for ROLE in \
  roles/artifactregistry.writer \
  roles/run.admin \
  roles/iam.serviceAccountUser \
; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE" \
    --condition=None > /dev/null
done
echo "Roles bound for $SA_NAME"

# --- Step 5: Cloud Tasks Queues ---
echo ""
echo "=== Step 5: Creating Cloud Tasks queues ==="

# Helper function to create queue if it doesn't exist
create_queue() {
  local queue_name="$1"
  shift
  if gcloud tasks queues describe "$queue_name" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
    echo "Queue $queue_name already exists. Skipping."
  else
    gcloud tasks queues create "$queue_name" --location="$REGION" --project="$PROJECT_ID" "$@"
    echo "Created queue: $queue_name"
  fi
}

create_queue media-jobs \
  --max-dispatches-per-second=5 \
  --max-concurrent-dispatches=10 \
  --max-attempts=5 \
  --min-backoff=1s \
  --max-backoff=300s

create_queue video-jobs-short \
  --max-dispatches-per-second=2 \
  --max-concurrent-dispatches=10 \
  --max-attempts=3 \
  --min-backoff=5s \
  --max-backoff=600s

create_queue video-jobs-long \
  --max-dispatches-per-second=1 \
  --max-concurrent-dispatches=3 \
  --max-attempts=3 \
  --min-backoff=10s \
  --max-backoff=600s

create_queue workflow-tasks \
  --max-dispatches-per-second=10 \
  --max-concurrent-dispatches=20 \
  --max-attempts=5 \
  --min-backoff=1s \
  --max-backoff=60s

create_queue polling-tasks \
  --max-dispatches-per-second=2 \
  --max-concurrent-dispatches=5 \
  --max-attempts=10 \
  --min-backoff=30s \
  --max-backoff=600s

create_queue periodic-tasks \
  --max-dispatches-per-second=1 \
  --max-concurrent-dispatches=5 \
  --max-attempts=3 \
  --min-backoff=5s \
  --max-backoff=300s

# --- Step 6: Secret Manager ---
echo ""
echo "=== Step 6: Creating Secret Manager secrets ==="

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
  if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
    echo "Secret $SECRET_NAME already exists. Skipping."
  else
    gcloud secrets create "$SECRET_NAME" \
      --replication-policy="automatic" \
      --project="$PROJECT_ID"
    echo "Created secret: $SECRET_NAME"
  fi
done

# Grant access to service accounts
echo "Granting secret access to service accounts..."
for SECRET_NAME in "${SECRETS[@]}"; do
  # Cloud Run API SA
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --member="serviceAccount:cloud-run-api@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID" > /dev/null

  # Cloud Run Jobs SA
  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
    --member="serviceAccount:cloud-run-jobs@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$PROJECT_ID" > /dev/null
done
echo "Secret access granted."
echo ""
echo "⚠️  Secrets created as EMPTY placeholders. You MUST populate them before deployment:"
echo "    Example: echo -n 'value' | gcloud secrets versions add SECRET_NAME --data-file=-"

# --- Step 7: Validate ---
echo ""
echo "=== Step 7: Running validation ==="
SCRIPT_DIR="$(dirname "$0")"
if [[ -f "${SCRIPT_DIR}/validate-gcp-setup.sh" ]]; then
  bash "${SCRIPT_DIR}/validate-gcp-setup.sh" "$PROJECT_ID" "$REGION"
else
  echo "⚠️  Validation script not found. Skipping validation."
  echo "Run ./scripts/validate-gcp-setup.sh manually to verify the setup."
fi

echo ""
echo "=== Bootstrap complete! ==="
echo ""
echo "Next steps:"
echo "1. Populate Secret Manager values (DATABASE_URL, REDIS_UPSTASH_URL, etc.)"
echo "2. Proceed to Section 02: Docker Images"
