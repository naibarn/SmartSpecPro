import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/dashboard", setLocationMock] as const,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: {
      role: "user",
      name: "Test User",
      email: "test@example.com",
      credits: 0,
      plan: "free",
    },
    isLoading: false,
    isAuthenticated: true,
    logout: vi.fn(),
  }),
}));

vi.mock("@/contexts/TenantContext", () => ({
  useTenant: () => ({
    tenant: { name: "SmartAIHub" },
    isLoading: false,
  }),
}));

vi.mock("@/components/LocaleToggle", () => ({
  LocaleToggle: () => React.createElement("div", null, "Locale"),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: "div",
    section: "section",
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn((options: any) => {
    const key = Array.isArray(options?.queryKey) ? options.queryKey[0] : null;

    if (key === "dashboard-analytics-summary") {
      return {
        data: {
          period: {
            start: "2026-03-17T00:00:00.000Z",
            end: "2026-03-24T12:00:00.000Z",
            days: 30,
          },
          usage: {
            total_requests: 42,
            total_credits: 2100,
            total_cost_usd: 2.1,
            avg_credits_per_request: 50,
            avg_cost_per_request_usd: 0.05,
          },
          payments: {
            total_paid_usd: 10,
            total_credits_purchased: 10000,
            payment_count: 1,
          },
          by_provider: {
            openai: { requests: 30, credits: 1500, cost_usd: 1.5 },
          },
          by_model: {},
          by_day: {},
        },
        isLoading: false,
      };
    }

    if (key === "dashboard-analytics-time-series") {
      return {
        data: {
          granularity: "day",
          period_days: 7,
          data_points: 7,
          data: [
            { timestamp: "2026-03-18", requests: 3, credits: 80, cost_usd: 0.08 },
            { timestamp: "2026-03-19", requests: 4, credits: 100, cost_usd: 0.1 },
            { timestamp: "2026-03-20", requests: 5, credits: 120, cost_usd: 0.12 },
            { timestamp: "2026-03-21", requests: 4, credits: 90, cost_usd: 0.09 },
            { timestamp: "2026-03-22", requests: 6, credits: 140, cost_usd: 0.14 },
            { timestamp: "2026-03-23", requests: 8, credits: 210, cost_usd: 0.21 },
            { timestamp: "2026-03-24", requests: 12, credits: 300, cost_usd: 0.3 },
          ],
        },
        isLoading: false,
      };
    }

    return { data: undefined, isLoading: false };
  }),
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlags: () => ({}),
}));

