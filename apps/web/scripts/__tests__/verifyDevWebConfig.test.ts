import { describe, expect, it } from "vitest";
import { verifyDevWebConfig } from "../verifyDevWebConfig.mjs";

const validConfig = {
  SMARTSPEC_ENVIRONMENT: "development",
  SMARTSPEC_DEV_DATABASE_MODE: "shared-tenant",
  DATABASE_URL: "postgresql://smartspec_dev:dev-only@localhost:5432/smartspec",
  APP_URL: "https://aimarkethubs.com",
  SMARTSPEC_DEV_TENANT_DOMAIN: "aimarkethubs.com",
  PORT: "3100",
  JWT_SECRET: "development-jwt-secret",
  LLM_ENCRYPTION_KEY: "development-encryption-key",
  CONTROL_PLANE_API_KEY: "dev-control-plane-key-at-least-24-chars",
};

describe("verifyDevWebConfig", () => {
  it("accepts the scoped development domain, service port, and dev database role", () => {
    expect(verifyDevWebConfig(validConfig)).toMatchObject({
      environment: "development",
      mode: "shared-tenant",
      domain: "aimarkethubs.com",
      port: 3100,
      databaseName: "smartspec",
      databaseRoleIsDev: true,
    });
  });

  it("rejects production database access modes for a development release", () => {
    expect(() => verifyDevWebConfig({
      ...validConfig,
      SMARTSPEC_DEV_DATABASE_MODE: "production-readonly",
      SMARTSPEC_PRODUCTION_READONLY_DATABASE_URL: "postgresql://smartspec_debug_ro@localhost:5432/smartspec",
    })).toThrow("Development releases cannot use production database access modes");
  });

  it("rejects a production domain or a web port shared with production", () => {
    expect(() => verifyDevWebConfig({
      ...validConfig,
      APP_URL: "https://smartaihub.app",
      SMARTSPEC_DEV_TENANT_DOMAIN: "smartaihub.app",
    })).toThrow("must match aimarkethubs.com");
    expect(() => verifyDevWebConfig({ ...validConfig, PORT: "3000" })).toThrow("must use port 3100");
  });

  it("rejects non-development database identities", () => {
    expect(() => verifyDevWebConfig({
      ...validConfig,
      DATABASE_URL: "postgresql://smartspec:prod@localhost:5432/smartspec",
    })).toThrow("Shared development requires the canonical smartspec database and a separate _dev login");
  });
});
