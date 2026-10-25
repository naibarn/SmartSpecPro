import { describe, expect, it } from "vitest";
import { cloudflareBrowserRunConnection } from "./cloudflareBrowserRun";

describe("Cloudflare Browser Run Playwright adapter", () => {
  it("creates an authenticated CDP connection without exposing the token in its endpoint", () => {
    const connection = cloudflareBrowserRunConnection({
      SMARTSPEC_UAT_CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
      SMARTSPEC_UAT_CLOUDFLARE_API_TOKEN: "test-token",
    } as NodeJS.ProcessEnv);

    expect(connection.endpoint).toBe(
      `wss://api.cloudflare.com/client/v4/accounts/${"a".repeat(32)}/browser-run/devtools/browser?keep_alive=600000`
    );
    expect(connection.endpoint).not.toContain("test-token");
    expect(connection.headers.Authorization).toBe("Bearer test-token");
  });

  it("rejects missing or malformed Cloudflare credentials without echoing them", () => {
    expect(() =>
      cloudflareBrowserRunConnection({
        SMARTSPEC_UAT_CLOUDFLARE_ACCOUNT_ID: "invalid",
        SMARTSPEC_UAT_CLOUDFLARE_API_TOKEN: "private-token",
      } as NodeJS.ProcessEnv)
    ).toThrow("CLOUDFLARE_BROWSER_RUN_CONFIGURATION_REQUIRED");
  });
});
