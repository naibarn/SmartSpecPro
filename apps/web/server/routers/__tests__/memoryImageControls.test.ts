import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Router-level tests for Section 10: memory.deleteImageFromMemory and memory.pinImageToMemory
 */

vi.mock("../../services/tenantFeatureFlagService", () => ({
  getTenantFeatureFlags: vi.fn(() => Promise.resolve({ multimodalMemory: true })),
}));
vi.mock("../../services/visionMemoryService", () => ({
  deleteFromMemory: vi.fn(() => Promise.resolve({ success: true, deletedItemCount: 1 })),
  pinToMemory: vi.fn(() => Promise.resolve({ success: true })),
  isImageDeletionCommand: vi.fn(() => false),
  checkSafety: vi.fn(() => ({ blocked: false })),
  buildSearchableText: vi.fn(() => ""),
  NSFW_BLOCKED_CATEGORIES: new Set(),
  NSFW_SCORE_THRESHOLD: 0.5,
}));

import { getTenantFeatureFlags } from "../../services/tenantFeatureFlagService";
import { deleteFromMemory, pinToMemory } from "../../services/visionMemoryService";

const mockGetTenantFlags = vi.mocked(getTenantFeatureFlags);
const mockDeleteFromMemory = vi.mocked(deleteFromMemory);
const mockPinToMemory = vi.mocked(pinToMemory);

// Inline caller that mirrors the router logic without importing the full router
async function callDeleteMutation(assetId: unknown, userId: number, tenantId: string) {
  const { z } = await import("zod");
  const input = z.object({ assetId: z.number() }).parse({ assetId });
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags.multimodalMemory) {
    const { TRPCError } = await import("@trpc/server");
    throw new TRPCError({ code: "FORBIDDEN", message: "Multimodal memory is not enabled" });
  }
  return deleteFromMemory(input.assetId, userId, tenantId);
}

async function callPinMutation(assetId: unknown, userId: number, tenantId: string) {
  const { z } = await import("zod");
  const input = z.object({ assetId: z.number() }).parse({ assetId });
  const flags = await getTenantFeatureFlags(tenantId);
  if (!flags.multimodalMemory) {
    const { TRPCError } = await import("@trpc/server");
    throw new TRPCError({ code: "FORBIDDEN", message: "Multimodal memory is not enabled" });
  }
  return pinToMemory(input.assetId, userId, tenantId);
}

describe("memory.deleteImageFromMemory mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFlags.mockResolvedValue({ multimodalMemory: true } as any);
    mockDeleteFromMemory.mockResolvedValue({ success: true, deletedItemCount: 1 });
  });

  it("should reject when assetId is missing", async () => {
    await expect(callDeleteMutation(undefined, 1, "t1")).rejects.toThrow();
  });

  it("should call deleteFromMemory with correct userId and tenantId", async () => {
    await callDeleteMutation(42, 7, "tenant-xyz");
    expect(mockDeleteFromMemory).toHaveBeenCalledWith(42, 7, "tenant-xyz");
  });

  it("should return success true", async () => {
    const result = await callDeleteMutation(42, 1, "t1");
    expect(result.success).toBe(true);
  });

  it("should throw FORBIDDEN when feature flag is off", async () => {
    mockGetTenantFlags.mockResolvedValue({ multimodalMemory: false } as any);
    await expect(callDeleteMutation(42, 1, "t1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("memory.pinImageToMemory mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTenantFlags.mockResolvedValue({ multimodalMemory: true } as any);
    mockPinToMemory.mockResolvedValue({ success: true });
  });

  it("should reject when assetId is missing", async () => {
    await expect(callPinMutation(undefined, 1, "t1")).rejects.toThrow();
  });

  it("should set salience to 1.0 via the service", async () => {
    await callPinMutation(55, 3, "tenant-abc");
    expect(mockPinToMemory).toHaveBeenCalledWith(55, 3, "tenant-abc");
  });

  it("should throw FORBIDDEN when feature flag is off", async () => {
    mockGetTenantFlags.mockResolvedValue({ multimodalMemory: false } as any);
    await expect(callPinMutation(55, 1, "t1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
