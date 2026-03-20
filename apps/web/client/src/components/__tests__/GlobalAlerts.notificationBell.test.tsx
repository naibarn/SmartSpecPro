import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import React from "react";

// Mutable mock data that tests can change
let notificationCountData = { count: 3 };
let notificationsData: any[] = [];

vi.mock("@/lib/trpc", () => ({
  trpc: {
    follows: {
      getUrgentMessages: { useQuery: () => ({ data: [] }) },
    },
    scheduledMessages: {
      getNotificationCount: { useQuery: () => ({ data: notificationCountData }) },
      getNotifications: { useQuery: () => ({ data: notificationsData }) },
      getUrgentReminders: { useQuery: () => ({ data: [] }) },
      markAllRead: { useMutation: () => ({ mutate: vi.fn(), isLoading: false }) },
      markRead: { useMutation: () => ({ mutate: vi.fn(), isLoading: false }) },
    },
    useUtils: () => ({
      scheduledMessages: {
        getNotificationCount: { invalidate: vi.fn() },
        getNotifications: { invalidate: vi.fn() },
        getUrgentReminders: { invalidate: vi.fn() },
      },
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 1 } }),
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

// Mock EventSource
(globalThis as any).EventSource = class {
  addEventListener() {}
  close() {}
  set onerror(_: any) {}
};

import { GlobalAlerts } from "../GlobalAlerts";

describe("GlobalNotificationBell occurrence badge", () => {
  beforeEach(() => {
    cleanup();
    notificationCountData = { count: 3 };
    notificationsData = [];
  });

  it("renders occurrence badge (xN) when occurrenceCount > 1", async () => {
    notificationsData = [
      {
        id: 1,
        title: "Job failed",
        content: "Error in pipeline",
        isRead: false,
        priority: "high",
        createdAt: new Date().toISOString(),
        occurrenceCount: 5,
      },
    ];

    render(<GlobalAlerts />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/unread notification/i));
    });

    expect(screen.getByText("x5")).toBeTruthy();
  });

  it("does NOT render occurrence badge when occurrenceCount is 1", async () => {
    notificationsData = [
      {
        id: 2,
        title: "Single event",
        content: "Just once",
        isRead: false,
        priority: "normal",
        createdAt: new Date().toISOString(),
        occurrenceCount: 1,
      },
    ];

    render(<GlobalAlerts />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/unread notification/i));
    });

    expect(screen.queryByText("x1")).toBeNull();
  });

  it("shows 'Latest:' prefix for grouped notification content", async () => {
    notificationsData = [
      {
        id: 3,
        title: "Grouped alert",
        content: "Job failed",
        isRead: false,
        priority: "high",
        createdAt: new Date().toISOString(),
        occurrenceCount: 3,
      },
    ];

    render(<GlobalAlerts />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/unread notification/i));
    });

    expect(screen.getByText("Latest: Job failed")).toBeTruthy();
  });
});
