#!/usr/bin/env bash
# validate-gcp-setup.sh
# Validates that all GCP bootstrap resources are correctly provisioned.
# Usage: ./scripts/validate-gcp-setup.sh [PROJECT_ID] [REGION]
# Returns: exit 0 if all checks pass, exit 1 with a list of missing/misconfigured resources.

set -euo pipefail

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || echo "")}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "ERROR: PROJECT_ID not specified and no default project configured."
  echo "Usage: $0 PROJECT_ID [REGION]"
  exit 1
fi
REGION="${2:-asia-southeast1}"
ERRORS=()

# --- Helper ---
check() {
  # Runs a gcloud command; if it fails or returns empty, records an error.
  # $1 = description, rest = command to run
  local desc="$1"
  shift
  if ! output=$("$@" 2>&1); then
    ERRORS+=("FAIL: $desc - command failed: $*")
    return 1
  fi
  if [[ -z "$output" ]]; then
    ERRORS+=("FAIL: $desc - no output from: $*")
    return 1
  fi
  echo "PASS: $desc"
  return 0
}

echo "=== SmartSpecPro GCP Bootstrap Validation ==="
echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo ""

# --- 1. Project exists and billing is linked ---
check "Project exists" \
  gcloud projects describe "$PROJECT_ID" --format="value(projectId)"

check "Billing is linked" \
  gcloud billing projects describe "$PROJECT_ID" --format="value(billingAccountName)"

# --- 2. Required APIs are enabled ---
REQUIRED_APIS=(
  "run.googleapis.com"
  "cloudtasks.googleapis.com"
  "cloudscheduler.googleapis.com"
  "artifactregistry.googleapis.com"
  "secretmanager.googleapis.com"
  "logging.googleapis.com"
  "monitoring.googleapis.com"
  "iam.googleapis.com"
  "iamcredentials.googleapis.com"
  "redis.googleapis.com"
)

for API in "${REQUIRED_APIS[@]}"; do
  check "API enabled: $API" \
    gcloud services list --enabled --project="$PROJECT_ID" --filter="name:$API" --format="value(name)"
done

# --- 3. Service accounts exist ---
SERVICE_ACCOUNTS=(
  "cloud-run-api"
  "cloud-run-jobs"
  "cloud-scheduler"
  "github-deploy"
)

for SA_NAME in "${SERVICE_ACCOUNTS[@]}"; do
  SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
  check "Service account: $SA_NAME" \
    gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" --format="value(email)"
done

# --- 4. Service account IAM roles ---
# Check all required roles for each SA
check "cloud-run-api has run.invoker role" \
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:cloud-run-api@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/run.invoker" \
    --format="value(bindings.role)"

check "cloud-run-api has secretAccessor role" \
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:cloud-run-api@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/secretmanager.secretAccessor" \
    --format="value(bindings.role)"

check "cloud-run-api has cloudtasks.enqueuer role" \
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:cloud-run-api@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/cloudtasks.enqueuer" \
    --format="value(bindings.role)"

check "cloud-run-api has logging.logWriter role" \
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:cloud-run-api@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/logging.logWriter" \
    --format="value(bindings.role)"

check "cloud-run-jobs has secretAccessor role" \
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:cloud-run-jobs@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/secretmanager.secretAccessor" \
    --format="value(bindings.role)"

check "cloud-run-jobs has logging.logWriter role" \
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:cloud-run-jobs@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/logging.logWriter" \
    --format="value(bindings.role)"

check "cloud-run-jobs has cloudtasks.enqueuer role" \
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:cloud-run-jobs@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/cloudtasks.enqueuer" \
    --format="value(bindings.role)"

check "cloud-scheduler has cloudtasks.enqueuer role" \
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:cloud-scheduler@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/cloudtasks.enqueuer" \
    --format="value(bindings.role)"

check "github-deploy has artifactregistry.writer role" \
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:github-deploy@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/artifactregistry.writer" \
    --format="value(bindings.role)"

check "github-deploy has run.admin role" \
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:github-deploy@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/run.admin" \
    --format="value(bindings.role)"

check "github-deploy has iam.serviceAccountUser role" \
  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
    --filter="bindings.members:serviceAccount:github-deploy@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/iam.serviceAccountUser" \
    --format="value(bindings.role)"

# --- 5. Artifact Registry repository exists ---
check "Artifact Registry repository: smartspecpro" \
  gcloud artifacts repositories describe smartspecpro --location="$REGION" --project="$PROJECT_ID" --format="value(name)"

# --- 6. Cloud Tasks queues exist with correct config ---
QUEUES=(
  "media-jobs"
  "video-jobs-short"
  "video-jobs-long"
  "workflow-tasks"
  "polling-tasks"
  "periodic-tasks"
)

for QUEUE in "${QUEUES[@]}"; do
  check "Cloud Tasks queue: $QUEUE" \
    gcloud tasks queues describe "$QUEUE" --location="$REGION" --project="$PROJECT_ID" --format="value(name)"
done

# Validate key queue configurations
MEDIA_RATE=$(gcloud tasks queues describe media-jobs --location="$REGION" --project="$PROJECT_ID" --format="value(rateLimits.maxDispatchesPerSecond)" 2>/dev/null || echo "")
if [[ -n "$MEDIA_RATE" ]] && [[ "$MEDIA_RATE" != "5.0" ]] && [[ "$MEDIA_RATE" != "5" ]]; then
  ERRORS+=("FAIL: Queue media-jobs has wrong rate limit: expected 5, got $MEDIA_RATE")
else
  echo "PASS: Queue media-jobs has correct rate limit (5/s)"
fi

WORKFLOW_RATE=$(gcloud tasks queues describe workflow-tasks --location="$REGION" --project="$PROJECT_ID" --format="value(rateLimits.maxDispatchesPerSecond)" 2>/dev/null || echo "")
if [[ -n "$WORKFLOW_RATE" ]] && [[ "$WORKFLOW_RATE" != "10.0" ]] && [[ "$WORKFLOW_RATE" != "10" ]]; then
  ERRORS+=("FAIL: Queue workflow-tasks has wrong rate limit: expected 10, got $WORKFLOW_RATE")
else
  echo "PASS: Queue workflow-tasks has correct rate limit (10/s)"
fi

# --- 7. Secret Manager secrets exist (not checking values) ---
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
  check "Secret exists: $SECRET_NAME" \
    gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" --format="value(name)"
done

# --- 8. Docker authentication ---
if [[ -f "$HOME/.docker/config.json" ]] && grep -q "${REGION}-docker.pkg.dev" "$HOME/.docker/config.json" 2>/dev/null; then
  echo "PASS: Docker authenticated for Artifact Registry"
else
  ERRORS+=("FAIL: Docker not authenticated for ${REGION}-docker.pkg.dev")
fi

# --- Report ---
echo ""
if [[ ${#ERRORS[@]} -eq 0 ]]; then
  echo "✅ All checks passed! GCP bootstrap is complete."
  exit 0
else
  echo "❌ Validation failed with ${#ERRORS[@]} error(s):"
  printf '%s\n' "${ERRORS[@]}"
  exit 1
fi
