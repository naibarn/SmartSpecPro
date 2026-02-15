#!/bin/bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID}"
SERVICE_NAME="${SERVICE_NAME:-node-api}"
START_TIME="$1"  # ISO 8601 format
END_TIME="$2"

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: Set GCP_PROJECT_ID environment variable"
  exit 1
fi

if [[ ! "$PROJECT_ID" =~ ^[a-z][a-z0-9-]{4,28}[a-z0-9]$ ]]; then
  echo "ERROR: Invalid PROJECT_ID format: $PROJECT_ID"
  exit 1
fi

if [[ -z "$START_TIME" ]] || [[ -z "$END_TIME" ]]; then
  echo "Usage: $0 <start-time> <end-time>"
  echo "  Times in ISO 8601 format: 2026-02-15T10:00:00Z"
  exit 1
fi

# Basic ISO 8601 format validation
if [[ ! "$START_TIME" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})$ ]]; then
  echo "ERROR: Invalid START_TIME format: $START_TIME (expected ISO 8601)"
  exit 1
fi

if [[ ! "$END_TIME" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(Z|[+-][0-9]{2}:[0-9]{2})$ ]]; then
  echo "ERROR: Invalid END_TIME format: $END_TIME (expected ISO 8601)"
  exit 1
fi

# Create timestamped output directory
OUTPUT_DIR="metrics-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "Collecting metrics for $SERVICE_NAME from $START_TIME to $END_TIME..."
echo "Output directory: $OUTPUT_DIR"

# Cloud Run instance count
echo "  Fetching instance count..."
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/container/instance_count\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > "$OUTPUT_DIR/metrics-instance-count.json"

# Cloud Run request latency (p95)
echo "  Fetching request latency (p95)..."
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/request_latencies\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --aggregation='{"alignmentPeriod":"60s","perSeriesAligner":"ALIGN_PERCENTILE_95"}' \
  --format=json > "$OUTPUT_DIR/metrics-latency-p95.json"

# Cloud Run CPU utilization
echo "  Fetching CPU utilization..."
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/container/cpu/utilization\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > "$OUTPUT_DIR/metrics-cpu-utilization.json"

# Cloud Run memory utilization
echo "  Fetching memory utilization..."
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"run.googleapis.com/container/memory/utilization\" AND resource.label.service_name=\"$SERVICE_NAME\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > "$OUTPUT_DIR/metrics-memory-utilization.json"

# Cloud Tasks queue depth
echo "  Fetching queue depth..."
gcloud monitoring time-series list \
  --project="$PROJECT_ID" \
  --filter="metric.type=\"cloudtasks.googleapis.com/queue/depth\" AND resource.label.queue_id=\"media-jobs\"" \
  --interval-start-time="$START_TIME" \
  --interval-end-time="$END_TIME" \
  --format=json > "$OUTPUT_DIR/metrics-queue-depth.json"

echo ""
echo "Metrics collected successfully:"
ls -lh "$OUTPUT_DIR"
