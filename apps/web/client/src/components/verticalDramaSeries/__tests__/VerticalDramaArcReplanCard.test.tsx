import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockListMemoryEventsQuery = vi.fn();
const mockSeriesGetQuery = vi.fn();
const mockApproveMutate = vi.fn();
const mockRejectMutate = vi.fn();
const mockInvalidateEvents = vi.fn();
const mockInvalidateSeriesGet = vi.fn();
let approveShouldFail = false;
let rejectShouldFail = false;

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      verticalDramaEpisodes: { listMemoryEvents: { invalidate: mockInvalidateEvents } },
      verticalDramaSeries: { get: { invalidate: mockInvalidateSeriesGet } },
    }),
    verticalDramaEpisodes: {
      listMemoryEvents: { useQuery: () => mockListMemoryEventsQuery() },
    },
    verticalDramaSeries: {
      get: { useQuery: () => mockSeriesGetQuery() },
      approveArcReplanProposal: {
        useMutation: (opts: { onSuccess?: () => void; onError?: (err: { message?: string }) => void }) => ({
          mutate: (input: unknown) => {
            mockApproveMutate(input);
            if (approveShouldFail) opts?.onError?.({ message: "boom" });
            else opts?.onSuccess?.();
          },
          isPending: false,
          variables: undefined as { proposalEventId?: string } | undefined,
        }),
      },
      rejectArcReplanProposal: {
        useMutation: (opts: { onSuccess?: () => void; onError?: (err: { message?: string }) => void }) => ({
          mutate: (input: unknown) => {
            mockRejectMutate(input);
            if (rejectShouldFail) opts?.onError?.({ message: "boom" });
            else opts?.onSuccess?.();
          },
          isPending: false,
          variables: undefined as { proposalEventId?: string } | undefined,
        }),
      },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "sonner";
import { VerticalDramaArcReplanCard } from "@/components/verticalDramaSeries/VerticalDramaArcReplanCard";

const proposalPayload = {
  proposalId: "prop-1",
  seriesId: "10",
  triggeredByEpisodeNumber: 3,
  driftReasons: ["VD_ARC_BEATS_CONSUMED_EARLY"],
  affectedEpisodeNumbers: [4],
  proposedBreakdown: [
    { episodeNumber: 4, workingTitle: "New EP4 title", logline: "New logline", keyBeats: ["new beat 1"] },
  ],
  rationale: "Episode 3 consumed episode 4's planned beat.",
  status: "proposed",
};

function proposalEvent(overridesPayload: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return {
    memoryEventId: "501",
    seriesId: "10",
    memoryKind: "arc_replan_proposal",
    payload: { ...proposalPayload, ...overridesPayload },
    summaryText: "Arc drift detected",
    createdAt: "2026-07-07T00:00:00.000Z",
    ...overrides,
  };
}

const bibleWithOldPlan = {
  activeBreakdownVersionId: "v1",
  breakdownVersions: [
    {
      versionId: "v1",
      createdAt: "2026-07-01T00:00:00.000Z",
      createdByUserId: 1,
      source: "generate_story",
      items: [{ episodeNumber: 4, workingTitle: "Old EP4 title", logline: "Old logline", keyBeats: ["old beat 1"] }],
    },
  ],
};

function mockQueries(events: unknown[], bible: unknown = bibleWithOldPlan) {
  mockListMemoryEventsQuery.mockReturnValue({
    data: { events },
    isLoading: false,
    isError: false,
  });
  mockSeriesGetQuery.mockReturnValue({
    data: { series: { bible } },
    isLoading: false,
  });
}

describe("VerticalDramaArcReplanCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    approveShouldFail = false;
    rejectShouldFail = false;
  });

  it("shows the empty state when there are no arc_replan_proposal events", () => {
    mockQueries([]);
    render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);
    expect(
      screen.getByText(/ยังไม่มีข้อเสนอปรับแผนซีซั่น/),
    ).toBeInTheDocument();
  });

  it("shows a loading skeleton while listMemoryEvents is loading", () => {
    mockListMemoryEventsQuery.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    mockSeriesGetQuery.mockReturnValue({ data: undefined, isLoading: true });
    const { container } = render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);
    expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
  });

  it("shows an error state when listMemoryEvents errors", () => {
    mockListMemoryEventsQuery.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    mockSeriesGetQuery.mockReturnValue({ data: undefined, isLoading: false });
    render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);
    expect(screen.getByText(/โหลดข้อเสนอปรับแผนซีซั่นไม่สำเร็จ/)).toBeInTheDocument();
  });

  it("renders a pending proposal with drift reasons, old-vs-new diff, and approve/reject actions", () => {
    mockQueries([proposalEvent()]);
    render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);

    // Triggered-by episode number (scoped regex — the rationale fixture text
    // below also happens to contain a bare "3", which would otherwise match
    // ambiguously).
    expect(screen.getByText(/เกิดจากตอนที่\s*3/)).toBeInTheDocument();
    // Localized drift reason (VD_ARC_BEATS_CONSUMED_EARLY).
    expect(screen.getByText(/ตอนนี้ใช้บีตเนื้อเรื่องที่วางแผนไว้สำหรับตอนถัดไปล่วงหน้า/)).toBeInTheDocument();
    // Old vs new breakdown diff, screen-reader labeled "แผนเดิม"/"แผนใหม่".
    expect(screen.getByText("Old EP4 title")).toBeInTheDocument();
    expect(screen.getByText("New EP4 title")).toBeInTheDocument();
    expect(screen.getByText("แผนเดิม")).toBeInTheDocument();
    expect(screen.getByText("แผนใหม่")).toBeInTheDocument();
    // Rationale.
    expect(screen.getByText(proposalPayload.rationale)).toBeInTheDocument();
    // Actions.
    expect(screen.getByRole("button", { name: /อนุมัติแผนใหม่/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /คงแผนเดิม/ })).toBeInTheDocument();
  });

  it("hides approve/reject actions when readOnly", () => {
    mockQueries([proposalEvent()]);
    render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={true} />);
    expect(screen.queryByRole("button", { name: /อนุมัติแผนใหม่/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /คงแผนเดิม/ })).not.toBeInTheDocument();
  });

  it("approve calls approveArcReplanProposal with {seriesId, proposalEventId}, toasts, and invalidates both queries", () => {
    mockQueries([proposalEvent()]);
    render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);

    fireEvent.click(screen.getByRole("button", { name: /อนุมัติแผนใหม่/ }));

    expect(mockApproveMutate).toHaveBeenCalledWith({ seriesId: "10", proposalEventId: "501" });
    expect(toast.success).toHaveBeenCalled();
    expect(mockInvalidateEvents).toHaveBeenCalledWith({ seriesId: "10" });
    expect(mockInvalidateSeriesGet).toHaveBeenCalledWith({ seriesId: "10" });
  });

  it("reject calls rejectArcReplanProposal with {seriesId, proposalEventId} and toasts", () => {
    mockQueries([proposalEvent()]);
    render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);

    fireEvent.click(screen.getByRole("button", { name: /คงแผนเดิม/ }));

    expect(mockRejectMutate).toHaveBeenCalledWith({ seriesId: "10", proposalEventId: "501" });
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows an error toast when approve fails", () => {
    approveShouldFail = true;
    mockQueries([proposalEvent()]);
    render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);
    fireEvent.click(screen.getByRole("button", { name: /อนุมัติแผนใหม่/ }));
    expect(toast.error).toHaveBeenCalledWith("boom");
  });

  it("renders an APPROVED badge and hides actions once a later arc_replan_applied event resolves it", () => {
    mockQueries([
      proposalEvent(),
      {
        memoryEventId: "502",
        seriesId: "10",
        memoryKind: "arc_replan_applied",
        payload: { arcReplanApprovalOf: "501", proposalId: "prop-1" },
        createdAt: "2026-07-07T01:00:00.000Z",
      },
    ]);
    render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);
    expect(screen.getByText(/อนุมัติแล้ว/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /อนุมัติแผนใหม่/ })).not.toBeInTheDocument();
  });

  it("renders a REJECTED badge and only one proposal card when a rejection-marker event resolves it", () => {
    mockQueries([
      proposalEvent(),
      {
        memoryEventId: "503",
        seriesId: "10",
        memoryKind: "arc_replan_proposal",
        payload: { arcReplanRejectionOf: "501", decision: "rejected" },
        createdAt: "2026-07-07T01:00:00.000Z",
      },
    ]);
    render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);
    expect(screen.getByText(/ปฏิเสธแล้ว/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /อนุมัติแผนใหม่/ })).not.toBeInTheDocument();
    // Only the genuine proposal renders a card — the rejection-marker event
    // (same memoryKind) must be filtered out, not rendered as a second item.
    expect(screen.getAllByText(/ตอนที่ได้รับผลกระทบ/)).toHaveLength(1);
  });

  it("shows a loading placeholder on the old-plan side while the series bible is still loading, not a false 'no plan' message", () => {
    mockListMemoryEventsQuery.mockReturnValue({ data: { events: [proposalEvent()] }, isLoading: false, isError: false });
    mockSeriesGetQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);
    expect(screen.queryByText("ยังไม่มีแผนเดิมสำหรับตอนนี้")).not.toBeInTheDocument();
  });

  describe("VD_ARC_TIE_IN_DEFERRED branch (task #31, spec §7.7.3)", () => {
    function tieInDeferredEvent() {
      return proposalEvent({
        triggeredByEpisodeNumber: 3,
        driftReasons: ["VD_ARC_TIE_IN_DEFERRED"],
        affectedEpisodeNumbers: [3, 4],
        proposedBreakdown: [
          { episodeNumber: 3, workingTitle: "Old EP4 title", logline: "Old logline", keyBeats: ["old beat 1"], tieIn: { planned: false, source: "planned" } },
          {
            episodeNumber: 4,
            workingTitle: "New EP4 title",
            logline: "New logline",
            keyBeats: ["new beat 1"],
            tieIn: { planned: true, source: "deferred", movedFromEpisodeNumber: 3 },
          },
        ],
        rationale: "เลื่อนตำแหน่งสินค้าจากตอนที่ 3 ไปตอนที่ 4",
      });
    }

    it("renders the compact 'moved product' kicker instead of the generic drift kicker", () => {
      mockQueries([tieInDeferredEvent()]);
      render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);

      expect(screen.getByText("ข้อเสนอย้ายสินค้า: ตอน 3 → ตอน 4")).toBeInTheDocument();
      expect(screen.queryByText(/ตอนนี้ใช้เนื้อเรื่องล่วงหน้า/)).not.toBeInTheDocument();
    });

    it("renders a compact gains/loses placement diff instead of the full breakdown diff", () => {
      mockQueries([tieInDeferredEvent()]);
      render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);

      expect(screen.getByTestId("vd-arc-replan-tie-in-diff")).toBeInTheDocument();
      expect(screen.getByText("เสียตำแหน่งสินค้า (ย้ายออก)")).toBeInTheDocument();
      expect(screen.getByText("ได้รับตำแหน่งสินค้า")).toBeInTheDocument();
      // The full old/new logline diff (used by non-tie-in proposals) is NOT rendered.
      expect(screen.queryByText("Old EP4 title")).not.toBeInTheDocument();
      expect(screen.queryByText("New EP4 title")).not.toBeInTheDocument();
    });

    it("still shows the localized drift-reason code and approve/reject actions", () => {
      mockQueries([tieInDeferredEvent()]);
      render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);

      expect(screen.getByText(/ย้ายตำแหน่งสินค้าไปตอนอื่นตามคำขอเลื่อนสินค้า/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /อนุมัติแผนใหม่/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /คงแผนเดิม/ })).toBeInTheDocument();
    });

    it("falls back to the generic kicker/diff when driftReasons claims VD_ARC_TIE_IN_DEFERRED but no item carries source: deferred (malformed)", () => {
      mockQueries([
        proposalEvent({
          driftReasons: ["VD_ARC_TIE_IN_DEFERRED"],
          affectedEpisodeNumbers: [4],
          proposedBreakdown: [
            { episodeNumber: 4, workingTitle: "New EP4 title", logline: "New logline", keyBeats: ["new beat 1"] },
          ],
        }),
      ]);
      render(<VerticalDramaArcReplanCard lang="th" seriesId="10" readOnly={false} />);

      expect(screen.getByText(/ตอนนี้ใช้เนื้อเรื่องล่วงหน้า/)).toBeInTheDocument();
      expect(screen.getByText("New EP4 title")).toBeInTheDocument();
    });
  });
});
