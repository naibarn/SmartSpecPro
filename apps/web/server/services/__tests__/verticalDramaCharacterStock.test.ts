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
  projectPortraitCandidateMetadata,
  VerticalDramaCharacterStockService,
  VerticalDramaCharacterStockError,
  VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE,
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

  it("projects bounded candidate lifecycle fields without leaking prompt or private DNA", () => {
    const metadata = {
      state: "generated",
      source: "generated",
      portraitCandidate: {
        batchId: "batch-1",
        candidateId: "candidate-2",
        index: 1,
        count: 3,
        status: "completed",
        taskId: "task-2",
        portraitPrompt: "PRIVATE_PROMPT",
        visualBibleSnapshot: { secret: "PRIVATE_DNA" },
      },
    };
    const contract = characterAssetRowToContract({
      id: 9,
      tenantId: "t1",
      userId: 42,
      seriesId: 10,
      characterId: 5,
      mediaAssetId: 101,
      assetType: "character_reference",
      role: "portrait_candidate",
      approved: false,
      containsHumanFace: true,
      qcStatus: "pending",
      checksumSha256: null,
      metadata,
      createdAt: new Date("2026-07-14T00:00:00.000Z"),
      updatedAt: new Date("2026-07-14T00:01:00.000Z"),
    } as any);

    expect(contract.portraitCandidate).toEqual({
      batchId: "batch-1",
      candidateId: "candidate-2",
      index: 1,
      count: 3,
      status: "completed",
      taskId: "task-2",
    });
    expect(JSON.stringify(contract)).not.toContain("PRIVATE_PROMPT");
    expect(JSON.stringify(contract)).not.toContain("PRIVATE_DNA");
    expect(projectPortraitCandidateMetadata(metadata)).toEqual(contract.portraitCandidate);
  });

  it("rejects out-of-range candidate indexes and counts from the browser projection", () => {
    const candidate = {
      batchId: "batch-1",
      candidateId: "candidate-1",
      status: "completed",
    };
    expect(
      projectPortraitCandidateMetadata({
        portraitCandidate: { ...candidate, index: 0, count: 6 },
      }),
    ).toBeUndefined();
    expect(
      projectPortraitCandidateMetadata({
        portraitCandidate: { ...candidate, index: 3, count: 3 },
      }),
    ).toBeUndefined();
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

describe("VerticalDramaCharacterStockService.getReferenceImageUrlByAssetLinkId (Phase D1 reference picker)", () => {
  const owner = { tenantId: "t1", userId: 42, seriesId: 10 };

  beforeEach(() => {
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockWhereSelect.mockClear();
    mockLimit.mockClear();
  });

  function portraitRow(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: 55,
      tenantId: "t1",
      userId: 42,
      seriesId: 10,
      characterId: 5,
      mediaAssetId: 100,
      assetType: "character_reference",
      role: "primary_portrait",
      approved: true,
      containsHumanFace: true,
      qcStatus: "passed",
      checksumSha256: null,
      metadata: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      ...over,
    };
  }

  it("resolves the media asset URL for the caller's own character's primary_portrait", async () => {
    mockLimit
      .mockResolvedValueOnce([portraitRow()]) // loadOwnedRow
      .mockResolvedValueOnce([{ url: "https://cdn.example.com/portrait.png" }]); // media lookup

    const service = new VerticalDramaCharacterStockService();
    const url = await service.getReferenceImageUrlByAssetLinkId(owner, 55);

    expect(url).toBe("https://cdn.example.com/portrait.png");
  });

  it("resolves a DIFFERENT character's primary_portrait within the same series (not scoped by characterId — the deliberate variant/twin design)", async () => {
    // The resolved row's own characterId (9) never matches any caller-side
    // characterId — the method signature doesn't even accept one, which is
    // exactly what proves the underlying query can never filter on it.
    mockLimit
      .mockResolvedValueOnce([portraitRow({ characterId: 9 })])
      .mockResolvedValueOnce([{ url: "https://cdn.example.com/parent-portrait.png" }]);

    const service = new VerticalDramaCharacterStockService();
    const url = await service.getReferenceImageUrlByAssetLinkId(owner, 55);

    expect(url).toBe("https://cdn.example.com/parent-portrait.png");
  });

  it("rejects a non-primary_portrait asset (asset_wrong_role) — e.g. a character sheet or color palette can never be smuggled in as an identity-lock reference", async () => {
    mockLimit.mockResolvedValueOnce([portraitRow({ role: "character_sheet_full" })]);

    const service = new VerticalDramaCharacterStockService();
    let caught: unknown;
    try {
      await service.getReferenceImageUrlByAssetLinkId(owner, 55);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VerticalDramaCharacterStockError);
    expect((caught as VerticalDramaCharacterStockError).reason).toBe("asset_wrong_role");
  });

  it("rejects when the asset link does not exist / does not belong to the caller (asset_not_found — covers not-found AND cross-tenant/cross-user identically, since loadOwnedRow's ownership-scoped WHERE simply finds no row in either case)", async () => {
    mockLimit.mockResolvedValueOnce([]); // loadOwnedRow finds no matching row

    const service = new VerticalDramaCharacterStockService();
    let caught: unknown;
    try {
      await service.getReferenceImageUrlByAssetLinkId(owner, 999);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VerticalDramaCharacterStockError);
    expect((caught as VerticalDramaCharacterStockError).reason).toBe("asset_not_found");
  });

  it("rejects with asset_not_found when the row has no mediaAssetId linked", async () => {
    mockLimit.mockResolvedValueOnce([portraitRow({ mediaAssetId: null })]);

    const service = new VerticalDramaCharacterStockService();
    let caught: unknown;
    try {
      await service.getReferenceImageUrlByAssetLinkId(owner, 55);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VerticalDramaCharacterStockError);
    expect((caught as VerticalDramaCharacterStockError).reason).toBe("asset_not_found");
  });

  it("rejects with asset_not_found when the linked media_assets row has no originalUrl", async () => {
    mockLimit.mockResolvedValueOnce([portraitRow()]).mockResolvedValueOnce([{ url: null }]);

    const service = new VerticalDramaCharacterStockService();
    let caught: unknown;
    try {
      await service.getReferenceImageUrlByAssetLinkId(owner, 55);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(VerticalDramaCharacterStockError);
    expect((caught as VerticalDramaCharacterStockError).reason).toBe("asset_not_found");
  });

  /* `planning/vd-look-image-not-replace-primary/plan.md` §4A — the URL-only
     method above now delegates here. The extra `characterId` is what lets the
     router tell "the user pinned MY OWN portrait" (explicit, own likeness)
     apart from "the user pinned SOMEBODY ELSE'S portrait" (inherited, borrowed
     likeness) — a distinction the URL alone cannot carry. */
  it("getReferenceImageByAssetLinkId also reports the owning characterId", async () => {
    mockLimit
      .mockResolvedValueOnce([portraitRow({ characterId: 9 })])
      .mockResolvedValueOnce([{ url: "https://cdn.example.com/parent-portrait.png" }]);

    const service = new VerticalDramaCharacterStockService();
    const resolved = await service.getReferenceImageByAssetLinkId(owner, 55);

    expect(resolved).toEqual({
      url: "https://cdn.example.com/parent-portrait.png",
      characterId: 9,
    });
  });

  it("getReferenceImageByAssetLinkId reports characterId: null for an unattached asset row", async () => {
    mockLimit
      .mockResolvedValueOnce([portraitRow({ characterId: null })])
      .mockResolvedValueOnce([{ url: "https://cdn.example.com/orphan.png" }]);

    const service = new VerticalDramaCharacterStockService();
    const resolved = await service.getReferenceImageByAssetLinkId(owner, 55);

    expect(resolved.characterId).toBeNull();
  });
});

/**
 * `markPortraitCandidateSubmissionFailed` — Set A gaps 5/6/7 (2026-07-16
 * stuck-candidate fix). Covers the idempotency guard (only a candidate still
 * "submitting"/"queued" can transition to "failed" — a background sweep and
 * a client poll can race each other and must never double-process or
 * downgrade an already-settled candidate) and the content-policy
 * classification (`isCharacterLockPolicyFailureMessage`) that persists a
 * clear Thai `errorMessage` while leaving `submissionError` as the raw
 * provider text for audit.
 */
describe("VerticalDramaCharacterStockService.markPortraitCandidateSubmissionFailed (Set A gap 5/6/7)", () => {
  const owner = { tenantId: "t1", userId: 42, seriesId: 10 };

  const DESIGN_DNA = {
    version: 1,
    designIntent: "A reassuring public defender whose guarded eyes reveal private guilt.",
    seriesDnaAlignment: ["grounded legal thriller", "restrained Bangkok old-money world"],
    roleTier: "lead_female",
    beautyArchetype: "approachable authority",
    ageRange: "early 30s",
    faceIdentity: {
      facialGeometry: "soft-square face, high cheekbones, compact chin",
      eyesAndGaze: "steady almond eyes with a delayed vulnerable blink",
      brows: "straight dense brows with a slight inner lift",
      nose: "low straight bridge with a rounded tip",
      lipsAndSmile: "defined upper lip, asymmetric closed-mouth smile",
      skinAndTexture: "warm medium skin, real pores, faint under-eye texture",
      hair: "collarbone-length black hair, restrained side part",
      distinctiveAsymmetry: "left brow sits slightly higher",
    },
    bodyLanguage: {
      posture: "upright but never rigid",
      gesturePattern: "keeps hands still until challenged",
      movementRhythm: "measured, then suddenly decisive",
      tensionTell: "thumb presses against index finger",
    },
    recallStack: {
      face: "higher left brow and delayed blink",
      silhouette: "clean long blazer over narrow trousers",
      color: "ink navy with one oxidized-gold accent",
      behavior: "still hands before decisive movement",
      emotionalHook: "competence shielding guilt",
    },
    costumeGrammar: "precise professional layers softened by one inherited accessory",
    publicMask: "calm competence",
    hiddenTruth: "fears she protected the wrong client",
    narrativePromise: "will choose between reputation and justice",
    attractiveContradiction: "warm face, forensic gaze",
    forbiddenDrift: ["generic luxury CEO styling", "porcelain skin retouching"],
    antiCloneChecks: {
      distinctFacialDimensions: ["face shape", "brow line", "mouth asymmetry"],
      distinctHairDimensions: ["length", "part"],
      distinctBodyLanguageDimensions: ["gesture pattern", "movement rhythm"],
      signatureDifference: "oxidized-gold heirloom pin",
    },
    scores: {
      storyFit: 9,
      screenPresence: 9,
      emotionalReadability: 8,
      ensembleContrast: 9,
      crossSeriesUniqueness: 17,
      thresholdStatus: "pass",
      rationale: "The face, behavior, and costume all express the central moral conflict.",
    },
    comparisonEvidence: {
      candidateDirectionCount: 3,
      currentCastCompared: 6,
      recentSeriesCompared: 4,
      priorLeadDnaCompared: 7,
      historyCompleteness: "structured",
    },
  };

  const VISUAL_BIBLE_SNAPSHOT = {
    version: 1,
    createdAt: "2026-07-09T00:00:00.000Z",
    model: "test",
    visualIdentitySummary: "sharp office lead",
    identityAnchors: ["round glasses"],
    signatureWardrobe: "navy blazer",
    hairMakeupNotes: "short bob",
    performanceEnergy: "tense",
    consistencyStrategy: "keep glasses and blazer",
    signatureVisualCues: ["round glasses"],
    colorPalette: "navy silver",
    storyWorldRelationship: "corporate thriller",
    forbiddenDrift: ["teen styling"],
    emotionalRangeNeeded: ["neutral", "fear"],
    ageRange: "30s",
    designDna: DESIGN_DNA,
  };

  function candidateRow(over: Partial<Record<string, unknown>> = {}) {
    return {
      id: 71,
      tenantId: "t1",
      userId: 42,
      seriesId: 10,
      characterId: 5,
      mediaAssetId: null,
      assetType: "character_reference",
      role: "portrait_candidate",
      approved: false,
      containsHumanFace: null,
      qcStatus: "pending",
      checksumSha256: null,
      metadata: {
        state: "draft",
        source: "generated",
        portraitCandidate: {
          batchId: "batch-1",
          candidateId: "candidate-1",
          index: 0,
          count: 3,
          status: "queued",
          taskId: "task-1",
          characterKey: "hero",
          portraitPrompt: "PRIVATE_PROMPT",
          visualIdentitySummary: "sharp office lead",
          visualBibleSnapshot: VISUAL_BIBLE_SNAPSHOT,
          sharedVisualLanguage: "warm corporate thriller",
          promptModel: "test-model",
          expiresAt: "2099-01-01T00:00:00.000Z",
          ...(over.candidateOverrides as Record<string, unknown> | undefined),
        },
      },
      createdAt: new Date("2026-07-14T00:00:00.000Z"),
      updatedAt: new Date("2026-07-14T00:00:00.000Z"),
      ...over,
    };
  }

  beforeEach(() => {
    mockSelect.mockClear();
    mockFrom.mockClear();
    mockWhereSelect.mockClear();
    mockLimit.mockClear();
    mockUpdate.mockClear();
    mockUpdateSet.mockClear();
    mockUpdateWhere.mockClear();
    mockUpdateReturning.mockClear();
  });

  it("fails a still-queued candidate: raw error preserved in submissionError, non-policy errorMessage passes through unclassified", async () => {
    mockLimit.mockResolvedValueOnce([candidateRow()]);

    const service = new VerticalDramaCharacterStockService();
    await service.markPortraitCandidateSubmissionFailed({
      ...owner,
      assetLinkId: 71,
      errorMessage: "Provider timed out after 30 minutes",
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const setArg = mockUpdateSet.mock.calls[0][0] as any;
    expect(setArg.approved).toBe(false);
    expect(setArg.qcStatus).toBe("failed");
    expect(setArg.metadata.portraitCandidate.status).toBe("failed");
    expect(setArg.metadata.portraitCandidate.submissionError).toBe(
      "Provider timed out after 30 minutes",
    );
    expect(setArg.metadata.portraitCandidate.errorMessage).toBe(
      "Provider timed out after 30 minutes",
    );
    expect(setArg.metadata.portraitCandidate.policyRejected).toBe(false);
    expect(setArg.metadata.state).toBe("rejected");
    // The already-shipped A-client fix reads the asset-level `rejectionReason`
    // (`characterAssetRowToContract`) — kept in sync with the same display text.
    expect(setArg.metadata.rejectionReason).toBe("Provider timed out after 30 minutes");
  });

  it("classifies a content-policy provider rejection: clear Thai errorMessage, raw text still preserved in submissionError", async () => {
    mockLimit.mockResolvedValueOnce([candidateRow()]);

    const service = new VerticalDramaCharacterStockService();
    const rawProviderError = "Image blocked: content policy violation detected";
    await service.markPortraitCandidateSubmissionFailed({
      ...owner,
      assetLinkId: 71,
      errorMessage: rawProviderError,
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    const setArg = mockUpdateSet.mock.calls[0][0] as any;
    expect(setArg.metadata.portraitCandidate.policyRejected).toBe(true);
    expect(setArg.metadata.portraitCandidate.errorMessage).toBe(
      VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE,
    );
    // Raw provider text is never lost — still the audit copy.
    expect(setArg.metadata.portraitCandidate.submissionError).toBe(rawProviderError);
    // Already-shipped A-client fix reads `asset.rejectionReason` — must get
    // the CLASSIFIED text, not the raw provider string.
    expect(setArg.metadata.rejectionReason).toBe(VD_PORTRAIT_CANDIDATE_POLICY_REJECTED_MESSAGE);
  });

  it("is idempotent: a candidate already in a terminal state (selected) is left untouched — no update, no re-fail", async () => {
    mockLimit.mockResolvedValueOnce([
      candidateRow({ candidateOverrides: { status: "selected" } }),
    ]);

    const service = new VerticalDramaCharacterStockService();
    await service.markPortraitCandidateSubmissionFailed({
      ...owner,
      assetLinkId: 71,
      errorMessage: "stale failure from a race",
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent: a candidate already marked failed is left untouched (no double-write)", async () => {
    mockLimit.mockResolvedValueOnce([
      candidateRow({ candidateOverrides: { status: "failed" } }),
    ]);

    const service = new VerticalDramaCharacterStockService();
    await service.markPortraitCandidateSubmissionFailed({
      ...owner,
      assetLinkId: 71,
      errorMessage: "second failure attempt",
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("is idempotent: a completed candidate (image already attached, not yet selected) is never downgraded to failed", async () => {
    mockLimit.mockResolvedValueOnce([
      candidateRow({ mediaAssetId: 900, candidateOverrides: { status: "completed" } }),
    ]);

    const service = new VerticalDramaCharacterStockService();
    await service.markPortraitCandidateSubmissionFailed({
      ...owner,
      assetLinkId: 71,
      errorMessage: "late stale-sweep failure",
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

/**
 * Regression invariant behind "กดตั้งเป็นหลักแล้วภาพด้านบนไม่เปลี่ยน"
 * (2026-07-31). `setPrimaryPortraitAsset` demotes a character's other
 * portraits so exactly one is the main image. Its FIRST version cleared only
 * the `approved` COLUMN — which does nothing visible, because
 * `deriveCharacterAssetState` returns `metadata.state` in preference to that
 * column, and `linkAsset` stamps every linked image with
 * `state: "approved"`. The siblings therefore kept reporting `approved` to the
 * client and the card kept rendering the same picture.
 *
 * This pins the trap itself: clearing the column is NOT enough to demote a row.
 */
describe("deriveCharacterAssetState — metadata.state outranks the approved column", () => {
  it("still reports approved when the column is false but metadata says approved", () => {
    expect(
      deriveCharacterAssetState({
        approved: false,
        qcStatus: "passed",
        metadata: { state: "approved" },
      } as never),
    ).toBe("approved");
  });

  it("reports generated once metadata.state is demoted too", () => {
    expect(
      deriveCharacterAssetState({
        approved: false,
        qcStatus: "passed",
        metadata: { state: "generated" },
      } as never),
    ).toBe("generated");
  });

  it("falls back to the column only when metadata carries no state", () => {
    expect(
      deriveCharacterAssetState({
        approved: true,
        qcStatus: "passed",
        metadata: {},
      } as never),
    ).toBe("approved");
  });
});
