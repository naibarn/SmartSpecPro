import { describe, expect, it } from "vitest";
import {
  classifySidebarSeriesItem,
  groupMainViewSeries,
  isVerticalDramaSeriesIndexPath,
  resolveSidebarSeriesView,
  type SidebarSeriesGroupNode,
  type SidebarSeriesItem,
} from "@/components/verticalDramaSeries/VerticalDramaShell";

describe("isVerticalDramaSeriesIndexPath", () => {
  it("allows the series index route, including a trailing slash/query", () => {
    expect(isVerticalDramaSeriesIndexPath("/drama-series")).toBe(true);
    expect(isVerticalDramaSeriesIndexPath("/drama-series/?tab=all")).toBe(true);
  });

  it("keeps series detail and episode routes out of the Draft Inbox", () => {
    expect(isVerticalDramaSeriesIndexPath("/drama-series/21")).toBe(false);
    expect(isVerticalDramaSeriesIndexPath("/drama-series/21/episodes/140")).toBe(
      false
    );
  });
});

/**
 * Coverage for the lineage-aware sidebar filter/grouping fix
 * (`planning/vd-series-memory-and-lineage/plan.md` Stage 2.6 follow-up, added
 * 2026-07-18) — same "test the extracted pure helper, not a full component
 * render" convention as this feature's other panel tests (e.g.
 * `VerticalDramaCharacterStockPanel.buildCharacterRosterEntries.test.ts`).
 */

function item(
  over: Partial<SidebarSeriesItem> & { id: string }
): SidebarSeriesItem {
  return {
    id: over.id,
    title: over.title ?? `Series ${over.id}`,
    status: over.status ?? "active",
    nextEpisodeNumber: over.nextEpisodeNumber ?? 1,
    episodeCount: over.episodeCount ?? 0,
    pendingApprovalCount: over.pendingApprovalCount ?? 0,
    createMode: over.createMode ?? null,
    seasonNumber: over.seasonNumber ?? null,
    parentSeriesId: over.parentSeriesId ?? null,
    lineage: over.lineage ?? null,
  };
}

describe("classifySidebarSeriesItem", () => {
  it("classifies a NULL-lineage row (today's default) as main", () => {
    expect(
      classifySidebarSeriesItem(
        item({ id: "s1", createMode: null, seasonNumber: null, parentSeriesId: null })
      )
    ).toBe("main");
  });

  it("classifies createMode: special_edition as special", () => {
    expect(
      classifySidebarSeriesItem(item({ id: "s2", createMode: "special_edition" }))
    ).toBe("special");
  });

  it("classifies createMode: sequel as sequel", () => {
    expect(
      classifySidebarSeriesItem(
        item({ id: "s3", createMode: "sequel", seasonNumber: 2, parentSeriesId: "s1" })
      )
    ).toBe("sequel");
  });

  it("defensively classifies a row with a parentSeriesId but no createMode as sequel (not main)", () => {
    expect(
      classifySidebarSeriesItem(item({ id: "s4", parentSeriesId: "s1" }))
    ).toBe("sequel");
  });

  it("defensively classifies a row with seasonNumber >= 2 but no createMode as sequel", () => {
    expect(classifySidebarSeriesItem(item({ id: "s5", seasonNumber: 2 }))).toBe(
      "sequel"
    );
  });

  it("special_edition wins over any parentSeriesId/seasonNumber signal", () => {
    expect(
      classifySidebarSeriesItem(
        item({
          id: "s6",
          createMode: "special_edition",
          seasonNumber: 2,
          parentSeriesId: "s1",
        })
      )
    ).toBe("special");
  });
});

