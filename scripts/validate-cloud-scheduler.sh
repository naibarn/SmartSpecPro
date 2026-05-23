#!/usr/bin/env bash
# Validates that all required Cloud Scheduler jobs exist with correct configuration.
#
# Usage: ./scripts/validate-cloud-scheduler.sh <GCP_PROJECT_ID> <GCP_REGION>
# Exit 0 if all jobs exist and are correctly configured, non-zero otherwise.
#
# Checks for each job:
#   - Job exists in Cloud Scheduler
#   - Cron expression matches expected value
#   - Target is an HTTP POST
#   - OIDC authentication is configured with the cloud-scheduler@ service account

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "Usage: $0 <GCP_PROJECT_ID> <GCP_REGION>"
  exit 1
fi

GCP_PROJECT="$1"
GCP_REGION="$2"
SA_EMAIL="cloud-scheduler@${GCP_PROJECT}.iam.gserviceaccount.com"

PASS=0
FAIL=0
TOTAL=0

validate_job() {
  local job_name="$1"
  local expected_schedule="$2"
  local expected_path="$3"

  TOTAL=$((TOTAL + 1))

  # Check job exists
  local desc
  desc=$(gcloud scheduler jobs describe "${job_name}" \
    --project="${GCP_PROJECT}" \
    --location="${GCP_REGION}" \
    --format=json 2>/dev/null) || {
    echo "FAIL: ${job_name} — job not found"
    FAIL=$((FAIL + 1))
    return
  }

  # Check schedule
  local actual_schedule
  actual_schedule=$(echo "${desc}" | jq -r '.schedule // empty')
  if [ "${actual_schedule}" != "${expected_schedule}" ]; then
    echo "FAIL: ${job_name} — schedule mismatch (expected: ${expected_schedule}, got: ${actual_schedule})"
    FAIL=$((FAIL + 1))
    return
  fi

  # Check HTTP method
  local method
  method=$(echo "${desc}" | jq -r '.httpTarget.httpMethod // empty')
  if [ "${method}" != "POST" ]; then
    echo "FAIL: ${job_name} — HTTP method is ${method}, expected POST"
    FAIL=$((FAIL + 1))
    return
  fi

  # Check URI contains expected path
  local uri
  uri=$(echo "${desc}" | jq -r '.httpTarget.uri // empty')
  if [[ "${uri}" != *"${expected_path}"* ]]; then
    echo "FAIL: ${job_name} — URI '${uri}' does not contain '${expected_path}'"
    FAIL=$((FAIL + 1))
    return
  fi

  # Check OIDC auth
  local oidc_email
  oidc_email=$(echo "${desc}" | jq -r '.httpTarget.oidcToken.serviceAccountEmail // empty')
  if [ "${oidc_email}" != "${SA_EMAIL}" ]; then
    echo "FAIL: ${job_name} — OIDC SA is '${oidc_email}', expected '${SA_EMAIL}'"
    FAIL=$((FAIL + 1))
    return
  fi

  echo "PASS: ${job_name}"
  PASS=$((PASS + 1))
}

echo "Validating Cloud Scheduler jobs in ${GCP_PROJECT} / ${GCP_REGION}..."
echo ""

validate_job "cleanup-expired-tasks"      "0 3 * * *"     "/tasks/cleanup-expired"
validate_job "retry-failed-tasks"          "*/15 * * * *"  "/tasks/retry-failed"
validate_job "retry-media-callbacks"       "* * * * *"     "/tasks/retry-callbacks"
validate_job "retry-library-index"         "* * * * *"     "/tasks/retry-callbacks"
validate_job "recover-stuck-tasks"         "*/2 * * * *"   "/tasks/recover-stuck"
validate_job "check-scheduled-workflows"   "* * * * *"     "/tasks/check-workflows"
validate_job "cleanup-edit-sessions"       "*/30 * * * *"  "/tasks/cleanup-sessions"
validate_job "renew-drive-channels"        "0 */6 * * *"   "/tasks/renew-drive-channels"
validate_job "poll-drive-changes"          "*/15 * * * *"  "/tasks/poll-drive-changes"
validate_job "process-dead-letters"        "0 8 * * *"     "/tasks/process-dead-letters"
validate_job "cleanup-redis-stale"         "*/5 * * * *"   "/tasks/cleanup-redis-stale"
validate_job "deliver-scheduled-messages"  "* * * * *"     "/tasks/deliver-scheduled-fallback"
validate_job "production-execution-reconcile" "* * * * *"   "/_internal/tasks/production-execution-reconcile"

echo ""
echo "Results: ${PASS}/${TOTAL} passed, ${FAIL} failed"

if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi

echo "All Cloud Scheduler jobs validated successfully."
exit 0
