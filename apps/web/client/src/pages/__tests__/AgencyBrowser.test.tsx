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
          documentVersion: 2,
          defaultEngine: "adk2",
          compileMode: "strict",
          compatibilityMode: "hybrid",
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

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      const dictionary: Record<string, string> = {
        "browser.back": "Back",
        "browser.header.title": "Agencies",
        "browser.header.subtitle": "Manage your teams",
        "browser.header.marketplace": "Marketplace",
        "browser.header.createAgency": "Create Agency",
        "browser.header.teamsCount": `${values?.count ?? 0} teams`,
        "browser.searchPlaceholder": "Search agencies",
        "browser.social.facebookAutoPost": "Facebook auto-post",
        "browser.social.partialReady": `${values?.ready ?? 0}/${values?.total ?? 0} ready`,
        "browser.social.pagesNeedAccess": "Need access or publishing enabled",
        "browser.social.openPublishing": "Open Social Publishing",
        "browser.status.published": "Published",
        "browser.visibility.private": "Private",
        "browser.card.owner": "Owner",
        "browser.card.evaluateAgency": "Evaluate Agency",
        "browser.card.agentsCount": `${values?.count ?? 0} agents`,
        "browser.card.chatTitle": "Chat",
        "browser.card.reviewTitle": "Review",
        "browser.card.shareTitle": "Share",
        "browser.card.editTitle": "Edit",
        "browser.card.deleteTitle": "Delete",
      };
      return dictionary[key] ?? key;
    },
  }),
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
    expect(screen.getByText("Hybrid Runtime")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Preview Hybrid Plan/i })).toBeInTheDocument();
    expect(screen.getByText(/planning shortcut only/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Preview Hybrid Plan/i }));

    await waitFor(() => {
      expect(mockSetLocation).toHaveBeenCalledWith(
        "/agencies/agency-1/hybrid-preview?hybridPreviewToken=preview-token-123",
      );
    });
  });
});
