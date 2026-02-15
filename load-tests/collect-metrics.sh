#!/bin/bash
set -e

PROJECT_ID="${GCP_PROJECT_ID}"
SERVICE_NAME="${SERVICE_NAME:-node-api}"
START_TIME="$1"  # ISO 8601 format
END_TIME="$2"

if [ -z "$PROJECT_ID" ]; then
  echo "Error: Set GCP_PROJECT_ID environment variable"
  exit 1
fi

if [ -z "$START_TIME" ] || [ -z "$END_TIME" ]; then
  echo "Usage: $0 <start-time> <end-time>"
  echo "  Times in ISO 8601 format: 2026-02-15T10:00:00Z"
  exit 1
fi

echo "Collecting metrics for $SERVICE_NAME from $START_TIME to $END_TIME..."

# Cloud Run instance count
echo "  Fetching instance count..."
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/container/instance_count\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > metrics-instance-count.json

# Cloud Run request latency (p95)
echo "  Fetching request latency (p95)..."
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/request_latencies\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_PERCENTILE_95"}' \
  --format=json > metrics-latency-p95.json

# Cloud Run CPU utilization
echo "  Fetching CPU utilization..."
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/container/cpu/utilization\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > metrics-cpu-utilization.json

# Cloud Run memory utilization
echo "  Fetching memory utilization..."
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/container/memory/utilization\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > metrics-memory-utilization.json

# Cloud Tasks queue depth
echo "  Fetching queue depth..."
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"cloudtasks.googleapis.com/queue/depth\" AND resource.label.queue_id=\"media-jobs\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > metrics-queue-depth.json

echo ""
echo "Metrics collected successfully:"
ls -lh metrics-*.json
