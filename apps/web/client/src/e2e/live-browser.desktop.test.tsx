import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { LiveBrowserWorkspace } from "../components/automation/LiveBrowserWorkspace";

describe("live-browser desktop e2e gates", () => {
  it("renders the live workspace with the embedded viewport and staged browser intelligence context", () => {
    (globalThis as typeof globalThis & {
      __SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__?: string;
    }).__SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__ = "https://browser.smart.local/embed";

    render(
      <LiveBrowserWorkspace
        session={{
          sessionId: "lbs_gate123",
          tenantId: "tenant-123",
          userId: 42,
          sourceType: "automation",
          sourceId: "task-1",
          status: "agent_running",
          controlMode: "agent_control",
          sessionVersion: 6,
          policyContext: {
            skillDraft: {
              status: "ready",
              skillId: "checkout_assistant",
              note: "Reusable browser skill draft is ready.",
              syncedSkillSlug: "checkout-assistant-v1",
            },
            siteDiscovery: {
              summary: "Found the target ecommerce checkout and pricing surfaces.",
              candidates: [
                {
                  label: "Primary checkout",
                  url: "https://example.com/checkout",
                  reason: "Best match for completing the checkout validation task.",
                },
              ],
            },
          },
          browserContextRef: {
            activeTabId: "tab_1",
            url: "https://example.com/checkout",
            pageTitle: "Checkout",
            pageSensitivity: "financial",
          },
          stream: {
            viewerToken: "viewer-token-123",
            expiresAt: "2026-03-13T03:00:00Z",
          },
          activeTabCount: 1,
          startedAt: "2026-03-13T02:50:00Z",
          lastActivityAt: "2026-03-13T02:55:00Z",
        }}
        events={[
          {
            eventId: "evt_1",
            sessionId: "lbs_gate123",
            sessionVersion: 6,
            type: "command_started",
            timestamp: "2026-03-13T02:55:00Z",
            payload: {},
            cursor: "lbs_gate123:6:evt_1",
          },
        ]}
        reconnectState="connected"
        compactViewport={false}
        commandDraft=""
        commandSkillId="checkout_assistant"
        busyAction={null}
        noticeMessage={null}
        stepUpCode=""
        showStepUpCodeInput
        onCommandDraftChange={() => {}}
        onCommandSkillIdChange={() => {}}
        onStepUpCodeChange={() => {}}
        onSendCommand={() => {}}
        onRefresh={() => {}}
        onTakeControl={() => {}}
        onReturnControl={() => {}}
        onApprove={() => {}}
        onReject={() => {}}
        onResolveAssist={() => {}}
        onCancelSession={() => {}}
      />,
    );

    const iframe = screen.getByTitle("Live Browser Viewport");
    expect(iframe).toHaveAttribute("src", expect.stringContaining("sessionId=lbs_gate123"));
    expect(iframe).toHaveAttribute("src", expect.stringContaining("token=viewer-token-123"));
    expect(screen.getByText("Checkout")).toBeInTheDocument();
    expect(screen.getByText("Browser Skill Draft Ready")).toBeInTheDocument();
    expect(screen.getByText("Skill: checkout-assistant-v1")).toBeInTheDocument();
    expect(screen.getByText(/Found the target ecommerce checkout/i)).toBeInTheDocument();
    expect(screen.getByText("Primary checkout")).toBeInTheDocument();
  });
});
