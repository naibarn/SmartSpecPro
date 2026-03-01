import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  };
  return { mockDb };
});

vi.mock("../../db", () => ({
  getDb: vi.fn().mockResolvedValue(mockDb),
}));

vi.mock("../../../drizzle/schema", () => ({
  conversationArtifacts: { id: "id", conversationId: "conversationId" },
  messages: { id: "id", artifacts: "artifacts" },
}));

import {
  isSimpleArtifact,
  isVersionedArtifact,
  storeArtifacts,
  createArtifactVersion,
} from "../artifactStorageService";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("artifactStorage", () => {
  it("code artifact is identified as simple type", () => {
    expect(isSimpleArtifact("code")).toBe(true);
    expect(isSimpleArtifact("markdown")).toBe(true);
    expect(isSimpleArtifact("mermaid")).toBe(true);
    expect(isSimpleArtifact("svg")).toBe(true);
  });

  it("react artifact is identified as versioned type", () => {
    expect(isVersionedArtifact("react")).toBe(true);
    expect(isVersionedArtifact("html")).toBe(true);
    expect(isVersionedArtifact("chart")).toBe(true);
    expect(isVersionedArtifact("table")).toBe(true);
  });

  it("storeArtifacts handles versioned types with db insert", async () => {
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });
    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue([{ id: 1, artifacts: [] }]),
        }),
      }),
    });
    mockDb.update.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });

    await storeArtifacts(1, 100, [
      { type: "react", content: "<div>Hello</div>", title: "My Component" },
    ]);

    expect(mockDb.insert).toHaveBeenCalled();
  });

  it("artifact content over 500KB is rejected", async () => {
    const bigContent = "x".repeat(512_001);

    mockDb.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue([{
          id: "abc",
          version: 1,
          conversationId: 1,
        }]),
      }),
    });

    await expect(
      createArtifactVersion("abc", bigContent, 1)
    ).rejects.toThrow(/500KB/);
  });
});
