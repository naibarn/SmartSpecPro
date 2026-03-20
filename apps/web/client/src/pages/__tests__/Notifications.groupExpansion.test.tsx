import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";

// Mock data
const mockNotifications = [
  {
    id: 10,
    title: "Pipeline failed",
    content: "Error in stage 3",
    isRead: false,
    priority: "high",
    type: "alert",
    createdAt: "2026-03-20T11:30:00Z",
    occurrenceCount: 7,
    firstOccurredAt: "2026-03-20T10:00:00Z",
    lastOccurredAt: "2026-03-20T11:30:00Z",
    groupKey: "pipeline-stage3",
  },
  {
    id: 11,
    title: "Single notification",
    content: "Just one",
    isRead: true,
    priority: "normal",
    type: "system",
    createdAt: "2026-03-20T09:00:00Z",
    occurrenceCount: 1,
  },
];

const mockOccurrences = [
  { id: 101, content: "Error at 10:00", metadata: null, occurredAt: "2026-03-20T10:00:00Z" },
  { id: 102, content: "Error at 10:30", metadata: null, occurredAt: "2026-03-20T10:30:00Z" },
  { id: 103, content: "Error at 11:00", metadata: { source: "celery" }, occurredAt: "2026-03-20T11:00:00Z" },
];

const mockMutate = vi.fn();
const mockInvalidate = vi.fn();
const mockGetGroupOccurrences = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    scheduledMessages: {
      getNotificationHistory: {
        useQuery: () => ({
          data: { items: mockNotifications, total: 2 },
          isLoading: false,
        }),
      },
      getNotificationCount: {
        useQuery: () => ({ data: { count: 1 } }),
      },
      getGroupOccurrences: {
        useQuery: (...args: any[]) => mockGetGroupOccurrences(...args),
      },
      markRead: {
        useMutation: () => ({ mutate: mockMutate }),
      },
      markAllRead: {
        useMutation: () => ({ mutate: mockMutate }),
      },
      dismissNotification: {
        useMutation: () => ({ mutate: mockMutate }),
      },
    },
    useUtils: () => ({
      scheduledMessages: {
        getNotificationHistory: { invalidate: mockInvalidate },
        getNotificationCount: { invalidate: mockInvalidate },
      },
    }),
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/notifications", vi.fn()],
}));

describe("Notifications group expansion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetGroupOccurrences.mockReturnValue({
      data: mockOccurrences,
      isLoading: false,
    });
  });

  it("renders occurrence badge (xN) in notification list when occurrenceCount > 1", async () => {
    const Notifications = (await import("../../pages/Notifications")).default;
    render(<Notifications />);

    expect(screen.getByText("x7")).toBeTruthy();
    expect(screen.queryByText("x1")).toBeNull();
  });

  it("calls getGroupOccurrences and renders sub-items when expanded", async () => {
    const Notifications = (await import("../../pages/Notifications")).default;
    render(<Notifications />);

    const expandBtn = screen.getByText(/Expand group/i);
    fireEvent.click(expandBtn);

    // Verify the query was called with correct args
    expect(mockGetGroupOccurrences).toHaveBeenCalledWith(
      { notificationId: 10, limit: 10 },
      expect.any(Object)
    );

    await waitFor(() => {
      expect(screen.getByText("Error at 10:00")).toBeTruthy();
      expect(screen.getByText("Error at 10:30")).toBeTruthy();
      expect(screen.getByText("Error at 11:00")).toBeTruthy();
    });
  });

  it("shows group info in detail panel when notification selected", async () => {
    const Notifications = (await import("../../pages/Notifications")).default;
    render(<Notifications />);

    // Click the notification with occurrenceCount=7
    const notifItem = screen.getByText("Pipeline failed");
    fireEvent.click(notifItem);

    await waitFor(() => {
      expect(screen.getByText(/7 occurrences/)).toBeTruthy();
      // Verify firstOccurredAt and lastOccurredAt are rendered
      expect(screen.getByText(/First:/)).toBeTruthy();
      expect(screen.getByText(/Last:/)).toBeTruthy();
    });
  });

  it("shows empty state when no occurrences exist", async () => {
    mockGetGroupOccurrences.mockReturnValue({
      data: [],
      isLoading: false,
    });

    const Notifications = (await import("../../pages/Notifications")).default;
    render(<Notifications />);

    const expandBtn = screen.getByText(/Expand group/i);
    fireEvent.click(expandBtn);

    await waitFor(() => {
      expect(screen.getByText(/No individual occurrences/i)).toBeTruthy();
    });
  });

  it("toggles group expansion on/off", async () => {
    const Notifications = (await import("../../pages/Notifications")).default;
    render(<Notifications />);

    const expandBtn = screen.getByText(/Expand group/i);

    // Expand
    fireEvent.click(expandBtn);
    await waitFor(() => {
      expect(screen.getByText("Error at 10:00")).toBeTruthy();
    });

    // Collapse — click button again (now shows "Collapse")
    const collapseBtn = screen.getByText(/Collapse/i);
    fireEvent.click(collapseBtn);

    await waitFor(() => {
      expect(screen.queryByText("Error at 10:00")).toBeNull();
    });
  });
});
