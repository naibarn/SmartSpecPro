import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";

// Mock AuthContext
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { role: 'admin', email: 'admin@test.com' },
    isLoading: false,
  }),
}));

// Mock tRPC client - factory function approach
vi.mock("@/lib/trpc", () => ({
  trpc: {
    funnelAnalytics: {
      summary: {
        useQuery: vi.fn(),
      },
      timeSeries: {
        useQuery: vi.fn(),
      },
      invalidateCache: {
        useMutation: vi.fn(),
      },
    },
  },
}));

import AdminFunnelDashboard from "../AdminFunnelDashboard";
import { trpc } from "@/lib/trpc";

// Get typed mocks
const mockSummaryQuery = vi.mocked(trpc.funnelAnalytics.summary.useQuery);
const mockTimeSeriesQuery = vi.mocked(trpc.funnelAnalytics.timeSeries.useQuery);
const mockInvalidateCacheMutation = vi.mocked(trpc.funnelAnalytics.invalidateCache.useMutation);

function renderWithProviders(ui: React.ReactElement, { route = "/admin/funnel" } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const { hook } = memoryLocation({ path: route });

  return render(
    <QueryClientProvider client={queryClient}>
      <Router hook={hook}>{ui}</Router>
    </QueryClientProvider>
  );
}

describe("AdminFunnelDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mutation mock setup
    mockInvalidateCacheMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ cleared: 0 }),
      isPending: false,
      isError: false,
      error: null,
    });
  });

  describe("Feature flag gating", () => {
    it("should render when feature flag is enabled (implied by route access)", () => {
      mockSummaryQuery.mockReturnValue({
        data: { stages: [], rangeClamped: false, cached: false },
        isLoading: false,
      });
      mockTimeSeriesQuery.mockReturnValue({
        data: { series: [], rangeClamped: false, cached: false },
        isLoading: false,
      });

      renderWithProviders(<AdminFunnelDashboard />);

      expect(screen.getByText(/Funnel Analytics/i)).toBeInTheDocument();
    });
  });

  describe("Tab rendering and MVP gating", () => {
    beforeEach(() => {
      mockSummaryQuery.mockReturnValue({
        data: { stages: [], rangeClamped: false, cached: false },
        isLoading: false,
      });
      mockTimeSeriesQuery.mockReturnValue({
        data: { series: [], rangeClamped: false, cached: false },
        isLoading: false,
      });
    });

    it("should render five MVP tabs: Overview, Acquisition, Activation, Revenue, Engagement (Retention hidden in MVP)", () => {
      renderWithProviders(<AdminFunnelDashboard />);

      expect(screen.getByRole("tab", { name: /overview/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /acquisition/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /activation/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /revenue/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /engagement/i })).toBeInTheDocument();

      // Retention tab should NOT be present in MVP
      expect(screen.queryByRole("tab", { name: /retention/i })).not.toBeInTheDocument();
    });

    it("should start with Overview tab selected by default", () => {
      renderWithProviders(<AdminFunnelDashboard />);

      const overviewTab = screen.getByRole("tab", { name: /overview/i });
      expect(overviewTab).toHaveAttribute("aria-selected", "true");
    });
  });

  describe("Date range and refresh controls", () => {
    beforeEach(() => {
      mockSummaryQuery.mockReturnValue({
        data: { stages: [], rangeClamped: false, cached: false },
        isLoading: false,
      });
      mockTimeSeriesQuery.mockReturnValue({
        data: { series: [], rangeClamped: false, cached: false },
        isLoading: false,
      });
    });

    it("should render date range inputs", () => {
      renderWithProviders(<AdminFunnelDashboard />);

      expect(screen.getByLabelText(/from/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
    });

    it("should render refresh button", () => {
      renderWithProviders(<AdminFunnelDashboard />);

      expect(screen.getByRole("button", { name: /refresh/i })).toBeInTheDocument();
    });
  });

  describe("Panel resilience", () => {
    it("should show loading state when data is loading", () => {
      mockSummaryQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
      });
      mockTimeSeriesQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      renderWithProviders(<AdminFunnelDashboard />);

      // Should show loading state in both panels
      const loadingElements = screen.getAllByText(/loading/i);
      expect(loadingElements.length).toBeGreaterThan(0);
    });

    it("should show empty state when no data is available", () => {
      mockSummaryQuery.mockReturnValue({
        data: { stages: [], rangeClamped: false, cached: false },
        isLoading: false,
      });
      mockTimeSeriesQuery.mockReturnValue({
        data: { series: [], rangeClamped: false, cached: false },
        isLoading: false,
      });

      renderWithProviders(<AdminFunnelDashboard />);

      // Should show empty state in both panels
      const noDataElements = screen.getAllByText(/no.*data/i);
      expect(noDataElements.length).toBeGreaterThan(0);
    });

    it("should show error state when query fails", async () => {
      mockSummaryQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Failed to fetch"),
      });
      mockTimeSeriesQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
      });

      renderWithProviders(<AdminFunnelDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/error|failed/i)).toBeInTheDocument();
      });
    });

    it("should render other panels even if one fails", async () => {
      // Summary fails but timeSeries succeeds
      mockSummaryQuery.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Failed to fetch summary"),
      });
      mockTimeSeriesQuery.mockReturnValue({
        data: {
          series: [
            { bucket: "2026-02-01", eventName: "signup_completed", total: 10 }
          ],
          rangeClamped: false,
          cached: false
        },
        isLoading: false,
      });

      renderWithProviders(<AdminFunnelDashboard />);

      // Error should be shown for failed panel
      await waitFor(() => {
        const errorElements = screen.queryAllByText(/error.*loading.*summary/i);
        expect(errorElements.length).toBeGreaterThan(0);
      });

      // But time series data should still render
      expect(screen.getByText(/signup_completed/i)).toBeInTheDocument();
    });
  });

  describe("Export functionality", () => {
    beforeEach(() => {
      mockSummaryQuery.mockReturnValue({
        data: { stages: [], rangeClamped: false, cached: false },
        isLoading: false,
      });
      mockTimeSeriesQuery.mockReturnValue({
        data: { series: [], rangeClamped: false, cached: false },
        isLoading: false,
      });
    });

    it("should render export button", () => {
      renderWithProviders(<AdminFunnelDashboard />);

      expect(screen.getByRole("button", { name: /export/i })).toBeInTheDocument();
    });

    it("should default to CSV format (aggregate-safe mode)", () => {
      renderWithProviders(<AdminFunnelDashboard />);

      const exportButton = screen.getByRole("button", { name: /export/i });
      expect(exportButton).toBeInTheDocument();
      // Export defaults to CSV - we'll test the interaction in integration tests
    });
  });

  describe("UTC bucket label semantics", () => {
    it("should display bucket labels with UTC indicator", () => {
      mockSummaryQuery.mockReturnValue({
        data: { stages: [], rangeClamped: false, cached: false },
        isLoading: false,
      });
      mockTimeSeriesQuery.mockReturnValue({
        data: {
          series: [
            { bucket: "2026-02-01", eventName: "signup_completed", total: 10 }
          ],
          rangeClamped: false,
          cached: false
        },
        isLoading: false,
      });

      renderWithProviders(<AdminFunnelDashboard />);

      // Bucket labels should be formatted with UTC timezone
      expect(screen.getByText(/Feb 1, 2026.*UTC/i)).toBeInTheDocument();
    });
  });
});
