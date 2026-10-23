#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Build and promote the latest compatible origin/main full-stack Linux release.

Usage:
  pnpm run release:web:linux [-- --required-integrated-revision <sha>]
  pnpm run build:deploy              # compatibility alias
  (run from repository root or apps/web)

This builds an immutable artifact, prepares it, then invokes the existing
sudo-gated smartspec-web.service promotion with health checks and rollback.
It does not run database migrations or SPEC-224 jobs.
EOF
}

REPOSITORY_PATH="${1:-$PWD}"
if [[ "${REPOSITORY_PATH}" == "--help" || "${REPOSITORY_PATH}" == "-h" ]]; then
  usage
  exit 0
fi
shift || true

REPOSITORY_ROOT="$(git -C "${REPOSITORY_PATH}" rev-parse --show-toplevel)"
if [[ "${1:-}" == "--" ]]; then
  shift
fi
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

# The release build and its nested packaging/publication steps invoke `pnpm`
# directly. Some Linux hosts provide Corepack without a global pnpm shim, so
# provision an ephemeral shim for this release process and its child commands.
PNPM_SHIM_DIR=""
if ! command -v pnpm >/dev/null 2>&1; then
  if ! command -v corepack >/dev/null 2>&1; then
    echo "Neither pnpm nor Corepack is available for the Linux release." >&2
    exit 127
  fi
  PNPM_SHIM_DIR="$(mktemp -d "${TMPDIR:-/tmp}/smartspec-pnpm-shim.XXXXXX")"
  trap 'rm -rf -- "$PNPM_SHIM_DIR"' EXIT
  corepack enable --install-directory "${PNPM_SHIM_DIR}" pnpm
  export PATH="${PNPM_SHIM_DIR}:${PATH}"
  hash -r
fi

BUILD_ENTRYPOINT="${REPOSITORY_ROOT}/skills/canonical-checkout-sync/scripts/build-canonical-main.sh"

if [[ ! -f "${BUILD_ENTRYPOINT}" ]]; then
  echo "Canonical build entrypoint is missing: ${BUILD_ENTRYPOINT}" >&2
  exit 20
fi

echo "[linux-release] Building latest configured canonical revision..." >&2
if ! BUILD_RECORD="$(bash "${BUILD_ENTRYPOINT}" "${REPOSITORY_ROOT}" "$@")"; then
  echo "[linux-release] Canonical build failed; production was not changed." >&2
  exit 21
fi
BUILD_STATUS="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("status", ""))' <<<"${BUILD_RECORD}")"
if [[ "${BUILD_STATUS}" != "BUILD_PASSED" ]]; then
  echo "[linux-release] Build did not pass: ${BUILD_STATUS:-missing status}; production was not changed." >&2
  exit 21
fi

BUILD_RESULT="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["result_file"])' <<<"${BUILD_RECORD}")"
BUILD_WORKSPACE="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["isolated_workspace"])' <<<"${BUILD_RECORD}")"
SOURCE_SHA="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["source_revision"])' <<<"${BUILD_RECORD}")"
RELEASE_TOOL="${BUILD_WORKSPACE}/apps/web/scripts/linux_backend_release.py"

if [[ ! -f "${RELEASE_TOOL}" ]]; then
  echo "[linux-release] Pinned release tool is missing: ${RELEASE_TOOL}" >&2
  exit 22
fi

echo "[linux-release] Preparing immutable frontend/backend artifact for ${SOURCE_SHA}..." >&2
PREPARED="$(python3 "${RELEASE_TOOL}" prepare --build-result "${BUILD_RESULT}")"
ARTIFACT_PATH="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["artifact_path"])' <<<"${PREPARED}")"
RELEASE_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["release_id"])' <<<"${PREPARED}")"

echo "[linux-release] Promoting ${RELEASE_ID}; sudo authorizes the production service restart." >&2
echo "[linux-release] SOURCE_SHA=${SOURCE_SHA}" >&2
echo "[linux-release] IMMUTABLE_ARTIFACT=${ARTIFACT_PATH}" >&2
PROMOTION="$(sudo python3 "${RELEASE_TOOL}" promote --artifact "${ARTIFACT_PATH}")"
PROMOTION_STATUS="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("status", ""))' <<<"${PROMOTION}")"
if [[ "${PROMOTION_STATUS}" != "DEPLOYED_VERIFIED" && "${PROMOTION_STATUS}" != "ALREADY_PROMOTED" ]]; then
  echo "[linux-release] Promotion was not verified: ${PROMOTION_STATUS:-missing status}" >&2
  printf '%s\n' "${PROMOTION}" >&2
  exit 23
fi

python3 - "${PROMOTION}" <<'PY'
import json
import sys

result = json.loads(sys.argv[1])
runtime = result.get("runtime_verification", result.get("runtime", {}))
print(json.dumps({
    "status": result.get("status"),
    "service": result.get("service", "smartspec-web.service"),
    "source_revision": result.get("source_revision", result.get("source_sha")),
    "release_id": result.get("release_id"),
    "artifact_digest": result.get("artifact_digest"),
    "release_path": result.get("release_path"),
    "deployment_receipt": result.get("deployment_receipt"),
    "runtime_verification": runtime,
}, sort_keys=True))
PY

echo "[linux-release] The Linux service is healthy on release ${SOURCE_SHA}. Verify the public hostname separately with the release status and browser steps." >&2
