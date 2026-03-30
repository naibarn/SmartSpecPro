/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createElement } from "react";

const mockMutate = vi.fn();
const mockRefetch = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    agency: {
      listAgentMemories: {
        useQuery: vi.fn(() => ({
          data: {
            items: [
              {
                id: 1,
                memoryType: "fact",
                content: "User prefers JSON output",
                confidence: "0.900",
                useCount: 3,
                lastUsedAt: "2026-03-20T10:00:00Z",
              },
              {
                id: 2,
                memoryType: "constraint",
                content: "Rate limit is 10/min",
                confidence: "0.800",
                useCount: 1,
                lastUsedAt: null,
              },
            ],
            total: 2,
            page: 1,
          },
          isLoading: false,
          refetch: mockRefetch,
        })),
      },
      deleteAgentMemory: {
        useMutation: () => ({
          mutate: mockMutate,
          isPending: false,
        }),
      },
      resetAgentMemories: {
        useMutation: () => ({
          mutate: mockMutate,
          isPending: false,
        }),
      },
    },
  },
}));

import { MemoryViewer } from "../MemoryViewer";

describe("MemoryViewer", () => {
  beforeEach(() => {
    mockMutate.mockClear();
    mockRefetch.mockClear();
  });

  function renderViewer(props: Partial<Parameters<typeof MemoryViewer>[0]> = {}) {
    return render(
      createElement(MemoryViewer, {
        agencyId: "agency-1",
        agentNodeId: "node-1",
        userId: 42,
        isAdmin: false,
        ...props,
      }),
    );
  }

  it("renders memory list with type badges", () => {
    renderViewer();
    expect(screen.getByText("fact")).toBeTruthy();
    expect(screen.getByText("constraint")).toBeTruthy();
    expect(screen.getByText("User prefers JSON output")).toBeTruthy();
    expect(screen.getByText("Rate limit is 10/min")).toBeTruthy();
  });

  it("renders use count for each memory", () => {
    renderViewer();
    expect(screen.getByText("Used 3x")).toBeTruthy();
    expect(screen.getByText("Used 1x")).toBeTruthy();
  });

  it("delete button calls deleteAgentMemory mutation", () => {
    renderViewer();
    const deleteBtn = screen.getByTestId("delete-memory-1");
    fireEvent.click(deleteBtn);
    expect(mockMutate).toHaveBeenCalledWith({ memoryId: 1 });
  });

  it("shows confirmation dialog before reset", () => {
    renderViewer();
    const resetBtn = screen.getByText("Reset All");
    fireEvent.click(resetBtn);
    expect(
      screen.getByText(/Are you sure you want to reset all memories/),
    ).toBeTruthy();
  });

  it("reset confirmation calls resetAgentMemories mutation", () => {
    renderViewer();
    const resetBtn = screen.getByText("Reset All");
    fireEvent.click(resetBtn);
    const confirmBtn = screen.getByText("Confirm Reset");
    fireEvent.click(confirmBtn);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ agencyId: "agency-1", agentNodeId: "node-1" }),
    );
  });

  it("shows empty state when no memories", async () => {
    // Re-mock with empty data for this test
    const { trpc } = await import("@/lib/trpc");
    (trpc.agency.listAgentMemories.useQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      data: { items: [], total: 0, page: 1 },
      isLoading: false,
      refetch: mockRefetch,
    });

    render(
      createElement(MemoryViewer, {
        agencyId: "agency-1",
        agentNodeId: "node-1",
        userId: 42,
      }),
    );

    expect(screen.getByText("No memories recorded yet")).toBeTruthy();
  });
});
