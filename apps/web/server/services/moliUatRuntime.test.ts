import { connect } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertMoliUatRuntimeIsolation,
  createMoliUatEgressProxy,
  isMoliUatPublicAddress,
} from "../../tests/e2e/uat/moliUatRuntime";

describe("Moli UAT runtime isolation", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts public Gateway addresses and rejects private or special ranges", () => {
    expect(isMoliUatPublicAddress("1.1.1.1")).toBe(true);
    expect(isMoliUatPublicAddress("10.0.0.1")).toBe(false);
    expect(isMoliUatPublicAddress("172.20.0.1")).toBe(false);
    expect(isMoliUatPublicAddress("192.168.1.1")).toBe(false);
    expect(isMoliUatPublicAddress("127.0.0.1")).toBe(false);
    expect(isMoliUatPublicAddress("::1")).toBe(false);
    expect(isMoliUatPublicAddress("2001:db8::1")).toBe(false);
  });

  it("fails closed in a production Node runtime", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => assertMoliUatRuntimeIsolation()).toThrow(
      "MOLI_UAT_PRODUCTION_ENVIRONMENT_FORBIDDEN"
    );
  });

  it("denies non-app hosts and non-HTTPS CONNECT targets", async () => {
    const proxy = await createMoliUatEgressProxy();
    const response = await new Promise<string>((resolve, reject) => {
      const socket = connect(proxy.port, "127.0.0.1", () => {
        socket.write(
          "CONNECT api.openai.com:443 HTTP/1.1\r\nHost: api.openai.com:443\r\n\r\n"
        );
      });
      socket.setTimeout(2_000, () =>
        reject(new Error("proxy response timeout"))
      );
      socket.once("error", reject);
      socket.once("data", data => {
        resolve(data.toString());
        socket.destroy();
      });
    });
    expect(response).toContain("403 Forbidden");
    expect(proxy.evidence().denied).toContain("api.openai.com:443");
    await proxy.close();
  });
});
