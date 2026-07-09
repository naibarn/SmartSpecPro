import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  canTransitionCharacterAssetState,
  transitionCharacterAssetState,
  isCharacterAssetUsable,
  type VerticalDramaCharacterAsset,
} from "@shared/verticalDramaSeries";

// ---------------------------------------------------------------------------
// DB mock — supports the exact chain shapes `linkAsset` exercises:
//   select().from().where().limit()   (existing-row lookup + media-asset check)
//   insert().values().returning()     (new-row insert)
//   update().set().where().returning() (idempotent-update branch)
// Additive (F131Z): `.from()` also exposes `.innerJoin()` for
// `getCharacterReferenceUrls`'s sheet-asset query
// (select().from().innerJoin().where(), resolved directly — no
// orderBy/limit, since sheet ranking happens in JS via
// `pickBestCharacterSheetAsset`). Never touched by `linkAsset`, so this is
// purely additive to `mockFrom`'s existing tests.
// ---------------------------------------------------------------------------
const mockLimit = vi.fn();
const mockWhereSelect = vi.fn(() => ({ limit: mockLimit }));
const mockJoinWhere = vi.fn();
const mockInnerJoin = vi.fn(() => ({ where: mockJoinWhere }));
const mockFrom = vi.fn(() => ({ where: mockWhereSelect, innerJoin: mockInnerJoin }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

const mockInsertReturning = vi.fn();
const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

const mockUpdateReturning = vi.fn();
const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

vi.mock("../../db", () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

import {
  buildCharacterAssetManifest,
  deriveCharacterAssetState,
  characterAssetRowToContract,
  characterRefChangeStaleTargets,
  pickBestCharacterSheetAsset,
  VerticalDramaCharacterStockService,
  type CharacterSheetAssetCandidate,
} from "../verticalDramaCharacterStock";

function asset(over: Partial<VerticalDramaCharacterAsset>): VerticalDramaCharacterAsset {
  return {
    assetLinkId: "1",
    seriesId: "10",
    characterId: "5",
    mediaAssetId: "100",
    assetType: "character_reference",
    state: "draft",
    approved: false,
    qcStatus: "pending",
    source: "imported",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("character asset state machine", () => {
  it("transitions through draft -> generated/imported -> approved -> stale", () => {
    expect(canTransitionCharacterAssetState("draft", "generated")).toBe(true);
    expect(canTransitionCharacterAssetState("generated", "approved")).toBe(true);
    expect(canTransitionCharacterAssetState("imported", "approved")).toBe(true);
    expect(canTransitionCharacterAssetState("approved", "stale")).toBe(true);
    expect(transitionCharacterAssetState("generated", "approved")).toBe("approved");
  });

  it("forbids skipping review from draft straight to approved", () => {
    expect(canTransitionCharacterAssetState("draft", "approved")).toBe(false);
    expect(() => transitionCharacterAssetState("draft", "approved")).toThrow();
  });

  it("supports rejection and re-work back into the pipeline", () => {
    expect(canTransitionCharacterAssetState("generated", "rejected")).toBe(true);
    expect(canTransitionCharacterAssetState("rejected", "generated")).toBe(true);
  });

  it("only an approved+approved-state asset is usable downstream", () => {
    expect(isCharacterAssetUsable({ state: "approved", approved: true })).toBe(true);
    expect(isCharacterAssetUsable({ state: "generated", approved: false })).toBe(false);
  });
});

describe("buildCharacterAssetManifest", () => {
  it("counts approved / pending / stale and picks latest updatedAt", () => {
    const manifest = buildCharacterAssetManifest(10, [
      asset({ assetLinkId: "1", state: "approved", approved: true, updatedAt: "2026-01-03T00:00:00.000Z" }),
      asset({ assetLinkId: "2", state: "generated", updatedAt: "2026-01-02T00:00:00.000Z" }),
      asset({ assetLinkId: "3", state: "stale", updatedAt: "2026-01-04T00:00:00.000Z" }),
    ]);
    expect(manifest.seriesId).toBe("10");
    expect(manifest.approvedCount).toBe(1);
    expect(manifest.pendingCount).toBe(1);
    expect(manifest.staleCount).toBe(1);
    expect(manifest.updatedAt).toBe("2026-01-04T00:00:00.000Z");
  });
});

describe("deriveCharacterAssetState", () => {
  it("prefers explicit metadata state", () => {
    expect(deriveCharacterAssetState({ approved: false, qcStatus: "pending", metadata: { state: "stale" } })).toBe("stale");
  });
  it("derives approved when approved flag set", () => {
    expect(deriveCharacterAssetState({ approved: true, qcStatus: "passed", metadata: null })).toBe("approved");
  });
  it("derives rejected when qc failed", () => {
    expect(deriveCharacterAssetState({ approved: false, qcStatus: "failed", metadata: null })).toBe("rejected");
  });
});

describe("characterAssetRowToContract", () => {
  it("maps a durable row to a browser-safe contract without provider URLs", () => {
    const contract = characterAssetRowToContract({
      id: 7,
      tenantId: "t1",
      userId: 42,
      seriesId: 10,
      characterId: 5,
      mediaAssetId: 100,
      assetType: "character_reference",
      role: "primary_reference",
      approved: true,
      containsHumanFace: true,
      qcStatus: "passed",
      checksumSha256: "abc",
      metadata: { state: "approved", source: "generated", characterKey: "hero" },
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    } as any);
    expect(contract.assetLinkId).toBe("7");
    expect(contract.mediaAssetId).toBe("100");
    expect(contract.state).toBe("approved");
    expect(contract.source).toBe("generated");
    expect(contract.characterKey).toBe("hero");
    // No provider URL leaks through the contract projection.
    expect(JSON.stringify(contract)).not.toMatch(/https?:\/\//);
  });
});

describe("characterRefChangeStaleTargets", () => {
  it("marks storyboard, start-frame, and motion-prompt stages stale", () => {
    const { coarse, pipelineStages } = characterRefChangeStaleTargets();
    expect(coarse).toEqual(["storyboard", "start_frame", "motion_prompt"]);
    expect(pipelineStages).toContain("storyboard_shotgrid");
    expect(pipelineStages).toContain("render_or_import_start_frames");
    expect(pipelineStages).toContain("video_motion_prompt_pack");
  });
});

describe("VerticalDramaCharacterStockService.linkAsset — idempotency (bug repro 2026-07-06)", () => {
  const owner = { tenantId: "t1", userId: 42, seriesId: 10 };
  const baseParams = {
    ...owner,
    characterId: 5,
    mediaAssetId: 100,
    assetType: "character_reference",
    source: "imported" as const,
  };
  const mediaAssetRow = { id: 100, tenantId: "t1", userId: 42, status: "completed" };

  beforeEach(() => {
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockWhereSelect.mockClear();
    mockLimit.mockClear();
    mockInsert.mockClear();
    mockInsertValues.mockClear();
    mockInsertReturning.mockClear();
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
    mockUpdateWhere.mockClear();
    mockUpdateReturning.mockClear();
  });

  it("inserts a new row when no existing (characterId, mediaAssetId) link exists", async () => {
    // 1st select() call = media-asset attachability check, 2nd = existing-link lookup.
    mockLimit
      .mockResolvedValueOnce([mediaAssetRow])
      .mockResolvedValueOnce([]); // no existing link
    mockInsertReturning.mockResolvedValueOnce([
      {
        id: 1,
        tenantId: "t1",
        userId: 42,
        seriesId: 10,
        characterId: 5,
        mediaAssetId: 100,
        assetType: "character_reference",
        role: "primary_portrait",
        approved: true,
        containsHumanFace: null,
        qcStatus: "pending",
        checksumSha256: null,
        metadata: { state: "approved", source: "imported" },
        createdAt: new Date("2026-07-06T00:00:00.000Z"),
        updatedAt: new Date("2026-07-06T00:00:00.000Z"),
      },
    ]);

    const service = new VerticalDramaCharacterStockService();
    const result = await service.linkAsset({ ...baseParams, role: "primary_portrait" });

    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(result.assetLinkId).toBe("1");
    expect(result.role).toBe("primary_portrait");
    expect(result.state).toBe("approved");
  });

  it("UPDATEs the existing row instead of inserting a duplicate on a second link of the same (characterId, mediaAssetId)", async () => {
    const existingRow = {
      id: 7,
      tenantId: "t1",
      userId: 42,
      seriesId: 10,
      characterId: 5,
      mediaAssetId: 100,
      assetType: "character_reference",
      role: null,
      approved: true,
      containsHumanFace: null,
      qcStatus: "pending",
      checksumSha256: null,
      metadata: { state: "approved", source: "imported" },
      createdAt: new Date("2026-07-05T00:00:00.000Z"),
      updatedAt: new Date("2026-07-05T00:00:00.000Z"),
    };
    mockLimit
      .mockResolvedValueOnce([mediaAssetRow]) // attachability check
      .mockResolvedValueOnce([existingRow]); // existing link found
    mockUpdateReturning.mockResolvedValueOnce([
      {
        ...existingRow,
        role: "primary_portrait",
        updatedAt: new Date("2026-07-06T00:00:00.000Z"),
      },
    ]);

    const service = new VerticalDramaCharacterStockService();
    const result = await service.linkAsset({ ...baseParams, role: "primary_portrait" });

    // No duplicate row inserted — the existing (characterId, mediaAssetId)
    // link is updated in place (this is the exact drag-onto-card repro: the
    // panel previously showed a second "primary_p..." tile for the same
    // already-linked image).
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateWhere).toHaveBeenCalled();
    expect(result.assetLinkId).toBe("7");
    expect(result.role).toBe("primary_portrait");
    expect(result.state).toBe("approved");
  });

  it("does not attempt idempotent lookup when characterId or mediaAssetId is absent (browse-only / product-reference rows)", async () => {
    mockInsertReturning.mockResolvedValueOnce([
      {
        id: 2,
        tenantId: "t1",
        userId: 42,
        seriesId: 10,
        characterId: null,
        mediaAssetId: null,
        assetType: "character_reference",
        role: null,
        approved: true,
        containsHumanFace: null,
        qcStatus: "pending",
        checksumSha256: null,
        metadata: { state: "approved", source: "imported" },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const service = new VerticalDramaCharacterStockService();
    await service.linkAsset({
      tenantId: "t1",
      userId: 42,
      seriesId: 10,
      characterId: null,
      mediaAssetId: null,
      assetType: "character_reference",
      source: "imported",
    });

    // No media-asset attachability check (mediaAssetId null) and no
    // existing-link lookup (both characterId and mediaAssetId are null) —
    // only the insert path runs.
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});

describe("pickBestCharacterSheetAsset (F131Z sheet-selection preference matrix)", () => {
  function candidate(over: Partial<CharacterSheetAssetCandidate>): CharacterSheetAssetCandidate {
    return {
      url: "https://cdn.example.com/sheet.png",
      role: "character_sheet_full",
      approved: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...over,
    };
  }

  it("returns null for an empty candidate list (caller falls back to portrait-only)", () => {
    expect(pickBestCharacterSheetAsset([])).toBeNull();
  });

  it("approved beats unapproved outright, regardless of role/recency", () => {
    const approvedFull = candidate({
      url: "approved-full",
      role: "character_sheet_full",
      approved: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const unapprovedTurnaroundNewer = candidate({
      url: "unapproved-turnaround",
      role: "character_sheet_turnaround",
      approved: false,
      updatedAt: "2026-06-01T00:00:00.000Z", // newer AND turnaround — still loses to approved
    });
    expect(
      pickBestCharacterSheetAsset([unapprovedTurnaroundNewer, approvedFull])?.url,
    ).toBe("approved-full");
    // Order-independent.
    expect(
      pickBestCharacterSheetAsset([approvedFull, unapprovedTurnaroundNewer])?.url,
    ).toBe("approved-full");
  });

  it("prefers turnaround over full when approved status ties", () => {
    const full = candidate({ url: "full", role: "character_sheet_full", approved: true });
    const turnaround = candidate({
      url: "turnaround",
      role: "character_sheet_turnaround",
      approved: true,
    });
    expect(pickBestCharacterSheetAsset([full, turnaround])?.url).toBe("turnaround");
    expect(pickBestCharacterSheetAsset([turnaround, full])?.url).toBe("turnaround");
  });

  it("falls back to newest updatedAt when approved and role both tie", () => {
    const older = candidate({
      url: "older",
      role: "character_sheet_turnaround",
      approved: true,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const newer = candidate({
      url: "newer",
      role: "character_sheet_turnaround",
      approved: true,
      updatedAt: "2026-02-01T00:00:00.000Z",
    });
    expect(pickBestCharacterSheetAsset([older, newer])?.url).toBe("newer");
    expect(pickBestCharacterSheetAsset([newer, older])?.url).toBe("newer");
  });
});

describe("VerticalDramaCharacterStockService.getCharacterReferenceUrls (F131Z)", () => {
  const owner = { tenantId: "t1", userId: 42, seriesId: 10 };

  beforeEach(() => {
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockInnerJoin.mockClear();
    mockJoinWhere.mockClear();
    mockWhereSelect.mockClear();
    mockLimit.mockClear();
  });

  it("returns portrait only when includeSheet=false — reuses getPrimaryPortraitUrl unchanged and never queries sheets", async () => {
    const service = new VerticalDramaCharacterStockService();
    const portraitSpy = vi
      .spyOn(service, "getPrimaryPortraitUrl")
      .mockResolvedValue("https://cdn.example.com/portrait.png");

    const result = await service.getCharacterReferenceUrls(owner, 5, {
      includeSheet: false,
    });

    expect(result).toEqual(["https://cdn.example.com/portrait.png"]);
    expect(portraitSpy).toHaveBeenCalledWith(owner, 5);
    // Byte-identical to pre-F131Z portrait resolution: no sheet query issued at all.
    expect(mockInnerJoin).not.toHaveBeenCalled();
  });

  it("returns portrait only when includeSheet=true but the character has no sheet asset yet", async () => {
    const service = new VerticalDramaCharacterStockService();
    vi.spyOn(service, "getPrimaryPortraitUrl").mockResolvedValue(
      "https://cdn.example.com/portrait.png",
    );
    mockJoinWhere.mockResolvedValueOnce([]);

    const result = await service.getCharacterReferenceUrls(owner, 5, {
      includeSheet: true,
    });

    expect(result).toEqual(["https://cdn.example.com/portrait.png"]);
  });

  it("appends the best sheet asset after the portrait when includeSheet=true (turnaround beats full)", async () => {
    const service = new VerticalDramaCharacterStockService();
    vi.spyOn(service, "getPrimaryPortraitUrl").mockResolvedValue(
      "https://cdn.example.com/portrait.png",
    );
    mockJoinWhere.mockResolvedValueOnce([
      {
        url: "https://cdn.example.com/sheet-full.png",
        role: "character_sheet_full",
        approved: true,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
      {
        url: "https://cdn.example.com/sheet-turnaround.png",
        role: "character_sheet_turnaround",
        approved: true,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const result = await service.getCharacterReferenceUrls(owner, 5, {
      includeSheet: true,
    });

    expect(result).toEqual([
      "https://cdn.example.com/portrait.png",
      "https://cdn.example.com/sheet-turnaround.png",
    ]);
  });

  it("returns an empty array when neither a portrait nor a sheet exist", async () => {
    const service = new VerticalDramaCharacterStockService();
    vi.spyOn(service, "getPrimaryPortraitUrl").mockResolvedValue(null);
    mockJoinWhere.mockResolvedValueOnce([]);

    const result = await service.getCharacterReferenceUrls(owner, 5, {
      includeSheet: true,
    });

    expect(result).toEqual([]);
  });

  it("filters out sheet rows with a null resolved url before ranking", async () => {
    const service = new VerticalDramaCharacterStockService();
    vi.spyOn(service, "getPrimaryPortraitUrl").mockResolvedValue(
      "https://cdn.example.com/portrait.png",
    );
    mockJoinWhere.mockResolvedValueOnce([
      {
        url: null,
        role: "character_sheet_turnaround",
        approved: true,
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
      },
      {
        url: "https://cdn.example.com/sheet-full.png",
        role: "character_sheet_full",
        approved: true,
        updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);

    const result = await service.getCharacterReferenceUrls(owner, 5, {
      includeSheet: true,
    });

    expect(result).toEqual([
      "https://cdn.example.com/portrait.png",
      "https://cdn.example.com/sheet-full.png",
    ]);
  });
});
