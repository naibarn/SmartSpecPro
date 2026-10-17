#!/usr/bin/env bash
set -euo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
node "${WEB_DIR}/scripts/live-build-target-guard.mjs" "${WEB_DIR}/dist/public"
