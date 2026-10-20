import { test } from "node:test";
import assert from "node:assert/strict";
import { applicationConnectorConfiguration } from "./cloudflare-http-entrypoint.mjs";

const now = Date.parse("2026-10-20T00:00:00Z");
const input = () => ({ NODE_ENV: "production", SMARTAIHUB_APPLICATION_RUNTIME: "cloudflare-http", CLOUDFLARE_CONTAINER_POLICY: "on-demand",
  DATABASE_CONNECTOR_HOSTNAME: "database.example.com", DATABASE_URL: "postgres://fixture:synthetic@database.example.com/app",
  DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA: "fixture certificate", DATABASE_ACCESS_CLIENT_ID: "fixture-id", DATABASE_ACCESS_CLIENT_SECRET: "fixture-secret",
  CLOUDFLARE_APPLICATION_EXPIRES_AT: new Date(now + 60_000).toISOString() });

test("only the connector child receives Access credentials and the API uses local TCP with the original TLS identity", () => {
  const result = applicationConnectorConfiguration(input(), now);
  assert.equal(result.applicationEnv.DATABASE_ACCESS_CLIENT_ID, undefined);
  assert.equal(result.applicationEnv.DATABASE_ACCESS_CLIENT_SECRET, undefined);
  assert.equal(result.connectorEnv.DATABASE_URL, undefined);
  assert.equal(result.connectorEnv.TUNNEL_SERVICE_TOKEN_SECRET, "fixture-secret");
  assert.equal(new URL(result.applicationEnv.DATABASE_URL).hostname, "127.0.0.1");
  assert.equal(new URL(result.applicationEnv.DATABASE_URL).port, "15432");
  assert.equal(result.applicationEnv.DATABASE_SSL_SERVER_NAME, "database.example.com");
});
test("expired, unbounded, incomplete or substituted deployment inputs fail before process creation", () => {
  for (const values of [
    { CLOUDFLARE_APPLICATION_EXPIRES_AT: "invalid" }, { CLOUDFLARE_APPLICATION_EXPIRES_AT: new Date(now).toISOString() },
    { CLOUDFLARE_APPLICATION_EXPIRES_AT: new Date(now + 600_001).toISOString() }, { DATABASE_ACCESS_CLIENT_SECRET: "" },
    { DATABASE_CONNECTOR_HOSTNAME: "database.example.com;invalid" }, { DATABASE_URL: "postgres://fixture:synthetic@foreign.example.com/app" },
    { DATABASE_URL: input().DATABASE_URL + "?sslmode=disable" }, { DATABASE_SSL_MODE: "require" }, { DATABASE_SSL_CA: "" },
    { CLOUDFLARE_CONTAINER_POLICY: "always-on" }, { NODE_ENV: "development" },
  ]) assert.throws(() => applicationConnectorConfiguration({ ...input(), ...values }, now), /^Error: APPLICATION_CONNECTOR_CONFIGURATION_DENIED$/);
});
