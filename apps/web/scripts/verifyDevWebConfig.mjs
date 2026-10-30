import { selectDevWebDatabase } from "./devWebDatabase.mjs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** Validate the environment used by the public development web service. */
export function verifyDevWebConfig(config, { domain = "aimarkethubs.com", port = 3100 } = {}) {
  const selected = selectDevWebDatabase(config);
  const mode = selected.SMARTSPEC_DEV_DATABASE_MODE;
  if (mode !== "development" && mode !== "shared-tenant") {
    throw new Error("Development releases cannot use production database access modes");
  }

  let appUrl;
  try {
    appUrl = new URL(selected.APP_URL || "");
  } catch {
    throw new Error("Development APP_URL must use the development domain");
  }
  if (appUrl.hostname !== domain || selected.SMARTSPEC_DEV_TENANT_DOMAIN !== domain) {
    throw new Error("Development APP_URL and tenant domain must match aimarkethubs.com");
  }
  if (Number(selected.PORT) !== port) {
    throw new Error(`Development web service must use port ${port}`);
  }
  if (!selected.JWT_SECRET || !selected.LLM_ENCRYPTION_KEY) {
    throw new Error("Development authentication/encryption keys are missing");
  }
  if (!selected.CONTROL_PLANE_API_KEY || selected.CONTROL_PLANE_API_KEY.length < 24) {
    throw new Error("A separate development control-plane key is missing");
  }
  return {
    environment: selected.SMARTSPEC_ENVIRONMENT,
    mode,
    domain: appUrl.hostname,
    port,
    databaseHost: new URL(selected.DATABASE_URL).hostname,
    databaseName: new URL(selected.DATABASE_URL).pathname.slice(1),
    databaseRoleIsDev: new URL(selected.DATABASE_URL).username.endsWith("_dev"),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const { readFileSync } = await import("node:fs");
  const { parse } = await import("dotenv");
  const envFile = process.argv[2];
  if (!envFile) throw new Error("Usage: node verifyDevWebConfig.mjs <dev-web.env>");
  const result = verifyDevWebConfig(parse(readFileSync(envFile)), {
    domain: process.argv[3] || "aimarkethubs.com",
    port: Number(process.argv[4] || 3100),
  });
  console.log(JSON.stringify(result));
}
