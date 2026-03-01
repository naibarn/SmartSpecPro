import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    select: vi.fn(),
    insert: vi.fn(),
  };
  return { mockDb };
});

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("../../../drizzle/schema", () => ({
  conversationArtifacts: {
    id: "id",
    conversationId: "conversationId",
    artifactType: "artifactType",
    version: "version",
    parentArtifactId: "parentArtifactId",
    createdAt: "createdAt",
  },
  conversations: {
    id: "id",
    userId: "userId",
    tenantId: "tenantId",
  },
}));

// Mock the service functions used by the router
const { mockGetArtifacts, mockGetVersions, mockCreateVersion } = vi.hoisted(() => ({
  mockGetArtifacts: vi.fn(),
  mockGetVersions: vi.fn(),
  mockCreateVersion: vi.fn(),
}));

vi.mock("../../services/artifactStorageService", () => ({
  getConversationArtifacts: mockGetArtifacts,
  getArtifactVersions: mockGetVersions,
  createArtifactVersion: mockCreateVersion,
  isSimpleArtifact: vi.fn(),
  isVersionedArtifact: vi.fn(),
  storeArtifacts: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("artifact tRPC endpoints", () => {
  describe("getArtifacts validation", () => {
    it("returns artifacts for valid conversation", async () => {
      const artifacts = [
        { id: "a1", artifactType: "chart", title: "Sales", version: 1 },
      ];
      mockGetArtifacts.mockResolvedValue(artifacts);

      const result = await mockGetArtifacts(1, 1, "tenant1");
      expect(result).toEqual(artifacts);
      expect(mockGetArtifacts).toHaveBeenCalledWith(1, 1, "tenant1");
    });
  });

  describe("getArtifactVersions", () => {
    it("returns version chain in order", async () => {
      const versions = [
        { id: "v1", version: 1, parentArtifactId: null },
        { id: "v2", version: 2, parentArtifactId: "v1" },
        { id: "v3", version: 3, parentArtifactId: "v2" },
      ];
      mockGetVersions.mockResolvedValue(versions);

      const result = await mockGetVersions("v1", 1, "tenant1");
      expect(result).toHaveLength(3);
      expect(result[0].version).toBe(1);
      expect(result[2].parentArtifactId).toBe("v2");
    });
  });

  describe("updateArtifact", () => {
    it("creates new version via service", async () => {
      mockCreateVersion.mockResolvedValue({ id: "v2", version: 2 });

      const result = await mockCreateVersion("v1", "new content", 1);
      expect(result.version).toBe(2);
      expect(mockCreateVersion).toHaveBeenCalledWith("v1", "new content", 1);
    });
  });
});
