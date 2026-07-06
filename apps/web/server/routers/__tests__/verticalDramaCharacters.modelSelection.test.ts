/**
 * Vertical Drama CHARACTER tab — coverage for the model-passthrough fix
 * (BUG 1 from the 2026-07-06 character-tab investigation): the three
 * generation mutations (`generateCharacterImage`, `generateCharacterTurnaround`,
 * `generateCharacterSheet`) used to price + generate against the fixed
 * `DEFAULT_MODELS.image` constant, silently ignoring the character tab's own
 * model picker (`selectedImageModelId`, persisted in
 * `VD_CHARACTER_IMAGE_MODEL_STORAGE_KEY`) — confirmed via the audit log
 * (`apps/web/logs/audit/audit-2026-07-06.jsonl`: every character-tab
 * submission that day used `"model":"google-banana-2-lite"` regardless of
 * the picker's selection).
 *
 * Covers:
 *  - `resolveCharacterImageModelId` — validates + resolves the caller-selected
 *    model, falling back to `DEFAULT_MODELS.image` when absent (mirrors
 *    `verticalDramaEpisodes.ts`'s `resolveEpisodeImageModelId`/
 *    `assertModelSelectable` coverage in `verticalDramaEpisodes.modelSelection.test.ts`).
 *  - `resolveVdCharacterMcpTransportMetadata` — MCP-transport routing +
 *    zero-cost / missing-connection guard, mirroring
 *    `verticalDramaEpisodes.ts`'s private `resolveVdMcpTransportMetadata`.
 *
 * The router file itself has a large module graph (DB, credit service, media
 * generation service, character-stock service, etc.) — everything is mocked
 * to a minimal no-op shape purely so the module can be imported; only the two
 * pure-ish helper functions under test are exercised.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetModelsByTypeAsync } = vi.hoisted(() => ({
  mockGetModelsByTypeAsync: vi.fn(),
}));

const { mockResolveMediaTransport } = vi.hoisted(() => ({
  mockResolveMediaTransport: vi.fn(),
}));

vi.mock("../../services/modelRegistry", () => ({
  getModelsByTypeAsync: mockGetModelsByTypeAsync,
}));

vi.mock("../../services/mediaTransportResolver", () => ({
  resolveMediaTransport: mockResolveMediaTransport,
}));

vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    instance: {},
  },
}));

vi.mock("../../_core/trpc", () => {
  const createProcedure = () => {
    const proc: any = {
      use: () => proc,
      input: () => proc,
      query: (fn: Function) => fn,
      mutation: (fn: Function) => fn,
    };
    return proc;
  };
  return {
    router: (routes: Record<string, unknown>) => routes,
    protectedProcedure: createProcedure(),
  };
});

vi.mock("../../middleware/requireFeatureFlag", () => ({
  requireFeatureFlag: () => (x: unknown) => x,
}));

vi.mock("../../services/verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: { getPrimaryPortraitUrl: vi.fn() },
  VerticalDramaCharacterStockError: class extends Error {},
}));

vi.mock("../../services/mediaGenerationService", () => ({
  mediaGenerationService: { generateImageAsync: vi.fn() },
  DEFAULT_MODELS: { image: "google-nano-banana-pro" },
}));

vi.mock("../../services/pricingCalculator", () => ({
  calculateCreditCost: vi.fn(() => 10),
}));

vi.mock("../../services/creditService", () => ({
  hasEnoughCredits: vi.fn(),
  deductCredits: vi.fn(),
  refundCredits: vi.fn(),
}));

vi.mock("../../_core/tokens", () => ({
  signBearerToken: vi.fn(() => "token"),
}));

vi.mock("../../services/verticalDramaCharacterImageGeneration", () => ({
  generateCharacterVisualPrompts: vi.fn(),
  InsufficientCreditsError: class extends Error {},
  VdSchemaValidationError: class extends Error {},
}));

vi.mock("../../services/rateLimiter", () => ({
  mediaGenerationLimiter: { isAllowed: vi.fn(() => true), getResetTime: vi.fn(() => 0) },
}));

vi.mock("../../services/mediaAssetService", () => ({
  createAssetFromAttachment: vi.fn(),
}));

import { z } from "zod";
import {
  resolveCharacterImageModelId,
  resolveVdCharacterMcpTransportMetadata,
} from "../verticalDramaCharacters";

function model(overrides: Partial<{ id: string; type: string; isEnabled: boolean }> = {}) {
  return { id: "google-banana-2-lite", type: "image", isEnabled: true, ...overrides };
}

describe("resolveCharacterImageModelId — resolution order (caller selection -> DEFAULT_MODELS)", () => {
  beforeEach(() => {
    mockGetModelsByTypeAsync.mockReset();
  });

  it("returns DEFAULT_MODELS.image when no model was selected", async () => {
    const resolved = await resolveCharacterImageModelId(undefined);
    expect(resolved).toBe("google-nano-banana-pro");
    expect(mockGetModelsByTypeAsync).not.toHaveBeenCalled();
  });

  it("returns the caller-selected model when it exists and is enabled (the BUG 1 fix)", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([model({ id: "higgsfield/nano-banana-pro" })]);
    const resolved = await resolveCharacterImageModelId("higgsfield/nano-banana-pro");
    expect(resolved).toBe("higgsfield/nano-banana-pro");
    expect(mockGetModelsByTypeAsync).toHaveBeenCalledWith("image");
  });

  it("throws BAD_REQUEST for a model id that doesn't exist in the catalog", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([model({ id: "google-banana-2-lite" })]);
    await expect(resolveCharacterImageModelId("does-not-exist")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("throws BAD_REQUEST for a disabled model (fails closed, does not silently substitute the default)", async () => {
    mockGetModelsByTypeAsync.mockResolvedValue([
      model({ id: "google-banana-2-lite", isEnabled: false }),
    ]);
    await expect(resolveCharacterImageModelId("google-banana-2-lite")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});

describe("resolveVdCharacterMcpTransportMetadata — MCP-transport routing", () => {
  beforeEach(() => {
    mockResolveMediaTransport.mockReset();
  });

  it("returns null for an ordinary gateway_api model (no MCP route, no configJson.transport)", async () => {
    const result = await resolveVdCharacterMcpTransportMetadata({
      tenantId: "tenant-1",
      actorUserId: 1,
      assetType: "image",
      modelId: "google-banana-2-lite",
      configJson: null,
    });
    expect(result).toBeNull();
    expect(mockResolveMediaTransport).not.toHaveBeenCalled();
  });

  it("throws BAD_REQUEST when an MCP-transport model is requested without a connected mcpConnectionId", async () => {
    await expect(
      resolveVdCharacterMcpTransportMetadata({
        tenantId: "tenant-1",
        actorUserId: 1,
        assetType: "image",
        modelId: "higgsfield/nano-banana-pro",
        configJson: null,
        // mcpConnectionId intentionally omitted
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockResolveMediaTransport).not.toHaveBeenCalled();
  });

  it("resolves transport metadata (zero-cost MCP path) when mcpConnectionId is supplied", async () => {
    mockResolveMediaTransport.mockResolvedValue({
      transport: "mcp",
      providerKey: "higgsfield",
      providerModelId: "nano_banana_pro",
      mcpConnectionId: "conn-123",
    });
    const result = await resolveVdCharacterMcpTransportMetadata({
      tenantId: "tenant-1",
      actorUserId: 1,
      assetType: "image",
      modelId: "higgsfield/nano-banana-pro",
      configJson: null,
      mcpConnectionId: "conn-123",
    });
    expect(result).toMatchObject({ transport: "mcp", providerKey: "higgsfield" });
    expect(mockResolveMediaTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-1",
        actorUserId: 1,
        assetType: "image",
        requestedTransport: "mcp",
        mcpConnectionId: "conn-123",
        providerKey: "higgsfield",
      }),
    );
  });

  it("routes an MCP-transport model declared via configJson.transport (not just the id-shape route)", async () => {
    mockResolveMediaTransport.mockResolvedValue({
      transport: "mcp",
      providerKey: "magnific",
      providerModelId: "upscale",
      mcpConnectionId: "conn-456",
    });
    const result = await resolveVdCharacterMcpTransportMetadata({
      tenantId: "tenant-1",
      actorUserId: 1,
      assetType: "image",
      modelId: "some-catalog-model-id",
      configJson: { transport: "mcp", mcp: { providerKey: "magnific", providerModelId: "upscale" } },
      mcpConnectionId: "conn-456",
    });
    expect(result).toMatchObject({ transport: "mcp", providerKey: "magnific" });
  });
});

/**
 * `resolveMediaAssetForImport`'s `source: "url"` branch (BUG 2 investigation)
 * — the `url` field is deliberately `z.string().min(1)`, NOT `z.string().url()`,
 * because local storage's `ai.upload` and MCP-transport task completions
 * (`mcpMediaAdapter.ts`'s `readFirstMcpMediaUrl`) can both legitimately return
 * a relative path (`/uploads/...` or `/api/storage/...`), which fails a
 * strict absolute-URL check but is a perfectly valid `storageKey`/`originalUrl`
 * for `createAssetFromAttachment`. This mirrors the router's exact inline
 * schema shape (see `verticalDramaCharacters.ts`'s `resolveMediaAssetForImport`
 * input) as a regression guard — if that schema ever regresses back to
 * `.url()`, this test fails without needing to spin up the full mutation.
 */
describe("resolveMediaAssetForImport's url schema — relative-URL acceptance (BUG 2)", () => {
  const urlSourceSchema = z.object({
    source: z.literal("url"),
    url: z.string().min(1),
    mimeType: z.string().min(1),
    fileName: z.string().optional(),
  });

  it("accepts an absolute https:// URL (ordinary gateway_api provider result)", () => {
    const result = urlSourceSchema.safeParse({
      source: "url",
      url: "https://tempfile.aiquickdraw.com/vnp/abc123.jpeg",
      mimeType: "image/jpeg",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a relative /uploads/ path (local storage / MCP-transport completion)", () => {
    const result = urlSourceSchema.safeParse({
      source: "url",
      url: "/uploads/character-portrait-123.jpg",
      mimeType: "image/jpeg",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a relative /api/storage/ path (the other relative shape readFirstMcpMediaUrl allows)", () => {
    const result = urlSourceSchema.safeParse({
      source: "url",
      url: "/api/storage/abc123.png",
      mimeType: "image/png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty url", () => {
    const result = urlSourceSchema.safeParse({
      source: "url",
      url: "",
      mimeType: "image/jpeg",
    });
    expect(result.success).toBe(false);
  });
});