vi.mock("@/hooks/useAgencyQuery", () => ({
  useAgencyList: () => ({
    data: {
      agencies: [
        { id: "agency-1", name: "Growth Agency" },
        { id: "agency-2", name: "Support Agency" },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useMenuItems", () => ({
  getResolvedMenuItems: () => ([
    {
      id: "dashboard",
      label: "Dashboard",
      path: "/dashboard",
      external: false,
      IconComponent: () => React.createElement("span", null, "D"),
    },
    {
      id: "document-management",
      label: "Library",
      path: "/document-management",
      external: false,
      section: "documents",
      IconComponent: () => React.createElement("span", null, "L"),
    },
    {
      id: "private-files",
      label: "Private Files",
      path: "/document-management?scope=private_vault&sort=updated_desc",
      external: false,
      parentId: "document-management",
      IconComponent: () => React.createElement("span", null, "P"),
    },
    {
      id: "settings",
      label: "Settings",
      path: "/settings",
      external: false,
      IconComponent: () => React.createElement("span", null, "S"),
    },
  ]),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    media: {
      listTasks: {
        useQuery: vi.fn(() => ({ data: { tasks: [], total: 0 }, isLoading: false })),
      },
    },
    credits: {
      stats: {
        useQuery: vi.fn(() => ({ data: { totalUsage: 0 }, isLoading: false })),
      },
      history: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
    },
    chat: {
      listConversations: {
        useQuery: vi.fn(() => ({ data: { conversations: [], total: 0 }, isLoading: false })),
      },
    },
    workflow: {
      list: {
        useQuery: vi.fn(() => ({ data: { workflows: [] }, isLoading: false })),
      },
    },
    approvals: {
      getPending: {
        useQuery: vi.fn(() => ({ data: { requests: [] }, isLoading: false })),
      },
      submitDecision: {
        useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
      },
    },
    agency: {
      reviewDashboard: {
        useQuery: vi.fn(() => ({
          data: {
            overview: {
              totalAgencies: 4,
              reviewedAgencies: 3,
              reviewCount: 6,
              averageRating: 4.3,
              averageObjectiveAlignment: 0.82,
              reviewCoverage: 0.75,
            },
            recentReviews: [
              {
                id: 11,
                agencyId: "agency-1",
                agencyName: "Growth Agency",
                rating: 5,
                suggestionsCount: 2,
                overallAssessment: "Strong output quality and good instruction coverage.",
                createdAt: "2026-03-23T12:00:00.000Z",
              },
              {
                id: 12,
                agencyId: "agency-2",
                agencyName: "Support Agency",
                rating: 3,
                suggestionsCount: 1,
                overallAssessment: "Needs more model diversity.",
                createdAt: "2026-03-23T11:00:00.000Z",
              },
            ],
            recentImprovements: [
              {
                id: 21,
                agencyId: "agency-1",
                agencyName: "Growth Agency",
                changeType: "node_instructions",
                description: "Applied: tightened the content brief.",
                createdAt: "2026-03-23T13:00:00.000Z",
              },
              {
                id: 22,
                agencyId: "agency-2",
                agencyName: "Support Agency",
                changeType: "model_selection",
                description: "Dismissed: keep the current model.",
                createdAt: "2026-03-23T09:00:00.000Z",
              },
            ],
          },
          isLoading: false,
        })),
      },
    },
    systemSettings: {
      getMenuVisibility: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
    },
  },
}));

import Dashboard from "../Dashboard";

describe("Dashboard", () => {
  beforeEach(() => {
    setLocationMock.mockClear();
  });

  it("shows Private Files in the sidebar", () => {
    render(<Dashboard />);

    expect(screen.getByText("Documents")).toBeInTheDocument();

    const privateFilesButtons = screen.getAllByRole("button", { name: /private files/i });
    expect(privateFilesButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(privateFilesButtons[0]);
    expect(setLocationMock).toHaveBeenCalledWith("/document-management?scope=private_vault&sort=updated_desc");
  });

  it("shows Social Automation in the sidebar when the menu item is unavailable", () => {
    render(<Dashboard />);

    const socialAutomationButton = screen.getByRole("button", { name: /social automation/i });
    fireEvent.click(socialAutomationButton);

    expect(setLocationMock).toHaveBeenCalledWith("/social/automation");
  });

  it("shows agency review summary on the dashboard", () => {
    render(<Dashboard />);

    expect(screen.getByText("Agency Review Center")).toBeInTheDocument();
    expect(screen.getByText("Tenant-wide improvement loop")).toBeInTheDocument();
    expect(screen.getByText("75% coverage")).toBeInTheDocument();
    expect(screen.getByText("Avg rating")).toBeInTheDocument();
    expect(screen.getByText("4.3")).toBeInTheDocument();
    expect(screen.getByText("Avg alignment")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getAllByText("Growth Agency").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("node_instructions")).toBeInTheDocument();
  });

  it("filters the review center by agency and opens the selected review center", () => {
    render(<Dashboard />);

    fireEvent.change(screen.getByLabelText(/filter by agency/i), {
      target: { value: "agency-1" },
    });

    expect(screen.getByText("Strong output quality and good instruction coverage.")).toBeInTheDocument();
    expect(screen.queryByText("Needs more model diversity.")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^open review$/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/agencies/agency-1/review");

    setLocationMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /open review center/i }));
    expect(setLocationMock).toHaveBeenCalledWith("/agencies/agency-1/review");
  });

  it("shows the priority snapshot and trend sections", () => {
    render(<Dashboard />);

    expect(screen.getByText("Priority Snapshot")).toBeInTheDocument();
    expect(screen.getByText("Trend & Health")).toBeInTheDocument();
    expect(screen.getByText("Workspace Shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Next Best Actions")).toBeInTheDocument();
  });
});
