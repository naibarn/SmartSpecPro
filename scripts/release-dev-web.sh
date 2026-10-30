#!/usr/bin/env bash
set -euo pipefail

# Development-only immutable web release. This script intentionally has no sudo
# path and never calls the production release controller.
REPOSITORY_ROOT="$(git -C "${1:-$PWD}" rev-parse --show-toplevel)"
cd "${REPOSITORY_ROOT}"
shift || true
if [[ "${1:-}" == "--" ]]; then shift; fi

usage() {
  cat <<'EOF'
Build and activate an immutable artifact on smartspec-dev-web.service only.

Usage:
  pnpm run release:dev:web
  pnpm run release:dev:web -- --build-result <verified-receipt.json>

The default path builds the configured canonical main revision. Activation is
restricted to the user-level service on port 3100 and the aimarkethubs.com
development tunnel. Production services and release pointers are fingerprinted
before and after activation and must remain unchanged.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then usage; exit 0; fi

BUILD_RESULT_INPUT=""
while (($#)); do
  case "$1" in
    --build-result)
      if (($# < 2)) || [[ -z "$2" ]]; then echo "--build-result requires a receipt path." >&2; exit 2; fi
      BUILD_RESULT_INPUT="$2"
      shift 2
      ;;
    *) echo "Unknown development release option: $1" >&2; exit 2 ;;
  esac
done

for command in git python3 systemctl journalctl curl sha256sum flock; do
  command -v "$command" >/dev/null || { echo "Required command is missing: $command" >&2; exit 2; }
done

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Development release requires the integrated main checkout." >&2
  exit 20
fi
git fetch --no-tags origin refs/heads/main:refs/remotes/origin/main
if [[ "$(git rev-parse HEAD)" != "$(git rev-parse refs/remotes/origin/main)" ]]; then
  echo "Local main must match origin/main before building a development release." >&2
  exit 20
fi

DEV_TUNNEL_CONFIG="${HOME}/.config/smartspec-dev/cloudflared.yml"
DEV_SERVICE="smartspec-dev-web.service"
DEV_TUNNEL="smartspec-dev-tunnel.service"
PROD_WEB="smartspec-web.service"
PROD_WORKER="smartspec-node-worker.service"
PROD_RELEASE_POINTER="${HOME}/production-releases/smartspec-web-current"
DROPIN_DIR="${HOME}/.config/systemd/user/${DEV_SERVICE}.d"
DROPIN="${DROPIN_DIR}/99-immutable-canonical-build.conf"
STATE_DIR="${HOME}/.local/state/smartspec-dev-web"
DEPLOYMENT_RECORD="${STATE_DIR}/last-deployment.json"
mkdir -p "$STATE_DIR"
exec 9>"${STATE_DIR}/release.lock"
flock -n 9 || { echo "Another development web release is already running." >&2; exit 27; }

[[ -f "$DEV_TUNNEL_CONFIG" ]] || { echo "Development tunnel config is missing: $DEV_TUNNEL_CONFIG" >&2; exit 21; }
python3 - "$DEV_TUNNEL_CONFIG" <<'PY'
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text(encoding="utf-8")
if not re.search(r"-\s*hostname:\s*aimarkethubs\.com\s*\n\s*service:\s*http://127\.0\.0\.1:3100(?:\s|$)", text):
    raise SystemExit("Development tunnel must route aimarkethubs.com to 127.0.0.1:3100")
if re.search(r"-\s*hostname:\s*smartaihub\.app\b", text):
    raise SystemExit("Production hostname must not be present in the development tunnel")
PY
node "${REPOSITORY_ROOT}/apps/web/scripts/verifyDevWebConfig.mjs" \
  "${HOME}/.config/smartspec-dev/web.env" aimarkethubs.com 3100

systemctl --user is-active --quiet "$DEV_TUNNEL" || { echo "Development tunnel is not active." >&2; exit 22; }
systemctl is-active --quiet "$PROD_WEB" || { echo "Production web service is not active; refusing development release." >&2; exit 23; }
systemctl is-active --quiet "$PROD_WORKER" || { echo "Production worker service is not active; refusing development release." >&2; exit 23; }

service_config="$(systemctl --user show "$DEV_SERVICE" --property=FragmentPath --property=DropInPaths --property=WorkingDirectory --property=ExecStart --property=EnvironmentFiles --property=Environment)"
[[ "$service_config" == *"smartspec-dev-web.service"* && "$service_config" == *"SMARTSPEC_DEV_ENV_FILE="*"/web.env"* && "$service_config" == *"SMARTSPEC_DEV_WEB_PORT=3100"* ]] || {
  echo "Development service identity, environment file, or port does not match the isolated deployment target." >&2
  exit 22
}
if ! systemctl --user is-active --quiet "$DEV_SERVICE"; then
  systemctl --user is-enabled --quiet "$DEV_SERVICE" || { echo "Inactive development service is not enabled for safe recovery." >&2; exit 22; }
  echo "[dev-release] Recovering the isolated development service from its last failed activation." >&2
fi

production_fingerprint() {
  {
    printf 'release=%s\n' "$(readlink -f "$PROD_RELEASE_POINTER")"
    systemctl show "$PROD_WEB" --property=ActiveState --property=MainPID --property=ExecMainStartTimestamp --property=FragmentPath --property=DropInPaths --property=WorkingDirectory --property=ExecStart --property=EnvironmentFiles
    systemctl show "$PROD_WORKER" --property=ActiveState --property=MainPID --property=ExecMainStartTimestamp --property=FragmentPath --property=DropInPaths --property=WorkingDirectory --property=ExecStart --property=EnvironmentFiles
  } | sha256sum | awk '{print $1}'
}
PRODUCTION_BEFORE="$(production_fingerprint)"
PRODUCTION_RELEASE_BEFORE="$(readlink -f "$PROD_RELEASE_POINTER")"

BUILD_ENTRYPOINT="${REPOSITORY_ROOT}/skills/canonical-checkout-sync/scripts/build-canonical-main.sh"
if [[ -n "$BUILD_RESULT_INPUT" ]]; then
  [[ -f "$BUILD_RESULT_INPUT" ]] || { echo "Build receipt does not exist." >&2; exit 24; }
  BUILD_RECORD="$(python3 - "$BUILD_RESULT_INPUT" <<'PY'
import json, re, sys
from pathlib import Path
record = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
source = record.get("source_revision")
if (record.get("status") != "BUILD_PASSED" or record.get("source_verified") is not True
        or record.get("canonical_ref") != "refs/heads/main"
        or not isinstance(source, str) or not re.fullmatch(r"[0-9a-f]{40,64}", source)
        or record.get("canonical_tip_after_build") != source
        or not isinstance(record.get("artifact"), dict)):
    raise SystemExit("Receipt is not a verified immutable canonical-main build.")
print(json.dumps(record, sort_keys=True))
PY
)"
else
  echo "[dev-release] Building canonical main; no production activation path is invoked." >&2
  BUILD_RECORD="$(bash "$BUILD_ENTRYPOINT" "$REPOSITORY_ROOT")"
fi

BUILD_RESULT="$(python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("result_file") or "")' <<<"$BUILD_RECORD")"
SOURCE_SHA="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["source_revision"])' <<<"$BUILD_RECORD")"
ARTIFACT_PATH="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["artifact"]["artifact_path"])' <<<"$BUILD_RECORD")"
ARTIFACT_DIGEST="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["artifact"]["artifact_digest"])' <<<"$BUILD_RECORD")"
PUBLIC_DIR="${ARTIFACT_PATH}/public"
[[ -f "${PUBLIC_DIR}/index.html" && -f "$BUILD_RESULT" ]] || { echo "Verified build output is incomplete." >&2; exit 24; }
[[ "$(git -C "${REPOSITORY_ROOT}" rev-parse HEAD)" == "$SOURCE_SHA" ]] || { echo "Build source is not the integrated development checkout." >&2; exit 24; }

mkdir -p "$DROPIN_DIR" "$STATE_DIR"
DROPIN_BACKUP="$(mktemp)"
PUBLIC_VERIFY_DIR=""
DROPIN_EXISTED=0
if [[ -f "$DROPIN" ]]; then cp -p "$DROPIN" "$DROPIN_BACKUP"; DROPIN_EXISTED=1; fi
ROLLBACK_NEEDED=1
rollback_dev() {
  if [[ "$ROLLBACK_NEEDED" == 1 ]]; then
    if [[ "$DROPIN_EXISTED" == 1 ]]; then cp -p "$DROPIN_BACKUP" "$DROPIN"; else rm -f "$DROPIN"; fi
    systemctl --user daemon-reload >/dev/null 2>&1 || true
    systemctl --user restart "$DEV_SERVICE" >/dev/null 2>&1 || true
  fi
  rm -f "$DROPIN_BACKUP"
  if [[ -n "$PUBLIC_VERIFY_DIR" ]]; then rm -rf "$PUBLIC_VERIFY_DIR"; fi
}
trap rollback_dev EXIT

tmp_dropin="$(mktemp "${DROPIN_DIR}/.release.XXXXXX")"
cat >"$tmp_dropin" <<EOF
[Service]
Environment=SMARTSPEC_DEV_WEB_PORT=3100
Environment=SMARTSPEC_DEV_BUILT_PUBLIC_DIR=${PUBLIC_DIR}
Environment=SMARTSPEC_DEV_BUILD_RESULT=${BUILD_RESULT}
EOF
chmod 0644 "$tmp_dropin"
mv -f "$tmp_dropin" "$DROPIN"
systemctl --user daemon-reload
systemctl --user restart "$DEV_SERVICE"

healthy=0
for attempt in {1..60}; do
  if curl --max-time 2 --silent --fail http://127.0.0.1:3100/healthz >/dev/null; then healthy=1; break; fi
  sleep 1
done
[[ "$healthy" == 1 ]] || { echo "Development service did not become healthy on port 3100." >&2; exit 25; }
if curl --max-time 5 --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:8100/health/ready | grep -q '^200$'; then
  :
else
  echo "The isolated development API/backend health endpoint is not ready." >&2
  exit 25
fi

DEV_MAIN_PID="$(systemctl --user show "$DEV_SERVICE" --property=MainPID --value)"
DEV_SOURCE_DIR="${REPOSITORY_ROOT}/apps/web"
[[ -n "$DEV_MAIN_PID" && "$(readlink -f "/proc/${DEV_MAIN_PID}/cwd")" == "$DEV_SOURCE_DIR" ]] || {
  echo "Development runtime is not executing from the expected development source checkout." >&2
  exit 25
}
RUNTIME_REVISION="$(journalctl --user -u "$DEV_SERVICE" -n 80 --no-pager -o cat | python3 -c 'import re,sys; values=re.findall(r"\[dev:web\] revision=([0-9a-f]{40,64}(?:-dirty)?) port=3100\b", sys.stdin.read()); print(values[-1] if values else "")')"
[[ "$RUNTIME_REVISION" == "$SOURCE_SHA" || "$RUNTIME_REVISION" == "${SOURCE_SHA}-dirty" ]] || {
  echo "Development backend runtime revision does not match the canonical artifact source." >&2
  exit 25
}
# The previous artifact may belong to an older checkout and no longer be
# restartable by the current launcher. Once the new local runtime is proven
# healthy, retain it if only the public edge check is unavailable.
ROLLBACK_NEEDED=0

python3 - "$PUBLIC_DIR/index.html" "$SOURCE_SHA" "$ARTIFACT_DIGEST" "$DEV_SERVICE" <<'PY'
import json, re, sys
from pathlib import Path
index = Path(sys.argv[1]).read_text(encoding="utf-8")
if "/@vite/client" in index or "vite/client" in index:
    raise SystemExit("Built development artifact unexpectedly contains Vite HMR.")
assets = re.findall(r'''(?:src|href)=["'](/assets/[^"']+\.(?:js|css))["']''', index)
if not assets:
    raise SystemExit("Built index does not reference immutable assets.")
print(json.dumps({"source_revision": sys.argv[2], "artifact_digest": sys.argv[3], "service": sys.argv[4], "index_assets": assets}, sort_keys=True))
PY

curl --max-time 15 --silent --show-error --fail \
  -A 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' \
  https://aimarkethubs.com/healthz >/dev/null
PUBLIC_VERIFY_DIR="$(mktemp -d)"
PUBLIC_CHAT_HTML="${PUBLIC_VERIFY_DIR}/chat.html"
PUBLIC_CHAT_ASSET="${PUBLIC_VERIFY_DIR}/chat-asset.js"
curl --max-time 20 --silent --show-error --fail \
  -H 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' \
  -H 'Accept-Language: en-US,en;q=0.9,th;q=0.8' \
  -H 'Cache-Control: no-cache' \
  -H 'Sec-Fetch-Dest: document' -H 'Sec-Fetch-Mode: navigate' -H 'Sec-Fetch-Site: none' \
  -H 'Upgrade-Insecure-Requests: 1' \
  -A 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' \
  https://aimarkethubs.com/chat --output "$PUBLIC_CHAT_HTML"
PUBLIC_ASSET="$(python3 - "$PUBLIC_CHAT_HTML" <<'PY'
import re, sys
html = open(sys.argv[1], encoding="utf-8", errors="replace").read()
if "/@vite/client" in html:
    raise SystemExit("Development domain returned a Vite development page.")
assets = re.findall(r'''(?:src|href)=["'](/assets/[^"']+\.js)["']''', html)
if not assets:
    raise SystemExit("Development domain returned no immutable JavaScript assets.")
print(assets[0])
PY
)"
curl --max-time 30 --silent --show-error --fail \
  -A 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' \
  "https://aimarkethubs.com${PUBLIC_ASSET}" --output "$PUBLIC_CHAT_ASSET"
PUBLIC_ASSET_PROOF="$(python3 - "$PUBLIC_DIR" "$PUBLIC_ASSET" "$PUBLIC_CHAT_ASSET" <<'PY'
import hashlib, json, sys
from pathlib import Path
root, asset, remote_path = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
local = root / asset.lstrip("/")
if not local.is_file():
    raise SystemExit("Public asset is missing from the immutable artifact.")
local_digest = hashlib.sha256(local.read_bytes()).hexdigest()
remote_digest = hashlib.sha256(remote_path.read_bytes()).hexdigest()
if local_digest != remote_digest:
    raise SystemExit(f"Public asset differs from release artifact: {asset}")
print(json.dumps({"domain": "aimarkethubs.com", "status": 200, "verified_asset": asset, "asset_sha256": remote_digest}, sort_keys=True))
PY
)"
rm -rf "$PUBLIC_VERIFY_DIR"

