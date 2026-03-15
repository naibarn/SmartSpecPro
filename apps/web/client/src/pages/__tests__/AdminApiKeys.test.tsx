import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      apiKeys: {
        list: { invalidate: vi.fn() },
        listWebhooks: { invalidate: vi.fn() },
      },
    }),
    apiKeys: {
      list: { useQuery: vi.fn() },
      create: { useMutation: vi.fn() },
      revoke: { useMutation: vi.fn() },
      getUsageStats: { useQuery: vi.fn() },
      listWebhooks: { useQuery: vi.fn() },
      deleteWebhook: { useMutation: vi.fn() },
      reEnableWebhook: { useMutation: vi.fn() },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import AdminAPIKeys from "../AdminAPIKeys";
import { trpc } from "@/lib/trpc";

const mockListQuery = vi.mocked(trpc.apiKeys.list.useQuery);
const mockCreateMutation = vi.mocked(trpc.apiKeys.create.useMutation);
const mockRevokeMutation = vi.mocked(trpc.apiKeys.revoke.useMutation);
const mockStatsQuery = vi.mocked(trpc.apiKeys.getUsageStats.useQuery);
const mockWebhooksQuery = vi.mocked(trpc.apiKeys.listWebhooks.useQuery);
const mockDeleteWebhook = vi.mocked(trpc.apiKeys.deleteWebhook.useMutation);
const mockReEnableWebhook = vi.mocked(trpc.apiKeys.reEnableWebhook.useMutation);

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const keyFixtures = [
  {
    id: "key-1",
    name: "Test Key",
    keyPrefix: "sk-ssp_test_ab",
    scopes: ["skills:list", "skills:execute"],
    rateLimit: 60,
    creditLimit: null,
    isActive: true,
    lastUsedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "key-2",
    name: "Read Key",
    keyPrefix: "sk-ssp_read_ab",
    scopes: ["skills:list", "agencies:list", "jobs:read", "events:read"],
    rateLimit: 30,
    creditLimit: 100,
    isActive: false,
    lastUsedAt: "2026-01-10T00:00:00Z",
    createdAt: "2026-01-01T00:00:00Z",
  },
];

function queryMock(data: any) {
  return { data, isLoading: false, error: null };
}

function mutationMock(onSuccess?: Function) {
  return {
    mutate: vi.fn((input: any) => onSuccess?.(input)),
    isPending: false,
    error: null,
  };
}

function renderComponent() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AdminAPIKeys />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListQuery.mockReturnValue(queryMock(keyFixtures) as any);
  mockCreateMutation.mockReturnValue(mutationMock() as any);
  mockRevokeMutation.mockReturnValue(mutationMock() as any);
  mockStatsQuery.mockReturnValue(queryMock(null) as any);
  mockWebhooksQuery.mockReturnValue(queryMock([]) as any);
  mockDeleteWebhook.mockReturnValue(mutationMock() as any);
  mockReEnableWebhook.mockReturnValue(mutationMock() as any);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AdminAPIKeys", () => {
  it("renders key list table with API keys", () => {
    renderComponent();
    expect(screen.getByText("Test Key")).toBeInTheDocument();
    expect(screen.getByText("Read Key")).toBeInTheDocument();
  });

  it("shows key prefix in monospace code", () => {
    renderComponent();
    expect(screen.getByText(/sk-ssp_test_ab\.\.\./)).toBeInTheDocument();
  });

  it("shows Active/Inactive status badges", () => {
    renderComponent();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
  });

  it("shows Create API Key button", () => {
    renderComponent();
    expect(screen.getByText("Create API Key")).toBeInTheDocument();
  });

  it("opens create dialog on button click", async () => {
    renderComponent();
    fireEvent.click(screen.getByText("Create API Key"));
    await waitFor(() => {
      expect(screen.getByText("Configure scopes and limits.")).toBeInTheDocument();
    });
  });

  it("shows scope checkboxes in create dialog", async () => {
    renderComponent();
    fireEvent.click(screen.getByText("Create API Key"));
    await waitFor(() => {
      expect(screen.getByLabelText("skills:list")).toBeInTheDocument();
      expect(screen.getByLabelText("skills:execute")).toBeInTheDocument();
      expect(screen.getByLabelText("media:generate")).toBeInTheDocument();
    });
  });

  it("shows scope bundle quick-select buttons", async () => {
    renderComponent();
    fireEvent.click(screen.getByText("Create API Key"));
    await waitFor(() => {
      expect(screen.getByText("Read-only")).toBeInTheDocument();
      expect(screen.getByText("Full Access")).toBeInTheDocument();
    });
  });

  it("shows the page heading", async () => {
    renderComponent();
    // Page title is in the h1 heading
    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toContain("API Keys");
  });

  it("shows revoke confirmation dialog", async () => {
    renderComponent();
    const trashButtons = screen.getAllByTitle("Revoke key");
    fireEvent.click(trashButtons[0]);
    await waitFor(() => {
      expect(screen.getByText("Revoke API Key?")).toBeInTheDocument();
      // Description text may be split across elements
      expect(screen.getByText(/cannot be undone/)).toBeInTheDocument();
    });
  });

  it("calls revoke mutation on confirm", async () => {
    const revokeFn = vi.fn();
    mockRevokeMutation.mockReturnValue({ mutate: revokeFn, isPending: false } as any);

    renderComponent();
    fireEvent.click(screen.getAllByTitle("Revoke key")[0]);

    await waitFor(() => {
      expect(screen.getByText("Revoke API Key?")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Revoke"));
    expect(revokeFn).toHaveBeenCalledWith({ keyId: "key-1" });
  });

  it("renders Webhooks tab content on click", async () => {
    renderComponent();
    const webhooksTab = screen.getByRole("tab", { name: "Webhooks" });
    fireEvent.click(webhooksTab);
    await waitFor(() => {
      // Webhooks tab panel is active
      expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    });
  });
});
