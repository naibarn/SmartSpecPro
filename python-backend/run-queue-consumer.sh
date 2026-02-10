#!/bin/bash
# Start Redis Streams Queue Consumer for workflow queue_trigger nodes

set -e

cd "$(dirname "$0")"

echo "🚀 Starting Queue Consumer..."
echo "   Monitoring queues: workflow-queue, default-queue"
echo "   Press Ctrl+C to stop"
echo ""

# Activate virtual environment if it exists
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# Run the consumer
python -m app.services.queue_consumer
