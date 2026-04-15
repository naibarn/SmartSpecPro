#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_WORKSPACE="apps/tauri-shell"
WEB_WORKSPACE="apps/web"
WEB_URL="${SMARTSPEC_DESKTOP_WEB_URL:-http://localhost:3000}"
BACKEND_HEALTH_URL="${SMARTSPEC_DESKTOP_BACKEND_HEALTH_URL:-http://localhost:8000/health}"
PUBLIC_WEB_URL="${SMARTSPEC_DESKTOP_PUBLIC_URL:-${SMARTAIHUB_DESKTOP_PUBLIC_URL:-${VITE_SMARTAIHUB_WEB_URL:-${VITE_SMARTSPEC_WEB_URL:-${APP_PUBLIC_URL:-${PUBLIC_URL:-https://smartaihub.app}}}}}}"
DESKTOP_BUNDLE_MODE="${SMARTSPEC_DESKTOP_BUNDLE_MODE:-skip}"
DESKTOP_BUILD_TARGET="${SMARTSPEC_DESKTOP_BUILD_TARGET:-}"

START_WEB_IF_MISSING=true
WEB_PID=""

log() {
    echo "[desktop] $1"
}

warn() {
    echo "[desktop] WARN: $1" >&2
}

fail() {
    echo "[desktop] ERROR: $1" >&2
    exit 1
}

usage() {
    cat <<'EOF'
Usage: ./scripts/desktop-app.sh <dev|build|info> [--no-web]

Commands:
  dev     Start the SmartSpec web dev server if needed, then launch Tauri.
  build   Build an installable desktop bundle that points at the public SmartSpec web URL.
  info    Print Tauri environment information for the desktop shell.

Options:
  --no-web  Do not auto-start the SmartSpec web dev server during `dev`.
  -h, --help
EOF
}

cleanup() {
    if [ -n "${WEB_PID:-}" ]; then
        log "Stopping temporary SmartSpec Web dev server..."
        kill "$WEB_PID" 2>/dev/null || true
        wait "$WEB_PID" 2>/dev/null || true
    fi
}

trap cleanup EXIT INT TERM

ensure_desktop_prereqs() {
    command -v node >/dev/null 2>&1 || fail "Node.js is required."
    command -v npm >/dev/null 2>&1 || fail "npm is required."
    command -v cargo >/dev/null 2>&1 || fail "Rust/Cargo is required."

    if [ ! -x "$ROOT/node_modules/.bin/tauri" ]; then
        log "Installing npm dependencies at repo root..."
        (cd "$ROOT" && npm install)
    fi
}

wait_for_url() {
    local url="$1"
    local label="$2"
    local max_attempts="${3:-45}"
    local attempt=1

    until curl -sf "$url" >/dev/null 2>&1; do
        if [ "$attempt" -ge "$max_attempts" ]; then
            fail "$label did not become ready at $url"
        fi
        sleep 2
        attempt=$((attempt + 1))
    done
}

require_gui_session() {
    if [ "$(uname -s)" = "Linux" ] && [ -z "${DISPLAY:-}" ] && [ -z "${WAYLAND_DISPLAY:-}" ]; then
        fail "No GUI display detected. Set DISPLAY or WAYLAND_DISPLAY and run from a desktop session."
    fi
}

ensure_web_dev_server() {
    if curl -sf "$WEB_URL" >/dev/null 2>&1; then
        log "Using existing SmartSpec Web server at $WEB_URL"
        return
    fi

    if [ "$START_WEB_IF_MISSING" != true ]; then
        fail "SmartSpec Web is not reachable at $WEB_URL. Start it first or remove --no-web."
    fi

    log "Starting SmartSpec Web dev server at $WEB_URL..."
    (
        cd "$ROOT"
        npm --workspace "$WEB_WORKSPACE" run dev
    ) &
    WEB_PID=$!

    wait_for_url "$WEB_URL" "SmartSpec Web dev server"
}

warn_if_backend_missing() {
    if ! curl -sf "$BACKEND_HEALTH_URL" >/dev/null 2>&1; then
        warn "Local Python backend is not responding at $BACKEND_HEALTH_URL. This only affects local dev flows that depend on localhost:8000; installed desktop builds should use the public web stack instead."
    fi
}

cmd_dev() {
    ensure_desktop_prereqs
    require_gui_session
    ensure_web_dev_server
    warn_if_backend_missing

    log "Launching Tauri desktop shell..."
    (
        cd "$ROOT"
        npm --workspace "$DESKTOP_WORKSPACE" run tauri:dev
    )
}

cmd_build() {
    ensure_desktop_prereqs

    log "Building desktop bundle for public web URL: $PUBLIC_WEB_URL"
    (
        cd "$ROOT"
        BUILD_ARGS=(node ./scripts/desktop-build-local.mjs --bundle-mode "$DESKTOP_BUNDLE_MODE" --web-url "$PUBLIC_WEB_URL")
        if [ -n "$DESKTOP_BUILD_TARGET" ]; then
            BUILD_ARGS+=(--target "$DESKTOP_BUILD_TARGET")
        fi
        "${BUILD_ARGS[@]}"
    )
}

cmd_info() {
    ensure_desktop_prereqs

    (
        cd "$ROOT"
        npm --workspace "$DESKTOP_WORKSPACE" run tauri info
    )
}

COMMAND="${1:-dev}"
shift || true

while [ "$#" -gt 0 ]; do
    case "$1" in
        --no-web)
            START_WEB_IF_MISSING=false
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            fail "Unknown option: $1"
            ;;
    esac
    shift
done

case "$COMMAND" in
    dev)
        cmd_dev
        ;;
    build)
        cmd_build
        ;;
    info)
        cmd_info
        ;;
    help|-h|--help)
        usage
        ;;
    *)
        fail "Unknown command: $COMMAND"
        ;;
esac
