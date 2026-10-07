#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" || -n "${MINI_APP_BASELINE_DATABASE_URL:-}" ]]; then
  echo "MINI_APP_PGVECTOR_RUNTIME_REFUSES_PREEXISTING_DATABASE_URL" >&2
  exit 2
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${MINI_APP_PGVECTOR_IMAGE:-pgvector/pgvector:pg15}"
CONTAINER="miniapp-authenticated-pgvector-$$"
RUNTIME_DIR="$(mktemp -d /tmp/miniapp-pgvector-runtime.XXXXXX)"
PORT=""
PASSED=0

cleanup() {
  local status=$?
  if [[ -n "$PORT" ]]; then
    if [[ "$status" -eq 0 && "$PASSED" == "1" ]]; then
      rm -rf -- "$RUNTIME_DIR"
    else
      docker logs "$CONTAINER" >"$RUNTIME_DIR/postgres.log" 2>&1 || true
      printf 'Disposable pgvector runtime evidence retained at %s\n' "$RUNTIME_DIR" >&2
    fi
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  else
    rm -rf -- "$RUNTIME_DIR"
  fi
  exit "$status"
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "MINI_APP_PGVECTOR_RUNTIME_DOCKER_REQUIRED" >&2
  exit 2
fi
docker image inspect "$IMAGE" >/dev/null 2>&1 || {
  echo "MINI_APP_PGVECTOR_IMAGE_NOT_AVAILABLE: $IMAGE" >&2
  exit 2
}

docker run --detach --name "$CONTAINER" \
  --publish 127.0.0.1::5432 \
  --env POSTGRES_USER=miniapp \
  --env POSTGRES_DB=miniapp_authenticated_test \
  --env POSTGRES_HOST_AUTH_METHOD=trust \
  "$IMAGE" >"$RUNTIME_DIR/container-id"
PORT="$(docker port "$CONTAINER" 5432/tcp | sed -E 's#^127\.0\.0\.1:##')"
if [[ ! "$PORT" =~ ^[0-9]+$ ]]; then
  echo "MINI_APP_PGVECTOR_RUNTIME_PORT_BINDING_INVALID" >&2
  exit 2
fi

export MINI_APP_BASELINE_DATABASE_URL="postgresql://miniapp@127.0.0.1:$PORT/miniapp_authenticated_test"
for attempt in $(seq 1 45); do
  if pg_isready --host=127.0.0.1 --port="$PORT" --username=miniapp --dbname=miniapp_authenticated_test >/dev/null 2>&1; then
    break
  fi
  if [[ "$attempt" == "45" ]]; then
    echo "MINI_APP_PGVECTOR_RUNTIME_START_TIMEOUT" >&2
    exit 1
  fi
  sleep 1
done

psql "$MINI_APP_BASELINE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc \
  "SELECT default_version FROM pg_available_extensions WHERE name = 'vector'" \
  >"$RUNTIME_DIR/vector-availability.txt"
if [[ ! -s "$RUNTIME_DIR/vector-availability.txt" ]]; then
  echo "MINI_APP_PGVECTOR_EXTENSION_UNAVAILABLE" >&2
  exit 1
fi

cd "$APP_DIR"
pnpm run test:mini-app-authenticated-runtime
PASSED=1
printf 'MINI_APP_PGVECTOR_AUTHENTICATED_RUNTIME=PASS postgres_image=%s vector_version=%s\n' \
  "$IMAGE" "$(cat "$RUNTIME_DIR/vector-availability.txt")"
