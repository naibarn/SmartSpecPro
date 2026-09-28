import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VerticalDramaRelationshipGraphPanel } from "../VerticalDramaRelationshipGraphPanel";

const { useQuery, usePathQuery } = vi.hoisted(() => ({
  useQuery: vi.fn(() => ({
    data: {
      graphRevisionId: "g1",
      episodeNumber: 119,
      nodes: [{ characterKey: "mina" }, { characterKey: "ethan" }],
      edges: [
        {
          edgeId: "e1",
          fromCharacterKey: "mina",
          toCharacterKey: "ethan",
          relationType: "spouse",
          familySide: "none",
          disclosure: "public",
          validFromEpisode: 1,
          validToEpisode: null,
        },
      ],
      familyGroups: [],
      nextCursor: "offset:1",
      pageSize: 100,
      truncated: true,
      redacted: true,
      redactedEdgeCount: 1,
      redactedEvidenceCount: 0,
      redactionPolicyVersion: "v1",
      redactionPolicyFingerprint: "fp",
      findingIds: ["relationship-edge-redacted"],
    },
    isLoading: false,
    error: null,
  })),
  usePathQuery: vi.fn(() => ({ data: null, isLoading: false, error: null })),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    verticalDramaSeries: {
      getCharacterRelationshipGraph: { useQuery },
      getCharacterRelationshipPath: { useQuery: usePathQuery },
    },
  },
}));

describe("VerticalDramaRelationshipGraphPanel", () => {
  it("shows bounded redacted graph state and requests the next cursor", () => {
    render(
      <VerticalDramaRelationshipGraphPanel
        lang="th"
        seriesId="1"
        graphRevisionId="g1"
        episodeNumber={119}
      />
    );
    expect(
      screen.getByTestId("vd-relationship-graph-panel")
    ).toBeInTheDocument();
    expect(screen.getByText(/ปิดบัง 1 รายการ/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "โหลดหน้าถัดไป" }));
    expect(useQuery).toHaveBeenCalled();
  });

  it("shows a bounded pair path when both characters are selected", () => {
    usePathQuery.mockReturnValue({
      data: {
        kind: "derived",
        paths: [
          {
            characterKeys: ["mina", "ethan"],
            sourceEdgeIds: ["e1"],
          },
        ],
        truncated: false,
      },
      isLoading: false,
      error: null,
    });

    render(
      <VerticalDramaRelationshipGraphPanel
        lang="th"
        seriesId="1"
        graphRevisionId="g1"
      />
    );
    fireEvent.change(screen.getByLabelText("จากตัวละคร"), {
      target: { value: "mina" },
    });
    fireEvent.change(screen.getByLabelText("ถึงตัวละคร"), {
      target: { value: "ethan" },
    });

    expect(screen.getAllByText(/mina → ethan/).length).toBeGreaterThanOrEqual(
      2
    );
    expect(screen.getByText(/หลักฐาน: e1/)).toBeInTheDocument();
  });

  it("sends timeline and relationship-state filters to the bounded query", () => {
    useQuery.mockClear();
    render(
      <VerticalDramaRelationshipGraphPanel
        lang="th"
        seriesId="1"
        graphRevisionId="g1"
      />
    );
    fireEvent.change(screen.getByLabelText("ดู ณ ตอน"), {
      target: { value: "12" },
    });
    fireEvent.change(screen.getByLabelText("สถานะ"), {
      target: { value: "active" },
    });
    fireEvent.change(screen.getByLabelText("การเปิดเผย"), {
      target: { value: "public" },
    });

    const lastInput = useQuery.mock.calls.at(-1)?.[0];
    expect(lastInput).toMatchObject({
      episodeNumber: 12,
      statuses: ["active"],
      disclosure: ["public"],
      pageSize: 100,
    });
  });
});
