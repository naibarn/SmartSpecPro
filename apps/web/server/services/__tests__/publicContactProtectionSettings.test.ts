import { beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "../crypto";

const mockGetDb = vi.fn();
const rows: Array<{
  key: string;
  value: string | null;
  isSensitive: boolean | null;
}> = [];

vi.mock("../../db", () => ({
  getDb: () => mockGetDb(),
}));

import {
  clearPublicContactProtectionSettingsCache,
  getPublicContactProtectionAdminSettings,
  getPublicContactProtectionConfig,
  normalizePublicContactHostnames,
  updatePublicContactProtectionSettings,
} from "../publicContactProtectionSettings";

describe("public contact protection settings", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(
      "LLM_ENCRYPTION_KEY",
      "test-encryption-key-32-characters-minimum"
    );
    vi.stubEnv("TURNSTILE_SITE_KEY", "env-site-key");
    vi.stubEnv("TURNSTILE_SECRET_KEY", "env-secret-key");
    vi.stubEnv("TURNSTILE_ALLOWED_HOSTNAMES", "env.example.com");
    rows.splice(0, rows.length);
    clearPublicContactProtectionSettingsCache();
    mockGetDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => Promise.resolve(rows),
        }),
      }),
    });
  });

  it("prefers UI/database values and decrypts the secret only on the server", async () => {
    rows.push(
      { key: "turnstile_site_key", value: "db-site-key", isSensitive: false },
      {
        key: "turnstile_secret_key",
        value: encrypt("db-secret-key"),
        isSensitive: true,
      },
      {
        key: "turnstile_allowed_hostnames",
        value: "smartaihub.app,www.smartaihub.app",
        isSensitive: false,
      }
    );

    await expect(getPublicContactProtectionConfig()).resolves.toEqual({
      siteKey: "db-site-key",
      secretKey: "db-secret-key",
      allowedHostnames: ["smartaihub.app", "www.smartaihub.app"],
      required: true,
      configured: true,
    });

    const adminSettings = await getPublicContactProtectionAdminSettings();
    expect(adminSettings).toMatchObject({
      siteKey: "db-site-key",
      secretKeyConfigured: true,
      allowedHostnames: ["smartaihub.app", "www.smartaihub.app"],
      source: "database",
    });
    expect(adminSettings).not.toHaveProperty("secretKey");
  });

  it("falls back to environment values when the UI has not been configured", async () => {
    await expect(getPublicContactProtectionConfig()).resolves.toMatchObject({
      siteKey: "env-site-key",
      secretKey: "env-secret-key",
      allowedHostnames: ["env.example.com"],
      configured: true,
    });
    await expect(
      getPublicContactProtectionAdminSettings()
    ).resolves.toMatchObject({
      source: "environment",
      secretKeyConfigured: true,
    });
  });

  it("rejects hostnames containing schemes or paths", () => {
    expect(() =>
      normalizePublicContactHostnames(["https://smartaihub.app/contact"])
    ).toThrow("valid hostnames");
    expect(
      normalizePublicContactHostnames(["SMARTAIHUB.APP", "www.smartaihub.app"])
    ).toEqual(["smartaihub.app", "www.smartaihub.app"]);
  });

  it("stores the secret encrypted when the Admin UI saves settings", async () => {
    const insertedValues: Array<Record<string, unknown>> = [];
    mockGetDb.mockReturnValue({
      select: (projection: Record<string, unknown>) => ({
        from: () => ({
          where: () => {
            if ("id" in projection) {
              return { limit: () => Promise.resolve([]) };
            }
            return Promise.resolve(rows);
          },
        }),
      }),
      insert: () => ({
        values: (value: Record<string, unknown>) => {
          insertedValues.push(value);
          return Promise.resolve();
        },
      }),
      delete: () => ({ where: () => Promise.resolve() }),
      update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
    });

    await updatePublicContactProtectionSettings({
      userId: 42,
      siteKey: "db-site-key",
      secretKey: "db-secret-key",
      clearSecret: false,
      allowedHostnames: ["smartaihub.app", "www.smartaihub.app"],
    });

    const secretRow = insertedValues.find(
      row => row.key === "turnstile_secret_key"
    );
    expect(secretRow).toMatchObject({ isSensitive: true });
    expect(secretRow?.value).not.toBe("db-secret-key");
    expect(typeof secretRow?.value).toBe("string");
  });
});
