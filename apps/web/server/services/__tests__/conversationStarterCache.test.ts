import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Redis before importing the module
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockScan = vi.fn();

vi.mock("../redis", () => ({
  getRedisClient: () => ({
    get: mockGet,
    set: mockSet,
    del: mockDel,
    scan: mockScan,
  }),
}));

import {
  getCachedStarterResponse,
  cacheStarterResponse,
  invalidateStarterCache,
} from "../conversationStarterCache";

describe("conversationStarterCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("caches starter response with correct key pattern and 24h TTL", async () => {
    mockSet.mockResolvedValue("OK");

    await cacheStarterResponse("agency-123", "Hello!", "Hi there!");

    expect(mockSet).toHaveBeenCalledTimes(1);
    const [key, value, ex, ttl] = mockSet.mock.calls[0];
    expect(key).toMatch(/^agency:agency-123:starter:[a-f0-9]+$/);
    expect(value).toBe("Hi there!");
    expect(ex).toBe("EX");
    expect(ttl).toBe(86400);
  });

  it("returns cached response on cache hit", async () => {
    mockGet.mockResolvedValue("Cached response");

    const result = await getCachedStarterResponse("agency-123", "Hello!");

    expect(result).toBe("Cached response");
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("returns null on cache miss", async () => {
    mockGet.mockResolvedValue(null);

    const result = await getCachedStarterResponse("agency-123", "Unknown prompt");

    expect(result).toBeNull();
  });

  it("invalidates all starter caches when agency instructions change", async () => {
    // First SCAN returns 3 keys, second returns empty (cursor "0")
    mockScan
      .mockResolvedValueOnce(["0", [
        "agency:agency-123:starter:abc",
        "agency:agency-123:starter:def",
        "agency:agency-123:starter:ghi",
      ]]);
    mockDel.mockResolvedValue(3);

    await invalidateStarterCache("agency-123");

    expect(mockScan).toHaveBeenCalledTimes(1);
    expect(mockDel).toHaveBeenCalledWith(
      "agency:agency-123:starter:abc",
      "agency:agency-123:starter:def",
      "agency:agency-123:starter:ghi",
    );
  });

  it("generates stable hash from prompt text for cache key", async () => {
    mockGet.mockResolvedValue(null);

    await getCachedStarterResponse("agency-1", "Same prompt");
    const key1 = mockGet.mock.calls[0][0];

    await getCachedStarterResponse("agency-1", "Same prompt");
    const key2 = mockGet.mock.calls[1][0];

    expect(key1).toBe(key2);
  });

  it("skips caching when cacheEnabled is false", async () => {
    await cacheStarterResponse("agency-1", "Hello!", "Response", false);
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("handles Redis errors gracefully", async () => {
    mockGet.mockRejectedValue(new Error("Redis down"));
    mockSet.mockRejectedValue(new Error("Redis down"));
    mockScan.mockRejectedValue(new Error("Redis down"));

    const result = await getCachedStarterResponse("agency-1", "test");
    expect(result).toBeNull();

    // Should not throw
    await cacheStarterResponse("agency-1", "test", "response");
    await invalidateStarterCache("agency-1");
  });
});
