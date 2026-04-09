import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => {
  const noopInvalidate = vi.fn();
  return {
    mockUseAuth: vi.fn(),
    mockGetEntityMemoriesQuery: vi.fn(),
    mockScopedMemoryListQuery: vi.fn(),
    mockGetConversationQuery: vi.fn(),
    mockGetSummariesQuery: vi.fn(),
    mockUpsertMemoryMutate: vi.fn(),
    mockDeleteMemoryMutate: vi.fn(),
    mockScopedDeleteMutate: vi.fn(),
    mockScopedUpdateMutate: vi.fn(),
    mockScopedUpdateMutateAsync: vi.fn(),
    mockScopedBulkDeleteMutateAsync: vi.fn(),
    mockDeleteSummaryMutate: vi.fn(),
    mockUpdateConversationMutate: vi.fn(),
    mockCompactMutate: vi.fn(),
    mockClearOldMutate: vi.fn(),
    mockSearchMemoryContextRefetch: vi.fn(),
    mockUseUtils: vi.fn(() => ({
      memory: {
        getEntityMemories: { invalidate: noopInvalidate },
        getSummaries: { invalidate: noopInvalidate },
        getConversationSummary: { fetch: vi.fn() },
      },
      scopedMemory: {
        list: { invalidate: noopInvalidate },
      },
      chat: {
        getConversation: { invalidate: noopInvalidate },
      },
    })),
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: mocks.mockUseAuth,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mocks.mockUseUtils,
    chat: {
      getConversation: { useQuery: mocks.mockGetConversationQuery },
      updateConversation: { useMutation: vi.fn(() => ({ mutate: mocks.mockUpdateConversationMutate, isPending: false })) },
    },
    memory: {
      getEntityMemories: { useQuery: mocks.mockGetEntityMemoriesQuery },
      getSummaries: { useQuery: mocks.mockGetSummariesQuery },
      deleteSummary: { useMutation: vi.fn(() => ({ mutate: mocks.mockDeleteSummaryMutate, isPending: false })) },
      upsertEntityMemory: { useMutation: vi.fn(() => ({ mutate: mocks.mockUpsertMemoryMutate, isPending: false })) },
      deleteEntityMemory: { useMutation: vi.fn(() => ({ mutate: mocks.mockDeleteMemoryMutate, isPending: false })) },
      compactConversation: { useMutation: vi.fn(() => ({ mutateAsync: mocks.mockCompactMutate, isPending: false })) },
      clearOldMemories: { useMutation: vi.fn(() => ({ mutateAsync: mocks.mockClearOldMutate, isPending: false })) },
      searchMemoryContext: {
        useQuery: vi.fn(() => ({
          data: null,
          refetch: mocks.mockSearchMemoryContextRefetch,
          isFetching: false,
        })),
      },
    },
    scopedMemory: {
      list: { useQuery: mocks.mockScopedMemoryListQuery },
      delete: { useMutation: vi.fn(() => ({ mutate: mocks.mockScopedDeleteMutate, isPending: false })) },
      bulkDelete: { useMutation: vi.fn(() => ({ mutateAsync: mocks.mockScopedBulkDeleteMutateAsync, isPending: false })) },
      update: { useMutation: vi.fn(() => ({ mutate: mocks.mockScopedUpdateMutate, mutateAsync: mocks.mockScopedUpdateMutateAsync, isPending: false })) },
    },
  },
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      switch (key) {
        case "memory.title":
          return "Memory";
        case "memory.addMemory":
          return "Add Memory";
        case "memory.addMemoryDesc":
          return "Add memory";
        case "memory.typeLabel":
          return "Type";
        case "memory.nameLabel":
          return "Name";
        case "memory.namePlaceholder":
          return "Name";
        case "memory.contentLabel":
          return "Content";
        case "memory.contentPlaceholder":
          return "Content";
        case "memory.importanceLabel":
          return `Importance ${params?.value ?? ""}`;
        case "memory.importanceLow":
          return "Low";
        case "memory.importanceHigh":
          return "High";
        case "memory.projectNotSet":
          return "Project not set";
        default:
          return key;
      }
    },
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

import { MemoryPanel } from "../MemoryPanel";

const entityMemories = [
  {
    id: 1,
    entityType: "rule",
    entityName: "Legacy Rule",
    facts: ["Always verify dates"],
    importance: 10,
    reinforcementCount: 4,
    source: "manual",
    lastAccessedAt: "2025-03-02T00:00:00.000Z",
    createdAt: "2025-03-01T00:00:00.000Z",
  },
  {
    id: 2,
    entityType: "preference",
    entityName: "Legacy Preference",
    facts: ["Likes concise answers"],
    importance: 5,
    reinforcementCount: 1,
    source: "auto",
    lastAccessedAt: "2025-03-01T00:00:00.000Z",
    createdAt: "2025-02-28T00:00:00.000Z",
  },
];

