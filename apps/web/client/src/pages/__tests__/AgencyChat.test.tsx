/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock wouter
vi.mock("wouter", () => ({
  useRoute: vi.fn(() => [true, { id: "agency-1" }]),
  useLocation: vi.fn(() => ["/agencies/agency-1", vi.fn()]),
}));

// Mock auth
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: "42", name: "Test" },
  })),
}));

// Mock tRPC hooks
vi.mock("@/hooks/useAgencyQuery", () => ({
  useAgencyById: vi.fn(() => ({
    data: { id: "agency-1", name: "Test Agency" },
    isLoading: false,
    isError: false,
  })),
}));

// Mock stream hook
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
vi.mock("@/hooks/useAgencyStream", () => ({
  useAgencyStream: vi.fn(() => ({
    messages: [],
    activeAgent: null,
    isStreaming: false,
    error: null,
    creditsUsed: 0,
    activityEvents: [],
    connect: mockConnect,
    disconnect: mockDisconnect,
  })),
}));

import AgencyChat from "../AgencyChat";

describe("AgencyChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders agency name in header", () => {
    render(<AgencyChat />);
    expect(screen.getByText("Test Agency")).toBeTruthy();
  });

  it("renders empty state when no messages", () => {
    render(<AgencyChat />);
    expect(screen.getByText("Start a conversation")).toBeTruthy();
  });

  it("renders message input area", () => {
    render(<AgencyChat />);
    expect(
      screen.getByPlaceholderText("Send a message..."),
    ).toBeTruthy();
  });

  it("renders with messages from stream", async () => {
    const { useAgencyStream } = await import("@/hooks/useAgencyStream");
    (useAgencyStream as any).mockReturnValue({
      messages: [
        { id: "u1", role: "user", content: "Hello" },
        {
          id: "a1",
          role: "assistant",
          content: "Hi there!",
          agentName: "Researcher",
        },
      ],
      activeAgent: "Researcher",
      isStreaming: false,
      error: null,
      creditsUsed: 0.5,
      activityEvents: [],
      connect: mockConnect,
      disconnect: mockDisconnect,
    });

    render(<AgencyChat />);
    expect(screen.getByText("Hello")).toBeTruthy();
    expect(screen.getByText("Hi there!")).toBeTruthy();
    expect(screen.getAllByText("Researcher").length).toBeGreaterThanOrEqual(1);
  });

  it("shows error message when stream errors", async () => {
    const { useAgencyStream } = await import("@/hooks/useAgencyStream");
    (useAgencyStream as any).mockReturnValue({
      messages: [],
      activeAgent: null,
      isStreaming: false,
      error: "Connection lost",
      creditsUsed: 0,
      activityEvents: [],
      connect: mockConnect,
      disconnect: mockDisconnect,
    });

    render(<AgencyChat />);
    expect(screen.getByText("Connection lost")).toBeTruthy();
  });

  it("shows credit usage when available", async () => {
    const { useAgencyStream } = await import("@/hooks/useAgencyStream");
    (useAgencyStream as any).mockReturnValue({
      messages: [{ id: "u1", role: "user", content: "test" }],
      activeAgent: null,
      isStreaming: false,
      error: null,
      creditsUsed: 1.25,
      activityEvents: [],
      connect: mockConnect,
      disconnect: mockDisconnect,
    });

    render(<AgencyChat />);
    expect(screen.getByText("1.25 credits")).toBeTruthy();
  });
});
