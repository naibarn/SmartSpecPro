#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Build and promote a full-stack Linux release, or reuse a verified build receipt.

Usage:
  pnpm run release:web:linux -- --target legacy-debian-dev [--required-integrated-revision <sha>]
  pnpm run release:web:linux -- --target legacy-debian-dev --build-result <receipt.json>
  (run from repository root or apps/web)

By default this builds an immutable artifact. With --build-result it reuses
that exact verified build receipt and artifact without rebuilding. It then
prepares the immutable release and invokes the existing
delegated smartspec-web.service development promotion with health checks and rollback.
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

BUILD_RESULT_INPUT=""
REQUIRED_REVISION=""
TARGET_ID=""
BUILD_ARGS=()
while (($#)); do
  case "$1" in
    --target)
      if (($# < 2)) || [[ -z "$2" ]]; then
        echo "[linux-release] --target requires a registered target ID." >&2
        exit 2
      fi
      TARGET_ID="$2"
      shift 2
      ;;
    --build-result)
      if (($# < 2)) || [[ -z "$2" ]]; then
        echo "[linux-release] --build-result requires a receipt path." >&2
        exit 2
      fi
      BUILD_RESULT_INPUT="$2"
      shift 2
      ;;
    --required-integrated-revision)
      if (($# < 2)) || [[ -z "$2" ]]; then
        echo "[linux-release] --required-integrated-revision requires a SHA." >&2
        exit 2
      fi
      REQUIRED_REVISION="$2"
      BUILD_ARGS+=("$1" "$2")
      shift 2
      ;;
    *)
      BUILD_ARGS+=("$1")
      shift
      ;;
  esac
done

if [[ -z "${TARGET_ID}" ]]; then
  echo "[linux-release] Deployment target is required; use --target legacy-debian-dev." >&2
  exit 2
fi

if [[ "${TARGET_ID}" != "legacy-debian-dev" ]]; then
  echo "[linux-release] This controller only accepts legacy-debian-dev; no other domain was built or changed." >&2
  exit 20
fi

python3 - "${REPOSITORY_ROOT}" "${TARGET_ID}" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

root, target_id = Path(sys.argv[1]), sys.argv[2]
try:
    raw = subprocess.check_output(
        ["git", "-C", str(root), "show", "HEAD:apps/web/scripts/deployment-targets.json"],
        text=True,
    )
    target = json.loads(raw)["targets"][target_id]
except (subprocess.CalledProcessError, ValueError, KeyError, TypeError) as exc:
    raise SystemExit("[linux-release] Canonical deployment target registry is missing or invalid.") from exc
expected = {
    "domain": "smartaihub.app", "environment": "development",
    "runtime": "debian-systemd", "service": "smartspec-web.service",
    "port": 3000, "controller": "linux-fullstack-immutable",
    "deploymentAuthority": "delegated-development", "deployable": True,
}
if any(target.get(key) != value for key, value in expected.items()):
    raise SystemExit("[linux-release] Target registry does not bind legacy-debian-dev to the approved Debian service.")
PY

if [[ -n "${BUILD_RESULT_INPUT}" ]]; then
  if [[ ! -f "${BUILD_RESULT_INPUT}" ]]; then
    echo "[linux-release] Build receipt does not exist; no target was changed." >&2
    exit 21
  fi
  BUILD_RECORD="$(python3 - "${BUILD_RESULT_INPUT}" "${REQUIRED_REVISION}" <<'PY'
import json
import re
import sys
from pathlib import Path

record = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
source = record.get("source_revision")
if (record.get("status") != "BUILD_PASSED" or record.get("source_verified") is not True
        or record.get("canonical_ref") != "refs/heads/main"
        or not isinstance(source, str) or not re.fullmatch(r"[0-9a-f]{40,64}", source)
        or record.get("canonical_tip_after_build") != source
        or not isinstance(record.get("artifact"), dict)):
    raise SystemExit("Build receipt is not a verified immutable origin/main build.")
if sys.argv[2] and source != sys.argv[2]:
    raise SystemExit("Build receipt SHA does not match --required-integrated-revision.")
print(json.dumps(record, sort_keys=True))
PY
)" || {
    echo "[linux-release] Existing build receipt is invalid; no target was changed." >&2
    exit 21
  }
  echo "[linux-release] Reusing verified build receipt ${BUILD_RESULT_INPUT}; no rebuild." >&2
else
  echo "[linux-release] Building latest configured canonical revision..." >&2
  if ! BUILD_RECORD="$(bash "${BUILD_ENTRYPOINT}" "${REPOSITORY_ROOT}" "${BUILD_ARGS[@]}")"; then
    echo "[linux-release] Canonical build failed; no target was changed." >&2
    exit 21
  fi
fi
BUILD_STATUS="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("status", ""))' <<<"${BUILD_RECORD}")"
if [[ "${BUILD_STATUS}" != "BUILD_PASSED" ]]; then
  echo "[linux-release] Build did not pass: ${BUILD_STATUS:-missing status}; no target was changed." >&2
  exit 21
fi

BUILD_RESULT="$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("result_file") or sys.argv[1])' "${BUILD_RESULT_INPUT}" <<<"${BUILD_RECORD}")"
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

  echo "[linux-release] Promoting ${RELEASE_ID} to ${TARGET_ID}; this operation is scoped to the delegated development target." >&2
echo "[linux-release] SOURCE_SHA=${SOURCE_SHA}" >&2
echo "[linux-release] IMMUTABLE_ARTIFACT=${ARTIFACT_PATH}" >&2
PROMOTION="$(sudo python3 "${RELEASE_TOOL}" promote --target "${TARGET_ID}" --artifact "${ARTIFACT_PATH}")"
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
    "target_id": result.get("target_id"),
    "target_domain": result.get("target_domain"),
    "logical_environment": result.get("logical_environment"),
    "service": result.get("service", "smartspec-web.service"),
    "source_revision": result.get("source_revision", result.get("source_sha")),
    "release_id": result.get("release_id"),
    "artifact_digest": result.get("artifact_digest"),
    "release_path": result.get("release_path"),
    "deployment_receipt": result.get("deployment_receipt"),
    "runtime_verification": runtime,
}, sort_keys=True))
PY

echo "[linux-release] The Debian development service is healthy on release ${SOURCE_SHA}. Verify the public hostname separately with the release status and browser steps." >&2
