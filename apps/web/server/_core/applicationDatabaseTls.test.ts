import { describe, expect, it } from "vitest";
import { createApplicationDatabaseTls } from "./applicationDatabaseTls";

const http = { NODE_ENV: "production", SMARTAIHUB_APPLICATION_RUNTIME: "cloudflare-http", CLOUDFLARE_CONTAINER_POLICY: "on-demand" };
describe("application database TLS", () => {
  it("preserves an unconfigured standard local connection", () => {
    expect(createApplicationDatabaseTls("postgres://fixture@localhost/db", {})).toBeUndefined();
  });
  it.each([
    {},
    { DATABASE_SSL_MODE: "require" },
    { DATABASE_SSL_MODE: "verify-full" },
    { DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA: "invalid certificate" },
  ])("rejects missing or weakened trust in HTTP containers", values => {
    expect(() => createApplicationDatabaseTls("postgres://fixture@localhost/db", { ...http, ...values })).toThrow("APPLICATION_DATABASE_TLS_REQUIRED");
  });
  it("does not include URLs or certificate material in validation errors", () => {
    expect(() => createApplicationDatabaseTls("postgres://fixture:synthetic@localhost/db", http)).toThrow(/^APPLICATION_DATABASE_TLS_REQUIRED$/);
  });
});
