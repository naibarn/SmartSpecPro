diff --git a/deploy/gcp-config.env b/deploy/gcp-config.env
new file mode 100644
index 0000000..6b25123
--- /dev/null
+++ b/deploy/gcp-config.env
@@ -0,0 +1,40 @@
+# GCP Project Configuration
+# Referenced by deploy scripts, CI/CD, and Cloud Run service definitions.
+# Do NOT put actual secret values here -- only resource names and IDs.
+
+GCP_PROJECT_ID=smartspecpro-mvp
+GCP_REGION=asia-southeast1
+
+# Artifact Registry
+AR_REPO=smartspecpro
+AR_HOST=${GCP_REGION}-docker.pkg.dev
+
+# Service Account Emails
+SA_CLOUD_RUN_API=cloud-run-api@${GCP_PROJECT_ID}.iam.gserviceaccount.com
+SA_CLOUD_RUN_JOBS=cloud-run-jobs@${GCP_PROJECT_ID}.iam.gserviceaccount.com
+SA_CLOUD_SCHEDULER=cloud-scheduler@${GCP_PROJECT_ID}.iam.gserviceaccount.com
+SA_GITHUB_DEPLOY=github-deploy@${GCP_PROJECT_ID}.iam.gserviceaccount.com
+
+# Cloud Tasks Queue Names
+QUEUE_MEDIA_JOBS=media-jobs
+QUEUE_VIDEO_SHORT=video-jobs-short
+QUEUE_VIDEO_LONG=video-jobs-long
+QUEUE_WORKFLOW=workflow-tasks
+QUEUE_POLLING=polling-tasks
+QUEUE_PERIODIC=periodic-tasks
+
+# Secret Manager Secret Names
+SECRET_DATABASE_URL=DATABASE_URL
+SECRET_REDIS_UPSTASH=REDIS_UPSTASH_URL
+SECRET_REDIS_MEMORYSTORE=REDIS_MEMORYSTORE_URL
+SECRET_LLM_KEY=LLM_ENCRYPTION_KEY
+SECRET_JWT=JWT_SECRET
+SECRET_KIE_API=KIE_AI_API_KEY
+SECRET_KIE_WEBHOOK=KIE_AI_WEBHOOK_SECRET
+SECRET_SENTRY_FE=SENTRY_DSN_FRONTEND
+SECRET_SENTRY_NODE=SENTRY_DSN_NODE
+SECRET_SENTRY_PY=SENTRY_DSN_PYTHON
+SECRET_POSTHOG=POSTHOG_API_KEY
+SECRET_R2_ACCESS=R2_ACCESS_KEY
+SECRET_R2_SECRET=R2_SECRET_KEY
+SECRET_R2_ACCOUNT=R2_ACCOUNT_ID
diff --git a/scripts/bootstrap-gcp.sh b/scripts/bootstrap-gcp.sh
new file mode 100755
index 0000000..61d2e54
--- /dev/null
+++ b/scripts/bootstrap-gcp.sh
@@ -0,0 +1,319 @@
+#!/usr/bin/env bash
+# bootstrap-gcp.sh
+# One-shot script to provision all GCP resources for SmartSpecPro MVP.
+# Usage: ./scripts/bootstrap-gcp.sh PROJECT_ID REGION BILLING_ACCOUNT_ID [ORG_ID]
+#
+# Prerequisites:
+#   - gcloud CLI installed and authenticated
+#   - Billing account ID available
+#   - Organization ID (optional, omit for personal accounts)
+#
+# This script is idempotent -- safe to re-run. Existing resources are skipped.
+
+set -euo pipefail
+
+PROJECT_ID="${1:?Usage: $0 PROJECT_ID REGION BILLING_ACCOUNT_ID [ORG_ID]}"
+REGION="${2:?Usage: $0 PROJECT_ID REGION BILLING_ACCOUNT_ID [ORG_ID]}"
+BILLING_ACCOUNT="${3:?Usage: $0 PROJECT_ID REGION BILLING_ACCOUNT_ID [ORG_ID]}"
+ORG_ID="${4:-}"
+
+echo "=== SmartSpecPro GCP Bootstrap ==="
+echo "Project: $PROJECT_ID"
+echo "Region:  $REGION"
+echo "Billing: $BILLING_ACCOUNT"
+if [[ -n "$ORG_ID" ]]; then
+  echo "Organization: $ORG_ID"
+fi
+echo ""
+
+# --- Step 1: Project + Billing ---
+echo "=== Step 1: Creating project ==="
+if gcloud projects describe "$PROJECT_ID" &>/dev/null; then
+  echo "Project $PROJECT_ID already exists. Skipping creation."
+else
+  if [[ -n "$ORG_ID" ]]; then
+    gcloud projects create "$PROJECT_ID" \
+      --name="SmartSpecPro MVP" \
+      --organization="$ORG_ID"
+  else
+    gcloud projects create "$PROJECT_ID" \
+      --name="SmartSpecPro MVP"
+  fi
+  echo "Project created: $PROJECT_ID"
+fi
+
+# Set as active project
+gcloud config set project "$PROJECT_ID"
+
+# Link billing
+echo "Linking billing account..."
+if gcloud billing projects describe "$PROJECT_ID" --format="value(billingAccountName)" &>/dev/null; then
+  echo "Billing already linked. Skipping."
+else
+  gcloud billing projects link "$PROJECT_ID" \
+    --billing-account="$BILLING_ACCOUNT"
+  echo "Billing linked."
+fi
+
+# --- Step 2: Enable APIs ---
+echo ""
+echo "=== Step 2: Enabling required APIs ==="
+gcloud services enable \
+  run.googleapis.com \
+  cloudtasks.googleapis.com \
+  cloudscheduler.googleapis.com \
+  artifactregistry.googleapis.com \
+  secretmanager.googleapis.com \
+  logging.googleapis.com \
+  monitoring.googleapis.com \
+  iam.googleapis.com \
+  iamcredentials.googleapis.com \
+  redis.googleapis.com \
+  --project="$PROJECT_ID"
+echo "APIs enabled."
+
+# --- Step 3: Artifact Registry ---
+echo ""
+echo "=== Step 3: Creating Artifact Registry repository ==="
+if gcloud artifacts repositories describe smartspecpro --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
+  echo "Artifact Registry repository already exists. Skipping."
+else
+  gcloud artifacts repositories create smartspecpro \
+    --repository-format=docker \
+    --location="$REGION" \
+    --description="SmartSpecPro Docker images" \
+    --project="$PROJECT_ID"
+  echo "Artifact Registry repository created."
+fi
+
+# Configure Docker authentication
+echo "Configuring Docker authentication..."
+gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
+
+# --- Step 4: Service Accounts + IAM ---
+echo ""
+echo "=== Step 4: Creating service accounts ==="
+
+# 4a. Cloud Run API Service Account
+SA_NAME="cloud-run-api"
+SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
+if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
+  echo "Service account $SA_NAME already exists. Skipping."
+else
+  gcloud iam service-accounts create "$SA_NAME" \
+    --display-name="Cloud Run API Services" \
+    --project="$PROJECT_ID"
+  echo "Created: $SA_NAME"
+fi
+
+# Bind roles
+for ROLE in \
+  roles/run.invoker \
+  roles/secretmanager.secretAccessor \
+  roles/cloudtasks.enqueuer \
+  roles/logging.logWriter \
+; do
+  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
+    --member="serviceAccount:$SA_EMAIL" \
+    --role="$ROLE" \
+    --condition=None \
+    --no-user-output-enabled
+done
+echo "Roles bound for $SA_NAME"
+
+# 4b. Cloud Run Jobs Service Account
+SA_NAME="cloud-run-jobs"
+SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
+if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
+  echo "Service account $SA_NAME already exists. Skipping."
+else
+  gcloud iam service-accounts create "$SA_NAME" \
+    --display-name="Cloud Run Jobs (Video/Media)" \
+    --project="$PROJECT_ID"
+  echo "Created: $SA_NAME"
+fi
+
+for ROLE in \
+  roles/secretmanager.secretAccessor \
+  roles/logging.logWriter \
+  roles/cloudtasks.enqueuer \
+; do
+  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
+    --member="serviceAccount:$SA_EMAIL" \
+    --role="$ROLE" \
+    --condition=None \
+    --no-user-output-enabled
+done
+echo "Roles bound for $SA_NAME"
+
+# 4c. Cloud Scheduler Service Account
+SA_NAME="cloud-scheduler"
+SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
+if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
+  echo "Service account $SA_NAME already exists. Skipping."
+else
+  gcloud iam service-accounts create "$SA_NAME" \
+    --display-name="Cloud Scheduler" \
+    --project="$PROJECT_ID"
+  echo "Created: $SA_NAME"
+fi
+
+gcloud projects add-iam-policy-binding "$PROJECT_ID" \
+  --member="serviceAccount:$SA_EMAIL" \
+  --role="roles/cloudtasks.enqueuer" \
+  --condition=None \
+  --no-user-output-enabled
+echo "Roles bound for $SA_NAME"
+
+# 4d. GitHub Deploy Service Account
+SA_NAME="github-deploy"
+SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
+if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
+  echo "Service account $SA_NAME already exists. Skipping."
+else
+  gcloud iam service-accounts create "$SA_NAME" \
+    --display-name="GitHub Actions Deploy" \
+    --project="$PROJECT_ID"
+  echo "Created: $SA_NAME"
+fi
+
+for ROLE in \
+  roles/artifactregistry.writer \
+  roles/run.admin \
+  roles/iam.serviceAccountUser \
+; do
+  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
+    --member="serviceAccount:$SA_EMAIL" \
+    --role="$ROLE" \
+    --condition=None \
+    --no-user-output-enabled
+done
+echo "Roles bound for $SA_NAME"
+
+# --- Step 5: Cloud Tasks Queues ---
+echo ""
+echo "=== Step 5: Creating Cloud Tasks queues ==="
+
+# Helper function to create queue if it doesn't exist
+create_queue() {
+  local queue_name="$1"
+  shift
+  if gcloud tasks queues describe "$queue_name" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
+    echo "Queue $queue_name already exists. Skipping."
+  else
+    gcloud tasks queues create "$queue_name" --location="$REGION" --project="$PROJECT_ID" "$@"
+    echo "Created queue: $queue_name"
+  fi
+}
+
+create_queue media-jobs \
+  --max-dispatches-per-second=5 \
+  --max-concurrent-dispatches=10 \
+  --max-attempts=5 \
+  --min-backoff=1s \
+  --max-backoff=300s
+
+create_queue video-jobs-short \
+  --max-dispatches-per-second=2 \
+  --max-concurrent-dispatches=10 \
+  --max-attempts=3 \
+  --min-backoff=5s \
+  --max-backoff=600s
+
+create_queue video-jobs-long \
+  --max-dispatches-per-second=1 \
+  --max-concurrent-dispatches=3 \
+  --max-attempts=3 \
+  --min-backoff=10s \
+  --max-backoff=600s
+
+create_queue workflow-tasks \
+  --max-dispatches-per-second=10 \
+  --max-concurrent-dispatches=20 \
+  --max-attempts=5 \
+  --min-backoff=1s \
+  --max-backoff=60s
+
+create_queue polling-tasks \
+  --max-dispatches-per-second=2 \
+  --max-concurrent-dispatches=5 \
+  --max-attempts=10 \
+  --min-backoff=30s \
+  --max-backoff=600s
+
+create_queue periodic-tasks \
+  --max-dispatches-per-second=1 \
+  --max-concurrent-dispatches=5 \
+  --max-attempts=3 \
+  --min-backoff=5s \
+  --max-backoff=300s
+
+# --- Step 6: Secret Manager ---
+echo ""
+echo "=== Step 6: Creating Secret Manager secrets ==="
+
+SECRETS=(
+  "DATABASE_URL"
+  "REDIS_UPSTASH_URL"
+  "REDIS_MEMORYSTORE_URL"
+  "LLM_ENCRYPTION_KEY"
+  "JWT_SECRET"
+  "KIE_AI_API_KEY"
+  "KIE_AI_WEBHOOK_SECRET"
+  "SENTRY_DSN_FRONTEND"
+  "SENTRY_DSN_NODE"
+  "SENTRY_DSN_PYTHON"
+  "POSTHOG_API_KEY"
+  "R2_ACCESS_KEY"
+  "R2_SECRET_KEY"
+  "R2_ACCOUNT_ID"
+)
+
+for SECRET_NAME in "${SECRETS[@]}"; do
+  if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
+    echo "Secret $SECRET_NAME already exists. Skipping."
+  else
+    gcloud secrets create "$SECRET_NAME" \
+      --replication-policy="automatic" \
+      --project="$PROJECT_ID"
+    echo "Created secret: $SECRET_NAME"
+  fi
+done
+
+# Grant access to service accounts
+echo "Granting secret access to service accounts..."
+for SECRET_NAME in "${SECRETS[@]}"; do
+  # Cloud Run API SA
+  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
+    --member="serviceAccount:cloud-run-api@${PROJECT_ID}.iam.gserviceaccount.com" \
+    --role="roles/secretmanager.secretAccessor" \
+    --project="$PROJECT_ID" \
+    --condition=None \
+    --no-user-output-enabled
+
+  # Cloud Run Jobs SA
+  gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
+    --member="serviceAccount:cloud-run-jobs@${PROJECT_ID}.iam.gserviceaccount.com" \
+    --role="roles/secretmanager.secretAccessor" \
+    --project="$PROJECT_ID" \
+    --condition=None \
+    --no-user-output-enabled
+done
+echo "Secret access granted."
+
+# --- Step 7: Validate ---
+echo ""
+echo "=== Step 7: Running validation ==="
+if [[ -f "$(dirname "$0")/validate-gcp-setup.sh" ]]; then
+  bash "$(dirname "$0")/validate-gcp-setup.sh" "$PROJECT_ID" "$REGION"
+else
+  echo "⚠️  Validation script not found. Skipping validation."
+  echo "Run ./scripts/validate-gcp-setup.sh manually to verify the setup."
+fi
+
+echo ""
+echo "=== Bootstrap complete! ==="
+echo ""
+echo "Next steps:"
+echo "1. Populate Secret Manager values (DATABASE_URL, REDIS_UPSTASH_URL, etc.)"
+echo "2. Proceed to Section 02: Docker Images"
diff --git a/scripts/validate-gcp-setup.sh b/scripts/validate-gcp-setup.sh
new file mode 100755
index 0000000..4325993
--- /dev/null
+++ b/scripts/validate-gcp-setup.sh
@@ -0,0 +1,144 @@
+#!/usr/bin/env bash
+# validate-gcp-setup.sh
+# Validates that all GCP bootstrap resources are correctly provisioned.
+# Usage: ./scripts/validate-gcp-setup.sh [PROJECT_ID] [REGION]
+# Returns: exit 0 if all checks pass, exit 1 with a list of missing/misconfigured resources.
+
+set -euo pipefail
+
+PROJECT_ID="${1:-smartspecpro-mvp}"
+REGION="${2:-asia-southeast1}"
+ERRORS=()
+
+# --- Helper ---
+check() {
+  # Runs a gcloud command; if it fails or returns empty, records an error.
+  # $1 = description, rest = command to run
+  local desc="$1"
+  shift
+  if ! output=$("$@" 2>&1); then
+    ERRORS+=("FAIL: $desc - command failed: $*")
+    return 1
+  fi
+  if [[ -z "$output" ]]; then
+    ERRORS+=("FAIL: $desc - no output from: $*")
+    return 1
+  fi
+  echo "PASS: $desc"
+  return 0
+}
+
+echo "=== SmartSpecPro GCP Bootstrap Validation ==="
+echo "Project: $PROJECT_ID"
+echo "Region:  $REGION"
+echo ""
+
+# --- 1. Project exists and billing is linked ---
+check "Project exists" \
+  gcloud projects describe "$PROJECT_ID" --format="value(projectId)"
+
+check "Billing is linked" \
+  gcloud billing projects describe "$PROJECT_ID" --format="value(billingAccountName)"
+
+# --- 2. Required APIs are enabled ---
+REQUIRED_APIS=(
+  "run.googleapis.com"
+  "cloudtasks.googleapis.com"
+  "cloudscheduler.googleapis.com"
+  "artifactregistry.googleapis.com"
+  "secretmanager.googleapis.com"
+  "logging.googleapis.com"
+  "monitoring.googleapis.com"
+  "iam.googleapis.com"
+  "iamcredentials.googleapis.com"
+  "redis.googleapis.com"
+)
+
+for API in "${REQUIRED_APIS[@]}"; do
+  check "API enabled: $API" \
+    gcloud services list --enabled --project="$PROJECT_ID" --filter="name:$API" --format="value(name)"
+done
+
+# --- 3. Service accounts exist ---
+SERVICE_ACCOUNTS=(
+  "cloud-run-api"
+  "cloud-run-jobs"
+  "cloud-scheduler"
+  "github-deploy"
+)
+
+for SA_NAME in "${SERVICE_ACCOUNTS[@]}"; do
+  SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
+  check "Service account: $SA_NAME" \
+    gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" --format="value(email)"
+done
+
+# --- 4. Service account IAM roles ---
+# Check key roles for each SA
+check "cloud-run-api has secretAccessor role" \
+  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
+    --filter="bindings.members:serviceAccount:cloud-run-api@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/secretmanager.secretAccessor" \
+    --format="value(bindings.role)"
+
+check "cloud-run-jobs has secretAccessor role" \
+  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
+    --filter="bindings.members:serviceAccount:cloud-run-jobs@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/secretmanager.secretAccessor" \
+    --format="value(bindings.role)"
+
+check "github-deploy has artifactregistry.writer role" \
+  gcloud projects get-iam-policy "$PROJECT_ID" --flatten="bindings[].members" \
+    --filter="bindings.members:serviceAccount:github-deploy@${PROJECT_ID}.iam.gserviceaccount.com AND bindings.role:roles/artifactregistry.writer" \
+    --format="value(bindings.role)"
+
+# --- 5. Artifact Registry repository exists ---
+check "Artifact Registry repository: smartspecpro" \
+  gcloud artifacts repositories describe smartspecpro --location="$REGION" --project="$PROJECT_ID" --format="value(name)"
+
+# --- 6. Cloud Tasks queues exist with correct config ---
+QUEUES=(
+  "media-jobs"
+  "video-jobs-short"
+  "video-jobs-long"
+  "workflow-tasks"
+  "polling-tasks"
+  "periodic-tasks"
+)
+
+for QUEUE in "${QUEUES[@]}"; do
+  check "Cloud Tasks queue: $QUEUE" \
+    gcloud tasks queues describe "$QUEUE" --location="$REGION" --project="$PROJECT_ID" --format="value(name)"
+done
+
+# --- 7. Secret Manager secrets exist (not checking values) ---
+SECRETS=(
+  "DATABASE_URL"
+  "REDIS_UPSTASH_URL"
+  "REDIS_MEMORYSTORE_URL"
+  "LLM_ENCRYPTION_KEY"
+  "JWT_SECRET"
+  "KIE_AI_API_KEY"
+  "KIE_AI_WEBHOOK_SECRET"
+  "SENTRY_DSN_FRONTEND"
+  "SENTRY_DSN_NODE"
+  "SENTRY_DSN_PYTHON"
+  "POSTHOG_API_KEY"
+  "R2_ACCESS_KEY"
+  "R2_SECRET_KEY"
+  "R2_ACCOUNT_ID"
+)
+
+for SECRET_NAME in "${SECRETS[@]}"; do
+  check "Secret exists: $SECRET_NAME" \
+    gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" --format="value(name)"
+done
+
+# --- Report ---
+echo ""
+if [[ ${#ERRORS[@]} -eq 0 ]]; then
+  echo "✅ All checks passed! GCP bootstrap is complete."
+  exit 0
+else
+  echo "❌ Validation failed with ${#ERRORS[@]} error(s):"
+  printf '%s\n' "${ERRORS[@]}"
+  exit 1
+fi
