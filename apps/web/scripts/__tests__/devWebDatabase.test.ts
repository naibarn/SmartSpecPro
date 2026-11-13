import { describe, expect, it } from "vitest";
import { selectDevWebDatabase, shouldRunDevSchemaMigrations } from "../devWebDatabase.mjs";

describe("dev web database selection", () => {
  const dev = { SMARTSPEC_ENVIRONMENT: "development", SMARTSPEC_DEV_DATABASE_MODE: "development",
    DATABASE_URL: "postgresql://smartspec_dev@localhost/smartspec_dev" };

  it("uses the isolated dev database by default", () => {
    expect(selectDevWebDatabase(dev)).toEqual(dev);
  });

  it("rejects production data in default dev mode and rejects the legacy shared selector", () => {
    expect(() => selectDevWebDatabase({ ...dev, DATABASE_URL: "postgresql://smartspec@localhost/smartspec" })).toThrow("dedicated _dev");
    expect(() => selectDevWebDatabase({ ...dev, SMARTSPEC_DEV_DATABASE_MODE: "shared-production" })).toThrow("shared-production is disabled");
  });

  it("requires the dedicated read-only role for production debug", () => {
    expect(() => selectDevWebDatabase({ ...dev, SMARTSPEC_DEV_DATABASE_MODE: "production-readonly" })).toThrow("read-only database URL is required");
    const selected = selectDevWebDatabase({ ...dev, SMARTSPEC_DEV_DATABASE_MODE: "production-readonly",
      SMARTSPEC_PRODUCTION_READONLY_DATABASE_URL: "postgresql://smartspec_debug_ro@localhost/smartspec",
      SMARTSPEC_DEV_TENANT_DOMAIN: "smartaihub.app" });
    expect(new URL(selected.DATABASE_URL).username).toBe("smartspec_debug_ro");
    expect(() => selectDevWebDatabase({ ...dev, SMARTSPEC_DEV_DATABASE_MODE: "production-readonly",
      SMARTSPEC_PRODUCTION_READONLY_DATABASE_URL: "postgresql://smartspec@localhost/smartspec",
      SMARTSPEC_DEV_TENANT_DOMAIN: "smartaihub.app" })).toThrow("dedicated _debug_ro");
  });

  it("accepts the canonical database only in the explicit tenant-shared mode", () => {
    const shared = selectDevWebDatabase({ ...dev, SMARTSPEC_DEV_DATABASE_MODE: "shared-tenant",
      DATABASE_URL: "postgresql://smartspec_dev@localhost/smartspec", APP_URL: "https://aimarkethubs.com",
      SMARTSPEC_DEV_TENANT_DOMAIN: "aimarkethubs.com" });
    expect(shared.DATABASE_URL).toBe("postgresql://smartspec_dev@localhost/smartspec");
    expect(shouldRunDevSchemaMigrations(shared)).toBe(false);
    expect(() => selectDevWebDatabase({ ...dev, SMARTSPEC_DEV_DATABASE_MODE: "shared-tenant",
      DATABASE_URL: "postgresql://smartspec@localhost/smartspec", APP_URL: "https://aimarkethubs.com",
      SMARTSPEC_DEV_TENANT_DOMAIN: "aimarkethubs.com" })).toThrow("separate _dev login");
    expect(() => selectDevWebDatabase({ ...dev, SMARTSPEC_DEV_DATABASE_MODE: "shared-tenant",
      DATABASE_URL: "postgresql://smartspec_dev@localhost/smartspec", APP_URL: "https://aimarkethubs.com",
      SMARTSPEC_DEV_TENANT_DOMAIN: "smartaihub.app" })).toThrow("must match APP_URL");
  });
});

describe("development schema startup repair", () => {
  it("runs migrations only for the isolated development database", () => {
    expect(shouldRunDevSchemaMigrations({
      SMARTSPEC_ENVIRONMENT: "development",
      SMARTSPEC_DEV_DATABASE_MODE: "development",
    })).toBe(true);
    expect(shouldRunDevSchemaMigrations({
      SMARTSPEC_ENVIRONMENT: "development",
      SMARTSPEC_DEV_DATABASE_MODE: "production-readonly",
    })).toBe(false);
    expect(shouldRunDevSchemaMigrations({
      SMARTSPEC_ENVIRONMENT: "development",
      SMARTSPEC_DEV_DATABASE_MODE: "shared-tenant",
    })).toBe(false);
    expect(shouldRunDevSchemaMigrations({
      SMARTSPEC_ENVIRONMENT: "production",
      SMARTSPEC_DEV_DATABASE_MODE: "development",
    })).toBe(false);
  });
});
