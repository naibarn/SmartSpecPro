import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TRPCError } from "@trpc/server";

// Feature 135 — Hermes Grok media worker transport arm tests. The resolver's
// static imports are mocked so the hermes_worker branch never touches the DB
// or the MCP connection-sharing policy — see the "never calls" assertions
// below.
const mockGetTenantFeatureFlags = vi.hoisted(() => vi.fn());
const mockGetHermesWorkerSettings = vi.hoisted(() => vi.fn());
const mockAssertMcpSharePolicyAllowed = vi.hoisted(() => vi.fn());
const mockGetDb = vi.hoisted(() => vi.fn());

vi.mock("../tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: mockGetTenantFeatureFlags,
}));
vi.mock("../hermesWorkerSettings", () => ({
  getHermesWorkerSettings: mockGetHermesWorkerSettings,
}));
vi.mock("../mcpConnectionSharingService", () => ({
  assertMcpSharePolicyAllowed: mockAssertMcpSharePolicyAllowed,
}));
vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import { defaultMcpToolNameForProvider, resolveMediaTransport } from "../mediaTransportResolver";

describe("mediaTransportResolver", () => {
  it("defaults Higgsfield MCP tools to provider-native tool names", () => {
    expect(
      defaultMcpToolNameForProvider({
        providerKey: "higgsfield",
        assetType: "image",
      })
    ).toBe("generate_image");
    expect(
      defaultMcpToolNameForProvider({
        providerKey: "higgsfield",
        assetType: "video",
      })
    ).toBe("generate_video");
  });

  it("keeps Magnific MCP default tool names provider-native", () => {
    expect(
      defaultMcpToolNameForProvider({
        providerKey: "magnific",
        assetType: "image",
      })
    ).toBe("images_generate");
    expect(
      defaultMcpToolNameForProvider({
        providerKey: "magnific",
        assetType: "video",
      })
    ).toBe("video_generate");
  });
});

