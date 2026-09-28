/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRoute = vi.hoisted(() => ({
  location: "/dashboard",
  setLocation: vi.fn(),
}));
const feedbackMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  mutate: vi.fn(),
  createChat: vi.fn(),
  user: null as { role?: string } | null,
}));

vi.mock("wouter", () => ({
  useLocation: () => [mockRoute.location, mockRoute.setLocation],
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    feedback: {
      submit: {
        useMutation: () => ({
          mutate: feedbackMocks.mutate,
          isPending: false,
        }),
      },
    },
    chat: {
      createConversation: {
        useMutation: () => ({
          mutateAsync: feedbackMocks.createChat,
          isPending: false,
          error: null,
        }),
      },
    },
  },
}));

vi.mock("@/components/chat/ChatView", () => ({
  ChatView: ({
    conversationId,
    density,
  }: {
    conversationId: number | null;
    density?: "default" | "compact";
  }) => (
    <section data-testid="global-chat-view" data-chat-density={density ?? "default"}>
      ChatView conversation {conversationId ?? "pending"}
    </section>
  ),
}));

vi.mock("@/components/chat/UniversalControlPlanePanel", () => ({
  UniversalControlPlanePanel: () => (
    <section data-testid="global-control-plane">Task Control Center</section>
  ),
}));

vi.mock("@/components/ui/confirm/ConfirmProvider", () => ({
  useConfirm: () => ({ confirm: feedbackMocks.confirm }),
}));

vi.mock("@/_core/hooks/useAuth", () => ({
  useAuth: () => ({ user: feedbackMocks.user }),
}));

import { FeedbackButton } from "../FeedbackButton";

describe("FeedbackButton placement", () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    mockRoute.location = "/dashboard";
    mockRoute.setLocation.mockClear();
    feedbackMocks.confirm.mockReset();
    feedbackMocks.confirm.mockResolvedValue(false);
    feedbackMocks.mutate.mockClear();
    feedbackMocks.createChat.mockReset();
    feedbackMocks.createChat.mockResolvedValue({ id: 42 });
    feedbackMocks.user = null;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1024,
    });
  });

  function openFeedbackForm() {
    fireEvent.click(screen.getByLabelText("Open AI Chat and Feedback"));
    fireEvent.click(screen.getByRole("tab", { name: "Send Feedback" }));
  }

  it("docks to the bottom right by default", () => {
    render(<FeedbackButton />);

    const button = screen.getByLabelText("Open AI Chat and Feedback");
    expect(button.style.right).toBe("16px");
    expect(button.style.bottom).toBe("calc(16px + env(safe-area-inset-bottom))");
    expect(button.style.left).toBe("");
    expect(button.style.top).toBe("");
  });

  it("ignores stored custom positions and docks to the bottom right", () => {
    localStorage.setItem(
      "feedback-button-position",
      JSON.stringify({
        version: 1,
        placement: { mode: "custom", x: 420, y: 240 },
      }),
    );

    render(<FeedbackButton />);

    const button = screen.getByLabelText("Open AI Chat and Feedback");
    expect(button.style.right).toBe("16px");
    expect(button.style.bottom).toBe("calc(16px + env(safe-area-inset-bottom))");
    expect(button.style.left).toBe("");
    expect(button.style.top).toBe("");
    expect(localStorage.getItem("feedback-button-position")).toBeNull();
  });

  it("keeps the default dock on tablet and desktop widths", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 768,
    });

    render(<FeedbackButton />);

    const button = screen.getByLabelText("Open AI Chat and Feedback");
    expect(button.style.right).toBe("16px");
    expect(button.style.bottom).toBe("calc(16px + env(safe-area-inset-bottom))");
    expect(button.style.left).toBe("");
  });

  it("docks to the bottom left on mobile to avoid right-side controls", () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 390,
    });

    render(<FeedbackButton />);

    const button = screen.getByLabelText("Open AI Chat and Feedback");
    expect(button.style.left).toBe("16px");
    expect(button.style.bottom).toBe("calc(16px + env(safe-area-inset-bottom))");
    expect(button.style.right).toBe("");
  });

  it("keeps normal feedback as the default and submits without confirmation", async () => {
    render(<FeedbackButton />);
    openFeedbackForm();
    fireEvent.change(screen.getByPlaceholderText("Title"), {
      target: { value: "Normal feedback" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));

    await waitFor(() => expect(feedbackMocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ priority: "normal" }),
    ));
    expect(feedbackMocks.confirm).not.toHaveBeenCalled();
  });

  it("uses a wrapping textarea for long titles", () => {
    render(<FeedbackButton />);
    openFeedbackForm();

    const titleField = screen.getByPlaceholderText("Title");
    expect(titleField.tagName).toBe("TEXTAREA");
    expect(titleField).toHaveAttribute("rows", "2");
  });

  it("requires confirmation before submitting urgent feedback", async () => {
    render(<FeedbackButton />);
    openFeedbackForm();
    fireEvent.change(screen.getByPlaceholderText("Title"), {
      target: { value: "Urgent feedback" },
    });
    fireEvent.click(screen.getByRole("switch", { name: "Send feedback as urgent" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit Feedback" }));

    await waitFor(() => expect(feedbackMocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Send urgent feedback?",
        tone: "danger",
      }),
    ));
    expect(feedbackMocks.mutate).not.toHaveBeenCalled();
  });

  it("opens AI Chat from the single combined Help and Feedback button", async () => {
    render(<FeedbackButton />);
    fireEvent.click(screen.getByLabelText("Open AI Chat and Feedback"));

    expect(screen.getByRole("tab", { name: "AI Chat" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await waitFor(() => {
      expect(screen.getByTestId("global-chat-view")).toHaveTextContent(
        "conversation 42",
      );
    });
    expect(screen.getByTestId("global-chat-view")).toHaveAttribute(
      "data-chat-density",
      "compact",
    );
    expect(screen.getByRole("dialog")).toHaveClass(
      "h-dvh",
      "sm:h-[min(88vh,760px)]",
    );
    expect(feedbackMocks.createChat).toHaveBeenCalledWith({
      title: "AI Chat Assistant",
    });
  });

  it("keeps Task Control Center in the same combined panel", () => {
    render(<FeedbackButton />);
    fireEvent.click(screen.getByLabelText("Open AI Chat and Feedback"));
    fireEvent.click(screen.getByRole("tab", { name: "Task Control" }));

    expect(screen.getByTestId("global-control-plane")).toBeInTheDocument();
    expect(mockRoute.setLocation).not.toHaveBeenCalledWith(
      "/chat?panel=control-plane",
    );
  });

  it("shows the Feedback Hub link only to admins", () => {
    feedbackMocks.user = { role: "admin" };
    render(<FeedbackButton />);
    openFeedbackForm();

    expect(
      screen.getByRole("button", { name: /Admin Feedback Hub/ }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Admin Feedback Hub/ }));
    expect(mockRoute.setLocation).toHaveBeenCalledWith("/admin/feedback-hub");
  });

  it("does not show the Feedback Hub link to non-admins", () => {
    feedbackMocks.user = { role: "domain_admin" };
    render(<FeedbackButton />);
    openFeedbackForm();

    expect(
      screen.queryByRole("button", { name: /Admin Feedback Hub/ }),
    ).not.toBeInTheDocument();
  });
});
