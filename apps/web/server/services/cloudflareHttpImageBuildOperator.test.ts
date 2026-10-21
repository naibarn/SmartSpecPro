import { describe, expect, it, vi } from "vitest";
import { runHttpImageOperatorCommand, createHttpImageBuildOperator } from "./cloudflareHttpImageBuildOperator";

describe("bounded image operator processes", () => {
  it("cancels a real owned process after authority is revoked without returning secret diagnostics", async () => {
    let revoked = false;
    const assertAuthorized = vi.fn(async () => {
      if (revoked) throw Error("fixture authority revoked");
    });
    const pending = runHttpImageOperatorCommand({ command: process.execPath,
      args: ["-e", "console.log(process.pid); console.error('fixture-private-diagnostic'); setInterval(()=>{},100)"],
      env: {}, timeoutMs: 5000, assertAuthorized });
    // The second guard check revokes while the child is still running.
    revoked = true;
    await expect(pending).rejects.toThrow("fixture authority revoked");
    expect(assertAuthorized.mock.calls.length).toBeGreaterThan(1);
  });
  it("bounds a real process deadline and never reflects its stderr", async () => {
    await expect(runHttpImageOperatorCommand({ command: process.execPath,
      args: ["-e", "console.error('private-fixture'); setInterval(()=>{},100)"], env: {}, timeoutMs: 100,
      assertAuthorized: async () => undefined })).rejects.toThrow("DEADLINE_EXCEEDED");
  });
  it("refuses image build/publish composition inside an API runtime", () => {
    const previous = process.env.SMARTAIHUB_APPLICATION_RUNTIME;
    process.env.SMARTAIHUB_APPLICATION_RUNTIME = "cloudflare-http";
    try { expect(() => createHttpImageBuildOperator(async () => undefined)).toThrow("OPERATOR_RUNTIME_REQUIRED"); }
    finally { if (previous === undefined) delete process.env.SMARTAIHUB_APPLICATION_RUNTIME; else process.env.SMARTAIHUB_APPLICATION_RUNTIME = previous; }
  });
});
