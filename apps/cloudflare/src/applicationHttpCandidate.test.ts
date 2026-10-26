import { describe, expect, it, vi } from "vitest";
import { fetchApplicationHttpCandidate } from "./applicationHttpCandidate";

describe("isolated production HTTP candidate", () => {
  it("hides all unconfigured and ordinary ingress paths without resolving a paid namespace", async () => {
    const get = vi.fn(), env = { CLOUDFLARE_ENVIRONMENT: "production", NODE_HTTP: { get, idFromName: vi.fn() } };
    for (const path of ["/", "/health", "/trpc/auth.me", "/_ops/application-canary/node/health", "/_ops/application-canary/ingress/status"]) {
      const result = await fetchApplicationHttpCandidate(new Request(`https://candidate.example${path}`), env);
      expect(result.status).toBe(404); expect(result.headers.get("cache-control")).toBe("no-store");
    }
    expect(get).not.toHaveBeenCalled();
  });
  it.each([
    { CLOUDFLARE_ENVIRONMENT: "staging" },
    { CLOUDFLARE_APPLICATION_HTTP_TRAFFIC: "production-full-http-v1" },
    { CLOUDFLARE_CONTAINER_REALTIME_ROUTES: "production-allowlisted-v1" },
  ])("fails closed on an ingress or environment mismatch %j", async override => {
    const result = await fetchApplicationHttpCandidate(new Request("https://candidate.example/_ops/application-canary/node/status"),
      { CLOUDFLARE_ENVIRONMENT: "production", ...override });
    expect(result.status).toBe(404);
  });
});
