import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { PYTHON_VPC_DATABASE_ENTRYPOINT } from "./applicationDatabaseEntrypoints";

describe("Python private database startup configuration", () => {
  it.each([
    ["db-staging.smartaihub.app", 5432],
    ["db.smartaihub.app", 5433],
  ])("accepts the verified %s:%i endpoint before loading the application", (hostname, port) => {
    // Stop at the real application's import boundary, after the unmodified
    // startup validation. No database, socket, dependency install or app boot.
    const harness = `import sys,types
sys.modules['aiohttp']=types.ModuleType('aiohttp')
module=types.ModuleType('app.core.cloudflare_http_entrypoint')
def reached_application_import(name):
 print('CONFIGURATION_VALIDATED')
 raise SystemExit(0)
module.__getattr__=reached_application_import
sys.modules['app.core.cloudflare_http_entrypoint']=module
exec(${JSON.stringify(PYTHON_VPC_DATABASE_ENTRYPOINT)})
`;
    const result = spawnSync("python3", ["-c", harness], { encoding: "utf8", timeout: 5000,
      env: { PATH: process.env.PATH, ENVIRONMENT: "production", SMARTAIHUB_APPLICATION_RUNTIME: "cloudflare-http",
        CLOUDFLARE_CONTAINER_POLICY: "on-demand", CLOUDFLARE_APPLICATION_EXPIRES_AT: new Date(Date.now() + 300_000).toISOString(),
        DATABASE_URL: `postgresql+asyncpg://sah_cf_app_abcdef012345:fixture-password@${hostname}:${port}/smartspec`,
        DATABASE_CONNECTOR_HOSTNAME: hostname, DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA: "fixture-ca" } });
    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("CONFIGURATION_VALIDATED");
  });
});
