import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const { mockUseQuery, mockUseAuth } = vi.hoisted(() => ({
  mockUseQuery: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    chat: {
      getMessageCost: {
        useQuery: mockUseQuery,
      },
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: mockUseAuth,
}));

import { MessageCostBadge } from "../MessageCostBadge";

beforeEach(() => {
  vi.clearAllMocks();
  mockUseQuery.mockReturnValue({ data: null, isLoading: false });
  mockUseAuth.mockReturnValue({ user: { role: "user" } });
});

describe("MessageCostBadge", () => {
  it("does not fetch cost data until expanded", () => {
    render(
      <MessageCostBadge
        messageId={1}
        model="gpt-4o"
        inputTokens={500}
        outputTokens={200}
        creditsUsed="3"
      />
    );

    // The tRPC query should be called with enabled: false initially
    expect(mockUseQuery).toHaveBeenCalledWith(
      { messageId: 1 },
      expect.objectContaining({ enabled: false })
    );
  });

  it("displays model, tokens, credits in compact view", () => {
    render(
      <MessageCostBadge
        messageId={1}
        model="gpt-4o"
        inputTokens={500}
        outputTokens={700}
        creditsUsed="3"
      />
    );

    // Should show model name
    expect(screen.getByText(/gpt-4o/)).toBeTruthy();
    // Should show total tokens (1200 -> "1.2K")
    expect(screen.getByText(/1\.2K tokens/)).toBeTruthy();
    // Should show credits
    expect(screen.getByText(/3 credits/)).toBeTruthy();
  });

  it("shows full breakdown when expanded", async () => {
    mockUseQuery.mockReturnValue({
      data: {
        model: "gpt-4o",
        provider: "OpenRouter",
        inputTokens: 500,
        outputTokens: 200,
        totalTokens: 700,
        creditsUsed: 3,
        responseTimeMs: 1400,
        wasFallback: false,
        fallbackFrom: null,
      },
      isLoading: false,
    });

    render(
      <MessageCostBadge
        messageId={1}
        model="gpt-4o"
        inputTokens={500}
        outputTokens={200}
        creditsUsed="3"
      />
    );

    // Click to expand
    const badge = screen.getByRole("button");
    fireEvent.click(badge);

    // After expanding, query should be enabled
    expect(mockUseQuery).toHaveBeenCalledWith(
      { messageId: 1 },
      expect.objectContaining({ enabled: true })
    );
  });
});
