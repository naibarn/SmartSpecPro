#!/usr/bin/env bash
set -euo pipefail

echo "ERROR: readiness markers are retired; run session-finish to pass the FAST INTEGRATION GATE and promote into the configured canonical ref" >&2
exit 2
