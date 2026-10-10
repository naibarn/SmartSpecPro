#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "R5_PERSISTED_ACCEPTANCE_REFUSES_INHERITED_DATABASE_URL" >&2
  exit 2
fi
if [[ -n "${JWT_SECRET:-}" ]]; then
  echo "R5_PERSISTED_ACCEPTANCE_REFUSES_INHERITED_JWT_SECRET" >&2
  exit 2
fi
if [[ -z "${SMARTAIHUB_R5_DATABASE_URL:-}" ]]; then
  echo "SMARTAIHUB_R5_DATABASE_URL_REQUIRED" >&2
  exit 2
fi
if [[ "${SMARTAIHUB_R5_DISPOSABLE_DB_CONFIRMED:-}" != "1" ]]; then
  echo "SMARTAIHUB_R5_DISPOSABLE_DB_CONFIRMATION_REQUIRED" >&2
  exit 2
fi

node - <<'NODE'
const url = new URL(process.env.SMARTAIHUB_R5_DATABASE_URL);
const host = url.hostname.toLowerCase();
const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
if (!["localhost", "127.0.0.1", "::1"].includes(host) || database !== "miniapp_r5_test") {
  throw new Error("R5_PERSISTED_ACCEPTANCE_REQUIRES_LOOPBACK_miniapp_r5_test");
}
NODE

export DATABASE_URL="$SMARTAIHUB_R5_DATABASE_URL"
export JWT_SECRET="r5-synthetic-test-secret-32-characters-minimum"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/smartaihub-r5-persisted-memory-bootstrap.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0392_spec304_app_identity_and_route_aliases.sql
export SMARTAIHUB_R5_PERSISTED_ACCEPTANCE=1
pnpm --filter @smartspec/web exec vitest run server/services/__tests__/integration/smartAiHubR5PersistedMemory.integration.test.ts
