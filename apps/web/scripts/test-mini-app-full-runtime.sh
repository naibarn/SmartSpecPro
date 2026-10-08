#!/usr/bin/env bash
set -euo pipefail
if [[ -n "${DATABASE_URL:-}" || -n "${MINI_APP_BASELINE_DATABASE_URL:-}" ]]; then
  echo "FULL_APP_RUNTIME_REFUSES_INHERITED_DATABASE_URL" >&2
  exit 2
fi
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(pg_config --bindir)"
RUNTIME_DIR="$(mktemp -d "${TMPDIR:-/tmp}/miniapp-full-app.XXXXXX")"
mkdir "$RUNTIME_DIR/socket"
DB_STARTED=0
APP_PID=""
SMOKE_FILE=""
PASS=0
cleanup() {
  local status=$?
  if [[ -n "$APP_PID" ]]; then
    kill -TERM "$APP_PID" 2>/dev/null || true
    for _ in $(seq 1 20); do
      kill -0 "$APP_PID" 2>/dev/null || break
      sleep 0.25
    done
    kill -KILL "$APP_PID" 2>/dev/null || true
    wait "$APP_PID" 2>/dev/null || true
  fi
  if [[ -n "$SMOKE_FILE" && -f "$SMOKE_FILE" ]]; then rm -- "$SMOKE_FILE"; fi
  if [[ "$DB_STARTED" == "1" ]]; then "$PG_BIN/pg_ctl" -D "$RUNTIME_DIR/data" stop -m fast >/dev/null || true; fi
  if [[ "$status" -eq 0 && "$PASS" == "1" ]]; then
    rm -rf -- "$RUNTIME_DIR"
  else
    echo "FULL_APP_RUNTIME_EVIDENCE_DIR=$RUNTIME_DIR" >&2
  fi
  exit "$status"
}
trap cleanup EXIT
PORT="$(node -e 'const net=require("node:net");const s=net.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
WEB_PORT="$(node -e 'const net=require("node:net");const s=net.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
"$PG_BIN/initdb" -D "$RUNTIME_DIR/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$RUNTIME_DIR/data" -o "-h 127.0.0.1 -p $PORT -k $RUNTIME_DIR/socket" -l "$RUNTIME_DIR/postgres.log" start >/dev/null
DB_STARTED=1
createdb -h 127.0.0.1 -p "$PORT" miniapp_full_runtime_test
export MINI_APP_BASELINE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PORT/miniapp_full_runtime_test"
cd "$APP_DIR"
pnpm exec drizzle-kit migrate --config=drizzle.mini-app-baseline.config.ts >/dev/null
psql "$MINI_APP_BASELINE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/research-notes-focused-runtime.seed.sql >/dev/null
env -i PATH="$PATH" HOME="$HOME" USER="$USER" DOTENV_CONFIG_PATH=/dev/null NODE_ENV=development HOST=127.0.0.1 PORT="$WEB_PORT" DATABASE_URL="$MINI_APP_BASELINE_DATABASE_URL" JWT_SECRET=synthetic-full-app-runtime-secret-32-characters APP_ID=smartspec-local-dev CONTROL_PLANE_API_KEY=synthetic-control-plane-test-key CONTROL_PLANE_URL=http://127.0.0.1:1 API_KEY_HMAC_SECRET=synthetic-api-key-hmac-secret-at-least-32-chars pnpm exec tsx server/_core/index.ts >"$RUNTIME_DIR/app.log" 2>&1 &
APP_PID=$!
HEALTH_CODE=""
for _ in $(seq 1 45); do
  HEALTH_CODE="$(curl --silent --output "$RUNTIME_DIR/health.json" --write-out '%{http_code}' "http://127.0.0.1:$WEB_PORT/healthz" || true)"
  if [[ "$HEALTH_CODE" == "200" ]]; then break; fi
  if ! kill -0 "$APP_PID" 2>/dev/null; then break; fi
  sleep 1