const scopedMemories = [
  {
    id: "scoped-1",
    ownerType: "user",
    ownerId: "1",
    memoryKind: "fact",
    title: "Scoped Fact",
    content: "Use npm for app tests",
    importance: 7,
    reinforcementCount: 2,
    sourceType: "manual",
    lastAccessedAt: "2025-03-03T00:00:00.000Z",
    createdAt: "2025-03-03T00:00:00.000Z",
  },
];

const summaries = [
  {
    id: 11,
    summary: "We discussed using npm and keeping summary data in memory.",
    messageRangeStart: 1,
    messageRangeEnd: 6,
    messageCount: 6,
    tokensUsed: 120,
    skippedRiskyCount: 2,
    extractedFactIds: ["fact-1"],
    hasRawArchive: true,
    classificationStats: { safe: 4, risky: 2 },
    createdAt: "2025-03-04T00:00:00.000Z",
  },
  {
    id: 12,
    summary: "Simple manual compact summary.",
    messageRangeStart: 7,
    messageRangeEnd: 10,
    messageCount: 4,
    tokensUsed: 60,
    skippedRiskyCount: 0,
    extractedFactIds: [],
    hasRawArchive: false,
    classificationStats: null,
    createdAt: "2025-03-05T00:00:00.000Z",
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockUseAuth.mockReturnValue({ user: { id: 1 } });
  mocks.mockGetConversationQuery.mockReturnValue({
    data: { projectId: "project-1", memoryMode: "full" },
    isLoading: false,
  });
  mocks.mockGetEntityMemoriesQuery.mockReturnValue({
    data: entityMemories,
    isLoading: false,
  });
  mocks.mockScopedMemoryListQuery.mockReturnValue({
    data: scopedMemories,
    isLoading: false,
  });
  mocks.mockScopedBulkDeleteMutateAsync.mockResolvedValue({ success: true, deletedCount: 1 });
  mocks.mockScopedUpdateMutateAsync.mockResolvedValue({ success: true });
  mocks.mockSearchMemoryContextRefetch.mockResolvedValue({
    data: {
      l1Results: [
        {
          memory: {
            id: "m-1",
            title: "Search Result Fact",
            content: "Use npm test before release.",
            memoryKind: "fact",
            sourceType: "manual",
          },
          score: 0.91,
          matchType: "hybrid",
        },
      ],
      l2Results: [
        {
          chunk: {
            id: "c-1",
            content: "Remember to run npm test before merging.",
            tokenCount: 12,
          },
          score: 0.77,
          matchType: "keyword",
        },
      ],
      l1Count: 1,
      l2Triggered: true,
    },
  });
  mocks.mockGetSummariesQuery.mockReturnValue({
    data: summaries,
    isLoading: false,
  });
});

