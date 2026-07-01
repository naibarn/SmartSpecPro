import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getDb: vi.fn(),
}));

vi.mock("./vectorize-search", () => ({
  searchImages: vi.fn(),
  searchImagesByBuffer: vi.fn(),
}));

vi.mock("./vectorize-indexing", () => ({
  indexImage: vi.fn(),
}));

const { isSafeMarketplaceImageIndexUrlForTest } = await import("./marketplaceProductService");

describe("marketplace product visual index URL policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires https image URLs", () => {
    expect(isSafeMarketplaceImageIndexUrlForTest("http://cdn.example.com/product.jpg")).toBe(false);
    expect(isSafeMarketplaceImageIndexUrlForTest("https://cdn.example.com/product.jpg")).toBe(true);
  });

  it("blocks localhost and private IP literals", () => {
    expect(isSafeMarketplaceImageIndexUrlForTest("https://localhost/product.jpg")).toBe(false);
    expect(isSafeMarketplaceImageIndexUrlForTest("https://127.0.0.1/product.jpg")).toBe(false);
    expect(isSafeMarketplaceImageIndexUrlForTest("https://10.0.0.12/product.jpg")).toBe(false);
    expect(isSafeMarketplaceImageIndexUrlForTest("https://192.168.1.10/product.jpg")).toBe(false);
    expect(isSafeMarketplaceImageIndexUrlForTest("https://172.16.1.10/product.jpg")).toBe(false);
  });

  it("honors configured allowed hosts", () => {
    const allowedHosts = ["cdn.example.com", "images.example.org"];

    expect(isSafeMarketplaceImageIndexUrlForTest("https://cdn.example.com/product.jpg", allowedHosts)).toBe(true);
    expect(isSafeMarketplaceImageIndexUrlForTest("https://thumbs.cdn.example.com/product.jpg", allowedHosts)).toBe(true);
    expect(isSafeMarketplaceImageIndexUrlForTest("https://other.example.com/product.jpg", allowedHosts)).toBe(false);
  });

  it("fails closed in production when no UI-managed allowed hosts are configured", () => {
    vi.stubEnv("NODE_ENV", "production");

    expect(isSafeMarketplaceImageIndexUrlForTest("https://cdn.example.com/product.jpg")).toBe(false);
  });
});
