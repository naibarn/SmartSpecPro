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
    localStorage.clear();
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

  it("opens a notification detail panel when clicking a generic alert", async () => {
    notificationsData = [
      {
        id: 4,
        title: "Generic alert",
        content: "Something happened",
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

    fireEvent.click(screen.getByText("Generic alert"));

    expect(screen.getByRole("button", { name: /back/i })).toBeTruthy();
  });

  it("keeps the bell visible even when unread count is zero", () => {
    notificationCountData = { count: 0 };

    render(<GlobalAlerts />);

    expect(screen.getByLabelText(/0 unread notification/i)).toBeTruthy();
  });

  it("shows a history CTA when unread count is zero", async () => {
    notificationCountData = { count: 0 };
    notificationsData = [
      {
        id: 5,
        title: "Old read item",
        content: "Archived event",
        isRead: true,
        priority: "low",
        createdAt: new Date().toISOString(),
        occurrenceCount: 1,
      },
    ];

    render(<GlobalAlerts />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/0 unread notification/i));
    });

    expect(
      screen.getByText(/No unread alerts, but 1 recent item available/i)
    ).toBeTruthy();
    expect(screen.getByText("ดูย้อนหลัง")).toBeTruthy();
  });

  it("shows a no-history message when there are no notifications at all", async () => {
    notificationCountData = { count: 0 };
    notificationsData = [];

    render(<GlobalAlerts />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/0 unread notification/i));
    });

    expect(screen.getByText("No notifications yet")).toBeTruthy();
  });

  it("moves the bell when dragged", async () => {
    notificationCountData = { count: 2 };
    notificationsData = [];

    render(<GlobalAlerts />);

    const bellRoot = screen.getByTestId("global-notification-bell");
    const bellButton = screen.getByLabelText(/unread notification/i);
    const startLeft = Number.parseFloat(bellRoot.style.left);
    const startTop = Number.parseFloat(bellRoot.style.top);

    await act(async () => {
      fireEvent.pointerDown(bellButton, {
        pointerId: 1,
        clientX: startLeft + 8,
        clientY: startTop + 8,
        buttons: 1,
      });
      fireEvent.pointerMove(document, {
        pointerId: 1,
        clientX: startLeft + 84,
        clientY: startTop + 36,
        buttons: 1,
      });
      fireEvent.pointerUp(document, {
        pointerId: 1,
        clientX: startLeft + 84,
        clientY: startTop + 36,
      });
    });

    expect(Number.parseFloat(bellRoot.style.left)).toBeGreaterThan(startLeft);
    expect(Number.parseFloat(bellRoot.style.top)).toBeGreaterThan(startTop);
  });
});