describe("MemoryPanel", () => {
  it("renders merged entity and scoped memories with badges", () => {
    const { container } = render(<MemoryPanel conversationId={123} />);

    expect(screen.getByText("Legacy Rule")).toBeTruthy();
    expect(screen.getByText("Scoped Fact")).toBeTruthy();
    expect(screen.getAllByText("manual").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Always Active")).toBeTruthy();
    expect(screen.getByText("Summaries (2)")).toBeTruthy();
    expect(screen.getAllByText("smart summarize").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("manual compact").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("2 risky skipped")).toBeTruthy();
    expect(screen.getByText("raw archive")).toBeTruthy();

    const cards = container.querySelectorAll(".group.rounded-lg.border.p-3");
    expect(cards.length).toBeGreaterThanOrEqual(2);
    expect(cards[0]?.textContent).toContain("Legacy Rule");
  });

  it("locks the project selector for personal conversations", () => {
    mocks.mockGetConversationQuery.mockReturnValue({
      data: { projectId: "personal", memoryMode: "full" },
      isLoading: false,
    });

    render(<MemoryPanel conversationId={123} />);

    expect(screen.getByTitle("Personal scope is locked to this user")).toBeTruthy();
    expect(screen.getByText(/personal scope is locked to this user/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Edit$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /new chat in/i })).toBeNull();
  });

  it("opens the scoped edit dialog prefilled and saves changes", () => {
    render(<MemoryPanel conversationId={123} />);

    fireEvent.click(screen.getByTitle("Edit scoped memory"));

    expect(screen.getByText("Edit Scoped Memory")).toBeTruthy();
    expect(screen.getByDisplayValue("Scoped Fact")).toBeTruthy();
    expect(screen.getByDisplayValue("Use npm for app tests")).toBeTruthy();

    fireEvent.change(screen.getByDisplayValue("Scoped Fact"), { target: { value: "Scoped Fact Updated" } });
    fireEvent.change(screen.getByDisplayValue("Use npm for app tests"), { target: { value: "Use npm and vitest" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(mocks.mockScopedUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryId: "scoped-1",
        title: "Scoped Fact Updated",
        content: "Use npm and vitest",
        importance: 7,
      }),
      expect.any(Object),
    );
  });

  it("bumps and lowers scoped importance within bounds", () => {
    render(<MemoryPanel conversationId={123} />);

    fireEvent.click(screen.getByTitle("Increase importance"));
    expect(mocks.mockScopedUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryId: "scoped-1",
        importance: 8,
      }),
    );

    fireEvent.click(screen.getByTitle("Decrease importance"));
    expect(mocks.mockScopedUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        memoryId: "scoped-1",
        importance: 6,
      }),
    );
  });

  it("deletes scoped memories with the scoped delete mutation", () => {
    render(<MemoryPanel conversationId={123} />);

    fireEvent.click(screen.getByTitle("Delete scoped memory"));

    expect(mocks.mockScopedDeleteMutate).toHaveBeenCalledWith({
      memoryId: "scoped-1",
    });
  });

  it("deletes summaries through the summary deletion flow", () => {
    render(<MemoryPanel conversationId={123} />);

    fireEvent.click(screen.getAllByTitle("Delete summary")[0]);
    expect(screen.getByText("Delete summary?")).toBeTruthy();

    fireEvent.click(screen.getAllByRole("button", { name: /^Delete$/i })[0]);

    expect(mocks.mockDeleteSummaryMutate).toHaveBeenCalledWith({
      conversationId: 123,
      summaryId: 11,
    });
  });

  it("bulk deletes selected scoped memories", async () => {
    render(<MemoryPanel conversationId={123} />);

    fireEvent.click(screen.getByRole("button", { name: /select scoped/i }));
    fireEvent.click(screen.getByRole("button", { name: /select all visible/i }));
    fireEvent.click(screen.getByRole("button", { name: /delete selected \(1\)/i }));

    await waitFor(() => {
      expect(mocks.mockScopedBulkDeleteMutateAsync).toHaveBeenCalledWith({
        memoryIds: ["scoped-1"],
      });
      expect(screen.queryByRole("button", { name: /delete selected \(1\)/i })).toBeNull();
    });
  });

  it("bulk promotes selected scoped memories", async () => {
    render(<MemoryPanel conversationId={123} />);

    fireEvent.click(screen.getByRole("button", { name: /select scoped/i }));
    fireEvent.click(screen.getByRole("button", { name: /select all visible/i }));
    fireEvent.click(screen.getByRole("button", { name: /promote selected/i }));

    await waitFor(() => {
      expect(mocks.mockScopedUpdateMutateAsync).toHaveBeenCalledWith({
        memoryId: "scoped-1",
        importance: 8,
      });
    });
  });

  it("bulk promotes all visible scoped memories", async () => {
    render(<MemoryPanel conversationId={123} />);

    fireEvent.click(screen.getByRole("button", { name: /select scoped/i }));
    fireEvent.click(screen.getByRole("button", { name: /promote all visible/i }));

    await waitFor(() => {
      expect(mocks.mockScopedUpdateMutateAsync).toHaveBeenCalledWith({
        memoryId: "scoped-1",
        importance: 8,
      });
    });
  });

  it("bulk demotes all visible scoped memories", async () => {
    render(<MemoryPanel conversationId={123} />);

    fireEvent.click(screen.getByRole("button", { name: /select scoped/i }));
    fireEvent.click(screen.getByRole("button", { name: /demote all visible/i }));

    await waitFor(() => {
      expect(mocks.mockScopedUpdateMutateAsync).toHaveBeenCalledWith({
        memoryId: "scoped-1",
        importance: 6,
      });
    });
  });

  it("searches memory context from the chat panel", async () => {
    render(<MemoryPanel conversationId={123} />);

    fireEvent.change(screen.getByPlaceholderText(/search memories or recent chat chunks/i), {
      target: { value: "npm test" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^search$/i }));

    await waitFor(() => {
      expect(mocks.mockSearchMemoryContextRefetch).toHaveBeenCalled();
    });

    expect(await screen.findByText("Search Result Fact")).toBeTruthy();
    expect(screen.getByText("Remember to run npm test before merging.")).toBeTruthy();
    expect(screen.getByText(/l2 keyword/i)).toBeTruthy();
  });
});
