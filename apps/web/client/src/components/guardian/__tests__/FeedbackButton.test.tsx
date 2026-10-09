/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";

const mockRoute = vi.hoisted(() => ({
  location: "/dashboard",
  setLocation: vi.fn(),
}));
const feedbackMocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  mutate: vi.fn(),
  createChat: vi.fn(),
  user: null as { role?: string } | null,
  loading: false,
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
          reset: vi.fn(),
        }),
      },
    },
  },
}));

vi.mock("@/components/chat/ChatView", () => ({
  ChatView: ({
    conversationId,
    density,
    mapContextDraft,
    onRemoveMapContext,
  }: {
    conversationId: number | null;
    density?: "default" | "compact";
    mapContextDraft?: { id: number; contextText: string } | null;
    onRemoveMapContext?: () => void;
  }) => {
    const [draft, setDraft] = useState("");
    return (
      <section data-testid="global-chat-view" data-chat-density={density ?? "default"}>
        ChatView conversation {conversationId ?? "pending"}
        <textarea aria-label="Chat draft test" value={draft} onChange={event => setDraft(event.target.value)} />
        {mapContextDraft && <>
          <p>{mapContextDraft.contextText}</p>
          <button type="button" onClick={onRemoveMapContext}>Remove attached map context</button>
        </>}
      </section>
    );
  },
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
  useAuth: () => ({ user: feedbackMocks.user, loading: feedbackMocks.loading }),
}));

vi.mock("@/i18n/useScopedTranslation", () => ({
  useScopedTranslation: () => ({
    t: (key: string) => ({
      "chat.guest.checkingSession": "Checking your sign-in…",
      "chat.guest.panelTitle": "AI Chat & Feedback",
      "chat.guest.chatTab": "AI Chat",
      "chat.guest.feedbackTab": "Send Feedback",
      "chat.guest.signInRequired": "Sign in to use AI Chat",
      "chat.guest.description": "Public emergency information remains available.",
      "chat.guest.signIn": "Sign in to continue",
      "feedback.panelTitle": "AI Chat & Feedback",
      "feedback.chatTab": "AI Chat",
      "feedback.taskControlTab": "Task Control",
      "feedback.feedbackTab": "Send Feedback",
      "feedback.sections": "Help sections",
      "feedback.chatSection": "AI Chat",
      "feedback.taskControlSection": "Task Control",
      "feedback.titlePlaceholder": "Title",
      "feedback.descriptionPlaceholder": "Describe in detail...",
      "feedback.submit": "Submit Feedback",
      "feedback.sendAsUrgent": "Send feedback as urgent",
      "feedback.normalDescription": "Tell us what happened and how we can improve.",
      "feedback.urgentDescription": "Use this for urgent issues only.",
      "assistantAppearance.launcherLabel": "AI Chat & Feedback",
      "assistantAppearance.launcherAriaLabel": "Open AI Chat & Feedback",
    })[key] ?? key,
  }),
}));

import { FeedbackButton, isAssistantBalloonEligible, isAssistantBalloonSuppressedRoute } from "../FeedbackButton";

describe("assistant reminder balloon eligibility", () => {
  const eligibleSurface = {
    dialogOpen: false,
    dragging: false,
    documentVisible: true,
    keyboardOpen: false,
    editableControlFocused: false,
    criticalOverlayOpen: false,
    routeSuppressed: false,
  };

  it.each([
    ["an open dialog", { dialogOpen: true }],
    ["launcher dragging", { dragging: true }],
    ["a hidden document", { documentVisible: false }],
    ["an open virtual keyboard", { keyboardOpen: true }],
    ["a focused editable control", { editableControlFocused: true }],
    ["a modal or critical overlay", { criticalOverlayOpen: true }],
    ["an immersive route", { routeSuppressed: true }],
  ])("suppresses decorative balloons during %s", (_reason, blocked) => {
    expect(isAssistantBalloonEligible({ ...eligibleSurface, ...blocked })).toBe(false);
  });

  it("allows a balloon when no blocking surface is active", () => {
    expect(isAssistantBalloonEligible(eligibleSurface)).toBe(true);
  });

  it.each([
    "/video-studio",
    "/video-studio/project-123",
    "/video-editor?projectId=123",
    "/presentation-editor/doc-123",
    "/presentation/123/play",
    "/disaster/map",
  ])("suppresses balloons on the immersive route %s", route => {
    expect(isAssistantBalloonSuppressedRoute(route)).toBe(true);
  });

  it.each([
    "/video-studiox/project-123",
    "/video-editor-help",
    "/presentation-editor",
    "/presentation/123",
    "/disaster",
    "/dashboard/emergency",
  ])("does not classify unrelated route %s as an immersive route", route => {
    expect(isAssistantBalloonSuppressedRoute(route)).toBe(false);
  });
});

