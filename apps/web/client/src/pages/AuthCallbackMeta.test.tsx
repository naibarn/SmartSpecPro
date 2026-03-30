import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthCallback from "./AuthCallback";

const {
  mockUseMutation,
  mockUseLocation,
  mockUseRoute,
} = vi.hoisted(() => ({
  mockUseMutation: vi.fn(),
  mockUseLocation: vi.fn(),
  mockUseRoute: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    metaChannels: {
      completeOAuth: {
        useMutation: mockUseMutation,
      },
    },
  },
}));

vi.mock("wouter", () => ({
  useLocation: mockUseLocation,
  useRoute: mockUseRoute,
}));

describe("AuthCallback meta flow", () => {
  let setLocation = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, "", "/auth/callback/meta?code=meta-code&state=meta-state");

    setLocation = vi.fn();
    mockUseLocation.mockReturnValue(["/auth/callback/meta", setLocation]);
    mockUseRoute.mockReturnValue([true, { provider: "meta" }]);
    mockUseMutation.mockImplementation(({ onSuccess }) => ({
      mutate: (input: { code: string; state: string }) => {
        onSuccess?.(
          {
            status: "connected",
            connection: { provider: "meta", providerUserId: "meta-user-1" },
            pages: [],
          },
          input,
        );
      },
      isPending: false,
    }));
  });

  it("completes the Meta OAuth flow without creating a session", async () => {
    render(<AuthCallback />);

    await waitFor(() => {
      expect(screen.getByText("Meta Pages connected! Redirecting...")).toBeInTheDocument();
    }, { timeout: 3000 });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1600));
    });

    expect(mockUseMutation).toHaveBeenCalled();
    expect(setLocation).toHaveBeenCalledWith("/social/channels");
  });
});
