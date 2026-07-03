#!/usr/bin/env bash
set -euo pipefail
echo "[vertical-drama] run: this skill is invoked by the episode pipeline (llm-only, no direct exec)"
echo "[vertical-drama] bundle=$(cd "$(dirname "$0")/.." && pwd)"
