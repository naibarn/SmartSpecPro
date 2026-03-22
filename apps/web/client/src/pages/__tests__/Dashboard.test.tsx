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
  },
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlags: () => ({}),
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
});