describe("groupMainViewSeries", () => {
  it("returns every row as a childless main node when all rows are NULL-lineage (today's live data)", () => {
    const series = [
      item({ id: "s1" }),
      item({ id: "s2" }),
      item({ id: "s3" }),
    ];
    const groups = groupMainViewSeries(series);
    expect(groups.map(g => g.item.id)).toEqual(["s1", "s2", "s3"]);
    expect(groups.every(g => g.children.length === 0)).toBe(true);
  });

  it("nests sequels under their parent, sorted by seasonNumber ascending", () => {
    const series = [
      item({ id: "root" }),
      item({
        id: "season3",
        createMode: "sequel",
        seasonNumber: 3,
        parentSeriesId: "root",
      }),
      item({
        id: "season2",
        createMode: "sequel",
        seasonNumber: 2,
        parentSeriesId: "root",
      }),
    ];
    const groups = groupMainViewSeries(series);
    const rootGroup = groups.find(g => g.item.id === "root") as SidebarSeriesGroupNode;
    expect(rootGroup.children.map(c => c.id)).toEqual(["season2", "season3"]);
  });

  it("keeps an orphan sequel (parent not in the list) visible as its own top-level node, not dropped", () => {
    const series = [
      item({ id: "root" }),
      item({
        id: "orphanSeason2",
        createMode: "sequel",
        seasonNumber: 2,
        parentSeriesId: "deleted-parent-id",
      }),
    ];
    const groups = groupMainViewSeries(series);
    const ids = groups.map(g => g.item.id);
    expect(ids).toContain("orphanSeason2");
    const orphanGroup = groups.find(g => g.item.id === "orphanSeason2")!;
    expect(orphanGroup.children).toEqual([]);
  });

  it("keeps a sequel whose parentSeriesId points at another sequel (not a main row) as an orphan", () => {
    const series = [
      item({ id: "root" }),
      item({
        id: "season2",
        createMode: "sequel",
        seasonNumber: 2,
        parentSeriesId: "root",
      }),
      item({
        id: "season3",
        createMode: "sequel",
        seasonNumber: 3,
        parentSeriesId: "season2", // points at a sequel, not the main root
      }),
    ];
    const groups = groupMainViewSeries(series);
    const rootGroup = groups.find(g => g.item.id === "root")!;
    expect(rootGroup.children.map(c => c.id)).toEqual(["season2"]);
    const season3Group = groups.find(g => g.item.id === "season3")!;
    expect(season3Group).toBeDefined();
    expect(season3Group.children).toEqual([]);
  });

  it("excludes special_edition rows from the main-chip tree entirely", () => {
    const series = [
      item({ id: "root" }),
      item({ id: "special1", createMode: "special_edition", parentSeriesId: "root" }),
    ];
    const groups = groupMainViewSeries(series);
    expect(groups.map(g => g.item.id)).toEqual(["root"]);
  });
});

describe("resolveSidebarSeriesView", () => {
  const series = [
    item({ id: "root" }),
    item({
      id: "season2",
      createMode: "sequel",
      seasonNumber: 2,
      parentSeriesId: "root",
    }),
    item({ id: "special1", createMode: "special_edition" }),
  ];

  it("defaults to grouped-main view when the chip is main and search is inactive", () => {
    const view = resolveSidebarSeriesView(series, "main", false);
    expect(view.mode).toBe("grouped-main");
    if (view.mode === "grouped-main") {
      expect(view.groups.map(g => g.item.id)).toEqual(["root"]);
      expect(view.groups[0].children.map(c => c.id)).toEqual(["season2"]);
    }
  });

  it("returns only special rows for the special chip", () => {
    const view = resolveSidebarSeriesView(series, "special", false);
    expect(view.mode).toBe("flat");
    if (view.mode === "flat") {
      expect(view.items.map(i => i.id)).toEqual(["special1"]);
    }
  });

  it("returns the full flat list for the all chip", () => {
    const view = resolveSidebarSeriesView(series, "all", false);
    expect(view.mode).toBe("flat");
    if (view.mode === "flat") {
      expect(view.items.map(i => i.id)).toEqual(["root", "season2", "special1"]);
    }
  });

  it("search overrides the active filter chip, returning every matching row flat regardless of class", () => {
    // Even with "special" active, an active search returns the full list
    // it was given (the server has already applied the search filter).
    const view = resolveSidebarSeriesView(series, "special", true);
    expect(view.mode).toBe("flat");
    if (view.mode === "flat") {
      expect(view.items.map(i => i.id)).toEqual(["root", "season2", "special1"]);
    }
  });

  it("search overrides the main chip too", () => {
    const view = resolveSidebarSeriesView(series, "main", true);
    expect(view.mode).toBe("flat");
    if (view.mode === "flat") {
      expect(view.items.map(i => i.id)).toEqual(["root", "season2", "special1"]);
    }
  });
});
