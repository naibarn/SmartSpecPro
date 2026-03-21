import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const setLocationMock = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/admin/notifications", setLocationMock],
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: vi.fn(() => ({
    user: { id: 1, role: "admin" },
    loading: false,
  })),
}));

import { useAuth } from "@/_core/hooks/useAuth";
const mockedUseAuth = vi.mocked(useAuth);

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: vi.fn(() => true),
}));

import { useTenantFeatureFlag } from "@/hooks/useTenantFeatureFlag";
const mockedUseFlag = vi.mocked(useTenantFeatureFlag);

const mockStatsQuery = vi.fn();
const mockListQuery = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    monitoring: {
      getUnifiedStats: {
        useQuery: (...args: any[]) => mockStatsQuery(...args),
      },
      getUnifiedNotifications: {
        useQuery: (...args: any[]) => mockListQuery(...args),
      },
    },
  },
}));

import AdminNotifications from "../AdminNotifications";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const sampleStats = {
  total: 42,
  unread: 5,
  critical: 2,
  today: 8,
  bySource: [
    { source: "user", count: 20 },
    { source: "orchestrator", count: 15 },
    { source: "guardian", count: 7 },
  ],
  bySeverity: [
    { severity: "low", count: 25 },
    { severity: "normal", count: 10 },
    { severity: "high", count: 5 },
    { severity: "critical", count: 2 },
  ],
};

const sampleItems = [
  {
    id: "user:1",
    source: "user",
    title: "New login detected",
    content: "Login from new device",
    priority: "normal",
    isRead: false,
    isDismissed: false,
    actionUrl: "https://example.com/action",
    createdAt: "2026-03-20T10:00:00.000Z",
    metadata: { ip: "1.2.3.4" },
  },
  {
    id: "orch:2",
    source: "orchestrator",
    title: "Run completed",
    content: "Team room run finished successfully",
    priority: "low",
    isRead: true,
    isDismissed: false,
    actionUrl: null,
    createdAt: "2026-03-20T09:00:00.000Z",
    metadata: null,
  },
  {
    id: "user:3",
    source: "guardian",
    title: "Security alert",
    content: "Unusual activity detected",
    priority: "critical",
    isRead: false,
    isDismissed: false,
    actionUrl: null,
    createdAt: "2026-03-20T08:00:00.000Z",
    metadata: { reason: "brute_force" },
  },
];

