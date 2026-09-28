import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverRoot = resolve(__dirname, "..");
const appRoot = resolve(serverRoot, "..");

describe("profile account-auth contract", () => {
  it("keeps email replacement and Google conversion behind password-confirmed procedures", () => {
    const source = readFileSync(resolve(serverRoot, "routers.ts"), "utf8");
    expect(source).toContain(
      "requestEmailChange: accountAuthMutationProcedure"
    );
    expect(source).toContain("confirmEmailChange: publicProcedure");
    expect(source).toContain(
      "startGoogleOnlyLink: accountAuthMutationProcedure"
    );
    expect(source).toContain(
      "completeGoogleOnlyLink: accountAuthMutationProcedure"
    );
    expect(source).toContain('namespace: "account-auth-mutation"');
    expect(source).toContain("Current password is incorrect");
    expect(source).toContain('.set({ password: null, loginMethod: "google" })');
  });

  it("prevents password recovery from undoing Google-only conversion", () => {
    const source = readFileSync(resolve(serverRoot, "routers.ts"), "utf8");
    expect(source).toContain(
      "This account uses Google sign-in and cannot restore password login"
    );
    expect(source).toContain('targetUser.loginMethod === "google"');
  });

  it("has additive tables and a provider identity uniqueness constraint", () => {
    const migration = readFileSync(
      resolve(appRoot, "drizzle/0320_profile_email_google_auth.sql"),
      "utf8"
    );
    const uniqueness = readFileSync(
      resolve(appRoot, "drizzle/0321_oauth_provider_identity_unique.sql"),
      "utf8"
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "account_email_change_requests"'
    );
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS "account_google_link_transactions"'
    );
    expect(migration).toContain("sessionHash");
    expect(uniqueness).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS "oauth_connections_provider_subject_unique"'
    );
  });
});
