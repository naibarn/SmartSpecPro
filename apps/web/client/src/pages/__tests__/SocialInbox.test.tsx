/**
 * @vitest-environment jsdom
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mocks = vi.hoisted(() => ({
  mockUseSocialInbox: vi.fn(),
}));

vi.mock("@/hooks/useSocialInbox", () => ({
  useSocialInbox: mocks.mockUseSocialInbox,
}));

vi.mock("@/components/ui/select", () => {
  function Select({ value, onValueChange, children }: any) {
    let ariaLabel = "Select";
    const options: Array<{ value: string; label: React.ReactNode }> = [];

    React.Children.forEach(children, (child) => {
      if (!React.isValidElement(child)) return;
      if (child.type === MockSelectTrigger) {
        ariaLabel = (child.props as { "aria-label"?: string })["aria-label"] ?? ariaLabel;
      }
      if (child.type === MockSelectContent) {
        React.Children.forEach(child.props.children, (optionChild) => {
          if (!React.isValidElement(optionChild)) return;
          if (optionChild.type === MockSelectItem) {
            options.push({
              value: optionChild.props.value,
              label: optionChild.props.children,
            });
          }
        });
      }
    });

    return React.createElement(
      "select",
      {
        "aria-label": ariaLabel,
        value,
        onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onValueChange?.(event.target.value),
      },
      options.map((option) =>
        React.createElement("option", { key: option.value, value: option.value }, option.label),
      ),
    );
  }

  function MockSelectTrigger({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }

  function MockSelectValue({ placeholder }: { placeholder?: string }) {
    return React.createElement(React.Fragment, null, placeholder ?? null);
  }

  function MockSelectContent({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }

  function MockSelectItem({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  }

  return {
    Select,
    SelectTrigger: MockSelectTrigger,
    SelectValue: MockSelectValue,
    SelectContent: MockSelectContent,
    SelectItem: MockSelectItem,
  };
});

import SocialInbox from "../SocialInbox";

let inboxState: Record<string, any>;
let observerCallback: IntersectionObserverCallback | null = null;

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observerCallback = callback;
  }

  observe() {}

  disconnect() {}

  unobserve() {}
}

(globalThis as any).IntersectionObserver = MockIntersectionObserver;

const conversations = [
  {
    id: 1,
    customerDisplayName: "Nina",
    customerExternalId: "psid-1",
    channelType: "messenger",
    status: "open",
    unreadCount: 2,
    lastMessagePreview: "Need help with shipping",
    lastMessageAt: "2026-03-24T06:00:00.000Z",
    lastInboundAt: "2026-03-24T05:59:00.000Z",
    lastOutboundAt: null,
    pageId: 101,
    pageName: "Main Page",
    pageStatus: "active",
  },
  {
    id: 2,
    customerDisplayName: "Alex",
    customerExternalId: "psid-2",
    channelType: "messenger",
    status: "resolved",
    unreadCount: 0,
    lastMessagePreview: "Thanks for the quick reply",
    lastMessageAt: "2026-03-24T04:00:00.000Z",
    lastInboundAt: "2026-03-24T03:45:00.000Z",
    lastOutboundAt: "2026-03-24T04:00:00.000Z",
    pageId: 202,
    pageName: "Support Page",
    pageStatus: "active",
  },
];

const selectedConversation = {
  id: 1,
  customerDisplayName: "Nina",
  customerExternalId: "psid-1",
  channelType: "messenger",
  status: "open",
  unreadCount: 2,
  lastMessagePreview: "Need help with shipping",
  lastMessageAt: "2026-03-24T06:00:00.000Z",
  lastInboundAt: "2026-03-24T05:59:00.000Z",
  lastOutboundAt: null,
  pageId: 101,
  pageName: "Main Page",
  pageStatus: "active",
  labels: [],
  assignedToUserId: null,
  priority: null,
};

const sampleMessages = [
  {
    id: 1,
    direction: "inbound",
    senderType: "customer",
    body: "Hello, can you help me?",
    messageType: "text",
    sentAt: null,
    receivedAt: "2026-03-24T06:01:00.000Z",
    deliveryStatus: "sent",
    createdAt: "2026-03-24T06:01:00.000Z",
  },
  {
    id: 2,
    direction: "outbound",
    senderType: "agent",
    body: "Of course, I can help.",
    messageType: "text",
    sentAt: "2026-03-24T06:02:00.000Z",
    receivedAt: null,
    deliveryStatus: "sent",
    createdAt: "2026-03-24T06:02:00.000Z",
  },
];

function setupInbox(overrides: Partial<Record<string, any>> = {}) {
  inboxState = {
    conversations,
    selectedConversation,
    messages: sampleMessages,
    pages: [
      { id: 101, label: "Main Page" },
      { id: 202, label: "Support Page" },
    ],
    error: null,
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: true,
    isSending: false,
    isUpdatingStatus: false,
    selectedConversationId: 1,
    statusFilter: "open",
    pageFilter: undefined,
    setStatusFilter: vi.fn(),
    setPageFilter: vi.fn(),
    selectConversation: vi.fn(),
    sendReply: vi.fn().mockResolvedValue(undefined),
    generateDraft: vi.fn().mockResolvedValue({ draft: "Draft reply from AI", confidence: 0.95 }),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    fetchNextPage: vi.fn(),
    ...overrides,
  };
  mocks.mockUseSocialInbox.mockReturnValue(inboxState);
}

beforeEach(() => {
  vi.clearAllMocks();
  observerCallback = null;
  setupInbox();
});

describe("SocialInbox", () => {
  it("renders two-panel layout with conversation list and thread", () => {
    setupInbox({ selectedConversation: null, selectedConversationId: null, messages: [] });
    render(<SocialInbox />);

    expect(screen.getByText("Social Inbox")).toBeTruthy();
    expect(screen.getByText("Nina")).toBeTruthy();
    expect(screen.getByText("Choose a conversation from the inbox to view messages and reply.")).toBeTruthy();
  });

  it("renders conversation items with name, preview, timestamp, and unread badge", () => {
    render(<SocialInbox />);

    expect(screen.getByText("Need help with shipping")).toBeTruthy();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    expect(screen.getAllByText((content) => content === "just now" || content.includes("ago")).length).toBeGreaterThan(0);
  });

  it("filter tabs call the status setter", async () => {
    const user = userEvent.setup();
    render(<SocialInbox />);

    await user.click(screen.getByRole("tab", { name: "Pending" }));

    expect(inboxState.setStatusFilter).toHaveBeenCalledWith("pending");
  });

  it("page filter dropdown calls setPageFilter with the selected page id", async () => {
    const user = userEvent.setup();
    render(<SocialInbox />);

    await user.selectOptions(screen.getByLabelText(/page filter/i), "202");

    expect(inboxState.setPageFilter).toHaveBeenCalledWith(202);
  });

  it("clicking a conversation item calls selectConversation", async () => {
    const user = userEvent.setup();
    render(<SocialInbox />);

    await user.click(screen.getByRole("option", { name: /nina/i }));

    expect(inboxState.selectConversation).toHaveBeenCalledWith(1);
  });

  it("shows sender type indicators for each message bubble", () => {
    render(<SocialInbox />);

    expect(screen.getByText("Customer")).toBeTruthy();
    expect(screen.getByText("Agent")).toBeTruthy();
  });

  it("reply composer disables send when input is empty and sends on submit", async () => {
    const user = userEvent.setup();
    render(<SocialInbox />);

    const sendButton = screen.getByRole("button", { name: "Send reply" });
    expect(sendButton).toBeDisabled();

    await user.type(screen.getByLabelText(/reply message/i), "Hello!");
    expect(sendButton).not.toBeDisabled();

    await user.click(sendButton);

    expect(inboxState.sendReply).toHaveBeenCalledWith("Hello!");
  });

  it("shows loading state while sendReply is pending", () => {
    setupInbox({ isSending: true, selectedConversationId: 1 });
    render(<SocialInbox />);

    expect(screen.getByRole("button", { name: "Send reply" })).toBeDisabled();
  });

  it("AI Draft populates the composer and shows confidence", async () => {
    const user = userEvent.setup();
    render(<SocialInbox />);

    await user.click(screen.getByRole("button", { name: "Generate AI draft reply" }));

    expect(inboxState.generateDraft).toHaveBeenCalled();
    expect(await screen.findByDisplayValue("Draft reply from AI")).toBeTruthy();
    expect(screen.getByText("95% confident")).toBeTruthy();
  });

  it("mark resolved and mark pending buttons call updateConversationStatus", async () => {
    const user = userEvent.setup();
    render(<SocialInbox />);

    await user.click(screen.getByRole("button", { name: "Mark Resolved" }));
    await user.click(screen.getByRole("button", { name: "Mark Pending" }));

    expect(inboxState.updateStatus).toHaveBeenCalledWith("resolved");
    expect(inboxState.updateStatus).toHaveBeenCalledWith("pending");
  });

  it("triggers infinite scroll load more when the sentinel becomes visible", () => {
    render(<SocialInbox />);

    expect(observerCallback).toBeTruthy();
    act(() => {
      observerCallback?.([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    });

    expect(inboxState.fetchNextPage).toHaveBeenCalled();
  });

  it("shows the empty state when there are no conversations and no selection", () => {
    setupInbox({
      conversations: [],
      selectedConversation: null,
      messages: [],
      hasNextPage: false,
      selectedConversationId: null,
    });
    render(<SocialInbox />);

    expect(screen.getByText("No conversations")).toBeTruthy();
    expect(screen.getByText("Select a conversation")).toBeTruthy();
  });

  it("shows an alert when the hook returns an error", () => {
    setupInbox({ error: new Error("Feature disabled") });
    render(<SocialInbox />);

    expect(screen.getByText("Unable to load Social Inbox")).toBeTruthy();
    expect(screen.getByText("Feature disabled")).toBeTruthy();
  });
});
