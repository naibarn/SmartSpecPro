#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../../.." && pwd)"

export CONTENT_PROTECTION_PROVIDER="${CONTENT_PROTECTION_PROVIDER:-videoseal}"
export CONTENT_PROTECTION_WORKER_CAPABILITY="${CONTENT_PROTECTION_WORKER_CAPABILITY:-true}"
export CONTENT_PROTECTION_PROVIDER_COMMAND="${CONTENT_PROTECTION_PROVIDER_COMMAND:-$ROOT/videoseal-provider.sh}"
export CONTENT_PROTECTION_PYTHON="${CONTENT_PROTECTION_PYTHON:-$REPO_ROOT/python-backend/.venv/bin/python}"
export CONTENT_PROTECTION_MODEL_DIR="${CONTENT_PROTECTION_MODEL_DIR:-$REPO_ROOT/ckpts}"
export CONTENT_PROTECTION_FFMPEG="${CONTENT_PROTECTION_FFMPEG:-$(command -v ffmpeg || true)}"
export CONTENT_PROTECTION_FFPROBE="${CONTENT_PROTECTION_FFPROBE:-$(command -v ffprobe || true)}"

for executable in "$CONTENT_PROTECTION_FFMPEG" "$CONTENT_PROTECTION_FFPROBE"; do
  if [[ ! -x "$executable" ]]; then
    echo "Required media executable is not available: $executable" >&2
    exit 1
  fi
done

exec npm --workspace apps/worker-app run tauri:dev "$@"