done
if [[ "$HEALTH_CODE" != "200" ]]; then
  echo "FULL_APP_HEALTHZ_FAILED status=$HEALTH_CODE" >&2
  tail -n 80 "$RUNTIME_DIR/app.log" >&2
  exit 1
fi
READY_CODE="$(curl --silent --output "$RUNTIME_DIR/ready.json" --write-out '%{http_code}' "http://127.0.0.1:$WEB_PORT/readyz" || true)"
UI_CODE="$(curl --silent --output "$RUNTIME_DIR/ui.html" --write-out '%{http_code}' "http://127.0.0.1:$WEB_PORT/apps/research-notes" || true)"
API_CODE="$(curl --silent --output "$RUNTIME_DIR/api.json" --write-out '%{http_code}' --get "http://127.0.0.1:$WEB_PORT/trpc/researchNotes.listProjects" --data-urlencode 'input={"json":{"appId":"app_research_notes"}}' || true)"
if [[ "$READY_CODE" != "200" || "$UI_CODE" != "200" || "$API_CODE" != "401" && "$API_CODE" != "403" ]]; then
  echo "FULL_APP_PROBE_FAILED health=$HEALTH_CODE ready=$READY_CODE ui=$UI_CODE api=$API_CODE" >&2
  tail -n 100 "$RUNTIME_DIR/app.log" >&2
  exit 1
fi
SMOKE_FILE="$APP_DIR/scripts/.mini-app-full-runtime-smoke-$$.tmp.ts"
cat > "$SMOKE_FILE" <<'TS'
import { createTRPCProxyClient, httpLink } from "@trpc/client";
import { readFile, writeFile } from "node:fs/promises";
import superjson from "superjson";
import { COOKIE_NAME } from "../shared/const";
import { sdk } from "../server/_core/sdk";