describe("resolveMediaTransport (Feature 135 — hermes_worker arm)", () => {
  const BASE_INPUT = {
    tenantId: "tenant-1",
    actorUserId: 7,
    originSurface: "media_studio" as const,
    assetType: "image" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFeatureFlags.mockResolvedValue({ hermesMediaWorker: true } as any);
    mockGetHermesWorkerSettings.mockResolvedValue({ enabled: true } as any);
  });

  describe("regression — existing gateway/mcp behavior stays byte-identical", () => {
    it("gateway happy path (no requestedTransport, no connection ids) returns the exact metadata shape it returns today", async () => {
      const result = await resolveMediaTransport({
        ...BASE_INPUT,
        idempotencyKey: "idem-1",
      });

      expect(result).toEqual({
        transport: "gateway_api",
        tenantId: "tenant-1",
        originSurface: "media_studio",
        assetType: "image",
        actorUserId: 7,
        creditPolicy: "smartspec_credits",
        idempotencyKey: "idem-1",
      });
      expect(mockGetTenantFeatureFlags).not.toHaveBeenCalled();
      expect(mockGetHermesWorkerSettings).not.toHaveBeenCalled();
      expect(mockAssertMcpSharePolicyAllowed).not.toHaveBeenCalled();
      expect(mockGetDb).not.toHaveBeenCalled();
    });

    it("gateway happy path with explicit requestedTransport: gateway_api behaves identically", async () => {
      const result = await resolveMediaTransport({
        ...BASE_INPUT,
        requestedTransport: "gateway_api",
      });
      expect(result.transport).toBe("gateway_api");
      expect(result.creditPolicy).toBe("smartspec_credits");
    });
  });

  describe("cross-transport connection-id rejections", () => {
    it("rejects hermesConnectionId on a gateway request (no requestedTransport)", async () => {
      await expect(
        resolveMediaTransport({ ...BASE_INPUT, hermesConnectionId: "hc-1" })
      ).rejects.toMatchObject<Partial<TRPCError>>({
        code: "BAD_REQUEST",
        message: "hermesConnectionId requires transport=hermes_worker",
      });
    });

    it("rejects hermesConnectionId on requestedTransport: mcp", async () => {
      await expect(
        resolveMediaTransport({
          ...BASE_INPUT,
          requestedTransport: "mcp",
          hermesConnectionId: "hc-1",
        })
      ).rejects.toMatchObject<Partial<TRPCError>>({
        code: "BAD_REQUEST",
        message: "hermesConnectionId requires transport=hermes_worker",
      });
      expect(mockGetTenantFeatureFlags).not.toHaveBeenCalled();
    });

    it("rejects mcpConnectionId on requestedTransport: hermes_worker (reverse mirror)", async () => {
      await expect(
        resolveMediaTransport({
          ...BASE_INPUT,
          requestedTransport: "hermes_worker",
          mcpConnectionId: "mcp-1",
        })
      ).rejects.toMatchObject<Partial<TRPCError>>({
        code: "BAD_REQUEST",
        message: "mcpConnectionId requires transport=mcp",
      });
    });

    it("rejects a hermes_worker request with no hermesConnectionId", async () => {
      const promise = resolveMediaTransport({
        ...BASE_INPUT,
        requestedTransport: "hermes_worker",
      });
      await expect(promise).rejects.toMatchObject<Partial<TRPCError>>({
        code: "BAD_REQUEST",
      });
      await promise.catch((error: TRPCError) => {
        expect(error.message.startsWith("[HERMES_CONNECTION_REQUIRED]")).toBe(true);
      });
    });
  });

  describe("hermes branch — fail-closed flags", () => {
    it("rejects with FORBIDDEN when the tenant flag hermesMediaWorker is false", async () => {
      mockGetTenantFeatureFlags.mockResolvedValue({ hermesMediaWorker: false } as any);
      const promise = resolveMediaTransport({
        ...BASE_INPUT,
        requestedTransport: "hermes_worker",
        hermesConnectionId: "hc-1",
      });
      await expect(promise).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
      await promise.catch((error: TRPCError) => {
        expect(error.message.startsWith("[HERMES_DISABLED]")).toBe(true);
      });
      expect(mockGetHermesWorkerSettings).not.toHaveBeenCalled();
    });

    it("rejects with FORBIDDEN when the tenant flag is true but the global kill switch is disabled", async () => {
      mockGetHermesWorkerSettings.mockResolvedValue({ enabled: false } as any);
      const promise = resolveMediaTransport({
        ...BASE_INPUT,
        requestedTransport: "hermes_worker",
        hermesConnectionId: "hc-1",
      });
      await expect(promise).rejects.toMatchObject<Partial<TRPCError>>({ code: "FORBIDDEN" });
      await promise.catch((error: TRPCError) => {
        expect(error.message.startsWith("[HERMES_DISABLED]")).toBe(true);
      });
    });
  });

  describe("hermes branch — happy path", () => {
    it("returns hermes_worker metadata and never touches DB or MCP share policy", async () => {
      const result = await resolveMediaTransport({
        ...BASE_INPUT,
        requestedTransport: "hermes_worker",
        hermesConnectionId: "hc-1",
        providerModelId: "grok-imagine-image",
        idempotencyKey: "idem-42",
      });

      expect(result).toEqual({
        transport: "hermes_worker",
        tenantId: "tenant-1",
        originSurface: "media_studio",
        assetType: "image",
        actorUserId: 7,
        connectionId: "hc-1",
        providerKey: "hermes-grok",
        providerModelId: "grok-imagine-image",
        creditPolicy: "provider_account",
        idempotencyKey: "idem-42",
      });
      expect(mockAssertMcpSharePolicyAllowed).not.toHaveBeenCalled();
      expect(mockGetDb).not.toHaveBeenCalled();
    });
  });
});
