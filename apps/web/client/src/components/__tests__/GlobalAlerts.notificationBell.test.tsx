import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import React from "react";

// Mutable mock data that tests can change
let notificationCountData = { count: 3 };
let notificationsData: any[] = [];
let urgentRemindersData: any[] = [];
let currentLocation = "/";
let mockLocale: "en" | "th" = "en";
const setLocationMock = vi.fn();
const openWindowMock = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    follows: {
      getUrgentMessages: { useQuery: () => ({ data: [] }) },
    },
    scheduledMessages: {
      getNotificationCount: { useQuery: () => ({ data: notificationCountData }) },
      getNotifications: { useQuery: () => ({ data: notificationsData }) },
      getUrgentReminders: { useQuery: () => ({ data: urgentRemindersData }) },
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

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    locale: mockLocale,
    t: (key: string) => key,
  }),
}));

vi.mock("wouter", () => ({
  useLocation: () => [currentLocation, setLocationMock],
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
    urgentRemindersData = [];
    currentLocation = "/";
    mockLocale = "en";
    setLocationMock.mockClear();
    openWindowMock.mockReset();
    Object.defineProperty(window, "open", {
      configurable: true,
      writable: true,
      value: openWindowMock,
    });
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

  it("keeps the bell visible on the dashboard even when unread count is zero", () => {
    notificationCountData = { count: 0 };
    currentLocation = "/dashboard";

    render(<GlobalAlerts />);

    expect(screen.getByLabelText(/0 unread notification/i)).toBeTruthy();
  });

  it("hides the bell on non-dashboard pages when unread count is zero", () => {
    notificationCountData = { count: 0 };
    currentLocation = "/chat";

    render(<GlobalAlerts />);

    expect(screen.queryByTestId("global-notification-bell")).toBeNull();
  });

  it("keeps the bell visible on non-dashboard pages when there are unread notifications", () => {
    notificationCountData = { count: 2 };
    currentLocation = "/chat";

    render(<GlobalAlerts />);

    expect(screen.getByLabelText(/unread notification/i)).toBeTruthy();
  });

  it("keeps hook order stable when unread-free visibility changes across routes", () => {
    notificationCountData = { count: 0 };
    currentLocation = "/dashboard";

    const { rerender } = render(<GlobalAlerts />);

    expect(screen.getByLabelText(/0 unread notification/i)).toBeTruthy();

    currentLocation = "/chat";

    expect(() => rerender(<GlobalAlerts />)).not.toThrow();
    expect(screen.queryByTestId("global-notification-bell")).toBeNull();
  });

  it("shows a history CTA when unread count is zero", async () => {
    notificationCountData = { count: 0 };
    currentLocation = "/dashboard";
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
    currentLocation = "/dashboard";
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

    expect(bellRoot.style.right).toBe("12px");
    expect(bellRoot.style.top).toBe("12px");

    await act(async () => {
      fireEvent.pointerDown(bellButton, {
        pointerId: 1,
        clientX: 980,
        clientY: 20,
        buttons: 1,
      });
      fireEvent.pointerMove(document, {
        pointerId: 1,
        clientX: 1060,
        clientY: 56,
        buttons: 1,
      });
      fireEvent.pointerUp(document, {
        pointerId: 1,
        clientX: 1060,
        clientY: 56,
      });
    });

    expect(Number.parseFloat(bellRoot.style.left)).toBeGreaterThan(0);
    expect(Number.parseFloat(bellRoot.style.top)).toBeGreaterThan(0);
    expect(bellRoot.style.right).toBe("");
  });

  it("ignores legacy stored absolute positions and docks the bell to the top right", () => {
    notificationCountData = { count: 2 };
    localStorage.setItem(
      "global-notification-bell-position",
      JSON.stringify({ x: 420, y: 24 }),
    );

    render(<GlobalAlerts />);

    const bellRoot = screen.getByTestId("global-notification-bell");
    expect(bellRoot.style.right).toBe("12px");
    expect(bellRoot.style.top).toBe("12px");
    expect(bellRoot.style.left).toBe("");
  });

  it("ignores legacy stored custom positions without a version marker and docks the bell to the top right", () => {
    notificationCountData = { count: 2 };
    localStorage.setItem(
      "global-notification-bell-position",
      JSON.stringify({ mode: "custom", x: 420, y: 24 }),
    );

    render(<GlobalAlerts />);

    const bellRoot = screen.getByTestId("global-notification-bell");
    expect(bellRoot.style.right).toBe("12px");
    expect(bellRoot.style.top).toBe("12px");
    expect(bellRoot.style.left).toBe("");
  });

  it("ignores stored custom positions and docks the bell to the top right", () => {
    notificationCountData = { count: 2 };
    localStorage.setItem(
      "global-notification-bell-position",
      JSON.stringify({
        version: 1,
        placement: { mode: "custom", x: 420, y: 240 },
      }),
    );

    render(<GlobalAlerts />);

    const bellRoot = screen.getByTestId("global-notification-bell");
    expect(bellRoot.style.right).toBe("12px");
    expect(bellRoot.style.top).toBe("12px");
    expect(bellRoot.style.left).toBe("");
    expect(localStorage.getItem("global-notification-bell-position")).toBeNull();
  });

  it("uses actionUrl for urgent monitoring reminders instead of falling back to chat", async () => {
    urgentRemindersData = [
      {
        id: 99,
        title: "Monitoring signal is stale",
        content: "No fresh monitoring check has landed.",
        priority: "critical",
        scheduledMessageId: null,
        conversationId: null,
        actionUrl: "/admin/dashboard?incident=ops-overview%3Amonitoring_stale",
        actionLabel: "Open Incident",
        relatedResourceType: "system_health",
        metadata: {
          source: "guardian.ops_overview",
          signal: "stale_for=14h",
          recommendation: "Restore the monitoring pipeline quickly",
          relatedItems: {
            category: "monitoring",
          },
        },
      },
    ];

    render(<GlobalAlerts />);

    const openIncidentButton = await screen.findByRole("button", { name: /open incident/i });
    fireEvent.click(openIncidentButton);

    expect(openWindowMock).toHaveBeenCalledWith(
      "/admin/dashboard?incident=ops-overview%3Amonitoring_stale",
      "_blank",
      "noopener,noreferrer",
    );
    expect(setLocationMock).not.toHaveBeenCalled();
  });

  it("repairs a stale deduplicated feedback target from the latest ticket in the content", async () => {
    urgentRemindersData = [
      {
        id: 101,
        title: "New Feedback: [Auto] media generation failed (image)",
        content: "[bug] Auto-classified as bug (high priority) Ticket #250",
        priority: "high",
        scheduledMessageId: null,
        conversationId: null,
        actionUrl: "/admin/feedback-hub?ticketId=249",
        actionLabel: "View Feedback",
        relatedResourceType: "feedback",
      },
    ];

    render(<GlobalAlerts />);

    fireEvent.click(await screen.findByRole("button", { name: /view feedback/i }));

    expect(openWindowMock).toHaveBeenCalledWith(
      "/admin/feedback-hub?ticketId=250",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("repairs legacy guardian-routed feedback notifications", async () => {
    urgentRemindersData = [
      {
        id: 102,
        title: "New Feedback: [Auto] media generation failed (image)",
        content: "[bug] Auto-classified as bug (high priority) Ticket #398",
        priority: "high",
        scheduledMessageId: null,
        conversationId: null,
        actionUrl: "/admin/system-guardian?incident=8",
        actionLabel: "View Feedback",
        relatedResourceType: "incident",
        metadata: { source: "guardian.feedbackProcessor" },
      },
    ];

    render(<GlobalAlerts />);

    fireEvent.click(await screen.findByRole("button", { name: /view feedback/i }));

    expect(openWindowMock).toHaveBeenCalledWith(
      "/admin/feedback-hub?ticketId=398",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("treats billing invoice due reminders as billing reminders instead of incident guidance", async () => {
    urgentRemindersData = [
      {
        id: 100,
        title: "Invoice due reminder",
        content: "Invoice TH-INV-2026-000001 is still awaiting payment.",
        priority: "high",
        scheduledMessageId: 55,
        conversationId: null,
        actionUrl: "/billing/invoices/55",
        relatedResourceType: "scheduled_message",
        metadata: {
          source: "billing",
          relatedItems: {
            invoiceId: "55",
            invoiceNumber: "TH-INV-2026-000001",
            notificationType: "invoice_due_reminder",
          },
        },
      },
    ];

    render(<GlobalAlerts />);

    expect(await screen.findByText("Billing Reminder")).toBeTruthy();
    expect(screen.getByText("Invoice due reminder")).toBeTruthy();
    expect(screen.getByText("Invoice TH-INV-2026-000001 is still awaiting payment.")).toBeTruthy();
    expect(screen.queryByText("Check Now")).toBeNull();
    expect(screen.queryByText("Open Monitoring")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /open invoice/i }));

    expect(openWindowMock).toHaveBeenCalledWith(
      "/billing/invoices/55",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("formats observed timestamps with the app locale instead of the browser locale", async () => {
    const toLocaleStringSpy = vi
      .spyOn(Date.prototype, "toLocaleString")
      .mockImplementation(function (this: Date, locale?: string) {
        return locale === "en" ? "en-formatted" : `unexpected-${locale ?? "none"}`;
      });

    urgentRemindersData = [
      {
        id: 119,
        title: "Monitoring signal is stale",
        content: "No fresh monitoring check has landed.",
        priority: "critical",
        scheduledMessageId: null,
        conversationId: null,
        relatedResourceType: "system_health",
        metadata: {
          source: "guardian.ops_overview",
          observedAt: "2026-04-11T13:08:01Z",
          signal: "1 pending",
          recommendation: "Triage the outstanding alerts now",
          relatedItems: {
            category: "monitoring",
          },
        },
      },
    ];

    render(<GlobalAlerts />);

    expect(await screen.findByText("Observed: en-formatted")).toBeTruthy();
    expect(toLocaleStringSpy).toHaveBeenCalledWith("en");
    toLocaleStringSpy.mockRestore();
  });

  it("uses the Thai incident action label for localized ops reminders", async () => {
    mockLocale = "th";
    urgentRemindersData = [
      {
        id: 122,
        title: "Critical alerts are piling up without clear ownership",
        content: "High-severity alerts were raised, but the incident still lacks clear triage and acknowledgement.",
        priority: "critical",
        scheduledMessageId: null,
        conversationId: null,
        actionUrl: "/admin/dashboard?incident=ops-overview%3Aaudit%3Allm_error_spike",
        actionLabel: "Open Incident",
        relatedResourceType: "system_health",
        metadata: {
          source: "guardian.ops_overview",
          signal: "44% error rate",
          recommendation: "Check provider health, rate limits, and fallback routing before chat traffic degrades broadly.",
          observedAt: "2026-04-11T12:57:32Z",
          relatedItems: {
            category: "audit",
          },
        },
      },
    ];

    render(<GlobalAlerts />);

    expect(await screen.findByRole("button", { name: /เปิดเหตุการณ์/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /open incident/i })).toBeNull();
  });

  it("dismisses an urgent reminder modal when the dismiss button is clicked", async () => {
    urgentRemindersData = [
      {
        id: 120,
        title: "Monitoring signal is stale",
        content: "No fresh monitoring check has landed.",
        priority: "critical",
        scheduledMessageId: null,
        conversationId: null,
      },
    ];

    render(<GlobalAlerts />);

    expect(await screen.findByText("Monitoring signal is stale")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByText("Monitoring signal is stale")).toBeNull();
  });

  it("dismisses an urgent reminder modal when clicking the backdrop", async () => {
    urgentRemindersData = [
      {
        id: 121,
        title: "Queue backlog is rising",
        content: "Workers are falling behind.",
        priority: "high",
        scheduledMessageId: null,
        conversationId: null,
      },
    ];

    render(<GlobalAlerts />);

    const dialog = await screen.findByRole("dialog", { name: /queue backlog is rising/i });
    fireEvent.click(dialog);

    expect(screen.queryByText("Queue backlog is rising")).toBeNull();
  });

  it("does not replace an open urgent reminder while a new one arrives", async () => {
    urgentRemindersData = [
      {
        id: 130,
        title: "Monitoring signal is stale",
        content: "No fresh monitoring check has landed.",
        priority: "critical",
        scheduledMessageId: null,
        conversationId: null,
      },
    ];

    const { rerender } = render(<GlobalAlerts />);

    expect(await screen.findByText("Monitoring signal is stale")).toBeTruthy();

    urgentRemindersData = [
      {
        id: 130,
        title: "Monitoring signal is stale",
        content: "No fresh monitoring check has landed.",
        priority: "critical",
        scheduledMessageId: null,
        conversationId: null,
      },
      {
        id: 131,
        title: "Critical alerts need triage",
        content: "A new incident was detected.",
        priority: "critical",
        scheduledMessageId: null,
        conversationId: null,
      },
    ];

    rerender(<GlobalAlerts />);

    expect(screen.getByText("Monitoring signal is stale")).toBeTruthy();
    expect(screen.queryByText("Critical alerts need triage")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(await screen.findByText("Critical alerts need triage")).toBeTruthy();
  });

  it("opens notification detail actions in a new tab to preserve the current page", async () => {
    notificationsData = [
      {
        id: 100,
        title: "Critical incident",
        content: "Open the incident timeline",
        isRead: false,
        priority: "critical",
        createdAt: new Date().toISOString(),
        occurrenceCount: 1,
        actionUrl: "/admin/dashboard?incident=ops-overview%3Aqueue_backlog",
        actionLabel: "Open Incident",
      },
    ];

    render(<GlobalAlerts />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/unread notification/i));
    });

    fireEvent.click(screen.getByText("Critical incident"));
    fireEvent.click(screen.getByRole("button", { name: /open incident/i }));

    expect(openWindowMock).toHaveBeenCalledWith(
      "/admin/dashboard?incident=ops-overview%3Aqueue_backlog",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("opens footer navigation in a new tab from the notification bell", async () => {
    notificationCountData = { count: 0 };
    currentLocation = "/dashboard";

    render(<GlobalAlerts />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/0 unread notification/i));
    });

    fireEvent.click(screen.getByText("ดูย้อนหลัง"));

    expect(openWindowMock).toHaveBeenCalledWith(
      "/notifications",
      "_blank",
      "noopener,noreferrer",
    );
  });
});