function setupDefaultMocks() {
  mockStatsQuery.mockReturnValue({
    data: sampleStats,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  mockListQuery.mockReturnValue({
    data: { items: sampleItems, hasMore: true },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  });
  mockedUseAuth.mockReturnValue({
    user: { id: 1, role: "admin" },
    loading: false,
  } as any);
  mockedUseFlag.mockReturnValue(true);
}

describe("AdminNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setLocationMock.mockClear();
    setupDefaultMocks();
  });

  describe("stat cards", () => {
    it("renders 4 stat cards with correct counts (total, unread, critical, today)", () => {
      render(<AdminNotifications />, { wrapper });
      // Check the stat card grid specifically
      const statCards = document.querySelectorAll(
        ".grid.grid-cols-2.lg\\:grid-cols-4 [data-slot='card']",
      );
      expect(statCards).toHaveLength(4);
      expect(statCards[0]!.textContent).toContain("42");
      expect(statCards[1]!.textContent).toContain("5");
      expect(statCards[2]!.textContent).toContain("2");
      expect(statCards[3]!.textContent).toContain("8");
    });

    it("shows loading skeleton while stats query is pending", () => {
      mockStatsQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<AdminNotifications />, { wrapper });
      const skeletons = document.querySelectorAll(".animate-pulse");
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it("shows error state when stats query fails", () => {
      mockStatsQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("Network error"),
        refetch: vi.fn(),
      });
      render(<AdminNotifications />, { wrapper });
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });

  describe("charts", () => {
    it("renders source breakdown display with user/orchestrator/guardian counts", () => {
      render(<AdminNotifications />, { wrapper });
      expect(screen.getByText("20")).toBeInTheDocument();
      expect(screen.getByText("15")).toBeInTheDocument();
      expect(screen.getByText("7")).toBeInTheDocument();
    });

    it("renders severity distribution display with info/warning/error/critical counts", () => {
      render(<AdminNotifications />, { wrapper });
      expect(screen.getByText("25")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
    });
  });

  describe("filter bar", () => {
    it("renders source dropdown with default 'all' value", () => {
      render(<AdminNotifications />, { wrapper });
      expect(screen.getByLabelText(/source/i)).toBeInTheDocument();
    });

    it("renders severity dropdown with default 'all' value", () => {
      render(<AdminNotifications />, { wrapper });
      expect(screen.getByLabelText(/severity/i)).toBeInTheDocument();
    });

    it("renders date range inputs (from/to)", () => {
      render(<AdminNotifications />, { wrapper });
      expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
    });
  });

  describe("notification list", () => {
    it("renders unified notification rows with source badge, title, severity, timestamp", () => {
      render(<AdminNotifications />, { wrapper });
      expect(screen.getByText("New login detected")).toBeInTheDocument();
      expect(screen.getByText("Run completed")).toBeInTheDocument();
      expect(screen.getByText("Security alert")).toBeInTheDocument();
    });

    it("applies correct source badge text per source type", () => {
      render(<AdminNotifications />, { wrapper });
      const badges = screen.getAllByText(/^(user|orchestrator|guardian)$/i);
      expect(badges.length).toBeGreaterThanOrEqual(3);
    });

    it("shows empty state when no notifications match filters", () => {
      mockListQuery.mockReturnValue({
        data: { items: [], hasMore: false },
        isLoading: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      });
      render(<AdminNotifications />, { wrapper });
      expect(screen.getByText(/no notifications/i)).toBeInTheDocument();
    });

    it("renders pagination controls (prev/next) when hasMore is true", () => {
      render(<AdminNotifications />, { wrapper });
      expect(screen.getByRole("button", { name: /next/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /prev/i })).toBeInTheDocument();
    });

    it("disables prev button on first page", () => {
      render(<AdminNotifications />, { wrapper });
      const prevBtn = screen.getByRole("button", { name: /prev/i });
      expect(prevBtn).toBeDisabled();
    });
  });

  describe("detail panel", () => {
    it("shows detail panel when a notification row is clicked", async () => {
      const user = userEvent.setup();
      render(<AdminNotifications />, { wrapper });
      await user.click(screen.getByText("New login detected"));
      expect(screen.getByLabelText("Notification detail")).toBeInTheDocument();
      expect(screen.getByText("Login from new device")).toBeInTheDocument();
    });

    it("displays full content, metadata, and action URL in detail panel", async () => {
      const user = userEvent.setup();
      render(<AdminNotifications />, { wrapper });
      await user.click(screen.getByText("New login detected"));
      expect(screen.getByText("Login from new device")).toBeInTheDocument();
      expect(screen.getByText(/example\.com/)).toBeInTheDocument();
      expect(screen.getByText(/"ip"/)).toBeInTheDocument();
    });

    it("hides detail panel when close button is clicked", async () => {
      const user = userEvent.setup();
      render(<AdminNotifications />, { wrapper });
      await user.click(screen.getByText("New login detected"));
      expect(screen.getByLabelText("Notification detail")).toBeInTheDocument();
      await user.click(screen.getByLabelText("Close detail panel"));
      expect(screen.queryByLabelText("Notification detail")).not.toBeInTheDocument();
    });
  });

  describe("feature flag guard", () => {
    it("renders fallback message when NOTIFICATION_UNIFIED_CENTER is false", () => {
      mockedUseFlag.mockReturnValue(false);
      render(<AdminNotifications />, { wrapper });
      expect(screen.getByText("Feature Not Enabled")).toBeInTheDocument();
      expect(screen.queryByText("42")).not.toBeInTheDocument();
    });
  });

  describe("admin guard", () => {
    it("redirects non-admin users to dashboard", () => {
      mockedUseAuth.mockReturnValue({
        user: { id: 2, role: "user" },
        loading: false,
      } as any);
      render(<AdminNotifications />, { wrapper });
      expect(setLocationMock).toHaveBeenCalledWith("/dashboard");
    });

    it("allows domain_admin users to access", () => {
      mockedUseAuth.mockReturnValue({
        user: { id: 3, role: "domain_admin" },
        loading: false,
      } as any);
      render(<AdminNotifications />, { wrapper });
      expect(setLocationMock).not.toHaveBeenCalled();
    });
  });
});
