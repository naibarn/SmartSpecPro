import { describe, it, expect, vi } from "vitest";

// Mock dependencies before module import
vi.mock("./llmRateLimiter", () => ({
  scheduleMediaWithLimiter: vi.fn(),
  recordMediaUsage: vi.fn(),
}));

import { MEDIA_MODELS } from "./mediaGenerationService";

describe("MEDIA_MODELS — BytePlus ModelArk entries", () => {
  it('MEDIA_MODELS["seedream-4-5-251128"] has provider "byteplus_modelark" and type "image"', () => {
    expect(MEDIA_MODELS["seedream-4-5-251128"]).toBeDefined();
    expect(MEDIA_MODELS["seedream-4-5-251128"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedream-4-5-251128"].type).toBe("image");
  });

  it('MEDIA_MODELS["seedream-4-0-250828"] has provider "byteplus_modelark" and type "image"', () => {
    expect(MEDIA_MODELS["seedream-4-0-250828"]).toBeDefined();
    expect(MEDIA_MODELS["seedream-4-0-250828"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedream-4-0-250828"].type).toBe("image");
  });

  it("Seedream 4.5 creditCost is 15", () => {
    expect(MEDIA_MODELS["seedream-4-5-251128"].creditCost).toBe(15);
  });

  it("Seedream 4.0 creditCost is 10", () => {
    expect(MEDIA_MODELS["seedream-4-0-250828"].creditCost).toBe(10);
  });

  it('MEDIA_MODELS["seedance-1-0-pro-250528"] has provider "byteplus_modelark" and type "video"', () => {
    expect(MEDIA_MODELS["seedance-1-0-pro-250528"]).toBeDefined();
    expect(MEDIA_MODELS["seedance-1-0-pro-250528"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedance-1-0-pro-250528"].type).toBe("video");
  });

  it('MEDIA_MODELS["seedance-1-0-lite-t2v-250428"] has provider "byteplus_modelark" and type "video"', () => {
    expect(MEDIA_MODELS["seedance-1-0-lite-t2v-250428"]).toBeDefined();
    expect(MEDIA_MODELS["seedance-1-0-lite-t2v-250428"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedance-1-0-lite-t2v-250428"].type).toBe("video");
  });

  it('MEDIA_MODELS["seedance-1-0-lite-i2v-250428"] has provider "byteplus_modelark" and type "video"', () => {
    expect(MEDIA_MODELS["seedance-1-0-lite-i2v-250428"]).toBeDefined();
    expect(MEDIA_MODELS["seedance-1-0-lite-i2v-250428"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedance-1-0-lite-i2v-250428"].type).toBe("video");
  });

  it('MEDIA_MODELS["seedance-1-0-pro-fast-251015"] has provider "byteplus_modelark" and type "video"', () => {
    expect(MEDIA_MODELS["seedance-1-0-pro-fast-251015"]).toBeDefined();
    expect(MEDIA_MODELS["seedance-1-0-pro-fast-251015"].provider).toBe("byteplus_modelark");
    expect(MEDIA_MODELS["seedance-1-0-pro-fast-251015"].type).toBe("video");
  });

  it("Seedance Pro creditCost is 30", () => {
    expect(MEDIA_MODELS["seedance-1-0-pro-250528"].creditCost).toBe(30);
  });

  it("Seedance Pro Fast creditCost is 20", () => {
    expect(MEDIA_MODELS["seedance-1-0-pro-fast-251015"].creditCost).toBe(20);
  });

  it("Seedance Lite T2V creditCost is 20", () => {
    expect(MEDIA_MODELS["seedance-1-0-lite-t2v-250428"].creditCost).toBe(20);
  });

  it("Seedance Lite I2V creditCost is 20", () => {
    expect(MEDIA_MODELS["seedance-1-0-lite-i2v-250428"].creditCost).toBe(20);
  });

  it("all 6 BytePlus model entries have id field matching their registry key", () => {
    const byteplusIds = [
      "seedream-4-5-251128",
      "seedream-4-0-250828",
      "seedance-1-0-pro-fast-251015",
      "seedance-1-0-pro-250528",
      "seedance-1-0-lite-t2v-250428",
      "seedance-1-0-lite-i2v-250428",
    ];
    for (const id of byteplusIds) {
      expect(MEDIA_MODELS[id].id).toBe(id);
    }
  });

  it("all 6 BytePlus models are present in MEDIA_MODELS", () => {
    const byteplusModels = Object.values(MEDIA_MODELS).filter(
      (m) => m.provider === "byteplus_modelark"
    );
    expect(byteplusModels).toHaveLength(6);
  });

  it("TypeScript compilation validates union types (run npm run check separately)", () => {
    // This is a marker test — TypeScript compilation itself is the real assertion.
    // If ImageModel and VideoModel unions do not include the BytePlus IDs,
    // `npm run check` will fail with type errors.
    expect(true).toBe(true);
  });
});
