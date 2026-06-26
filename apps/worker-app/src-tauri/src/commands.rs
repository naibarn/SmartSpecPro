use crate::credentials::{
    clear_connection, ensure_device_proof_material, load_connection, load_connection_device_proof,
    save_connection_with_device_proof, save_device_proof_material, StoredWorkerConnection,
    WorkerDeviceProofMaterial,
};
use crate::diagnostics::{append_diagnostic_event, diagnostic_log_path};
use crate::executor_state::ExecutorState;
use crate::runtime_manifest::{
    doctor_from_installed_or_default_paths, read_runtime_pack_manifest, DoctorCheck, DoctorSummary,
    RuntimePackManifest,
};
use crate::settings::{save_settings, WorkerAppSettings};
use crate::WorkerAppState;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

use crate::control_plane::{build_registration_payload, WorkerAppRegistrationPayload};
use crate::executor_state::ExecutorStatus;
use crate::worker_control_plane::{post_worker_json, WorkerApiTokens, WorkerLoopConnection};
use crate::worker_loop::{start_worker_loop, WorkerLoopStatus};

#[derive(Debug, Clone, PartialEq, Eq)]
struct WorkerTokenBindingSummary {
    connection_id: Option<String>,
    device_id: Option<String>,
    expires_at: Option<i64>,
    jti: Option<String>,
    machine_fingerprint_hash: Option<String>,
    public_key_fingerprint: Option<String>,
    token_use: Option<String>,
    worker_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct LocalDeviceProofSummary {
    device_id: String,
    machine_fingerprint_hash: String,
    public_key_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectSession {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub verification_uri_complete: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectPollResponse {
    pub status: String,
    pub interval: Option<u64>,
    pub expires_at: Option<String>,
    pub worker: Option<WorkerConnectWorker>,
    pub tokens: Option<WorkerConnectTokens>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectWorker {
    pub id: String,
    pub display_name: String,
    pub runtime_type: String,
    pub machine_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerConnectTokens {
    pub execution_token: String,
    pub upload_token: String,
    pub refresh_token: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeInstallResult {
    pub status: String,
    pub message: String,
    pub manifest: Option<RuntimePackManifest>,
    pub doctor: DoctorSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct WorkerConnectRefreshEnvelope {
    pub tokens: WorkerConnectTokens,
}

fn get_effective_runtime_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data directory: {error}"))?;

    // Load settings, if failed or if runtime_dir is empty, use app_data_dir
    let settings = crate::settings::load_settings(&app_data_dir);
    if !settings.runtime_dir.trim().is_empty() {
        let custom_path = PathBuf::from(settings.runtime_dir.trim());
        // Create the directory if it doesn't exist
        if !custom_path.exists() {
            if let Err(e) = std::fs::create_dir_all(&custom_path) {
                return Err(format!("Failed to create custom runtime directory: {}", e));
            }
        }
        return Ok(custom_path);
    }

    Ok(app_data_dir)
}

#[tauri::command]
pub async fn worker_app_get_settings(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerAppSettings, String> {
    state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())
}

#[tauri::command]
pub async fn worker_app_save_settings(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    settings: WorkerAppSettings,
) -> Result<WorkerAppSettings, String> {
    settings.validate()?;
    let settings = WorkerAppSettings {
        server_url: settings.normalized_server_url(),
        ..settings
    };
    let mut locked = state
        .settings
        .lock()
        .map_err(|_| "settings lock poisoned".to_string())?;
    *locked = settings.clone();
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    save_settings(&app_data_dir, &settings)?;
    Ok(settings)
}

#[tauri::command]
pub async fn worker_app_get_saved_connection(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<Option<StoredWorkerConnection>, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let Some(connection) = load_connection(&app_data_dir)? else {
        append_diagnostic_event(&app_data_dir, "connection.restore.none", json!({}));
        return Ok(None);
    };
    let device_proof = match load_connection_device_proof(&app_data_dir)? {
        Some(device_proof) => device_proof,
        None => ensure_device_proof_material(&app_data_dir)?,
    };
    validate_connection_tokens_match_device_proof(
        &app_data_dir,
        "connection.restore",
        &connection.tokens,
        &device_proof,
    )
    .inspect_err(|_| {
        let _ = clear_connection(&app_data_dir);
    })?;
    set_active_connected_device_proof(&state, Some(device_proof.clone()))?;
    append_diagnostic_event(
        &app_data_dir,
        "connection.restore.ok",
        json!({
            "workerId": connection.worker.id,
            "serverUrl": connection.server_url,
            "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
        }),
    );
    Ok(Some(connection))
}

#[tauri::command]
pub async fn worker_app_clear_saved_connection(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    clear_connection(&app_data_dir)?;
    set_active_connected_device_proof(&state, None)?;
    if let Ok(mut pending) = state.pending_connect_device_proof.lock() {
        *pending = None;
    }
    worker_app_stop_worker_loop(state).await.map(|_| ())
}

#[tauri::command]
pub async fn worker_app_get_executor_state(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<ExecutorState, String> {
    state
        .executor
        .lock()
        .map(|executor| executor.clone())
        .map_err(|_| "executor lock poisoned".to_string())
}

#[tauri::command]
pub async fn worker_app_run_doctor(app: tauri::AppHandle) -> Result<DoctorSummary, String> {
    build_runtime_doctor(app, false)
}

#[tauri::command]
pub async fn worker_app_run_full_doctor(app: tauri::AppHandle) -> Result<DoctorSummary, String> {
    build_runtime_doctor(app, true)
}

#[cfg(target_os = "windows")]
const WSL_BROWSER_DEPENDENCY_REPAIR_SCRIPT: &str = r#"set -Eeuo pipefail
sudo dpkg --configure -a || true
sudo apt-get --fix-broken install -y || true
sudo apt-get update
resolve_pkg() {
  for candidate in "$@"; do
    if apt-cache show "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}
PACKAGES=(libnspr4 libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libxkbcommon0 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libdrm2 libxshmfence1 libpangocairo-1.0-0 libpango-1.0-0 libcairo2 fontconfig fonts-liberation fonts-noto-color-emoji fonts-noto-cjk fonts-noto-core fonts-noto-extra fonts-noto-ui-core fonts-freefont-ttf fonts-dejavu-core)
AUDIO_PKG="$(resolve_pkg libasound2t64 libasound2 liboss4-salsa-asound2 || true)"
if [ -n "$AUDIO_PKG" ]; then PACKAGES+=("$AUDIO_PKG"); fi
sudo apt-get install -y --no-install-recommends "${PACKAGES[@]}"
fc-cache -fv || true
echo
echo Smart AI Hub WSL browser dependency repair finished.
read -r -p 'Press Enter to close this window...'
"#;

#[cfg(target_os = "windows")]
const MANAGED_WSL_RUNTIME_SETUP_SCRIPT_TEMPLATE: &str = r#"#!/usr/bin/env bash
set -Eeuo pipefail
ROOT=__SMARTAIHUB_MANAGED_WSL_ROOT_EXPR__
SERVER_URL=__SMARTAIHUB_SERVER_URL_EXPR__
RUNTIME_CHANNEL=__SMARTAIHUB_RUNTIME_CHANNEL_EXPR__
mkdir -p "$ROOT" "$ROOT/cache" "$ROOT/logs" "$ROOT/tools"
LOG_PATH="$ROOT/logs/setup-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_PATH") 2>&1
finish() {
  status=$?
  echo
  echo "Managed WSL setup log: $LOG_PATH"
  if [ "$status" -eq 0 ]; then
    echo "Managed WSL runtime setup completed successfully."
    echo "Return to the Worker App and click Run checks."
  else
    echo "Managed WSL runtime setup failed with exit code $status."
    echo "Read the error above, then fix it and click Prepare managed WSL runtime again."
  fi
  echo
  read -r -p 'Press Enter to close this window...'
  exit "$status"
}
trap finish EXIT
echo "Smart AI Hub managed WSL runtime root: $ROOT"
echo "Smart AI Hub runtime source: $SERVER_URL"

repair_apt_state() {
  echo "Repairing WSL apt/dpkg state if needed..."
  sudo dpkg --configure -a || true
  sudo apt-get --fix-broken install -y || true
  sudo apt-get update
}

ensure_python() {
  if command -v python3 >/dev/null 2>&1; then
    return 0
  fi
  repair_apt_state
  sudo apt-get install -y --no-install-recommends python3-minimal
}

download_url() {
  url="$1"
  dest="$2"
  mkdir -p "$(dirname "$dest")"
  if command -v curl >/dev/null 2>&1; then
    echo "Downloading with WSL curl: $url"
    curl --fail --location --retry 3 --retry-delay 2 --connect-timeout 30 --continue-at - --output "$dest" "$url"
    return 0
  fi
  if [ -x /mnt/c/Windows/System32/curl.exe ]; then
    echo "Downloading with Windows curl.exe through WSL: $url"
    tmp_dest="${dest}.windows-curl-download"
    rm -f "$tmp_dest"
    /mnt/c/Windows/System32/curl.exe --fail --location --retry 3 --retry-delay 2 --connect-timeout 30 "$url" > "$tmp_dest"
    mv "$tmp_dest" "$dest"
    return 0
  fi
  echo "curl was not found; falling back to Python urllib downloader."
  python3 - "$1" "$2" <<'PY'
import os
import shutil
import sys
import urllib.error
import urllib.request

url, dest = sys.argv[1], sys.argv[2]
os.makedirs(os.path.dirname(dest), exist_ok=True)
partial = os.path.getsize(dest) if os.path.exists(dest) else 0
headers = {
    "User-Agent": "SmartAIHub-Worker-App/managed-wsl-runtime (+https://smartaihub.app)",
    "Accept": "application/json, application/zip, application/octet-stream, */*",
    "Connection": "close",
}
mode = "wb"
if partial > 0:
    headers["Range"] = f"bytes={partial}-"
    mode = "ab"
request = urllib.request.Request(url, headers=headers)
try:
    response = urllib.request.urlopen(request, timeout=60)
except urllib.error.HTTPError as exc:
    if exc.code == 416 and partial > 0:
        print(f"Download already complete: {dest}")
        raise SystemExit(0)
    print(f"Download failed: HTTP {exc.code} {exc.reason} for {url}", file=sys.stderr)
    body = exc.read(512)
    if body:
        print(body.decode("utf-8", errors="replace"), file=sys.stderr)
    raise
status = getattr(response, "status", 200)
if status == 200 and partial > 0:
    print("Server did not resume partial download; restarting this archive download.")
    mode = "wb"
    partial = 0
total_header = response.headers.get("Content-Length")
total = int(total_header) + partial if total_header and total_header.isdigit() else 0
downloaded = partial
last_pct = -1
with open(dest, mode + ("" if "b" in mode else "b")) as handle:
    while True:
        chunk = response.read(1024 * 1024)
        if not chunk:
            break
        handle.write(chunk)
        downloaded += len(chunk)
        if total > 0:
            pct = int(downloaded * 100 / total)
            if pct >= last_pct + 5 or pct == 100:
                last_pct = pct
                print(f"Download progress: {pct}% ({downloaded}/{total} bytes)", flush=True)
        else:
            print(f"Downloaded {downloaded} bytes", flush=True)
print(f"Downloaded: {dest}")
PY
}

extract_zip() {
  python3 - "$1" "$2" <<'PY'
import sys
import zipfile

archive, dest = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(archive) as zf:
    zf.extractall(dest)
print(f"Extracted: {archive}")
PY
}

ensure_python
sudo apt-get update
resolve_pkg() {
  for candidate in "$@"; do
    if apt-cache show "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}
BASE_PACKAGES=(ca-certificates libnspr4 libnss3 libatk-bridge2.0-0 libatk1.0-0 libcups2 libxkbcommon0 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libdrm2 libxshmfence1 libpangocairo-1.0-0 libpango-1.0-0 libcairo2 fontconfig fonts-liberation fonts-noto-color-emoji fonts-noto-cjk fonts-noto-core fonts-noto-extra fonts-noto-ui-core fonts-freefont-ttf fonts-dejavu-core)
OPTIONAL_PACKAGES=()
AUDIO_PKG="$(resolve_pkg libasound2t64 libasound2 liboss4-salsa-asound2 || true)"
if [ -n "$AUDIO_PKG" ]; then
  OPTIONAL_PACKAGES+=("$AUDIO_PKG")
fi
echo "Installing managed WSL dependencies..."
printf 'Base packages: %s\n' "${BASE_PACKAGES[*]}"
printf 'Audio package: %s\n' "${OPTIONAL_PACKAGES[*]:-none detected}"
repair_apt_state
sudo apt-get install -y --no-install-recommends "${BASE_PACKAGES[@]}" "${OPTIONAL_PACKAGES[@]}"
fc-cache -fv || true
MANIFEST_URL="$SERVER_URL/api/workers/runtime-pack/manifest?runtimeId=hyperframes-wsl2&channel=$RUNTIME_CHANNEL"
MANIFEST_PATH="$ROOT/cache/runtime-manifest.json"
INSTALLED_MARKER="$ROOT/installed-runtime.json"
echo "Downloading runtime manifest..."
rm -f "$MANIFEST_PATH"
download_url "$MANIFEST_URL" "$MANIFEST_PATH"
eval "$(python3 - "$MANIFEST_PATH" "$SERVER_URL" <<'PY'
import json
import sys
from urllib.parse import urljoin

manifest_path, server_url = sys.argv[1], sys.argv[2].rstrip("/") + "/"
with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)
archive_url = manifest.get("archiveUrl")
archive_sha256 = manifest.get("archiveSha256")
archive_size = manifest.get("archiveSizeBytes")
version = manifest.get("version")
if not archive_url or not archive_sha256:
    raise SystemExit("runtime manifest is missing archiveUrl/archiveSha256")
if not archive_url.startswith(("http://", "https://")):
    archive_url = urljoin(server_url, archive_url.lstrip("/"))
print("ARCHIVE_URL=" + repr(archive_url))
print("ARCHIVE_SHA256=" + repr(archive_sha256))
print("ARCHIVE_SIZE_BYTES=" + repr(str(archive_size or "")))
print("RUNTIME_VERSION=" + repr(str(version or "")))
PY
)"
SAFE_RUNTIME_VERSION="${RUNTIME_VERSION//[^A-Za-z0-9._-]/_}"
ARCHIVE_PATH="$ROOT/cache/runtime-pack-${SAFE_RUNTIME_VERSION}-${ARCHIVE_SHA256:0:16}.zip"
TMP_ARCHIVE_PATH="${ARCHIVE_PATH}.download"
echo "Cleaning stale managed runtime downloads..."
find "$ROOT/cache" -maxdepth 1 -type f \( -name 'runtime-pack.zip' -o -name 'runtime-pack-*.zip' -o -name 'runtime-pack-*.zip.download' \) \
  ! -name "$(basename "$ARCHIVE_PATH")" \
  ! -name "$(basename "$TMP_ARCHIVE_PATH")" \
  -print -delete || true
INSTALLED_SHA256=""
INSTALLED_VERSION=""
if [ -f "$INSTALLED_MARKER" ]; then
  eval "$(python3 - "$INSTALLED_MARKER" <<'PY'
import json
import sys
try:
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        data = json.load(handle)
except Exception:
    data = {}
print("INSTALLED_VERSION=" + repr(str(data.get("version") or "")))
print("INSTALLED_SHA256=" + repr(str(data.get("archiveSha256") or "")))
PY
)"
fi
if [ "$INSTALLED_VERSION" = "$RUNTIME_VERSION" ] && [ "$INSTALLED_SHA256" = "$ARCHIVE_SHA256" ] && [ -x "$ROOT/runtime-pack/node/bin/node" ] && [ -x "$ROOT/runtime-pack/browser/chrome" ]; then
  echo "Managed WSL runtime ${RUNTIME_VERSION} is already installed. Re-validating dependencies and executable permissions."
else
  echo "Managed WSL runtime update available or not installed."
  echo "Installed: ${INSTALLED_VERSION:-none} ${INSTALLED_SHA256:-}"
  echo "Latest:    ${RUNTIME_VERSION} ${ARCHIVE_SHA256}"
fi
echo "Downloading HyperFrames managed WSL runtime ${RUNTIME_VERSION}..."
echo "Archive size: ${ARCHIVE_SIZE_BYTES:-unknown} bytes"
if [ -f "$ARCHIVE_PATH" ]; then
  if echo "${ARCHIVE_SHA256}  ${ARCHIVE_PATH}" | sha256sum -c - >/dev/null 2>&1; then
    echo "Using verified cached runtime archive: $ARCHIVE_PATH"
  else
    echo "Cached runtime archive hash changed; removing stale cache."
    rm -f "$ARCHIVE_PATH"
  fi
fi
if [ ! -f "$ARCHIVE_PATH" ]; then
  download_url "$ARCHIVE_URL" "$TMP_ARCHIVE_PATH"
  echo "${ARCHIVE_SHA256}  ${TMP_ARCHIVE_PATH}" | sha256sum -c -
  mv "$TMP_ARCHIVE_PATH" "$ARCHIVE_PATH"
fi
echo "${ARCHIVE_SHA256}  ${ARCHIVE_PATH}" | sha256sum -c -
STAGE="$ROOT/.runtime-install-$$"
rm -rf "$STAGE"
mkdir -p "$STAGE"
echo "Extracting runtime archive..."
extract_zip "$ARCHIVE_PATH" "$STAGE"
test -f "$STAGE/runtime-pack/manifest.json"
rm -rf "$ROOT/runtime-pack" "$ROOT/sidecars"
mv "$STAGE/runtime-pack" "$ROOT/runtime-pack"
if [ -d "$STAGE/sidecars" ]; then
  mv "$STAGE/sidecars" "$ROOT/sidecars"
fi
rm -rf "$STAGE"
chmod +x "$ROOT/runtime-pack/node/bin/node" "$ROOT/runtime-pack/bin/ffmpeg" "$ROOT/runtime-pack/bin/ffprobe" || true
find "$ROOT/runtime-pack/browser" -maxdepth 1 -type f \( \
  -name 'chrome' -o \
  -name 'chrome_crashpad_handler' -o \
  -name 'chrome_sandbox' -o \
  -name 'headless_shell' \
\) -exec chmod +x {} \; || true
python3 - "$INSTALLED_MARKER" "$RUNTIME_VERSION" "$ARCHIVE_SHA256" "$ARCHIVE_SIZE_BYTES" "$ARCHIVE_URL" <<'PY'
import json
import sys
from datetime import datetime, timezone

marker_path, version, archive_sha256, archive_size, archive_url = sys.argv[1:6]
payload = {
    "version": version,
    "archiveSha256": archive_sha256,
    "archiveSizeBytes": archive_size,
    "archiveUrl": archive_url,
    "installedAt": datetime.now(timezone.utc).isoformat(),
}
with open(marker_path, "w", encoding="utf-8") as handle:
    json.dump(payload, handle, indent=2)
    handle.write("\n")
PY
cat > "$ROOT/README.txt" <<'EOF'
Smart AI Hub managed WSL runtime environment

This directory is the editable WSL render runtime. Managed mode runs from this root directly and does not fall back to the old runtime-pack execution path.
EOF
echo
echo "Managed WSL runtime environment is ready."
echo "Run Worker App checks again. Managed WSL mode will run from this root directly."
"#;

#[tauri::command]
pub async fn worker_app_open_wsl_dependency_repair() -> Result<String, String> {
    open_wsl_dependency_repair_terminal()
}

#[tauri::command]
pub async fn worker_app_open_managed_wsl_runtime_setup(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<String, String> {
    let settings = state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    open_managed_wsl_runtime_setup_terminal(
        &settings.managed_wsl_root,
        &settings.normalized_server_url(),
        settings.runtime_channel.as_query_value(),
    )
}

#[cfg(target_os = "windows")]
fn open_wsl_dependency_repair_terminal() -> Result<String, String> {
    let script = WSL_BROWSER_DEPENDENCY_REPAIR_SCRIPT;
    if std::process::Command::new("wt.exe")
        .args(["wsl.exe", "-e", "bash", "-lc", script])
        .spawn()
        .is_ok()
    {
        return Ok(
            "Opened Windows Terminal to repair WSL browser dependencies. Enter your WSL sudo password if prompted, then run checks again."
                .into(),
        );
    }

    std::process::Command::new("cmd.exe")
        .args([
            "/C",
            "start",
            "Smart AI Hub WSL Repair",
            "wsl.exe",
            "-e",
            "bash",
            "-lc",
            script,
        ])
        .spawn()
        .map_err(|error| format!("failed to open WSL repair terminal: {error}"))?;
    Ok(
        "Opened a WSL terminal to repair browser dependencies. Enter your WSL sudo password if prompted, then run checks again."
            .into(),
    )
}

#[cfg(target_os = "windows")]
fn open_managed_wsl_runtime_setup_terminal(
    managed_wsl_root: &str,
    server_url: &str,
    runtime_channel: &str,
) -> Result<String, String> {
    let root = if managed_wsl_root.trim().is_empty() {
        "~/.smartaihub-worker/runtime"
    } else {
        managed_wsl_root.trim()
    };
    let script = MANAGED_WSL_RUNTIME_SETUP_SCRIPT_TEMPLATE
        .replace(
            "__SMARTAIHUB_MANAGED_WSL_ROOT_EXPR__",
            &wsl_shell_assignment_expr(root),
        )
        .replace(
            "__SMARTAIHUB_SERVER_URL_EXPR__",
            &shell_single_quote(server_url.trim_end_matches('/')),
        )
        .replace(
            "__SMARTAIHUB_RUNTIME_CHANNEL_EXPR__",
            &shell_single_quote(runtime_channel),
        );
    let setup_script_path = write_managed_wsl_setup_script(&script)?;
    let wsl_setup_script_path = windows_path_to_wsl_string(&setup_script_path);
    if std::process::Command::new("wt.exe")
        .args(["wsl.exe", "-e", "bash", &wsl_setup_script_path])
        .spawn()
        .is_ok()
    {
        return Ok(
            "Opened a visible Windows Terminal to install the managed WSL runtime. Keep that terminal open, enter your WSL sudo password if prompted, watch the download/extract progress, then run checks again after it finishes."
                .into(),
        );
    }

    std::process::Command::new("cmd.exe")
        .args([
            "/C",
            "start",
            "Smart AI Hub Managed WSL Runtime",
            "wsl.exe",
            "-e",
            "bash",
            &wsl_setup_script_path,
        ])
        .spawn()
        .map_err(|error| format!("failed to open managed WSL setup terminal: {error}"))?;
    Ok(
        "Opened a visible WSL terminal to install the managed runtime. Keep that terminal open, enter your WSL sudo password if prompted, watch the download/extract progress, then run checks again after it finishes."
            .into(),
    )
}

#[cfg(target_os = "windows")]
fn write_managed_wsl_setup_script(script: &str) -> Result<PathBuf, String> {
    let dir = std::env::temp_dir().join("smart-ai-hub-worker-app");
    fs::create_dir_all(&dir)
        .map_err(|error| format!("failed to create managed WSL setup script dir: {error}"))?;
    let path = dir.join("managed-wsl-runtime-setup.sh");
    fs::write(&path, script)
        .map_err(|error| format!("failed to write managed WSL setup script: {error}"))?;
    Ok(path)
}

#[cfg(not(target_os = "windows"))]
fn open_wsl_dependency_repair_terminal() -> Result<String, String> {
    Err("WSL dependency repair can only be launched from the Windows Worker App.".into())
}

#[cfg(not(target_os = "windows"))]
fn open_managed_wsl_runtime_setup_terminal(
    _managed_wsl_root: &str,
    _server_url: &str,
    _runtime_channel: &str,
) -> Result<String, String> {
    Err("Managed WSL runtime setup can only be launched from the Windows Worker App.".into())
}

fn build_runtime_doctor(
    app: tauri::AppHandle,
    include_host_checks: bool,
) -> Result<DoctorSummary, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource directory unavailable: {error}"))?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let settings = crate::settings::load_settings(&app_data_dir);
    let effective_runtime_dir = get_effective_runtime_dir(&app)?;
    let mut doctor = doctor_from_installed_or_default_paths(&resource_dir, &effective_runtime_dir);
    annotate_runtime_doctor_for_settings(
        &mut doctor,
        &settings,
        include_host_checks,
        &effective_runtime_dir,
    );
    Ok(doctor)
}

pub(crate) fn annotate_runtime_doctor_for_settings(
    doctor: &mut DoctorSummary,
    settings: &WorkerAppSettings,
    include_host_checks: bool,
    effective_runtime_dir: &Path,
) {
    let runtime_manifest = doctor
        .checks
        .iter()
        .find(|check| check.id == "runtime_manifest");
    let runtime_id = runtime_manifest
        .and_then(|check| detail_string(&check.details_json, "runtimeId"))
        .unwrap_or_else(|| "unknown".to_string());
    let runtime_platform = doctor
        .checks
        .iter()
        .find(|check| check.id == "official_hyperframes_renderer")
        .and_then(|check| detail_string(&check.details_json, "runtimePlatform"))
        .unwrap_or_else(|| runtime_id.clone());
    let runtime_platform_normalized = runtime_platform.to_ascii_lowercase();
    let installed_wsl2_profile = runtime_platform_normalized.contains("wsl2")
        || runtime_platform_normalized.contains("linux")
        || runtime_id.to_ascii_lowercase().contains("wsl2");

    let uses_wsl2_runtime = settings.uses_wsl2_runtime();

    if settings.runtime_environment.is_managed_wsl() {
        doctor.checks.clear();
        if include_host_checks {
            doctor.checks.push(wsl2_host_check());
            doctor
                .checks
                .push(managed_wsl_runtime_check(&settings.managed_wsl_root));
        } else {
            doctor.checks.push(DoctorCheck {
                id: "managed_wsl_runtime".into(),
                status: "warn".into(),
                message:
                    "Managed WSL runtime mode is selected. Run full checks to verify the WSL runtime root."
                        .into(),
                details_json: json!({
                    "managedWslRoot": settings.managed_wsl_root.clone(),
                }),
            });
        }
        let managed_has_error = doctor.checks.iter().any(|check| check.status == "error");
        let managed_verified = doctor
            .checks
            .iter()
            .any(|check| check.id == "managed_wsl_runtime" && check.status == "ok");
        doctor.checks.push(DoctorCheck {
            id: "installer_set".into(),
            status: if managed_has_error {
                "error"
            } else if managed_verified {
                "ok"
            } else {
                "warn"
            }
            .into(),
            message: if managed_has_error {
                "Managed WSL runtime is not ready. The Worker App will not claim render jobs until the WSL runtime root passes checks."
                    .into()
            } else if managed_verified {
                "Managed WSL runtime is ready. Render jobs will run from the managed WSL runtime root."
                    .into()
            } else {
                "Managed WSL runtime has not been fully checked yet. Run checks after the visible setup terminal finishes."
                    .into()
            },
            details_json: json!({
                "runtimeEnvironment": settings.runtime_environment.clone(),
                "managedWslRoot": settings.managed_wsl_root.clone(),
            }),
        });
        if managed_has_error || !managed_verified {
            push_unique_action(
                &mut doctor.recommended_actions,
                "Open Prepare managed WSL runtime, keep the terminal visible until download/extract finishes, then run checks again. Managed mode does not fall back to the old runtime-pack execution path.",
            );
        }
        recompute_doctor_status(doctor);
        return;
    }

    if uses_wsl2_runtime {
        let wsl2_profile_ok = installed_wsl2_profile;
        doctor.checks.push(DoctorCheck {
            id: "wsl2_runtime_profile".into(),
            status: if wsl2_profile_ok { "ok" } else { "error" }.into(),
            message: if wsl2_profile_ok {
                "Runtime settings and installed pack are aligned for the WSL2 HyperFrames profile."
                    .into()
            } else {
                "Worker App is set to use WSL2, but the installed runtime pack is not the WSL2/Linux HyperFrames pack."
                    .into()
            },
            details_json: json!({
                "useWsl2Setting": settings.use_wsl2,
                "runtimeEnvironment": settings.runtime_environment.clone(),
                "runtimeId": runtime_id,
                "runtimePlatform": runtime_platform,
            }),
        });
        if !wsl2_profile_ok {
            push_unique_action(
                &mut doctor.recommended_actions,
                "Download the default WSL2 HyperFrames runtime pack, or use legacy Windows runtime mode only if WSL2 is not available.",
            );
        }
        if include_host_checks {
            doctor.checks.push(wsl2_host_check());
            doctor
                .checks
                .push(wsl2_browser_dependencies_check(effective_runtime_dir));
            if doctor
                .checks
                .iter()
                .any(|check| check.id == "wsl2_browser_dependencies" && check.status == "error")
            {
                push_unique_action(
                    &mut doctor.recommended_actions,
                    "Repair WSL2 browser dependencies by clicking Prepare managed WSL runtime again. On Ubuntu 24.04 the app will install libasound2t64 instead of the old virtual libasound2 package.",
                );
            }
        }
    } else {
        doctor.checks.push(DoctorCheck {
            id: "wsl2_runtime_profile".into(),
            status: if installed_wsl2_profile { "warn" } else { "ok" }.into(),
            message: if installed_wsl2_profile {
                "A WSL2/Linux runtime pack is installed while the Worker App is configured for legacy Windows runtime mode."
                    .into()
            } else {
                "Worker App is configured for legacy Windows runtime mode.".into()
            },
            details_json: json!({
                "useWsl2Setting": settings.use_wsl2,
                "runtimeEnvironment": settings.runtime_environment.clone(),
                "runtimeId": runtime_id,
                "runtimePlatform": runtime_platform,
            }),
        });
        if installed_wsl2_profile {
            push_unique_action(
                &mut doctor.recommended_actions,
                "Enable WSL2 in Worker preferences to use the installed WSL2 HyperFrames runtime pack.",
            );
        }
    }

    let required_runtime_checks = [
        "runtime_manifest",
        "runtime_bundle",
        "official_hyperframes_renderer",
        "hyperframes_native_dependencies",
        "browser_runtime",
        "media_tools",
        "hyperframes_sidecar",
        "runtime_sidecar_policy",
        "runtime_hash",
        "runtime_signature_bundle",
        "thai_font",
        "tool_versions",
    ];
    let missing_runtime_checks: Vec<String> = required_runtime_checks
        .iter()
        .filter(|id| {
            doctor
                .checks
                .iter()
                .find(|check| check.id == **id)
                .map(|check| check.status == "error")
                .unwrap_or(true)
        })
        .map(|id| (*id).to_string())
        .collect();
    let wsl2_blocked = uses_wsl2_runtime
        && include_host_checks
        && doctor.checks.iter().any(|check| {
            (check.id == "wsl2_host" || check.id == "wsl2_browser_dependencies")
                && check.status == "error"
        });
    let installer_complete = missing_runtime_checks.is_empty() && !wsl2_blocked;
    doctor.checks.push(DoctorCheck {
        id: "installer_set".into(),
        status: if installer_complete { "ok" } else { "error" }.into(),
        message: if installer_complete {
            "WSL2 readiness, runtime pack, sidecar, media tools, browser runtime, checksum, signature, and Thai font metadata are complete."
                .into()
        } else {
            "The Worker App installation is not complete enough to safely claim HyperFrames render jobs."
                .into()
        },
        details_json: json!({
            "missingRuntimeChecks": missing_runtime_checks,
            "wsl2Blocked": wsl2_blocked,
        }),
    });
    if !installer_complete {
        push_unique_action(
            &mut doctor.recommended_actions,
            "Run Download render runtime, then run checks again. If WSL2 host is blocked, install or repair WSL2 before accepting render jobs.",
        );
    }

    recompute_doctor_status(doctor);
}

fn detail_string(details: &Value, key: &str) -> Option<String> {
    details
        .get(key)
        .and_then(|value| value.as_str())
        .map(str::to_string)
}

fn push_unique_action(actions: &mut Vec<String>, action: &str) {
    if !actions.iter().any(|existing| existing == action) {
        actions.push(action.to_string());
    }
}

fn recompute_doctor_status(doctor: &mut DoctorSummary) {
    let has_error = doctor.checks.iter().any(|check| check.status == "error");
    let has_warn = doctor.checks.iter().any(|check| check.status == "warn");
    doctor.status = if has_error {
        "blocked"
    } else if has_warn {
        "degraded"
    } else {
        "ready"
    }
    .into();
}

#[cfg(target_os = "windows")]
fn managed_wsl_runtime_check(managed_wsl_root: &str) -> DoctorCheck {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let root = if managed_wsl_root.trim().is_empty() {
        "~/.smartaihub-worker/runtime"
    } else {
        managed_wsl_root.trim()
    };
    let root_expr = wsl_shell_assignment_expr(root);
    let script = format!(
        r#"ROOT={root_expr}
missing=0
check_file() {{
  if [ ! -e "$1" ]; then
    echo "missing: $1"
    missing=1
  elif [ "$2" = executable ] && [ ! -x "$1" ]; then
    echo "not executable: $1"
    missing=1
  fi
}}
check_command() {{
  label="$1"
  shift
  if ! output="$("$@" 2>&1 | head -n 1)"; then
    echo "$label failed: $output"
    missing=1
  else
    echo "$label: $output"
  fi
}}
check_file "$ROOT/runtime-pack/node/bin/node" executable
check_file "$ROOT/runtime-pack/hyperframes-sidecar/render.mjs" file
check_file "$ROOT/runtime-pack/bin/ffmpeg" executable
check_file "$ROOT/runtime-pack/bin/ffprobe" executable
check_file "$ROOT/runtime-pack/browser/chrome" executable
check_file "$ROOT/runtime-pack/browser/chrome_crashpad_handler" executable
check_file "$ROOT/installed-runtime.json" file
if [ -x "$ROOT/runtime-pack/node/bin/node" ]; then
  NODE_MAJOR="$("$ROOT/runtime-pack/node/bin/node" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)"
  if [ "${{NODE_MAJOR:-0}}" -lt 22 ]; then
    echo "node version too old: $("$ROOT/runtime-pack/node/bin/node" --version 2>/dev/null || echo unknown)"
    missing=1
  else
    check_command "node" "$ROOT/runtime-pack/node/bin/node" --version
  fi
fi
if [ -x "$ROOT/runtime-pack/bin/ffmpeg" ]; then check_command "ffmpeg" "$ROOT/runtime-pack/bin/ffmpeg" -version; fi
if [ -x "$ROOT/runtime-pack/bin/ffprobe" ]; then check_command "ffprobe" "$ROOT/runtime-pack/bin/ffprobe" -version; fi
if [ -x "$ROOT/runtime-pack/browser/chrome" ]; then
  ldd "$ROOT/runtime-pack/browser/chrome" | awk '/not found/ {{ print "missing shared library: " $1; missing=1 }} END {{ exit missing }}' || missing=1
  check_command "chrome" "$ROOT/runtime-pack/browser/chrome" --version
fi
if command -v fc-match >/dev/null 2>&1; then
  echo "fontconfig: $(fc-match 'Noto Sans Thai' | head -n 1)"
else
  echo "missing command: fc-match"
  missing=1
fi
if [ -d /dev/shm ]; then
  SHM_MB="$(df -Pm /dev/shm | awk 'NR==2 {{ print $2 }}')"
  echo "dev shm: ${{SHM_MB:-unknown}} MB"
  if [ "${{SHM_MB:-0}}" -lt 256 ]; then
    echo "warning: /dev/shm is below upstream recommended 256 MB"
  fi
fi
exit $missing"#
    );

    match std::process::Command::new("wsl.exe")
        .args(["-e", "bash", "-lc", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(output) if output.status.success() => DoctorCheck {
            id: "managed_wsl_runtime".into(),
            status: "ok".into(),
            message: "Managed WSL runtime root contains the latest prepared runtime marker, Node 22+, HyperFrames sidecar, FFmpeg, ffprobe, Chrome, fonts, and required Chrome shared libraries.".into(),
            details_json: json!({
                "managedWslRoot": root,
                "stdout": String::from_utf8_lossy(&output.stdout).trim(),
            }),
        },
        Ok(output) => DoctorCheck {
            id: "managed_wsl_runtime".into(),
            status: "error".into(),
            message: "Managed WSL runtime root is incomplete. The Worker App will not fall back to the old runtime-pack execution path.".into(),
            details_json: json!({
                "managedWslRoot": root,
                "exitCode": output.status.code(),
                "stdout": String::from_utf8_lossy(&output.stdout).trim(),
                "stderr": String::from_utf8_lossy(&output.stderr).trim(),
            }),
        },
        Err(error) => DoctorCheck {
            id: "managed_wsl_runtime".into(),
            status: "error".into(),
            message: "Managed WSL runtime could not be checked because wsl.exe failed to start.".into(),
            details_json: json!({
                "managedWslRoot": root,
                "error": error.to_string(),
            }),
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn managed_wsl_runtime_check(managed_wsl_root: &str) -> DoctorCheck {
    DoctorCheck {
        id: "managed_wsl_runtime".into(),
        status: "warn".into(),
        message:
            "Managed WSL runtime checks run only in the Windows Worker App because they require wsl.exe."
                .into(),
        details_json: json!({
            "managedWslRoot": managed_wsl_root,
        }),
    }
}

#[cfg(target_os = "windows")]
fn wsl2_host_check() -> DoctorCheck {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    match std::process::Command::new("wsl.exe")
        .arg("--status")
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(output) if output.status.success() => DoctorCheck {
            id: "wsl2_host".into(),
            status: "ok".into(),
            message: "WSL2 is installed and responding on this Windows host.".into(),
            details_json: json!({
                "command": "wsl.exe --status",
                "stdout": String::from_utf8_lossy(&output.stdout).trim(),
            }),
        },
        Ok(output) => DoctorCheck {
            id: "wsl2_host".into(),
            status: "error".into(),
            message: "WSL2 is installed but did not report a healthy status.".into(),
            details_json: json!({
                "command": "wsl.exe --status",
                "exitCode": output.status.code(),
                "stderr": String::from_utf8_lossy(&output.stderr).trim(),
            }),
        },
        Err(error) => DoctorCheck {
            id: "wsl2_host".into(),
            status: "error".into(),
            message: "WSL2 is not available to the Worker App on this Windows host.".into(),
            details_json: json!({
                "command": "wsl.exe --status",
                "error": error.to_string(),
            }),
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn wsl2_host_check() -> DoctorCheck {
    DoctorCheck {
        id: "wsl2_host".into(),
        status: "warn".into(),
        message: "WSL2 host readiness can only be verified from the Windows Worker App runtime."
            .into(),
        details_json: json!({
            "command": "wsl.exe --status",
            "hostPlatform": std::env::consts::OS,
        }),
    }
}

#[cfg(target_os = "windows")]
fn wsl2_browser_dependencies_check(effective_runtime_dir: &Path) -> DoctorCheck {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x08000000;

    let browser_root = effective_runtime_dir.join("runtime-pack").join("browser");
    let Some(browser_path) = find_browser_binary(&browser_root) else {
        return DoctorCheck {
            id: "wsl2_browser_dependencies".into(),
            status: "error".into(),
            message: "WSL2 browser dependency check could not find the bundled Linux browser."
                .into(),
            details_json: json!({
                "browserRoot": browser_root.to_string_lossy(),
            }),
        };
    };
    let wsl_browser_path = windows_path_to_wsl(&browser_path);
    let browser_libs_path = browser_root
        .parent()
        .map(|runtime_pack| runtime_pack.join("browser-libs"))
        .unwrap_or_else(|| {
            effective_runtime_dir
                .join("runtime-pack")
                .join("browser-libs")
        });
    let wsl_browser_libs_path = windows_path_to_wsl(&browser_libs_path);
    let ldd_script = format!(
        "LD_LIBRARY_PATH={} ldd {}",
        shell_single_quote(&wsl_browser_libs_path),
        shell_single_quote(&wsl_browser_path)
    );
    match std::process::Command::new("wsl.exe")
        .arg("-e")
        .arg("bash")
        .arg("-lc")
        .arg(&ldd_script)
        .creation_flags(CREATE_NO_WINDOW)
        .output()
    {
        Ok(output) if output.status.success() => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let missing: Vec<String> = stdout
                .lines()
                .filter(|line| line.contains("not found"))
                .map(|line| line.trim().to_string())
                .collect();
            if missing.is_empty() {
                DoctorCheck {
                    id: "wsl2_browser_dependencies".into(),
                    status: "ok".into(),
                    message: "WSL2 can load the bundled Linux browser shared libraries.".into(),
                    details_json: json!({
                        "command": "wsl.exe -e ldd <bundled-browser>",
                        "browser": wsl_browser_path,
                        "browserLibs": wsl_browser_libs_path,
                    }),
                }
            } else {
                DoctorCheck {
                    id: "wsl2_browser_dependencies".into(),
                    status: "error".into(),
                    message:
                        "WSL2 is missing Linux shared libraries required by the bundled browser."
                            .into(),
                    details_json: json!({
                        "command": "wsl.exe -e ldd <bundled-browser>",
                        "browser": wsl_browser_path,
                        "browserLibs": wsl_browser_libs_path,
                        "missing": missing,
                        "recommendedUbuntuPackages": "libnss3 libnspr4 libatk-bridge2.0-0 libatk1.0-0 libcups2 libxkbcommon0 libasound2t64|libasound2 libgbm1 libgtk-3-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libdrm2 libxshmfence1 libpangocairo-1.0-0 libpango-1.0-0 libcairo2 fontconfig fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji fonts-liberation fonts-dejavu-core",
                    }),
                }
            }
        }
        Ok(output) => DoctorCheck {
            id: "wsl2_browser_dependencies".into(),
            status: "error".into(),
            message: "WSL2 could not inspect the bundled browser shared libraries.".into(),
            details_json: json!({
                "command": "wsl.exe -e ldd <bundled-browser>",
                "browser": wsl_browser_path,
                "browserLibs": wsl_browser_libs_path,
                "exitCode": output.status.code(),
                "stdout": String::from_utf8_lossy(&output.stdout).trim(),
                "stderr": String::from_utf8_lossy(&output.stderr).trim(),
            }),
        },
        Err(error) => DoctorCheck {
            id: "wsl2_browser_dependencies".into(),
            status: "error".into(),
            message: "WSL2 browser dependency check could not run ldd.".into(),
            details_json: json!({
                "command": "wsl.exe -e ldd <bundled-browser>",
                "browser": wsl_browser_path,
                "browserLibs": wsl_browser_libs_path,
                "error": error.to_string(),
            }),
        },
    }
}

#[cfg(not(target_os = "windows"))]
fn wsl2_browser_dependencies_check(_effective_runtime_dir: &Path) -> DoctorCheck {
    DoctorCheck {
        id: "wsl2_browser_dependencies".into(),
        status: "warn".into(),
        message:
            "WSL2 browser shared-library readiness can only be verified from the Windows Worker App runtime."
                .into(),
        details_json: json!({
            "command": "wsl.exe -e ldd <bundled-browser>",
            "hostPlatform": std::env::consts::OS,
        }),
    }
}

#[cfg(target_os = "windows")]
fn shell_single_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(target_os = "windows")]
fn wsl_shell_assignment_expr(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed == "~" {
        return "\"${HOME}\"".into();
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        return format!("\"${{HOME}}/{}\"", rest.replace('"', "\\\""));
    }
    shell_single_quote(trimmed)
}

#[cfg(target_os = "windows")]
fn windows_path_to_wsl_string(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        let drive = normalized
            .chars()
            .next()
            .unwrap_or('c')
            .to_ascii_lowercase();
        format!("/mnt/{drive}{}", &normalized[2..])
    } else {
        normalized
    }
}

#[cfg(target_os = "windows")]
fn find_browser_binary(root: &Path) -> Option<PathBuf> {
    let entries = fs::read_dir(root).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_browser_binary(&path) {
                return Some(found);
            }
        } else if path.is_file() {
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if matches!(
                name.as_str(),
                "chrome" | "headless_shell" | "chrome-headless-shell"
            ) {
                return Some(path);
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn windows_path_to_wsl(path: &Path) -> String {
    let normalized = path.to_string_lossy().replace('\\', "/");
    if normalized.len() >= 2 && normalized.as_bytes()[1] == b':' {
        let drive = normalized
            .chars()
            .next()
            .unwrap_or('c')
            .to_ascii_lowercase();
        format!("/mnt/{drive}{}", &normalized[2..])
    } else {
        normalized
    }
}

#[tauri::command]
pub async fn worker_app_clear_runtime_pack(app: tauri::AppHandle) -> Result<(), String> {
    let effective_runtime_dir = get_effective_runtime_dir(&app)?;

    let runtime_pack = effective_runtime_dir.join("runtime-pack");
    let sidecars = effective_runtime_dir.join("sidecars");

    // Use the safe replacement pattern to avoid Windows locking issues
    if runtime_pack.exists() {
        let temp_old = effective_runtime_dir.join(format!(
            "runtime-pack_old_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ));
        if fs::rename(&runtime_pack, &temp_old).is_ok() {
            let _ = fs::remove_dir_all(&temp_old);
        } else {
            let _ = fs::remove_dir_all(&runtime_pack);
        }
    }

    if sidecars.exists() {
        let temp_old = effective_runtime_dir.join(format!(
            "sidecars_old_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ));
        if fs::rename(&sidecars, &temp_old).is_ok() {
            let _ = fs::remove_dir_all(&temp_old);
        } else {
            let _ = fs::remove_dir_all(&sidecars);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn worker_app_install_runtime_pack(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<RuntimeInstallResult, String> {
    let settings = state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource directory unavailable: {error}"))?;
    let runtime_id = if settings.uses_wsl2_runtime() {
        "hyperframes-wsl2"
    } else {
        "hyperframes-windows-x64"
    };
    let manifest = fetch_runtime_manifest(
        &settings.normalized_server_url(),
        runtime_id,
        settings.runtime_channel.as_query_value(),
    )
    .await?;
    let effective_runtime_dir = get_effective_runtime_dir(&app)?;
    if !manifest.allowed {
        return Ok(RuntimeInstallResult {
            status: "blocked".into(),
            message: manifest
                .deny_reason
                .clone()
                .unwrap_or_else(|| "Runtime pack is not allowed by server policy.".into()),
            manifest: Some(manifest),
            doctor: doctor_from_installed_or_default_paths(&resource_dir, &effective_runtime_dir),
        });
    }
    let archive_url = manifest
        .archive_url
        .clone()
        .ok_or_else(|| "Runtime manifest does not include archiveUrl.".to_string())?;
    let archive_sha256 = manifest
        .archive_sha256
        .clone()
        .ok_or_else(|| "Runtime manifest does not include archiveSha256.".to_string())?;
    let absolute_archive_url = absolute_url(&settings.normalized_server_url(), &archive_url)?;
    let temp_dir = effective_runtime_dir.join("runtime-downloads");
    fs::create_dir_all(&temp_dir)
        .map_err(|error| format!("failed to create runtime download directory: {error}"))?;
    let archive_path = temp_dir.join(format!(
        "{}-{}.zip",
        sanitize_file_segment(&manifest.runtime_id),
        sanitize_file_segment(&manifest.version)
    ));
    download_runtime_archive(
        &absolute_archive_url,
        &archive_path,
        manifest.archive_size_bytes,
    )
    .await?;
    let digest = file_sha256(&archive_path)?;
    if !digest.eq_ignore_ascii_case(&archive_sha256) {
        return Err(format!(
            "Runtime archive checksum mismatch. Expected {archive_sha256}, got {digest}."
        ));
    }
    extract_runtime_archive(&archive_path, &effective_runtime_dir)?;

    let installed_manifest_path = effective_runtime_dir
        .join("runtime-pack")
        .join("manifest.json");
    let installed_manifest = read_runtime_pack_manifest(&installed_manifest_path)?;
    if installed_manifest.runtime_profile_hash != manifest.runtime_profile_hash {
        return Err("Installed runtime profile hash does not match server manifest.".into());
    }
    let doctor = doctor_from_installed_or_default_paths(&resource_dir, &effective_runtime_dir);
    if doctor.status != "ready" {
        return Ok(RuntimeInstallResult {
            status: "blocked".into(),
            message: "Runtime was installed, but readiness checks are still blocked.".into(),
            manifest: Some(installed_manifest),
            doctor,
        });
    }
    Ok(RuntimeInstallResult {
        status: "installed".into(),
        message: format!("Runtime pack {} is ready.", installed_manifest.version),
        manifest: Some(installed_manifest),
        doctor,
    })
}

#[tauri::command]
pub async fn worker_app_start_connect(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<(), String> {
    let server_url = state
        .settings
        .lock()
        .map(|settings| settings.normalized_server_url())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let url = worker_connect_url(&server_url);
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| format!("unable to open browser approval: {error}"))
}

#[tauri::command]
pub async fn worker_app_start_connect_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerConnectSession, String> {
    let settings = state
        .settings
        .lock()
        .map(|settings| settings.clone())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let doctor = worker_app_run_doctor(app.clone()).await?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let device_proof = ensure_device_proof_material(&app_data_dir)?;
    {
        let mut pending = state
            .pending_connect_device_proof
            .lock()
            .map_err(|_| "pending connect device proof lock poisoned".to_string())?;
        *pending = Some(device_proof.clone());
    }
    append_diagnostic_event(
        &app_data_dir,
        "connect.start.device_proof",
        json!({
            "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
            "serverUrl": settings.normalized_server_url(),
        }),
    );
    let payload = build_registration_payload(&settings, &doctor, device_proof.binding());
    let session = start_worker_connect_session(&settings.normalized_server_url(), &payload).await?;
    app.opener()
        .open_url(session.verification_uri_complete.clone(), None::<&str>)
        .map_err(|error| format!("unable to open browser approval: {error}"))?;
    Ok(session)
}

#[tauri::command]
pub async fn worker_app_poll_connect_session(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    device_code: String,
) -> Result<WorkerConnectPollResponse, String> {
    let server_url = state
        .settings
        .lock()
        .map(|settings| settings.normalized_server_url())
        .map_err(|_| "settings lock poisoned".to_string())?;
    let response = poll_worker_connect_session(&server_url, &device_code).await?;
    if response.status == "approved" {
        if let (Some(worker), Some(tokens)) = (response.worker.clone(), response.tokens.clone()) {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("app data directory unavailable: {error}"))?;
            let pending_device_proof = state
                .pending_connect_device_proof
                .lock()
                .map_err(|_| "pending connect device proof lock poisoned".to_string())?
                .clone();
            let used_pending_device_proof = pending_device_proof.is_some();
            let device_proof = match pending_device_proof {
                Some(device_proof) => device_proof,
                None => ensure_device_proof_material(&app_data_dir)?,
            };
            save_device_proof_material(&app_data_dir, &device_proof)?;
            append_diagnostic_event(
                &app_data_dir,
                "connect.poll.approved.device_proof_selected",
                json!({
                    "source": if used_pending_device_proof { "pending_connect_session" } else { "app_data_file" },
                    "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
                }),
            );
            validate_connection_tokens_match_device_proof(
                &app_data_dir,
                "connect.poll.approved",
                &tokens,
                &device_proof,
            )?;
            set_active_connected_device_proof(&state, Some(device_proof.clone()))?;
            let stored_connection = StoredWorkerConnection {
                server_url: server_url.clone(),
                worker: worker.clone(),
                tokens: tokens.clone(),
                connected_at: now_rfc3339(),
                last_refreshed_at: None,
            };
            save_connection_with_device_proof(&app_data_dir, &stored_connection, &device_proof)?;
            append_diagnostic_event(
                &app_data_dir,
                "connect.poll.approved.saved",
                json!({
                    "workerId": worker.id,
                    "serverUrl": server_url,
                    "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
                    "tokens": tokens_summary_json(&tokens),
                }),
            );
            if let Ok(mut pending) = state.pending_connect_device_proof.lock() {
                *pending = None;
            }
        }
    } else if matches!(response.status.as_str(), "expired" | "denied" | "error") {
        if let Ok(mut pending) = state.pending_connect_device_proof.lock() {
            *pending = None;
        }
    }
    Ok(response)
}

#[tauri::command]
pub async fn worker_app_refresh_connect_tokens(
    app: tauri::AppHandle,
    server_url: String,
    refresh_token: String,
) -> Result<WorkerConnectTokens, String> {
    if refresh_token.trim().is_empty() {
        return Err("refresh token is required".into());
    }
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let device_proof = ensure_device_proof_material(&app_data_dir)?;
    let tokens =
        refresh_worker_connect_tokens(server_url.trim(), refresh_token.trim(), &device_proof)
            .await?;
    validate_connection_tokens_match_device_proof(
        &app_data_dir,
        "connection.refresh.manual",
        &tokens,
        &device_proof,
    )?;
    Ok(tokens)
}

#[tauri::command]
pub async fn worker_app_refresh_saved_connection(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<StoredWorkerConnection, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let mut stored = load_connection(&app_data_dir)?
        .ok_or_else(|| "Worker App is not connected yet.".to_string())?;
    let refresh_token = stored
        .tokens
        .refresh_token
        .clone()
        .ok_or_else(|| "Worker connection does not include a refresh token.".to_string())?;
    let device_proof = match load_connection_device_proof(&app_data_dir)? {
        Some(device_proof) => device_proof,
        None => ensure_device_proof_material(&app_data_dir)?,
    };
    append_diagnostic_event(
        &app_data_dir,
        "connection.refresh.saved.device_proof_selected",
        json!({
            "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
        }),
    );
    stored.tokens =
        refresh_worker_connect_tokens(&stored.server_url, &refresh_token, &device_proof).await?;
    validate_connection_tokens_match_device_proof(
        &app_data_dir,
        "connection.refresh.saved",
        &stored.tokens,
        &device_proof,
    )?;
    set_active_connected_device_proof(&state, Some(device_proof.clone()))?;
    stored.last_refreshed_at = Some(now_rfc3339());
    save_connection_with_device_proof(&app_data_dir, &stored, &device_proof)?;
    update_running_loop_connection(&state, &stored, &app_data_dir)?;
    Ok(stored)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorkerLoopStartRequest {
    pub server_url: String,
    pub worker_id: String,
    pub worker_label: String,
    pub execution_token: String,
    pub upload_token: String,
}

#[tauri::command]
pub async fn worker_app_start_worker_loop(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
    request: WorkerLoopStartRequest,
) -> Result<WorkerLoopStatus, String> {
    if request.worker_id.trim().is_empty() {
        return Err("worker id is required before starting the background loop".into());
    }
    if request.execution_token.trim().is_empty() || request.upload_token.trim().is_empty() {
        return Err("worker execution and upload tokens are required".into());
    }
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("resource directory unavailable: {error}"))?;
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let active_device_proof = active_connected_device_proof(&state)?;
    let used_active_device_proof = active_device_proof.is_some();
    let device_proof = match active_device_proof {
        Some(device_proof) => device_proof,
        None => ensure_device_proof_material(&app_data_dir)?,
    };
    append_diagnostic_event(
        &app_data_dir,
        "worker_loop.start.device_proof_selected",
        json!({
            "source": if used_active_device_proof { "active_connected_session" } else { "app_data_file" },
            "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&device_proof)),
        }),
    );
    let request_tokens = WorkerConnectTokens {
        execution_token: request.execution_token.trim().to_string(),
        upload_token: request.upload_token.trim().to_string(),
        refresh_token: None,
    };
    validate_connection_tokens_match_device_proof(
        &app_data_dir,
        "worker_loop.start",
        &request_tokens,
        &device_proof,
    )?;
    let connection = WorkerLoopConnection {
        server_url: request.server_url.trim().trim_end_matches('/').to_string(),
        worker_id: request.worker_id.trim().to_string(),
        worker_label: request.worker_label.trim().to_string(),
        tokens: WorkerApiTokens {
            execution_token: request.execution_token.trim().to_string(),
            upload_token: request.upload_token.trim().to_string(),
        },
        device_proof,
    };
    append_diagnostic_event(
        &app_data_dir,
        "worker_loop.start.ok",
        json!({
            "workerId": connection.worker_id,
            "serverUrl": connection.server_url,
            "deviceProof": local_device_proof_summary_json(&summarize_local_device_proof(&connection.device_proof)),
            "tokens": tokens_summary_json(&request_tokens),
        }),
    );

    let mut locked_loop = state
        .worker_loop
        .lock()
        .map_err(|_| "worker loop lock poisoned".to_string())?;
    if locked_loop
        .as_ref()
        .is_some_and(|existing| existing.stopped.load(std::sync::atomic::Ordering::Relaxed))
    {
        locked_loop.take();
    }
    if let Some(existing) = locked_loop.as_ref() {
        let mut locked_connection = existing
            .connection
            .lock()
            .map_err(|_| "worker loop connection lock poisoned".to_string())?;
        *locked_connection = connection;
        return Ok(WorkerLoopStatus {
            running: true,
            mode: "foreground_background_loop".into(),
            message: "Worker loop is already running; connection tokens were updated without stopping active work.".into(),
        });
    }
    let handle = start_worker_loop(
        state.settings.clone(),
        state.executor.clone(),
        resource_dir,
        app_data_dir,
        connection,
    );
    *locked_loop = Some(handle);
    Ok(WorkerLoopStatus {
        running: true,
        mode: "foreground_background_loop".into(),
        message: "Worker loop is running in this app process.".into(),
    })
}

#[tauri::command]
pub async fn worker_app_start_saved_worker_loop(
    app: tauri::AppHandle,
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerLoopStatus, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("app data directory unavailable: {error}"))?;
    let stored = load_connection(&app_data_dir)?
        .ok_or_else(|| "Connect this Worker App before starting the worker loop.".to_string())?;
    worker_app_start_worker_loop(
        app,
        state,
        WorkerLoopStartRequest {
            server_url: stored.server_url,
            worker_id: stored.worker.id,
            worker_label: stored.worker.display_name,
            execution_token: stored.tokens.execution_token,
            upload_token: stored.tokens.upload_token,
        },
    )
    .await
}

#[tauri::command]
pub async fn worker_app_stop_worker_loop(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerLoopStatus, String> {
    stop_worker_loop_state(&state).await
}

pub async fn stop_worker_loop_state(state: &WorkerAppState) -> Result<WorkerLoopStatus, String> {
    let existing = {
        let mut locked_loop = state
            .worker_loop
            .lock()
            .map_err(|_| "worker loop lock poisoned".to_string())?;
        locked_loop.take()
    };

    if let Some(existing) = existing {
        let stopped = existing.stopped.clone();
        existing
            .cancel
            .store(true, std::sync::atomic::Ordering::Relaxed);
        let handle = existing.handle;
        let started = Instant::now();
        while !stopped.load(std::sync::atomic::Ordering::Relaxed)
            && started.elapsed() < Duration::from_secs(8)
        {
            let _ = tauri::async_runtime::spawn_blocking(|| {
                std::thread::sleep(Duration::from_millis(250));
            })
            .await;
        }
        if stopped.load(std::sync::atomic::Ordering::Relaxed) {
            let _ = handle.await;
        } else {
            // The render task should normally observe cancel and clean up the WSL
            // process group. Abort is kept as a final app-shutdown fallback.
            handle.abort();
            let _ = handle.await;
        }
    }
    if let Ok(mut executor) = state.executor.lock() {
        executor.accepting_jobs = false;
        executor.current_job_id = None;
        executor.current_job_label = None;
        executor.current_job_type = None;
        executor.current_project_id = None;
        executor.current_project_name = None;
        executor.manual_command = None;
        executor.log_tail = None;
        executor.progress_percent = 0;
        executor.status = ExecutorStatus::Idle;
        executor.last_message = "Worker loop stopped and render cleanup requested.".into();
    }
    Ok(WorkerLoopStatus {
        running: false,
        mode: "manual".into(),
        message: "Worker loop stopped and render cleanup requested.".into(),
    })
}

#[tauri::command]
pub async fn worker_app_get_worker_loop_status(
    state: tauri::State<'_, WorkerAppState>,
) -> Result<WorkerLoopStatus, String> {
    let mut locked_loop = state
        .worker_loop
        .lock()
        .map_err(|_| "worker loop lock poisoned".to_string())?;
    if locked_loop
        .as_ref()
        .is_some_and(|existing| existing.stopped.load(std::sync::atomic::Ordering::Relaxed))
    {
        locked_loop.take();
    }
    let running = locked_loop.is_some();
    Ok(WorkerLoopStatus {
        running,
        mode: if running {
            "foreground_background_loop".into()
        } else {
            "manual".into()
        },
        message: if running {
            "Worker loop is running in this app process.".into()
        } else {
            "Worker loop is stopped.".into()
        },
    })
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StartupModeStatus {
    pub start_with_windows: bool,
    pub service_available: bool,
    pub message: String,
}

#[tauri::command]
pub async fn worker_app_configure_startup(enabled: bool) -> Result<StartupModeStatus, String> {
    configure_windows_login_startup(enabled)
}

#[cfg(target_os = "windows")]
fn configure_windows_login_startup(enabled: bool) -> Result<StartupModeStatus, String> {
    let exe = std::env::current_exe()
        .map_err(|error| format!("unable to resolve Worker App executable path: {error}"))?;
    let exe = exe
        .to_str()
        .ok_or_else(|| "Worker App executable path is not valid UTF-8".to_string())?;
    let status = if enabled {
        std::process::Command::new("reg")
            .args([
                "add",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "SmartAIHubWorkerApp",
                "/t",
                "REG_SZ",
                "/d",
                &format!("\"{exe}\""),
                "/f",
            ])
            .status()
            .map_err(|error| format!("failed to configure Windows login startup: {error}"))?
    } else {
        std::process::Command::new("reg")
            .args([
                "delete",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "SmartAIHubWorkerApp",
                "/f",
            ])
            .status()
            .map_err(|error| format!("failed to remove Windows login startup: {error}"))?
    };
    if !status.success() {
        return Err(format!(
            "Windows startup registry command failed with {status}"
        ));
    }
    Ok(StartupModeStatus {
        start_with_windows: enabled,
        service_available: false,
        message: if enabled {
            "Worker App will start when this Windows user signs in. This is not a Windows service."
                .into()
        } else {
            "Windows login autostart is disabled.".into()
        },
    })
}

#[cfg(not(target_os = "windows"))]
fn configure_windows_login_startup(enabled: bool) -> Result<StartupModeStatus, String> {
    Ok(StartupModeStatus {
        start_with_windows: false,
        service_available: false,
        message: if enabled {
            "Windows login autostart can only be configured from the Windows build.".into()
        } else {
            "Windows login autostart is disabled.".into()
        },
    })
}

async fn start_worker_connect_session(
    server_url: &str,
    payload: &WorkerAppRegistrationPayload,
) -> Result<WorkerConnectSession, String> {
    let url = format!(
        "{}/api/workers/connect/start",
        server_url.trim().trim_end_matches('/')
    );
    let response = reqwest::Client::new()
        .post(url)
        .json(&json!({ "payload": payload }))
        .send()
        .await
        .map_err(|error| format!("unable to start browser approval: {error}"))?;
    parse_json_response::<WorkerConnectSession>(response).await
}

async fn poll_worker_connect_session(
    server_url: &str,
    device_code: &str,
) -> Result<WorkerConnectPollResponse, String> {
    let url = format!(
        "{}/api/workers/connect/token",
        server_url.trim().trim_end_matches('/')
    );
    let response = reqwest::Client::new()
        .post(url)
        .json(&json!({ "deviceCode": device_code }))
        .send()
        .await
        .map_err(|error| format!("unable to check browser approval: {error}"))?;
    parse_json_response::<WorkerConnectPollResponse>(response).await
}

async fn refresh_worker_connect_tokens(
    server_url: &str,
    refresh_token: &str,
    device_proof: &WorkerDeviceProofMaterial,
) -> Result<WorkerConnectTokens, String> {
    let envelope = post_worker_json::<WorkerConnectRefreshEnvelope, _>(
        server_url,
        "/api/workers/connect/refresh",
        refresh_token,
        &json!({}),
        device_proof,
    )
    .await
    .map_err(|error| format!("unable to refresh worker access: {error}"))?;
    Ok(envelope.tokens)
}

async fn fetch_runtime_manifest(
    server_url: &str,
    runtime_id: &str,
    channel: &str,
) -> Result<RuntimePackManifest, String> {
    let url = format!(
        "{}/api/workers/runtime-pack/manifest?runtimeId={}&channel={}",
        server_url.trim().trim_end_matches('/'),
        runtime_id.trim(),
        channel.trim()
    );
    let response = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|error| format!("unable to fetch runtime manifest: {error}"))?;
    parse_json_response::<RuntimePackManifest>(response)
        .await
        .map_err(|error| format!("runtime manifest unavailable: {error}"))
}

fn absolute_url(server_url: &str, value: &str) -> Result<String, String> {
    let value = value.trim();
    if value.starts_with("https://") || value.starts_with("http://") {
        return Ok(value.to_string());
    }
    if !value.starts_with('/') {
        return Err("runtime archiveUrl must be absolute or root-relative".into());
    }
    Ok(format!(
        "{}{}",
        server_url.trim().trim_end_matches('/'),
        value
    ))
}

fn sanitize_file_segment(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' || ch == '.' {
                ch
            } else {
                '-'
            }
        })
        .collect();
    sanitized.trim_matches(&['-', '.'][..]).to_string()
}

async fn download_runtime_archive(
    url: &str,
    archive_path: &Path,
    expected_size_bytes: Option<u64>,
) -> Result<(), String> {
    let mut response = reqwest::Client::new()
        .get(url)
        .send()
        .await
        .map_err(|error| format!("unable to download runtime archive: {error}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "runtime archive download failed with {}",
            response.status()
        ));
    }
    let mut file = File::create(archive_path)
        .map_err(|error| format!("failed to create runtime archive: {error}"))?;
    let mut downloaded: u64 = 0;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| format!("failed while downloading runtime archive: {error}"))?
    {
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        file.write_all(&chunk)
            .map_err(|error| format!("failed to write runtime archive: {error}"))?;
    }
    file.flush()
        .map_err(|error| format!("failed to flush runtime archive: {error}"))?;
    if let Some(expected) = expected_size_bytes {
        if expected != downloaded {
            return Err(format!(
                "runtime archive size mismatch. Expected {expected} bytes, got {downloaded} bytes."
            ));
        }
    }
    Ok(())
}

fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("failed to open file: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("failed to read file: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn extract_runtime_archive(archive_path: &Path, app_data_dir: &Path) -> Result<(), String> {
    let file = File::open(archive_path)
        .map_err(|error| format!("failed to open runtime archive: {error}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|error| format!("runtime archive is not a valid zip: {error}"))?;
    let install_root = app_data_dir.join("runtime-install");
    if install_root.exists() {
        fs::remove_dir_all(&install_root)
            .map_err(|error| format!("failed to clear runtime install staging: {error}"))?;
    }
    fs::create_dir_all(&install_root)
        .map_err(|error| format!("failed to create runtime install staging: {error}"))?;
    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| format!("failed to read runtime archive entry: {error}"))?;
        let out_path = safe_archive_output_path(&install_root, entry.name())?;
        if entry.is_dir() {
            fs::create_dir_all(&out_path)
                .map_err(|error| format!("failed to create runtime directory: {error}"))?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create runtime directory: {error}"))?;
        }
        let mut out_file = File::create(&out_path)
            .map_err(|error| format!("failed to create runtime file: {error}"))?;
        io::copy(&mut entry, &mut out_file)
            .map_err(|error| format!("failed to extract runtime file: {error}"))?;
    }
    let staged_runtime_pack = install_root.join("runtime-pack");
    let staged_sidecars = install_root.join("sidecars");
    if !staged_runtime_pack.join("manifest.json").is_file() {
        return Err("Runtime archive must contain runtime-pack/manifest.json.".into());
    }
    if !staged_sidecars.is_dir() {
        return Err("Runtime archive must contain sidecars/.".into());
    }
    replace_dir(&staged_runtime_pack, &app_data_dir.join("runtime-pack"))?;
    replace_dir(&staged_sidecars, &app_data_dir.join("sidecars"))?;
    let _ = fs::remove_dir_all(&install_root);
    Ok(())
}

fn safe_archive_output_path(root: &Path, name: &str) -> Result<PathBuf, String> {
    let relative = Path::new(name);
    if relative.is_absolute()
        || relative
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::Prefix(_)))
    {
        return Err("Runtime archive contains an unsafe path.".into());
    }
    Ok(root.join(relative))
}

fn replace_dir(from: &Path, to: &Path) -> Result<(), String> {
    if to.exists() {
        let temp_old = to.with_file_name(format!(
            "{}_old_{}",
            to.file_name().unwrap_or_default().to_string_lossy(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis()
        ));

        if let Err(e) = fs::rename(to, &temp_old) {
            return Err(format!("failed to move previous runtime directory: {e}"));
        }

        // We can safely ignore if this fails immediately, as it's just cleanup
        let _ = fs::remove_dir_all(&temp_old);
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create runtime parent directory: {error}"))?;
    }
    fs::rename(from, to).map_err(|error| format!("failed to install runtime directory: {error}"))
}

fn active_connected_device_proof(
    state: &tauri::State<'_, WorkerAppState>,
) -> Result<Option<WorkerDeviceProofMaterial>, String> {
    state
        .active_connected_device_proof
        .lock()
        .map(|proof| proof.clone())
        .map_err(|_| "active connected device proof lock poisoned".to_string())
}

fn set_active_connected_device_proof(
    state: &tauri::State<'_, WorkerAppState>,
    device_proof: Option<WorkerDeviceProofMaterial>,
) -> Result<(), String> {
    let mut active = state
        .active_connected_device_proof
        .lock()
        .map_err(|_| "active connected device proof lock poisoned".to_string())?;
    *active = device_proof;
    Ok(())
}

fn update_running_loop_connection(
    state: &tauri::State<'_, WorkerAppState>,
    stored: &StoredWorkerConnection,
    app_data_dir: &std::path::Path,
) -> Result<(), String> {
    let locked_loop = state
        .worker_loop
        .lock()
        .map_err(|_| "worker loop lock poisoned".to_string())?;
    if let Some(existing) = locked_loop.as_ref() {
        let mut connection = existing
            .connection
            .lock()
            .map_err(|_| "worker loop connection lock poisoned".to_string())?;
        let device_proof = match active_connected_device_proof(state)? {
            Some(device_proof) => device_proof,
            None => ensure_device_proof_material(app_data_dir)?,
        };
        validate_connection_tokens_match_device_proof(
            app_data_dir,
            "worker_loop.update_connection",
            &stored.tokens,
            &device_proof,
        )?;
        *connection = WorkerLoopConnection {
            server_url: stored.server_url.trim().trim_end_matches('/').to_string(),
            worker_id: stored.worker.id.trim().to_string(),
            worker_label: stored.worker.display_name.trim().to_string(),
            tokens: WorkerApiTokens {
                execution_token: stored.tokens.execution_token.trim().to_string(),
                upload_token: stored.tokens.upload_token.trim().to_string(),
            },
            device_proof,
        };
    }
    Ok(())
}

fn validate_connection_tokens_match_device_proof(
    app_data_dir: &Path,
    context: &str,
    tokens: &WorkerConnectTokens,
    device_proof: &WorkerDeviceProofMaterial,
) -> Result<(), String> {
    let local = summarize_local_device_proof(device_proof);
    let token_summaries = [
        ("execution", Some(tokens.execution_token.as_str())),
        ("upload", Some(tokens.upload_token.as_str())),
        ("refresh", tokens.refresh_token.as_deref()),
    ]
    .into_iter()
    .filter_map(|(name, token)| {
        token
            .filter(|value| !value.trim().is_empty())
            .map(|value| decode_worker_token_binding(value).map(|summary| (name, summary)))
    })
    .collect::<Result<Vec<_>, _>>()?;

    for (name, summary) in &token_summaries {
        let mismatches = token_device_binding_mismatches(summary, &local);
        if !mismatches.is_empty() {
            append_diagnostic_event(
                app_data_dir,
                "token.device_binding_mismatch",
                json!({
                    "context": context,
                    "tokenName": name,
                    "mismatches": mismatches,
                    "localDeviceProof": local_device_proof_summary_json(&local),
                    "token": token_binding_summary_json(summary),
                }),
            );
            return Err(format!(
                "Worker App token/device proof mismatch before {context}. Reconnect this Worker App in your browser. Diagnostic log: {}",
                diagnostic_log_path(app_data_dir).to_string_lossy()
            ));
        }
    }

    append_diagnostic_event(
        app_data_dir,
        "token.device_binding_ok",
        json!({
            "context": context,
            "localDeviceProof": local_device_proof_summary_json(&local),
            "tokens": token_summaries
                .iter()
                .map(|(name, summary)| json!({
                    "name": name,
                    "claims": token_binding_summary_json(summary),
                }))
                .collect::<Vec<_>>(),
        }),
    );
    Ok(())
}

fn decode_worker_token_binding(token: &str) -> Result<WorkerTokenBindingSummary, String> {
    let payload = token
        .trim()
        .split('.')
        .nth(1)
        .ok_or_else(|| "worker token is not a JWT".to_string())?;
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, payload)
        .map_err(|error| format!("worker token payload is invalid: {error}"))?;
    let value = serde_json::from_slice::<Value>(&bytes)
        .map_err(|error| format!("worker token payload is not JSON: {error}"))?;
    Ok(WorkerTokenBindingSummary {
        connection_id: string_claim(&value, "workerConnectionId"),
        device_id: string_claim(&value, "deviceId"),
        expires_at: value.get("exp").and_then(Value::as_i64),
        jti: string_claim(&value, "jti"),
        machine_fingerprint_hash: string_claim(&value, "machineFingerprintHash"),
        public_key_fingerprint: string_claim(&value, "devicePublicKeyFingerprint"),
        token_use: string_claim(&value, "tokenUse"),
        worker_id: string_claim(&value, "workerId"),
    })
}

fn string_claim(value: &Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn summarize_local_device_proof(
    device_proof: &WorkerDeviceProofMaterial,
) -> LocalDeviceProofSummary {
    LocalDeviceProofSummary {
        device_id: device_proof.device_id.trim().to_string(),
        machine_fingerprint_hash: normalize_machine_fingerprint_hash(
            &device_proof.machine_fingerprint,
        ),
        public_key_fingerprint: sha256_hex(
            normalize_public_key(&device_proof.public_key_pem).as_bytes(),
        ),
    }
}

fn token_device_binding_mismatches(
    token: &WorkerTokenBindingSummary,
    local: &LocalDeviceProofSummary,
) -> Vec<&'static str> {
    let mut mismatches = Vec::new();
    if token
        .device_id
        .as_deref()
        .is_some_and(|device_id| device_id != local.device_id)
    {
        mismatches.push("deviceId");
    }
    if token
        .public_key_fingerprint
        .as_deref()
        .is_some_and(|fingerprint| fingerprint != local.public_key_fingerprint)
    {
        mismatches.push("devicePublicKeyFingerprint");
    }
    if token
        .machine_fingerprint_hash
        .as_deref()
        .is_some_and(|fingerprint| fingerprint != local.machine_fingerprint_hash)
    {
        mismatches.push("machineFingerprintHash");
    }
    mismatches
}

fn tokens_summary_json(tokens: &WorkerConnectTokens) -> Value {
    json!({
        "execution": decode_worker_token_binding(&tokens.execution_token)
            .map(|summary| token_binding_summary_json(&summary))
            .unwrap_or_else(|error| json!({ "decodeError": error })),
        "upload": decode_worker_token_binding(&tokens.upload_token)
            .map(|summary| token_binding_summary_json(&summary))
            .unwrap_or_else(|error| json!({ "decodeError": error })),
        "refresh": tokens.refresh_token.as_ref().map(|token| {
            decode_worker_token_binding(token)
                .map(|summary| token_binding_summary_json(&summary))
                .unwrap_or_else(|error| json!({ "decodeError": error }))
        }),
    })
}

fn token_binding_summary_json(summary: &WorkerTokenBindingSummary) -> Value {
    json!({
        "connectionIdHash": summary.connection_id.as_deref().map(hash_for_log),
        "deviceIdHash": summary.device_id.as_deref().map(hash_for_log),
        "expiresAt": summary.expires_at,
        "jtiHash": summary.jti.as_deref().map(hash_for_log),
        "machineFingerprintHash": summary.machine_fingerprint_hash,
        "publicKeyFingerprint": summary.public_key_fingerprint,
        "tokenUse": summary.token_use,
        "workerId": summary.worker_id,
    })
}

fn local_device_proof_summary_json(summary: &LocalDeviceProofSummary) -> Value {
    json!({
        "deviceIdHash": hash_for_log(&summary.device_id),
        "machineFingerprintHash": summary.machine_fingerprint_hash,
        "publicKeyFingerprint": summary.public_key_fingerprint,
    })
}

fn normalize_public_key(public_key: &str) -> String {
    public_key
        .replace("\\n", "\n")
        .replace("\r\n", "\n")
        .trim()
        .to_string()
}

fn normalize_machine_fingerprint_hash(machine_fingerprint: &str) -> String {
    let trimmed = machine_fingerprint.trim();
    if trimmed.len() == 64 && trimmed.chars().all(|ch| ch.is_ascii_hexdigit()) {
        trimmed.to_lowercase()
    } else {
        sha256_hex(trimmed.as_bytes())
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    format!("{:x}", hasher.finalize())
}

fn hash_for_log(value: &str) -> String {
    sha256_hex(value.as_bytes())
}

fn now_rfc3339() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".into())
}

async fn parse_json_response<T>(response: reqwest::Response) -> Result<T, String>
where
    T: for<'de> Deserialize<'de>,
{
    let status = response.status();
    let text = response
        .text()
        .await
        .map_err(|error| format!("unable to read server response: {error}"))?;
    if !status.is_success() {
        let message = serde_json::from_str::<serde_json::Value>(&text)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .and_then(|message| message.as_str())
                    .map(str::to_string)
                    .or_else(|| {
                        value
                            .get("error")
                            .and_then(|error| error.get("message"))
                            .and_then(|message| message.as_str())
                            .map(str::to_string)
                    })
                    .or_else(|| {
                        value
                            .get("error")
                            .and_then(|message| message.as_str())
                            .map(str::to_string)
                    })
            })
            .unwrap_or_else(|| text.chars().take(240).collect());
        return Err(format!(
            "server rejected worker connection ({status}): {message}"
        ));
    }
    serde_json::from_str::<T>(&text)
        .map_err(|error| format!("server returned an unexpected response: {error}"))
}

fn worker_connect_url(server_url: &str) -> String {
    format!(
        "{}/workers/connect",
        server_url.trim().trim_end_matches('/')
    )
}

pub async fn try_refresh_connection_if_needed(
    app_data_dir: &std::path::Path,
    running_connection: &std::sync::Arc<std::sync::Mutex<WorkerLoopConnection>>,
) -> Result<(), String> {
    let current_tokens = {
        let lock = running_connection
            .lock()
            .map_err(|_| "worker connection lock poisoned".to_string())?;
        lock.tokens.clone()
    };

    let execution_exp =
        crate::worker_control_plane::jwt_exp(&current_tokens.execution_token).unwrap_or(0);
    let upload_exp =
        crate::worker_control_plane::jwt_exp(&current_tokens.upload_token).unwrap_or(0);
    let exp = execution_exp.min(upload_exp);
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    if exp > now + 300 {
        return Ok(());
    }

    let mut stored = load_connection(app_data_dir)?
        .ok_or_else(|| "Worker App is not connected yet.".to_string())?;

    let refresh_token = stored
        .tokens
        .refresh_token
        .clone()
        .ok_or_else(|| "Worker connection does not include a refresh token.".to_string())?;

    let device_proof = match load_connection_device_proof(app_data_dir)? {
        Some(device_proof) => device_proof,
        None => ensure_device_proof_material(app_data_dir)?,
    };

    let new_tokens =
        refresh_worker_connect_tokens(&stored.server_url, &refresh_token, &device_proof).await?;

    stored.tokens = new_tokens;
    stored.last_refreshed_at = Some(
        time::OffsetDateTime::now_utc()
            .format(&time::format_description::well_known::Rfc3339)
            .unwrap(),
    );
    save_connection_with_device_proof(app_data_dir, &stored, &device_proof)?;

    {
        let mut lock = running_connection
            .lock()
            .map_err(|_| "worker connection lock poisoned".to_string())?;
        lock.tokens = WorkerApiTokens {
            execution_token: stored.tokens.execution_token.clone(),
            upload_token: stored.tokens.upload_token.clone(),
        };
    }

    Ok(())
}

#[tauri::command]
pub async fn worker_app_open_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        normalize_machine_fingerprint_hash, summarize_local_device_proof,
        token_device_binding_mismatches, worker_connect_url, WorkerTokenBindingSummary,
    };
    use crate::credentials::WorkerDeviceProofMaterial;
    use base64::Engine;

    #[test]
    fn worker_connect_url_uses_configured_server_without_double_slashes() {
        assert_eq!(
            worker_connect_url("https://smartaihub.app/"),
            "https://smartaihub.app/workers/connect",
        );
    }

    #[test]
    fn local_device_proof_summary_matches_server_binding_hash_rules() {
        let material = WorkerDeviceProofMaterial {
            device_id: "wdev_1".into(),
            machine_fingerprint: "machine_same".into(),
            public_key_pem: "-----BEGIN PUBLIC KEY-----\\nabc\\n-----END PUBLIC KEY-----".into(),
            private_key_pem: "private".into(),
        };

        let summary = summarize_local_device_proof(&material);

        assert_eq!(summary.device_id, "wdev_1");
        assert_eq!(
            summary.machine_fingerprint_hash,
            normalize_machine_fingerprint_hash("machine_same")
        );
        assert_eq!(summary.public_key_fingerprint.len(), 64);
    }

    #[test]
    fn token_device_binding_mismatch_identifies_exact_claims() {
        let token = WorkerTokenBindingSummary {
            connection_id: Some("conn-1".into()),
            device_id: Some("wdev_old".into()),
            expires_at: None,
            jti: Some("jti-1".into()),
            machine_fingerprint_hash: Some("machine-old".into()),
            public_key_fingerprint: Some("public-old".into()),
            token_use: Some("worker_execution".into()),
            worker_id: Some("worker-1".into()),
        };
        let material = WorkerDeviceProofMaterial {
            device_id: "wdev_new".into(),
            machine_fingerprint: "machine_new".into(),
            public_key_pem: "public-new".into(),
            private_key_pem: "private".into(),
        };
        let local = summarize_local_device_proof(&material);

        assert_eq!(
            token_device_binding_mismatches(&token, &local),
            vec![
                "deviceId",
                "devicePublicKeyFingerprint",
                "machineFingerprintHash"
            ]
        );
    }

    #[test]
    fn worker_token_binding_decoder_reads_claims_without_logging_token() {
        let payload = serde_json::json!({
            "workerConnectionId": "conn-1",
            "deviceId": "wdev_1",
            "devicePublicKeyFingerprint": "public-fp",
            "machineFingerprintHash": "machine-fp",
            "jti": "jti-1",
            "exp": 123,
            "tokenUse": "worker_execution",
            "workerId": "worker-1"
        });
        let token = format!(
            "{}.{}.sig",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode("{}"),
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload.to_string())
        );

        let decoded = super::decode_worker_token_binding(&token).unwrap();

        assert_eq!(decoded.device_id.as_deref(), Some("wdev_1"));
        assert_eq!(decoded.public_key_fingerprint.as_deref(), Some("public-fp"));
        assert_eq!(
            decoded.machine_fingerprint_hash.as_deref(),
            Some("machine-fp")
        );
        assert_eq!(decoded.expires_at, Some(123));
    }
}

#[tauri::command]
pub async fn worker_app_run_manual_command(command: String) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    let output = std::process::Command::new("cmd")
        .args(&["/C", &command])
        .output()
        .map_err(|e| format!("failed to spawn cmd: {e}"))?;

    #[cfg(not(target_os = "windows"))]
    let output = std::process::Command::new("sh")
        .args(&["-c", &command])
        .output()
        .map_err(|e| format!("failed to spawn shell: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    if output.status.success() {
        Ok(format!("Success:\n{stdout}\n{stderr}"))
    } else {
        Err(format!("Exited {}:\n{stdout}\n{stderr}", output.status))
    }
}
