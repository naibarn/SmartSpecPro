import { describe, expect, it } from "vitest";
import { classifyHttpCandidateWranglerFailure } from "./cloudflareHttpCandidateDiagnostics";
import { runHttpImageOperatorCommand } from "./cloudflareHttpImageBuildOperator";

describe("sanitized Wrangler failure diagnostics", () => {
  it("preserves exact provider code and HTTP status without token, path or command text", () => {
    expect(classifyHttpCandidateWranglerFailure("private token=fixture-secret", "HTTP 403 Authentication error [code: 10000] /private/config"))
      .toBe("HTTP_CANDIDATE_WRANGLER_FAILED_HTTP_403_CF_10000");
    expect(classifyHttpCandidateWranglerFailure("", "\x1b[31mfailed [code: 10085]\x1b[0m"))
      .toBe("HTTP_CANDIDATE_WRANGLER_FAILED_CF_10085");
    expect(classifyHttpCandidateWranglerFailure("fixture-secret", "arbitrary provider detail"))
      .toBe("HTTP_CANDIDATE_WRANGLER_FAILED");
  });
  it("captures bounded stderr from a real subprocess while exposing only the safe code", async () => {
    await expect(runHttpImageOperatorCommand({ command: process.execPath,
      args: ["-e", "process.stderr.write('private fixture-secret HTTP 403 [code: 10000]');process.exit(1)"], env: {},
      timeoutMs: 10000, assertAuthorized: async () => undefined, classifyFailure: classifyHttpCandidateWranglerFailure }))
      .rejects.toMatchObject({ diagnosticCode: "HTTP_CANDIDATE_WRANGLER_FAILED_HTTP_403_CF_10000" });
  });
});
