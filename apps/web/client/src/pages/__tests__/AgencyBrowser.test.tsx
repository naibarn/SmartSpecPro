/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockSetLocation = vi.fn();
const mockUseUtils = vi.fn();
const mockListPagesQuery = vi.fn();
const mockDeleteMutation = vi.fn();
const mockRequestPublishMutation = vi.fn();
const mockCancelPublishMutation = vi.fn();
const mockCreateHybridPreviewTokenMutation = vi.fn();

vi.mock("wouter", () => ({
  useLocation: () => ["/agencies", mockSetLocation],
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 7 },
  }),
}));

vi.mock("@/hooks/useAgencyQuery", () => ({
  useAgencyList: () => ({
    data: {
      agencies: [
        {
          id: "agency-1",
          name: "Growth Agency",
          description: "Growth experiments and publishing workflows.",
          status: "published",
          agentCount: 3,
          canEdit: true,
          visibility: "private",
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock("@/hooks/useTenantFeatureFlag", () => ({
  useTenantFeatureFlags: () => ({
    META_CHANNELS_ENABLED: true,
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mockUseUtils,
    socialPublishing: {
      listPages: {
        useQuery: mockListPagesQuery,
      },
    },
    agency: {
      delete: {
        useMutation: mockDeleteMutation,
      },
      requestPublish: {
        useMutation: mockRequestPublishMutation,
      },
      cancelPublishRequest: {
        useMutation: mockCancelPublishMutation,
      },
    },
    hybridOrchestration: {
      createPreviewToken: {
        useMutation: vi.fn(() => mockCreateHybridPreviewTokenMutation()),
      },
    },
    groups: {
      list: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
    },
  },
}));

vi.mock("@/components/agency/AgencyTemplateModal", () => ({
  AgencyTemplateModal: () => null,
}));

describe("AgencyBrowser", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUseUtils.mockReturnValue({
      agency: {
        list: {
          invalidate: vi.fn(),
        },
        listAgencyGroups: {
          invalidate: vi.fn(),
        },
      },
      socialPublishing: {
        listPages: {
          invalidate: vi.fn(),
        },
      },
      groups: {
        list: {
          invalidate: vi.fn(),
        },
      },
    });

    mockListPagesQuery.mockReturnValue({
      data: [
        {
          id: 101,
          label: "Main Page",
          status: "active",
          provider: "meta",
          pageName: "Main Page",
          pageCategory: "Business",
          providerPageId: "page-101",
          publishingReady: true,
          publishingIssueCode: "ready",
          publishingIssue: null,
        },
        {
          id: 102,
          label: "Support Page",
          status: "active",
          provider: "meta",
          pageName: "Support Page",
          pageCategory: "Support",
          providerPageId: "page-102",
          publishingReady: false,
          publishingIssueCode: "missing_page_access",
          publishingIssue: "Facebook Page access is missing. Reconnect the Page before auto-posting.",
        },
      ],
      isLoading: false,
      error: null,
    });

    mockDeleteMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    mockRequestPublishMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    mockCancelPublishMutation.mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    });
    mockCreateHybridPreviewTokenMutation.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        token: "preview-token-123",
        expiresAt: "2026-03-24T12:00:00.000Z",
      }),
      isPending: false,
    });
  });

  it("shows Facebook auto-post readiness in the agencies overview", async () => {
    const { default: AgencyBrowser } = await import("../AgencyBrowser");

    render(<AgencyBrowser />);

    expect(screen.getByText("Facebook auto-post")).toBeInTheDocument();
    expect(screen.getByText(/1\/2 ready/i)).toBeInTheDocument();
    expect(screen.getByText(/need access or publishing enabled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open Social Publishing/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Evaluate Agency/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Hybrid Orchestrate/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Regenerate Preview Token/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Regenerate Preview Token/i }));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith(
        "/agencies/agency-1/hybrid-preview?hybridPreviewToken=preview-token-123",
      );
    });
  });
});
