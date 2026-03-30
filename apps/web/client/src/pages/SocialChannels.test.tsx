import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SocialChannels from "./SocialChannels";

const {
  mockGetConnectionStatusQuery,
  mockGetAuthUrlQuery,
  mockUseUtils,
  mockUseMutation,
} = vi.hoisted(() => ({
  mockGetConnectionStatusQuery: vi.fn(),
  mockGetAuthUrlQuery: vi.fn(),
  mockUseUtils: vi.fn(),
  mockUseMutation: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: mockUseUtils,
    metaChannels: {
      getConnectionStatus: {
        useQuery: mockGetConnectionStatusQuery,
      },
      getAuthUrl: {
        useQuery: mockGetAuthUrlQuery,
      },
      updatePageSettings: {
        useMutation: mockUseMutation,
      },
      connectPage: {
        useMutation: mockUseMutation,
      },
      disconnectPage: {
        useMutation: mockUseMutation,
      },
    },
  },
}));

describe("SocialChannels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUtils.mockReturnValue({
      metaChannels: {
        getConnectionStatus: {
          invalidate: vi.fn(),
        },
      },
    });
    mockGetAuthUrlQuery.mockReturnValue({
      refetch: vi.fn().mockResolvedValue({
        data: {
          authorization_url: "https://www.facebook.com/v25.0/dialog/oauth?client_id=test",
        },
      }),
      isFetching: false,
    });
    mockUseMutation.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      variables: undefined,
    });
  });

  it("renders a connected Meta page with routing controls", () => {
    mockGetConnectionStatusQuery.mockReturnValue({
      data: {
        status: "connected",
        connection: {
          id: 1,
          providerUserId: "meta-user-1",
          connectionStatus: "active",
          tokenMasked: "***",
          tokenExpiresAt: null,
          pages: [
            {
              pageId: 77,
              providerPageId: "page_77",
              pageName: "Demo Page",
              pageCategory: "Business",
              status: "active",
              selectedForInbox: true,
              selectedForPublishing: true,
              selectedForModeration: false,
              aiActionMode: "draft_only",
              autoSendConfidenceThreshold: 0.95,
              tokenExpiresAt: null,
            },
          ],
        },
      },
      error: null,
      isLoading: false,
      refetch: vi.fn(),
      isFetching: false,
    });

    render(<SocialChannels />);

    expect(screen.getByText("Social Channels")).toBeInTheDocument();
    expect(screen.getByText("Connected pages")).toBeInTheDocument();
    expect(screen.getByText("Demo Page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /connect meta/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sync webhooks/i })).toBeInTheDocument();
  });
});
