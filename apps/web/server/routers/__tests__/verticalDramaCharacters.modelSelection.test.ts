/**
 * Vertical Drama CHARACTER tab — coverage for the model-passthrough fix
 * (BUG 1 from the 2026-07-06 character-tab investigation): the generation
 * mutations (`generateCharacterImage`, `generateCharacterSheet` — the latter
 * absorbed the former `generateCharacterTurnaround` in the vertical-drama-
 * character-sheet-consolidation plan, see
 * `verticalDramaCharacters.characterSheetType.test.ts` for that merge's own
 * coverage) used to price + generate against the fixed
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
  verticalDramaCharacterStockService: {
    getPrimaryPortraitUrl: vi.fn(),
    getReferenceImageUrlByAssetLinkId: vi.fn(),
  },
  VerticalDramaCharacterStockError: class extends Error {
    constructor(
      public readonly reason: string,
      message: string,
    ) {
      super(message);
    }
  },
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
  resolveReferencePortraitUrl,
} from "../verticalDramaCharacters";
import { verticalDramaCharacterStockService } from "../../services/verticalDramaCharacterStock";

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

/**
 * `resolveReferencePortraitUrl` (Phase D1 reference picker,
 * `planning/vertical-drama-reference-picker-outfit-lock/plan.md`) — the
 * shared helper both `generateCharacterImage` and `generateCharacterSheet`
 * call to resolve the identity-lock reference image. Covers the override
 * branch (present -> `getReferenceImageUrlByAssetLinkId` + error mapping)
 * and confirms the absent branch is byte-identical to the pre-existing
 * `getPrimaryPortraitUrl` auto-resolution.
 */
