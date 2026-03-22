/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AgencyChatStream } from "../AgencyChatStream";
import type {
  AgencyStreamMessage,
  ToolCallState,
  GuardrailEvent,
  ApprovalRequest,
} from "@/hooks/useAgencyStream";

const defaultProps = {
  messages: [] as AgencyStreamMessage[],
  activeAgent: null,
  isStreaming: false,
  error: null,
  creditsUsed: 0,
  activityEvents: [],
  toolCalls: [] as ToolCallState[],
  guardrailEvents: [] as GuardrailEvent[],
  pendingApproval: null as ApprovalRequest | null,
  isPollingFallback: false,
};

describe("AgencyChatStream", () => {
  it("renders streaming text with typing indicator when isStreaming", () => {
    const messages: AgencyStreamMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        content: "Hello world",
        agentName: "Writer",
        isStreaming: true,
      },
    ];

    render(
      <AgencyChatStream
        {...defaultProps}
        messages={messages}
        isStreaming={true}
      />,
    );

    expect(screen.getByText("Hello world")).toBeTruthy();
    expect(screen.getByTestId("typing-cursor")).toBeTruthy();
  });

  it("renders tool status spinner for in-progress tool calls", () => {
    const toolCalls: ToolCallState[] = [
      {
        toolCallId: "tc1",
        toolName: "web-search",
        agentName: "Researcher",
        status: "running",
        startedAt: Date.now(),
      },
    ];
    const messages: AgencyStreamMessage[] = [
      {
        id: "msg-1",
        role: "assistant",
        content: "Searching...",
        agentName: "Researcher",
        isStreaming: true,
      },
    ];

    render(
      <AgencyChatStream
        {...defaultProps}
        messages={messages}
        toolCalls={toolCalls}
        isStreaming={true}
      />,
    );

    expect(screen.getByTestId("tool-spinner")).toBeTruthy();
    expect(screen.getByText("web-search")).toBeTruthy();
  });

  it("renders completed tool call with success icon", () => {
    const toolCalls: ToolCallState[] = [
      {
        toolCallId: "tc1",
        toolName: "web-search",
        agentName: "Researcher",
        status: "success",
        startedAt: Date.now() - 1000,
        endedAt: Date.now(),
      },
    ];

    render(
      <AgencyChatStream
        {...defaultProps}
        toolCalls={toolCalls}
        isStreaming={false}
      />,
    );

    expect(screen.getByTestId("tool-success")).toBeTruthy();
    expect(screen.queryByTestId("tool-spinner")).toBeNull();
  });

  it("renders agent switch badge", () => {
    render(
      <AgencyChatStream
        {...defaultProps}
        activityEvents={[
          {
            type: "agent_switch",
            agentName: "Editor",
            timestamp: Date.now(),
            data: {},
          },
        ]}
      />,
    );

    expect(screen.getByText("Editor took over")).toBeTruthy();
  });

  it("renders cancel button when isStreaming and onCancel provided", () => {
    const onCancel = vi.fn();

    render(
      <AgencyChatStream
        {...defaultProps}
        isStreaming={true}
        onCancel={onCancel}
      />,
    );

    const cancelWrapper = screen.getByTestId("cancel-button-wrapper");
    expect(cancelWrapper).toBeTruthy();

    // Click the cancel button to open dropdown
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);
  });

  it("renders guardrail alert when guardrail_trigger event received", () => {
    const guardrailEvents: GuardrailEvent[] = [
      {
        type: "input",
        guardrailName: "pii_detection",
        action: "blocked",
        timestamp: Date.now(),
      },
    ];

    render(
      <AgencyChatStream
        {...defaultProps}
        guardrailEvents={guardrailEvents}
      />,
    );

    const alert = screen.getByTestId("guardrail-alert");
    expect(alert).toBeTruthy();
    expect(screen.getByText("pii_detection")).toBeTruthy();
  });

  it("renders approval card when approval is pending", () => {
    const pendingApproval: ApprovalRequest = {
      approvalKey: "uuid-1",
      step: "publish",
      summary: "Publish article?",
      agentName: "Writer",
      timestamp: Date.now(),
    };

    render(
      <AgencyChatStream
        {...defaultProps}
        pendingApproval={pendingApproval}
      />,
    );

    const card = screen.getByTestId("approval-card");
    expect(card).toBeTruthy();
    expect(screen.getByText("Publish article?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject" })).toBeTruthy();
  });

  it("renders polling fallback notice when isPollingFallback", () => {
    render(
      <AgencyChatStream
        {...defaultProps}
        isPollingFallback={true}
      />,
    );

    const banner = screen.getByTestId("polling-fallback-banner");
    expect(banner).toBeTruthy();
    expect(screen.getByText(/polling updates/i)).toBeTruthy();
  });

  it("does not render cancel button when not streaming", () => {
    render(
      <AgencyChatStream
        {...defaultProps}
        isStreaming={false}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("cancel-button-wrapper")).toBeNull();
  });
});
