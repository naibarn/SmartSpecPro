import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { VdSeriesMemory } from "@shared/verticalDramaSeries/seriesMemoryState";

const mockGetSeriesMemoryQuery = vi.fn();
const mockUpdateMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaSeries: {
        getSeriesMemory: { invalidate: mockInvalidate },
      },
    }),
    verticalDramaSeries: {
      getSeriesMemory: {
        useQuery: () => mockGetSeriesMemoryQuery(),
      },
      updateSeriesMemory: {
        useMutation: (opts: {
          onSuccess?: (data: unknown, variables: unknown) => void;
          onError?: (err: { message?: string }) => void;
        }) => ({
          mutate: (input: unknown) => {
            mockUpdateMutate(input);
            opts?.onSuccess?.({}, input);
          },
          isPending: false,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// window.confirm — used only by the "remove episode record" action, not
// exercised in these tests, but jsdom doesn't implement it.
window.confirm = vi.fn(() => true);

import { VerticalDramaSeriesMemoryStateTab } from "@/components/verticalDramaSeries/VerticalDramaSeriesMemoryStateTab";

function emptyMemory(): VdSeriesMemory {
  return {
    contractVersion: 1,
    episodes: [],
    currentState: {
      relationships: [],
      openThreads: [],
      canonicalFacts: [],
      characterKnowledge: {},
    },
    compactSummary: "",
    lastFoldedEpisode: 0,
  };
}

function renderTab(
  memory: VdSeriesMemory,
  coverage: {
    targetEpisodeCount: number;
    episodeRowCount: number;
    episodesWithRealScript: number;
    episodesWithMemory: number;
    episodesWithMemoryAndRealScript: number;
    provenanceDistinguishable: false;
  },
  readOnly = false
) {
  mockGetSeriesMemoryQuery.mockReturnValue({
    data: { memory, coverage },
    isLoading: false,
    isError: false,
  });
  return render(
    <VerticalDramaSeriesMemoryStateTab lang="th" seriesId="17" readOnly={readOnly} />
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.confirm = vi.fn(() => true);
});

describe("VerticalDramaSeriesMemoryStateTab — empty state (the common case today)", () => {
  it("renders a clean empty state without crashing for a series with no memory yet", () => {
    renderTab(emptyMemory(), {
      targetEpisodeCount: 0,
      episodeRowCount: 0,
      episodesWithRealScript: 0,
      episodesWithMemory: 0,
      episodesWithMemoryAndRealScript: 0,
      provenanceDistinguishable: false,
    });

    expect(screen.getByTestId("vd-series-memory-tab")).toBeInTheDocument();
    expect(screen.getByTestId("vd-memory-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("vd-memory-user-edited-badge")).not.toBeInTheDocument();
  });

  it("shows a loading skeleton while the query is pending", () => {
    mockGetSeriesMemoryQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<VerticalDramaSeriesMemoryStateTab lang="th" seriesId="17" readOnly={false} />);
    expect(screen.getByTestId("vd-series-memory-loading")).toBeInTheDocument();
  });
});

describe("VerticalDramaSeriesMemoryStateTab — coverage warning", () => {
  it("renders the thin-season warning with the real numbers, honestly caveated", () => {
    renderTab(emptyMemory(), {
      targetEpisodeCount: 30,
      episodeRowCount: 30,
      episodesWithRealScript: 9,
      episodesWithMemory: 12,
      episodesWithMemoryAndRealScript: 7,
      provenanceDistinguishable: false,
    });

    const alert = screen.getByTestId("vd-memory-coverage-alert");
    expect(within(alert).getByText(/9\/30/)).toBeInTheDocument();
    const secondary = screen.getByTestId("vd-memory-coverage-secondary");
    expect(secondary.textContent).toMatch(/12\/30/);
    expect(secondary.textContent).toMatch(/7/);
    // Honesty caveat — must not phrase the correlation as a stored certainty.
    expect(secondary.textContent).toMatch(/ประมาณ|estimated/);
  });

  it("does not use destructive/warning styling when the series has full script coverage", () => {
    renderTab(emptyMemory(), {
      targetEpisodeCount: 5,
      episodeRowCount: 5,
      episodesWithRealScript: 5,
      episodesWithMemory: 5,
      episodesWithMemoryAndRealScript: 5,
      provenanceDistinguishable: false,
    });
    const alert = screen.getByTestId("vd-memory-coverage-alert");
    expect(alert.className).not.toMatch(/destructive/);
  });
});

describe("VerticalDramaSeriesMemoryStateTab — disclosure is visually unmistakable", () => {
  it("renders all four disclosure variants distinguishably", () => {
    const memory: VdSeriesMemory = {
      ...emptyMemory(),
      currentState: {
        relationships: [
          { pair: ["a", "b"], status: "คบกัน", disclosure: "public", knownBy: [], sinceEpisode: 1 },
          { pair: ["c", "d"], status: "แอบคุยกัน", disclosure: "known_to_some", knownBy: ["e"], sinceEpisode: 2 },
          { pair: ["e", "f"], status: "รู้สึกดีต่อกัน", disclosure: "undeclared", knownBy: [], sinceEpisode: 3 },
          { pair: ["g", "h"], status: "แอบคบกันลับๆ", disclosure: "secret", knownBy: ["i"], sinceEpisode: 4 },
        ],
        openThreads: [],
        canonicalFacts: [],
        characterKnowledge: {},
      },
    };
    renderTab(memory, {
      targetEpisodeCount: 4,
      episodeRowCount: 4,
      episodesWithRealScript: 4,
      episodesWithMemory: 0,
      episodesWithMemoryAndRealScript: 0,
      provenanceDistinguishable: false,
    });

    const publicBadge = screen.getByTestId("vd-memory-disclosure-public");
    const knownBadge = screen.getByTestId("vd-memory-disclosure-known_to_some");
    const undeclaredBadge = screen.getByTestId("vd-memory-disclosure-undeclared");
    const secretBadge = screen.getByTestId("vd-memory-disclosure-secret");

    // Four distinct visible labels.
    const labels = [publicBadge, knownBadge, undeclaredBadge, secretBadge].map(b => b.textContent);
    expect(new Set(labels).size).toBe(4);

    // Distinct styling classes — secret uses the destructive badge variant,
    // the other three each get their own color class.
    expect(secretBadge.className).toMatch(/destructive/);
    expect(publicBadge.className).toMatch(/emerald/);
    expect(knownBadge.className).toMatch(/amber/);
    expect(undeclaredBadge.className).toMatch(/slate/);
  });
});

describe("VerticalDramaSeriesMemoryStateTab — whole-episode round trip", () => {
  it("sends the WHOLE episode object (all fields) when adding a first episode record", () => {
    renderTab(emptyMemory(), {
      targetEpisodeCount: 0,
      episodeRowCount: 0,
      episodesWithRealScript: 0,
      episodesWithMemory: 0,
      episodesWithMemoryAndRealScript: 0,
      provenanceDistinguishable: false,
    });

    fireEvent.click(screen.getByTestId("vd-memory-add-first-episode"));
    const recap = screen.getByTestId("vd-memory-dialog-recap");
    fireEvent.change(recap, { target: { value: "ตอนแรกของเรื่อง" } });
    fireEvent.click(screen.getByTestId("vd-memory-dialog-save"));

    expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    const call = mockUpdateMutate.mock.calls[0][0];
    expect(call.seriesId).toBe("17");
    expect(call.edit.kind).toBe("upsertEpisode");
    expect(call.edit.episode).toMatchObject({
      episodeNumber: 1,
      recap: "ตอนแรกของเรื่อง",
      canonicalFacts: [],
      threadsOpened: [],
      threadsResolved: [],
      relationshipChanges: [],
      knowledgeChanges: [],
    });
  });

  it("edits an existing episode by sending back the full episode record, not a diff", () => {
    const memory: VdSeriesMemory = {
      ...emptyMemory(),
      episodes: [
        {
          episodeNumber: 3,
          recap: "เดิม",
          canonicalFacts: ["ข้อเท็จจริงเดิม"],
          threadsOpened: [],
          threadsResolved: [],
          relationshipChanges: [],
          knowledgeChanges: [],
        },
      ],
      lastFoldedEpisode: 3,
    };
    renderTab(memory, {
      targetEpisodeCount: 3,
      episodeRowCount: 3,
      episodesWithRealScript: 3,
      episodesWithMemory: 1,
      episodesWithMemoryAndRealScript: 1,
      provenanceDistinguishable: false,
    });

    fireEvent.click(screen.getByTestId("vd-memory-episode-trigger-3"));
    fireEvent.click(screen.getByTestId("vd-memory-episode-edit-3"));
    const recap = screen.getByTestId("vd-memory-dialog-recap");
    fireEvent.change(recap, { target: { value: "อัปเดตแล้ว" } });
    fireEvent.click(screen.getByTestId("vd-memory-dialog-save"));

    const call = mockUpdateMutate.mock.calls[0][0];
    expect(call.edit.episode.episodeNumber).toBe(3);
    expect(call.edit.episode.recap).toBe("อัปเดตแล้ว");
    // The untouched canonicalFacts field must still be present in the WHOLE
    // object sent back — this is a full-record replace, not a partial diff.
    expect(call.edit.episode.canonicalFacts).toEqual(["ข้อเท็จจริงเดิม"]);
  });
});

describe("VerticalDramaSeriesMemoryStateTab — sticky userEdited consequence", () => {
  it("warns, before saving, that this permanently marks the whole series memory as user-edited", () => {
    renderTab(emptyMemory(), {
      targetEpisodeCount: 0,
      episodeRowCount: 0,
      episodesWithRealScript: 0,
      episodesWithMemory: 0,
      episodesWithMemoryAndRealScript: 0,
      provenanceDistinguishable: false,
    });
    fireEvent.click(screen.getByTestId("vd-memory-add-first-episode"));
    expect(screen.getByText(/แก้ไขโดยผู้ใช้อย่างถาวร|permanently marks/)).toBeInTheDocument();
  });

  it("shows the already-user-edited badge and a different dialog notice once userEdited is true", () => {
    const memory: VdSeriesMemory = { ...emptyMemory(), userEdited: true };
    renderTab(memory, {
      targetEpisodeCount: 0,
      episodeRowCount: 0,
      episodesWithRealScript: 0,
      episodesWithMemory: 0,
      episodesWithMemoryAndRealScript: 0,
      provenanceDistinguishable: false,
    });
    expect(screen.getByTestId("vd-memory-user-edited-badge")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("vd-memory-add-first-episode"));
    expect(
      screen.getByText(/ถูกทำเครื่องหมายว่าแก้ไขโดยผู้ใช้แล้ว|already marked user-edited/)
    ).toBeInTheDocument();
  });
});

describe("VerticalDramaSeriesMemoryStateTab — remove episode record", () => {
  it("sends a removeEpisode edit for the episode number, gated by confirm()", () => {
    const memory: VdSeriesMemory = {
      ...emptyMemory(),
      episodes: [
        {
          episodeNumber: 2,
          recap: "recap",
          canonicalFacts: [],
          threadsOpened: [],
          threadsResolved: [],
          relationshipChanges: [],
          knowledgeChanges: [],
        },
      ],
    };
    renderTab(memory, {
      targetEpisodeCount: 2,
      episodeRowCount: 2,
      episodesWithRealScript: 2,
      episodesWithMemory: 1,
      episodesWithMemoryAndRealScript: 1,
      provenanceDistinguishable: false,
    });

    fireEvent.click(screen.getByTestId("vd-memory-episode-trigger-2"));
    fireEvent.click(screen.getByTestId("vd-memory-episode-remove-2"));

    expect(window.confirm).toHaveBeenCalled();
    expect(mockUpdateMutate).toHaveBeenCalledWith({
      seriesId: "17",
      edit: { kind: "removeEpisode", episodeNumber: 2 },
    });
  });

  it("does not mutate when the user cancels the confirm dialog", () => {
    window.confirm = vi.fn(() => false);
    const memory: VdSeriesMemory = {
      ...emptyMemory(),
      episodes: [
        {
          episodeNumber: 2,
          recap: "recap",
          canonicalFacts: [],
          threadsOpened: [],
          threadsResolved: [],
          relationshipChanges: [],
          knowledgeChanges: [],
        },
      ],
    };
    renderTab(memory, {
      targetEpisodeCount: 2,
      episodeRowCount: 2,
      episodesWithRealScript: 2,
      episodesWithMemory: 1,
      episodesWithMemoryAndRealScript: 1,
      provenanceDistinguishable: false,
    });

    fireEvent.click(screen.getByTestId("vd-memory-episode-trigger-2"));
    fireEvent.click(screen.getByTestId("vd-memory-episode-remove-2"));
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });
});

describe("VerticalDramaSeriesMemoryStateTab — readOnly", () => {
  it("hides every edit affordance when readOnly", () => {
    const memory: VdSeriesMemory = {
      ...emptyMemory(),
      episodes: [
        {
          episodeNumber: 1,
          recap: "recap",
          canonicalFacts: [],
          threadsOpened: [],
          threadsResolved: [],
          relationshipChanges: [],
          knowledgeChanges: [],
        },
      ],
    };
    renderTab(
      memory,
      {
        targetEpisodeCount: 1,
        episodeRowCount: 1,
        episodesWithRealScript: 1,
        episodesWithMemory: 1,
        episodesWithMemoryAndRealScript: 1,
        provenanceDistinguishable: false,
      },
      true
    );
    expect(screen.getByTestId("vd-series-memory-tab")).toHaveTextContent("อ่านอย่างเดียว");
    expect(screen.queryByTestId("vd-memory-add-episode-record")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("vd-memory-episode-trigger-1"));
    expect(screen.queryByTestId("vd-memory-episode-edit-1")).not.toBeInTheDocument();
  });
});
