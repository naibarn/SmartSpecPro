/**
 * Vertical Drama Series — Text Overlay Suite auto-text/derivation resolution
 * tests (task #34). Mocks `db`, `verticalDramaSeriesMemoryService`, and the
 * dynamically-imported `verticalDramaStoryBible` module (see the source
 * file's own header doc comment for why that one is lazy-loaded).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDb } = vi.hoisted(() => ({
  mockDb: { select: vi.fn() },
}));
vi.mock("../../db", () => ({ db: mockDb }));

const { mockBuildEpisodeMemoryBundle } = vi.hoisted(() => ({
  mockBuildEpisodeMemoryBundle: vi.fn(),
}));
vi.mock("../verticalDramaSeriesMemory", () => ({
  verticalDramaSeriesMemoryService: {
    buildEpisodeMemoryBundle: mockBuildEpisodeMemoryBundle,
  },
}));

const { mockGetActiveBreakdown, mockReadItemCliffhangerLine } = vi.hoisted(() => ({
  mockGetActiveBreakdown: vi.fn(),
  mockReadItemCliffhangerLine: vi.fn(),
}));
vi.mock("../verticalDramaStoryBible", () => ({
  getActiveBreakdown: mockGetActiveBreakdown,
  readItemCliffhangerLine: mockReadItemCliffhangerLine,
}));

import {
  resolveVdCharacterIntroCardsForEpisode,
  resolveVdEndCardAndOpenerAutoTexts,
} from "../verticalDramaTextOverlayResolution";

/** Thenable select-chain stub — mirrors the convention already established
 *  in this router/service test suite family. */
function selectChain(rows: unknown[]) {
  const chain: any = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    limit: vi.fn(() => Promise.resolve(rows)),
    then: (resolve: any) => Promise.resolve(rows).then(resolve),
  };
  return chain;
}

const owner = { tenantId: "t1", userId: 42, seriesId: 10 };

beforeEach(() => {
  vi.clearAllMocks();
  mockBuildEpisodeMemoryBundle.mockResolvedValue({
    episodeSummaries: [],
    unresolvedHooks: [],
  });
  mockGetActiveBreakdown.mockReturnValue([]);
  mockReadItemCliffhangerLine.mockReturnValue(undefined);
});

describe("resolveVdEndCardAndOpenerAutoTexts", () => {
  it("prefers a manual end-card/opener text over any auto-derived source", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: {} }]));

    const result = await resolveVdEndCardAndOpenerAutoTexts(owner, 3, {
      endCardText: "จบแบบกำหนดเอง",
      openerRecapText: "ความเดิมกำหนดเอง",
    });

    expect(result.endCard).toEqual({ text: "จบแบบกำหนดเอง", source: "manual" });
    expect(result.openerRecap).toEqual({ text: "ความเดิมกำหนดเอง", source: "manual" });
    // Manual text short-circuits without even needing the memory bundle to
    // carry data, but the bundle IS still fetched (source of truth for the
    // NON-manual case too) — assert it was called with the right owner/episode.
    expect(mockBuildEpisodeMemoryBundle).toHaveBeenCalledWith(owner, 3);
  });

  it("falls back to the active breakdown item's cliffhanger_line when no manual text", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: { some: "bible" } }]));
    mockGetActiveBreakdown.mockReturnValue([{ episodeNumber: 3 }, { episodeNumber: 4 }]);
    mockReadItemCliffhangerLine.mockImplementation((item: any) =>
      item.episodeNumber === 3 ? "cliffhanger ตอน 3" : undefined
    );

    const result = await resolveVdEndCardAndOpenerAutoTexts(owner, 3);
    expect(result.endCard).toEqual({ text: "cliffhanger ตอน 3", source: "cliffhanger" });
  });

  it("skips the bible lookup entirely when the series has no bible yet", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: null }]));

    await resolveVdEndCardAndOpenerAutoTexts(owner, 3);
    expect(mockGetActiveBreakdown).not.toHaveBeenCalled();
  });

  it("falls back to an unresolved hook when no cliffhanger is available", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: null }]));
    mockBuildEpisodeMemoryBundle.mockResolvedValue({
      episodeSummaries: [],
      unresolvedHooks: ["ปมค้าง"],
    });

    const result = await resolveVdEndCardAndOpenerAutoTexts(owner, 3);
    expect(result.endCard).toEqual({ text: "ปมค้าง", source: "hook" });
  });

  it("uses the most recent PRIOR episode summary for opener recap", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: null }]));
    mockBuildEpisodeMemoryBundle.mockResolvedValue({
      episodeSummaries: [
        { episodeNumber: 1, summary: "ตอน 1" },
        { episodeNumber: 2, summary: "ตอน 2 ล่าสุด" },
        // A "future" episode summary (shouldn't happen in practice) must
        // never be picked for episode 3's recap.
        { episodeNumber: 5, summary: "ตอน 5" },
      ],
      unresolvedHooks: [],
    });

    const result = await resolveVdEndCardAndOpenerAutoTexts(owner, 3);
    expect(result.openerRecap).toEqual({ text: "ตอน 2 ล่าสุด", source: "summary" });
  });

  it("never gives episode 1 a recap even when a summary exists", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([{ bible: null }]));
    mockBuildEpisodeMemoryBundle.mockResolvedValue({
      episodeSummaries: [{ episodeNumber: 1, summary: "ไม่ควรถูกใช้" }],
      unresolvedHooks: [],
    });

    const result = await resolveVdEndCardAndOpenerAutoTexts(owner, 1);
    expect(result.openerRecap).toEqual({ text: "", source: "none" });
  });
});

describe("resolveVdCharacterIntroCardsForEpisode", () => {
  it("returns [] without querying the DB when there are no frames", async () => {
    const result = await resolveVdCharacterIntroCardsForEpisode(owner, []);
    expect(result).toEqual([]);
    expect(mockDb.select).not.toHaveBeenCalled();
  });

  it("joins frame character refs against the series roster", async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([{ characterKey: "char-a", name: "มาลี", role: "นางเอก" }])
    );

    const result = await resolveVdCharacterIntroCardsForEpisode(owner, [
      { shotNumber: 2, requiredCharacterRefs: ["char-a"] },
    ]);

    expect(result).toEqual([
      { characterKey: "char-a", shotNumber: 2, name: "มาลี", role: "นางเอก" },
    ]);
  });

  it("skips a character key with no matching roster row", async () => {
    mockDb.select.mockReturnValueOnce(selectChain([]));

    const result = await resolveVdCharacterIntroCardsForEpisode(owner, [
      { shotNumber: 1, requiredCharacterRefs: ["char-missing"] },
    ]);
    expect(result).toEqual([]);
  });
});
