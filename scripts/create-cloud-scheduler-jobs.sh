#!/usr/bin/env bash
# Creates all Cloud Scheduler jobs for periodic tasks.
#
# Usage: ./scripts/create-cloud-scheduler-jobs.sh <GCP_PROJECT_ID> <GCP_REGION> <PYTHON_SERVICE_URL> [NODE_SERVICE_URL]
#
# Example:
#   ./scripts/create-cloud-scheduler-jobs.sh smartspec-prod us-central1 https://python-orchestrator-xxxxx.run.app https://web-xxxxx.run.app
#
# Each job enqueues into the periodic-tasks Cloud Tasks queue by POSTing
# to the Python Cloud Run Service's handler endpoint. Node-side internal tasks
# use NODE_SERVICE_URL when provided; otherwise they default to PYTHON_SERVICE_URL
# for monolith deployments.

set -euo pipefail

if [ $# -lt 3 ]; then
  echo "Usage: $0 <GCP_PROJECT_ID> <GCP_REGION> <PYTHON_SERVICE_URL> [NODE_SERVICE_URL]"
  echo "Example: $0 smartspec-prod us-central1 https://python-orchestrator-xxxxx.run.app https://web-xxxxx.run.app"
  exit 1
fi

GCP_PROJECT="$1"
GCP_REGION="$2"
PYTHON_SERVICE_URL="$3"
NODE_SERVICE_URL="${4:-$PYTHON_SERVICE_URL}"
SA_EMAIL="cloud-scheduler@${GCP_PROJECT}.iam.gserviceaccount.com"

echo "Creating Cloud Scheduler jobs..."
echo "  Project:     ${GCP_PROJECT}"
echo "  Region:      ${GCP_REGION}"
echo "  Python URL:  ${PYTHON_SERVICE_URL}"
echo "  Node URL:    ${NODE_SERVICE_URL}"
echo "  SA Email:    ${SA_EMAIL}"
echo ""

create_job() {
  local job_name="$1"
  local schedule="$2"
  local handler_path="$3"
  local description="$4"
  local service_url="${5:-$PYTHON_SERVICE_URL}"

  echo "Creating job: ${job_name} (${schedule}) -> ${service_url}${handler_path}"

  # Delete existing job if it exists (for idempotent re-runs)
  gcloud scheduler jobs delete "${job_name}" \
    --project="${GCP_PROJECT}" \
    --location="${GCP_REGION}" \
    --quiet 2>/dev/null || true

  gcloud scheduler jobs create http "${job_name}" \
    --project="${GCP_PROJECT}" \
    --location="${GCP_REGION}" \
    --schedule="${schedule}" \
    --uri="${service_url}${handler_path}" \
    --http-method=POST \
    --headers="Content-Type=application/json" \
    --message-body='{}' \
    --oidc-service-account-email="${SA_EMAIL}" \
    --oidc-token-audience="${service_url}" \
    --time-zone="UTC" \
    --attempt-deadline="600s" \
    --description="${description}"
}

# ── CeleryBeat replacements ──────────────────────────────────────────────

create_job "cleanup-expired-tasks" \
  "0 3 * * *" \
  "/tasks/cleanup-expired" \
  "Daily at 3 AM UTC. Deletes media tasks older than 12 days."

create_job "retry-failed-tasks" \
  "*/15 * * * *" \
  "/tasks/retry-failed" \
  "Every 15 min. Retries tasks in failed state eligible for retry."

create_job "retry-media-callbacks" \
  "* * * * *" \
  "/tasks/retry-callbacks" \
  "Every minute. Retries failed webhook/callback deliveries."

create_job "retry-library-index" \
  "* * * * *" \
  "/tasks/retry-callbacks" \
  "Every minute. Retries failed library indexing jobs (shares handler)."

create_job "recover-stuck-tasks" \
  "*/2 * * * *" \
  "/tasks/recover-stuck" \
  "Every 2 min. Recovers tasks stuck in processing state."

create_job "check-scheduled-workflows" \
  "* * * * *" \
  "/tasks/check-workflows" \
  "Every minute. Checks for workflow schedules that are due."

create_job "cleanup-edit-sessions" \
  "*/30 * * * *" \
  "/tasks/cleanup-sessions" \
  "Every 30 min. Expires stale Google Drive edit sessions."

create_job "renew-drive-channels" \
  "0 */6 * * *" \
  "/tasks/renew-drive-channels" \
  "Every 6 hours. Renews expiring Google Drive webhook channels."

create_job "poll-drive-changes" \
  "*/15 * * * *" \
  "/tasks/poll-drive-changes" \
  "Every 15 min. Fallback polling when Drive webhook is down."

# ── New periodic jobs ────────────────────────────────────────────────────

create_job "process-dead-letters" \
  "0 8 * * *" \
  "/tasks/process-dead-letters" \
  "Daily at 8 AM UTC. Reviews dead-letter tasks and sends admin alerts."

create_job "cleanup-redis-stale" \
  "*/5 * * * *" \
  "/tasks/cleanup-redis-stale" \
  "Every 5 min. Cleans stale Redis active-job entries (replaces Node.js setInterval)."

create_job "deliver-scheduled-messages" \
  "* * * * *" \
  "/tasks/deliver-scheduled-fallback" \
  "Every minute. Fallback for BullMQ scheduled message migration."

create_job "production-execution-reconcile" \
  "* * * * *" \
  "/_internal/tasks/production-execution-reconcile" \
  "Every minute. Reconciles pending Feature 116 provider executions and credit ledger terminal states." \
  "${NODE_SERVICE_URL}"

echo ""
echo "All 13 Cloud Scheduler jobs created successfully."
echo "Verify with: gcloud scheduler jobs list --project=${GCP_PROJECT} --location=${GCP_REGION}"