describe("FeedbackButton placement", () => {
  it("keeps the floating trigger readable over dark public sections", () => {
    render(<FeedbackButton />);
    const trigger = screen.getByLabelText("Open AI Chat & Feedback");
    expect(trigger).toHaveClass(
      "bg-white",
      "text-slate-900",
      "dark:bg-white",
      "dark:text-slate-900",
    );
    expect(screen.getByText("AI Chat & Feedback")).toHaveClass("hidden", "md:inline");
  });

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
    feedbackMocks.loading = false;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      writable: true,
      value: 1024,
    });
  });

  function openFeedbackForm() {
    fireEvent.click(screen.getByLabelText("Open AI Chat & Feedback"));
    fireEvent.click(screen.getByRole("tab", { name: "Send Feedback" }));
  }

  it("docks to the bottom right by default", () => {
    render(<FeedbackButton />);

    const button = screen.getByLabelText("Open AI Chat & Feedback");
    expect(button.style.right).toBe("16px");
    expect(button.style.bottom).toBe("calc(16px + env(safe-area-inset-bottom))");
    expect(button.style.left).toBe("");
    expect(button.style.top).toBe("");
  });

  it("preserves the existing Chat draft when switching to Task Control and back", async () => {
    feedbackMocks.user = { role: "member" };
    render(<FeedbackButton />);
    fireEvent.click(screen.getByLabelText("Open AI Chat & Feedback"));
    const draft = await screen.findByRole("textbox", { name: "Chat draft test" });
    fireEvent.change(draft, { target: { value: "Keep this unsent message" } });
    fireEvent.click(screen.getByRole("tab", { name: "Task Control" }));
    fireEvent.click(screen.getByRole("tab", { name: "AI Chat" }));
    const restoredDraft = await screen.findByRole("textbox", { name: "Chat draft test" });
    expect((restoredDraft as HTMLTextAreaElement).value).toBe("Keep this unsent message");
  });

  it("attaches map context without replacing the draft and removes only the context", async () => {
    feedbackMocks.user = { role: "member" };
    render(<FeedbackButton />);
    fireEvent.click(screen.getByLabelText("Open AI Chat & Feedback"));
    const draft = await screen.findByRole("textbox", { name: "Chat draft test" });
    fireEvent.change(draft, { target: { value: "My existing question" } });
    act(() => window.dispatchEvent(new CustomEvent("smartspec:emergency-map:ask-ai", {
      detail: { prompt: "Public map context summary" },
    })));
    expect(screen.getByText("Public map context summary")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "Chat draft test" }) as HTMLTextAreaElement).value).toBe("My existing question");
    fireEvent.click(screen.getByRole("button", { name: "Remove attached map context" }));
    expect(screen.queryByText("Public map context summary")).toBeNull();
    expect((screen.getByRole("textbox", { name: "Chat draft test" }) as HTMLTextAreaElement).value).toBe("My existing question");
  });

  it("keeps the anonymous public panel focused on sign-in and feedback", () => {
    render(<FeedbackButton />);
    fireEvent.click(screen.getByLabelText("Open AI Chat & Feedback"));

    expect(screen.getByRole("tab", { name: "AI Chat" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Send Feedback" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Task Control" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveClass("max-w-md", "max-h-[80dvh]");
    expect(screen.getByRole("heading", { name: "Sign in to use AI Chat" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in to continue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate Image" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Generate Video" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Chat draft test" })).not.toBeInTheDocument();
    expect(feedbackMocks.createChat).not.toHaveBeenCalled();

    act(() => window.dispatchEvent(new CustomEvent("smartspec:emergency-map:ask-ai", {
      detail: { prompt: "Do not stage this anonymous map context" },
    })));
    expect(screen.queryByText("Do not stage this anonymous map context")).not.toBeInTheDocument();
    expect(feedbackMocks.createChat).not.toHaveBeenCalled();
  });

  it("supports manual-activation keyboard navigation for the dialog tabs", () => {
    render(<FeedbackButton />);
    fireEvent.click(screen.getByLabelText("Open AI Chat & Feedback"));

    const chatTab = screen.getByRole("tab", { name: "AI Chat" });
    const feedbackTab = screen.getByRole("tab", { name: "Send Feedback" });
    expect(chatTab).toHaveAttribute("aria-controls", "assistant-help-panel-chat");
    expect(chatTab).toHaveAttribute("aria-selected", "true");
    expect(chatTab).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "assistant-help-tab-chat");

    chatTab.focus();
    fireEvent.keyDown(chatTab, { key: "ArrowRight" });
    expect(feedbackTab).toHaveFocus();
    expect(feedbackTab).toHaveAttribute("aria-selected", "false");
    expect(feedbackTab).toHaveAttribute("tabindex", "-1");
    expect(feedbackMocks.createChat).not.toHaveBeenCalled();

    fireEvent.click(feedbackTab);
    expect(feedbackTab).toHaveAttribute("aria-selected", "true");
    expect(feedbackTab).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "assistant-help-tab-feedback");
  });

  it("waits for session restoration before creating an authenticated conversation", async () => {
    feedbackMocks.loading = true;
    const view = render(<FeedbackButton />);
    fireEvent.click(screen.getByLabelText("Open AI Chat & Feedback"));

    expect(screen.getByText("Checking your sign-in…")).toBeInTheDocument();
    expect(feedbackMocks.createChat).not.toHaveBeenCalled();

    feedbackMocks.user = { role: "member" };
    feedbackMocks.loading = false;
    view.rerender(<FeedbackButton />);

    await waitFor(() => expect(feedbackMocks.createChat).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId("global-chat-view")).toBeInTheDocument();
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

    const button = screen.getByLabelText("Open AI Chat & Feedback");
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

    const button = screen.getByLabelText("Open AI Chat & Feedback");
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

    const button = screen.getByLabelText("Open AI Chat & Feedback");
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
    feedbackMocks.user = { role: "member" };
    render(<FeedbackButton />);
    fireEvent.click(screen.getByLabelText("Open AI Chat & Feedback"));

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
    feedbackMocks.user = { role: "member" };
    render(<FeedbackButton />);
    fireEvent.click(screen.getByLabelText("Open AI Chat & Feedback"));
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
