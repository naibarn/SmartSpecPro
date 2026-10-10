import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticateRequest: vi.fn() }));

vi.mock("../sdk", () => ({ sdk: { authenticateRequest: mocks.authenticateRequest } }));
vi.mock("../logger", () => ({ debugLog: vi.fn() }));

import { createContext } from "../context";

function request(headers: Record<string, string>, extra: Record<string, unknown> = {}) {
  return {
    headers,
    hostname: headers.host?.split(":")[0],
    get: (name: string) => headers[name.toLowerCase()],
    socket: { remoteAddress: "198.51.100.42" },
    ...extra,
  } as any;
}

describe("createContext App ingress trust boundary", () => {
  beforeEach(() => {
    mocks.authenticateRequest.mockReset();
    mocks.authenticateRequest.mockResolvedValue({ id: 7, currentTenantId: 42 });
  });

  it.each([
    ["spoofed Host", { host: "notes.example.com" }],
    ["spoofed X-Forwarded-Host", { host: "smartaihub.app", "x-forwarded-host": "notes.example.com" }],
    ["conflicting X-Forwarded-Host", { host: "smartaihub.app", "x-forwarded-host": "notes.example.com, tasks.example.com" }],
    ["same-tenant App alias", { host: "tasks.example.com" }],
    ["cross-tenant App alias", { host: "foreign.example.net" }],
    ["direct-origin Host", { host: "notes.example.com" }],
    ["missing ingress provenance", { host: "notes.example.com" }],
  ])("never derives trusted App context from %s", async (_name, headers) => {
    const ctx = await createContext({ req: request(headers), res: {} as any });
    expect(ctx.tenantId).toBe("42");
    expect(ctx.trustedAppContext).toBeNull();
  });

  it("does not trust a client supplied hostAppId or projectId", async () => {
    const ctx = await createContext({
      req: request({ host: "notes.example.com", "x-host-app-id": "app-attacker", "x-project-id": "project-attacker" }, {
        hostAppId: "app-attacker",
        projectId: "project-attacker",
        params: { hostAppId: "app-attacker", projectId: "project-attacker" },
      }),
      res: {} as any,
    });
    expect(ctx.trustedAppContext).toBeNull();
  });

  it("rejects conflicting duplicate Host and forwarded-host wire headers", async () => {
    const ctx = await createContext({
      req: request({ host: "smartaihub.app", "x-forwarded-host": "smartaihub.app" }, {
        rawHeaders: [
          "Host", "smartaihub.app",
          "Host", "notes.example.com",
          "X-Forwarded-Host", "smartaihub.app",
          "X-Forwarded-Host", "notes.example.com",
        ],
      }),
      res: {} as any,
    });
    expect(ctx.trustedAppContext).toBeNull();
  });

  it.todo("accepts a valid custom-domain route only when a server-authenticated ingress assertion is available");
});
