/**
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { LiveBrowserSession } from "@shared/liveBrowser";
import { LiveBrowserStreamRenderer } from "../LiveBrowserStreamRenderer";

function makeSession(
  overrides: Partial<LiveBrowserSession> = {},
): LiveBrowserSession {
  return {
    sessionId: "lbs_123",
    tenantId: "tenant-1",
    userId: 42,
    sourceType: "automation",
    sourceId: "task-1",
    status: "ready",
    controlMode: "observe",
    sessionVersion: 4,
    controllerActorType: null,
    controllerActorId: null,
    controllerConnectionId: null,
    controllerLeaseExpiresAt: null,
    pauseReason: null,
    pendingAssistRequestId: null,
    pendingApprovalRequestId: null,
    policyContext: {},
    browserContextRef: {},
    stream: {
      viewerToken: "viewer-token",
      expiresAt: "2026-03-12T10:10:00.000Z",
    },
    activeTabCount: 1,
    startedAt: "2026-03-12T10:00:00.000Z",
    lastActivityAt: "2026-03-12T10:05:00.000Z",
    endedAt: null,
    endReason: null,
    ...overrides,
  };
}

describe("LiveBrowserStreamRenderer", () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & {
      __SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__?: string;
    }).__SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__;
  });

  it("renders an observe-mode iframe with the viewer token", () => {
    (globalThis as typeof globalThis & {
      __SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__?: string;
    }).__SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__ = "https://browser.example.com/embed";

    render(
      <LiveBrowserStreamRenderer
        session={makeSession()}
        reconnectState="connected"
        compactViewport={false}
      />,
    );

    const frame = screen.getByTitle("Live Browser Viewport");
    expect(frame).toHaveAttribute("src", expect.stringContaining("token=viewer-token"));
    expect(frame).toHaveAttribute("src", expect.stringContaining("scope=viewer"));
    expect(screen.getByText("Observe Mode")).toBeInTheDocument();
  });

  it("switches to the controller token during takeover and updates on rerender", () => {
    (globalThis as typeof globalThis & {
      __SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__?: string;
    }).__SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__ = "https://browser.example.com/embed";

    const { rerender } = render(
      <LiveBrowserStreamRenderer
        session={makeSession({
          status: "human_controlling",
          controlMode: "takeover",
          stream: {
            viewerToken: "viewer-token",
            controllerToken: "controller-token-1",
            expiresAt: "2026-03-12T10:10:00.000Z",
            leaseExpiresAt: "2026-03-12T10:12:00.000Z",
          },
        })}
        reconnectState="connected"
        compactViewport={false}
      />,
    );

    expect(screen.getByTitle("Live Browser Viewport")).toHaveAttribute(
      "src",
      expect.stringContaining("token=controller-token-1"),
    );
    expect(screen.getByText("Takeover Active")).toBeInTheDocument();

    rerender(
      <LiveBrowserStreamRenderer
        session={makeSession({
          status: "human_controlling",
          controlMode: "takeover",
          stream: {
            viewerToken: "viewer-token",
            controllerToken: "controller-token-2",
            expiresAt: "2026-03-12T10:11:00.000Z",
            leaseExpiresAt: "2026-03-12T10:13:00.000Z",
          },
        })}
        reconnectState="connected"
        compactViewport={false}
      />,
    );

    expect(screen.getByTitle("Live Browser Viewport")).toHaveAttribute(
      "src",
      expect.stringContaining("token=controller-token-2"),
    );
  });

  it("survives reconnect state and reattaches with a refreshed takeover token", () => {
    (globalThis as typeof globalThis & {
      __SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__?: string;
    }).__SMARTSPEC_LIVE_BROWSER_EMBED_BASE_URL__ = "https://browser.example.com/embed";

    const { rerender } = render(
      <LiveBrowserStreamRenderer
        session={makeSession({
          status: "human_controlling",
          controlMode: "takeover",
          stream: {
            viewerToken: "viewer-token",
            controllerToken: "controller-token-stale",
            expiresAt: "2026-03-12T10:10:00.000Z",
            leaseExpiresAt: "2026-03-12T10:12:00.000Z",
          },
        })}
        reconnectState="reconnecting"
        compactViewport={false}
      />,
    );

    expect(screen.getByText("Recovering")).toBeInTheDocument();
    expect(screen.getByText("Reconnecting stream...")).toBeInTheDocument();

    rerender(
      <LiveBrowserStreamRenderer
        session={makeSession({
          status: "human_controlling",
          controlMode: "takeover",
          stream: {
            viewerToken: "viewer-token",
            controllerToken: "controller-token-refreshed",
            expiresAt: "2026-03-12T10:11:00.000Z",
            leaseExpiresAt: "2026-03-12T10:13:00.000Z",
          },
        })}
        reconnectState="connected"
        compactViewport={false}
      />,
    );

    expect(screen.getByText("Attached")).toBeInTheDocument();
    expect(screen.getByTitle("Live Browser Viewport")).toHaveAttribute(
      "src",
      expect.stringContaining("token=controller-token-refreshed"),
    );
  });

  it("shows an explicit degraded state when the embed transport is not configured", () => {
    render(
      <LiveBrowserStreamRenderer
        session={makeSession()}
        reconnectState="connected"
        compactViewport={false}
      />,
    );

    expect(screen.getByTestId("live-browser-stream-unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Live browser rendering is not configured/i)).toBeInTheDocument();
  });
});
