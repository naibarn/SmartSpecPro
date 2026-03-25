/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("wouter", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlag: vi.fn(() => false),
}));

const mockListQuery = vi.fn();
const mockMutation = () => ({ mutateAsync: vi.fn(), isPending: false });

vi.mock("@/lib/trpc", () => ({
  trpc: {
    mcpServers: {
      list: { useQuery: (...args: any[]) => mockListQuery(...args) },
      create: { useMutation: () => mockMutation() },
      update: { useMutation: () => mockMutation() },
      delete: { useMutation: () => mockMutation() },
      testConnection: { useMutation: () => mockMutation() },
      assignToTarget: { useMutation: () => mockMutation() },
      removeAssignment: { useMutation: () => mockMutation() },
      listDiscoveredTools: { fetch: vi.fn() },
    },
    useUtils: vi.fn(() => ({})),
  },
}));

import McpServerManager from "../../pages/McpServerManager";

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("McpServerManager", () => {
  it("renders the feature-disabled state without crashing", () => {
    mockListQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    renderWithProviders(<McpServerManager />);

    expect(screen.getByText("MCP Server Registry")).toBeDefined();
    expect(screen.getByText("This feature is not enabled for your organization.")).toBeDefined();
  });
});
