/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useRouteMock = vi.fn();
const detailMock = vi.fn();
const replayMock = vi.fn();
const simulateMock = vi.fn();
const invalidateMock = vi.fn();

vi.mock("wouter", () => ({
  useRoute: (...args: unknown[]) => useRouteMock(...args),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      workpack: {
        getDetail: { invalidate: invalidateMock },
        replay: { invalidate: invalidateMock },
        readiness: { invalidate: invalidateMock },
      },
    }),
    workpack: {
      getDetail: { useQuery: (...args: unknown[]) => detailMock(...args) },
      replay: { useQuery: (...args: unknown[]) => replayMock(...args) },
      simulate: { useMutation: (...args: unknown[]) => simulateMock(...args) },
    },
  },
}));

import WorkpackReplayLab from "../WorkpackReplayLab";

describe("WorkpackReplayLab", () => {
  beforeEach(() => {
    useRouteMock.mockReturnValue([true, { workpackId: "wp_1" }]);
    detailMock.mockReturnValue({
      data: {
        workpack: {
          id: "wp_1",
          title: "Replay Workpack",
          lifecycleState: "needs_review",
          autonomyMode: "draft",
          promotionState: "blocked",
        },
        runs: [],
        simulations: [],
      },
      isLoading: false,
    });
    replayMock.mockReturnValue({
      data: {
        gateStatus: "blocked",
        nextAction: "Inspect connector drift",
        diffs: [
          {
            category: "connector_auth_mismatch",
            severity: "high",
            summary: "Connector scope drifted",
            remediationPointer: "/workpacks/wp_1/connectors",
          },
        ],
      },
      isLoading: false,
    });
    simulateMock.mockReturnValue({ mutate: vi.fn(), isPending: false });
  });

  it("renders replay diffs and remediation paths", () => {
    render(<WorkpackReplayLab />);

    expect(screen.getByText("Replay Diffs")).toBeInTheDocument();
    expect(screen.getByText(/connector scope drifted/i)).toBeInTheDocument();
    expect(screen.getAllByText(/inspect connector drift/i).length).toBeGreaterThan(0);
  });
});