PRODUCTION_AFTER="$(production_fingerprint)"
PRODUCTION_RELEASE_AFTER="$(readlink -f "$PROD_RELEASE_POINTER")"
if [[ "$PRODUCTION_BEFORE" != "$PRODUCTION_AFTER" || "$PRODUCTION_RELEASE_BEFORE" != "$PRODUCTION_RELEASE_AFTER" ]]; then
  echo "Production service/release fingerprint changed during development activation; dev release is being rolled back." >&2
  exit 26
fi

python3 - "$DEPLOYMENT_RECORD" "$BUILD_RESULT" "$SOURCE_SHA" "$RUNTIME_REVISION" "$ARTIFACT_DIGEST" "$ARTIFACT_PATH" "$PUBLIC_DIR" "$PRODUCTION_RELEASE_AFTER" "$PRODUCTION_BEFORE" "$PRODUCTION_AFTER" "$PUBLIC_ASSET_PROOF" <<'PY'
import json, sys, time
from pathlib import Path
target = Path(sys.argv[1])
record = {
  "status": "DEV_RELEASE_VERIFIED",
  "deployed_at_epoch": int(time.time()),
  "domain": "aimarkethubs.com",
  "service": "smartspec-dev-web.service",
  "port": 3100,
  "tunnel_service": "smartspec-dev-tunnel.service",
  "build_result": sys.argv[2],
  "source_sha": sys.argv[3],
  "backend_runtime_revision": sys.argv[4],
  "artifact_sha256": sys.argv[5],
  "artifact_path": sys.argv[6],
  "public_dir": sys.argv[7],
  "public_asset_proof": json.loads(sys.argv[11]),
  "production_release_preserved": sys.argv[8],
  "production_services_fingerprint_before": sys.argv[9],
  "production_services_fingerprint_after": sys.argv[10],
  "production_service": "smartspec-web.service",
}
target.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8")
target.chmod(0o600)
print(json.dumps(record, sort_keys=True))
PY

ROLLBACK_NEEDED=0
rm -f "$DROPIN_BACKUP"
trap - EXIT