const baseUrl = process.env.FULL_APP_BASE_URL;
if (!baseUrl || process.env.NODE_ENV !== "test") throw new Error("FULL_APP_SMOKE_ENV_REQUIRED");
const token = await sdk.createSessionToken("miniapp-runtime-user", { name: "Synthetic Runtime User" });
await writeFile(process.env.FULL_APP_SESSION_TOKEN_FILE!, token, { mode: 0o600 });
const client = createTRPCProxyClient<any>({
  transformer: superjson,
  links: [httpLink({ url: `${baseUrl}/trpc`, transformer: superjson,
    headers: { origin: baseUrl, cookie: `${COOKIE_NAME}=${token}` } })],
});
const resolved = await client.appIdentity.resolvePublicApp.query({ publicAppId: "research-notes" });
if (resolved.appId !== "app_research_notes") throw new Error("FULL_APP_MINI_APP_RESOLUTION_FAILED");
const projects = await client.researchNotes.listProjects.query({ appId: "app_research_notes" });
if (!projects.some((project: { projectId: string }) => project.projectId === "miniapp-runtime-project")) {
  throw new Error("FULL_APP_RESEARCH_NOTES_PROJECT_CONTEXT_FAILED");
}
const requestFile = process.env.FULL_APP_SUMMARY_REQUEST_FILE!;
if (!requestFile) throw new Error("FULL_APP_SUMMARY_REQUEST_FILE_REQUIRED");
if (process.env.FULL_APP_SMOKE_MODE === "verify-summary") {
  const request = JSON.parse(await readFile(requestFile, "utf8")) as { jobId: string; noteId: string };
  const summary = await client.researchNotes.summaryJob.query({
    appId: "app_research_notes", projectId: "miniapp-runtime-project", ...request,
  });
  if (summary?.status !== "succeeded") throw new Error("FULL_APP_HEADLESS_SUMMARY_NOT_SETTLED");
  await client.researchNotes.archiveNote.mutate({
    appId: "app_research_notes", projectId: "miniapp-runtime-project", noteId: request.noteId,
  });
  console.log("FULL_APP_HEADLESS_SUMMARY_SETTLEMENT_PASS");
} else {
  const runId = crypto.randomUUID();
  const created = await client.researchNotes.createNote.mutate({
    appId: "app_research_notes", projectId: "miniapp-runtime-project",
    title: `Full app ${runId}`, content: `Synthetic full app runtime ${runId}`,
  });
  const summary = await client.researchNotes.requestSummary.mutate({
    appId: "app_research_notes", projectId: "miniapp-runtime-project", noteId: created.noteId,
  });
  await writeFile(requestFile, JSON.stringify({ jobId: summary.jobId, noteId: created.noteId }), { mode: 0o600 });
  console.log("FULL_APP_AUTHENTICATED_API_PASS");
}
TS
FULL_APP_SUMMARY_REQUEST_FILE="$RUNTIME_DIR/research-notes-summary.json"
NODE_ENV=test JWT_SECRET=synthetic-full-app-runtime-secret-32-characters FULL_APP_BASE_URL="http://127.0.0.1:$WEB_PORT" FULL_APP_SESSION_TOKEN_FILE="$RUNTIME_DIR/session-token" FULL_APP_SUMMARY_REQUEST_FILE="$FULL_APP_SUMMARY_REQUEST_FILE" pnpm exec tsx "$SMOKE_FILE"
env -i PATH="$PATH" HOME="$HOME" USER="$USER" DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test DATABASE_URL="$MINI_APP_BASELINE_DATABASE_URL" JWT_SECRET=synthetic-full-app-runtime-secret-32-characters FEATURE_186_NODE_WORKER_HEARTBEAT_FILE="$RUNTIME_DIR/worker.heartbeat" FULL_APP_SUMMARY_REQUEST_FILE="$FULL_APP_SUMMARY_REQUEST_FILE" pnpm exec tsx scripts/research-notes-background-worker-runtime.ts
NODE_ENV=test JWT_SECRET=synthetic-full-app-runtime-secret-32-characters FULL_APP_BASE_URL="http://127.0.0.1:$WEB_PORT" FULL_APP_SESSION_TOKEN_FILE="$RUNTIME_DIR/session-token" FULL_APP_SUMMARY_REQUEST_FILE="$FULL_APP_SUMMARY_REQUEST_FILE" FULL_APP_SMOKE_MODE=verify-summary pnpm exec tsx "$SMOKE_FILE"
echo "FULL_APP_SAME_RUNTIME_BACKGROUND_WORKER_PASS"
if [[ "${SKIP_BROWSER_UAT:-0}" == "1" ]]; then
  echo "FULL_APP_BROWSER_UAT_SKIPPED_FOR_RUNTIME_PLACEMENT_ONLY"
else
  env -i PATH="$PATH" HOME="$HOME" USER="$USER" DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test DATABASE_URL="$MINI_APP_BASELINE_DATABASE_URL" JWT_SECRET=synthetic-full-app-runtime-secret-32-characters APP_ID=smartspec-local-dev CONTROL_PLANE_API_KEY=synthetic-control-plane-test-key CONTROL_PLANE_URL=http://127.0.0.1:1 API_KEY_HMAC_SECRET=synthetic-api-key-hmac-secret-at-least-32-chars PLAYWRIGHT_SKIP_WEB_SERVER=1 PLAYWRIGHT_BASE_URL="http://127.0.0.1:$WEB_PORT" FULL_APP_SESSION_TOKEN_FILE="$RUNTIME_DIR/session-token" pnpm exec playwright test tests/e2e/research-notes-browser.spec.ts --project=chromium
fi

echo "FULL_APP_RUNTIME_BOOT_PASS runtimeId=loopback:$WEB_PORT healthz=$HEALTH_CODE readyz=$READY_CODE research_notes_ui=$UI_CODE authenticated_api=PASS unauthenticated_api=$API_CODE host=127.0.0.1"
PASS=1