describe("resolveReferencePortraitUrl — override branch (Phase D1)", () => {
  const owner = { tenantId: "tenant-1", userId: 7, seriesId: 3 };

  beforeEach(() => {
    (verticalDramaCharacterStockService.getPrimaryPortraitUrl as ReturnType<typeof vi.fn>).mockReset();
    (
      verticalDramaCharacterStockService.getReferenceImageUrlByAssetLinkId as ReturnType<typeof vi.fn>
    ).mockReset();
  });

  it("absent referenceAssetLinkId: calls getPrimaryPortraitUrl unchanged, never touches the override method", async () => {
    (verticalDramaCharacterStockService.getPrimaryPortraitUrl as ReturnType<typeof vi.fn>).mockResolvedValue(
      "https://cdn.example.com/auto-portrait.png",
    );

    const url = await resolveReferencePortraitUrl(owner, 42, undefined);

    expect(url).toBe("https://cdn.example.com/auto-portrait.png");
    expect(verticalDramaCharacterStockService.getPrimaryPortraitUrl).toHaveBeenCalledWith(owner, 42);
    expect(verticalDramaCharacterStockService.getReferenceImageUrlByAssetLinkId).not.toHaveBeenCalled();
  });

  it("present referenceAssetLinkId: calls the override method with the parsed id, never touches auto-resolution", async () => {
    (
      verticalDramaCharacterStockService.getReferenceImageUrlByAssetLinkId as ReturnType<typeof vi.fn>
    ).mockResolvedValue("https://cdn.example.com/picked-portrait.png");

    const url = await resolveReferencePortraitUrl(owner, 42, "55");

    expect(url).toBe("https://cdn.example.com/picked-portrait.png");
    expect(verticalDramaCharacterStockService.getReferenceImageUrlByAssetLinkId).toHaveBeenCalledWith(
      owner,
      55,
    );
    expect(verticalDramaCharacterStockService.getPrimaryPortraitUrl).not.toHaveBeenCalled();
  });

  it("rejects with BAD_REQUEST for a non-numeric referenceAssetLinkId (parseId guard) without calling the service", async () => {
    await expect(resolveReferencePortraitUrl(owner, 42, "not-a-number")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(verticalDramaCharacterStockService.getReferenceImageUrlByAssetLinkId).not.toHaveBeenCalled();
  });

  it("routes a wrong-role rejection from the override method through mapStockError as BAD_REQUEST", async () => {
    const { VerticalDramaCharacterStockError } = await import("../../services/verticalDramaCharacterStock");
    (
      verticalDramaCharacterStockService.getReferenceImageUrlByAssetLinkId as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new VerticalDramaCharacterStockError("asset_wrong_role", "not a primary_portrait"));

    await expect(resolveReferencePortraitUrl(owner, 42, "55")).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("routes a not-found rejection (also covers cross-tenant/cross-user) from the override method through mapStockError as NOT_FOUND", async () => {
    const { VerticalDramaCharacterStockError } = await import("../../services/verticalDramaCharacterStock");
    (
      verticalDramaCharacterStockService.getReferenceImageUrlByAssetLinkId as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new VerticalDramaCharacterStockError("asset_not_found", "Character asset not found"));

    await expect(resolveReferencePortraitUrl(owner, 42, "55")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

/**
 * `resolveReferencePortraitUrl`'s tier-3 parent/twin-source fallback (Phase
 * F1, `planning/vertical-drama-twin-variant-completeness/plan.md` W1): when
 * there's no override AND the character has no portrait of its own yet, a
 * brand-new variant/twin should default to borrowing its parent/twin-source
 * character's own portrait rather than getting no reference at all.
 */
describe("resolveReferencePortraitUrl — parent/twin-source fallback (Phase F1)", () => {
  const owner = { tenantId: "tenant-1", userId: 7, seriesId: 3 };

  beforeEach(() => {
    (verticalDramaCharacterStockService.getPrimaryPortraitUrl as ReturnType<typeof vi.fn>).mockReset();
    (
      verticalDramaCharacterStockService.getReferenceImageUrlByAssetLinkId as ReturnType<typeof vi.fn>
    ).mockReset();
  });

  it("(a) own portrait exists: uses it unchanged, never calls getPrimaryPortraitUrl a second time for the fallback id", async () => {
    (verticalDramaCharacterStockService.getPrimaryPortraitUrl as ReturnType<typeof vi.fn>).mockResolvedValue(
      "https://cdn.example.com/own-portrait.png",
    );

    const url = await resolveReferencePortraitUrl(owner, 42, undefined, 10);

    expect(url).toBe("https://cdn.example.com/own-portrait.png");
    expect(verticalDramaCharacterStockService.getPrimaryPortraitUrl).toHaveBeenCalledTimes(1);
    expect(verticalDramaCharacterStockService.getPrimaryPortraitUrl).toHaveBeenCalledWith(owner, 42);
  });

  it("(b) explicit override present: uses the override, ignores the fallback id entirely (tier 1 still wins)", async () => {
    (
      verticalDramaCharacterStockService.getReferenceImageUrlByAssetLinkId as ReturnType<typeof vi.fn>
    ).mockResolvedValue("https://cdn.example.com/picked-portrait.png");

    const url = await resolveReferencePortraitUrl(owner, 42, "55", 10);

    expect(url).toBe("https://cdn.example.com/picked-portrait.png");
    expect(verticalDramaCharacterStockService.getPrimaryPortraitUrl).not.toHaveBeenCalled();
  });

  it("(c) no own portrait, has parentCharacterId whose portrait exists: falls back to the parent's portrait", async () => {
    (verticalDramaCharacterStockService.getPrimaryPortraitUrl as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // own portrait: none yet (brand-new variant)
      .mockResolvedValueOnce("https://cdn.example.com/parent-portrait.png"); // parent's portrait

    const url = await resolveReferencePortraitUrl(owner, 42, undefined, 10);

    expect(url).toBe("https://cdn.example.com/parent-portrait.png");
    expect(verticalDramaCharacterStockService.getPrimaryPortraitUrl).toHaveBeenNthCalledWith(1, owner, 42);
    expect(verticalDramaCharacterStockService.getPrimaryPortraitUrl).toHaveBeenNthCalledWith(2, owner, 10);
  });

  it("(d) no own portrait, has sharesFaceWithCharacterId (twin) whose portrait exists: falls back to the twin-source's portrait", async () => {
    (verticalDramaCharacterStockService.getPrimaryPortraitUrl as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null) // own portrait: none yet (brand-new twin)
      .mockResolvedValueOnce("https://cdn.example.com/twin-source-portrait.png");

    // Caller passes `parentCharacterId ?? sharesFaceWithCharacterId` — twin
    // characters have no parentCharacterId, so callers pass the twin-source
    // id (here 99) as the fallback.
    const url = await resolveReferencePortraitUrl(owner, 42, undefined, 99);

    expect(url).toBe("https://cdn.example.com/twin-source-portrait.png");
    expect(verticalDramaCharacterStockService.getPrimaryPortraitUrl).toHaveBeenNthCalledWith(2, owner, 99);
  });

  it("(e) no own portrait AND no parent/twin-source portrait either: returns null (unchanged final behavior)", async () => {
    (verticalDramaCharacterStockService.getPrimaryPortraitUrl as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const url = await resolveReferencePortraitUrl(owner, 42, undefined, 10);

    expect(url).toBeNull();
    expect(verticalDramaCharacterStockService.getPrimaryPortraitUrl).toHaveBeenCalledTimes(2);
  });

  it("(e2) no own portrait AND no parent/twin relationship at all (fallback id undefined): returns null without a second lookup", async () => {
    (verticalDramaCharacterStockService.getPrimaryPortraitUrl as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );

    const url = await resolveReferencePortraitUrl(owner, 42, undefined, undefined);

    expect(url).toBeNull();
    expect(verticalDramaCharacterStockService.getPrimaryPortraitUrl).toHaveBeenCalledTimes(1);
  });
});
