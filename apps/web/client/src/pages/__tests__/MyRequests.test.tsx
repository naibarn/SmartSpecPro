/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const mockNavigate = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/work/requests", mockNavigate],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: 42, role: "user" },
  }),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (_key: string, defaultValue?: string | Record<string, unknown>) =>
      typeof defaultValue === "string" ? defaultValue : _key,
    locale: "en",
    i18n: {
      exists: () => true,
      resolvedLanguage: "en",
      language: "en",
      changeLanguage: vi.fn(),
    },
    setLocale: vi.fn(),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    workOs: {
      listMyRequests: {
        useQuery: () => ({
          data: [
            {
              id: "req-1",
              title: "Review refund request",
              sourceType: "chat",
              currentState: "waiting_for_approval",
              businessDomain: "finance",
              urgency: "high",
              riskLevel: "medium",
              defaultOwnerType: "human",
              defaultOwnerId: "42",
              linkedCaseId: "case-1",
              createdAt: "2026-04-11T10:00:00.000Z",
            },
            {
              id: "req-2",
              title: "Prepare weekly report",
              sourceType: "manual",
              currentState: "completed",
              businessDomain: "operations",
              urgency: "normal",
              riskLevel: "low",
              defaultQueueId: "team-1",
              linkedCaseId: "case-2",
              createdAt: "2026-04-10T10:00:00.000Z",
            },
          ],
          isLoading: false,
        }),
      },
    },
  },
}));

import MyRequestsPage from "../MyRequests";

describe("MyRequestsPage", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("shows a summary of the user's requests and routes to work creation", () => {
    render(<MyRequestsPage />);

    expect(screen.getAllByRole("heading", { name: "My Requests" })[0]).toBeInTheDocument();
    expect(screen.getByText("Total requests")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.getByText("Review refund request")).toBeInTheDocument();
    expect(screen.getByText("Prepare weekly report")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /start work/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/work/request");
  });

  it("returns to chat from the page header", () => {
    render(<MyRequestsPage />);

    fireEvent.click(screen.getAllByRole("button", { name: /open chat/i })[0]);
    expect(mockNavigate).toHaveBeenCalledWith("/chat");
  });
});
