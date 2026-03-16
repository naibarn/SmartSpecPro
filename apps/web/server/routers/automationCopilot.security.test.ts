/**
 * Security tests: verify user_jwt is not sent to Python backend
 * and that internal token header is standardized.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SOURCE_PATH = resolve(__dirname, "automationCopilot.ts");
const source = readFileSync(SOURCE_PATH, "utf-8");

describe("automationCopilot JWT removal", () => {
  it("should not contain user_jwt in any POST body to Python", () => {
    // Ensure user_jwt / userToken is not sent in request bodies
    expect(source).not.toContain("user_jwt");
    expect(source).not.toContain("userToken");
  });

  it("should use x-internal-token header, not x-proxy-token", () => {
    expect(source).toContain('"x-internal-token"');
    expect(source).not.toContain('"x-proxy-token"');
  });

  it("should prefer SMARTSPEC_WEB_GATEWAY_TOKEN over SMARTSPEC_PROXY_TOKEN", () => {
    // The env var resolution should put WEB_GATEWAY_TOKEN first
    const tokenLine = source.split("\n").find((l) => l.includes("INTERNAL_TOKEN"));
    expect(tokenLine).toBeDefined();
    const webIdx = tokenLine!.indexOf("SMARTSPEC_WEB_GATEWAY_TOKEN");
    const proxyIdx = tokenLine!.indexOf("SMARTSPEC_PROXY_TOKEN");
    expect(webIdx).toBeLessThan(proxyIdx);
  });

  it("should not include ctx.userToken in callPythonBackend body", () => {
    // Find all callPythonBackend calls and verify none include userToken
    const callMatches = source.match(/callPythonBackend\([^)]*\{[\s\S]*?\}\)/g) || [];
    for (const call of callMatches) {
      expect(call).not.toContain("userToken");
      expect(call).not.toContain("user_jwt");
    }
  });
});
