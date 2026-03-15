import { describe, expect, it } from "vitest";

import type { LiveBrowserSession } from "@shared/liveBrowser";
import {
  getLiveBrowserStreamRefreshDelayMs,
  getPreferredLiveBrowserStreamScope,
  mergeLiveBrowserStream,
} from "./liveBrowserStream";

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

describe("liveBrowserStream helpers", () => {
  it("prefers controller scope only during active takeover on non-compact layouts", () => {
    expect(
      getPreferredLiveBrowserStreamScope(
        makeSession({
          status: "human_controlling",
          controlMode: "takeover",
          stream: {
            viewerToken: "viewer-token",
            controllerToken: "controller-token",
            expiresAt: "2026-03-12T10:10:00.000Z",
            leaseExpiresAt: "2026-03-12T10:12:00.000Z",
          },
        }),
        false,
      ),
    ).toBe("controller");
    expect(
      getPreferredLiveBrowserStreamScope(
        makeSession({
          status: "human_controlling",
          controlMode: "takeover",
          stream: {
            viewerToken: "viewer-token",
            controllerToken: "controller-token",
            expiresAt: "2026-03-12T10:10:00.000Z",
            leaseExpiresAt: "2026-03-12T10:12:00.000Z",
          },
        }),
        true,
      ),
    ).toBe("viewer");
  });

  it("computes a bounded refresh delay before token expiry", () => {
    expect(
      getLiveBrowserStreamRefreshDelayMs(
        "2026-03-12T10:10:00.000Z",
        Date.parse("2026-03-12T10:09:00.000Z"),
      ),
    ).toBe(30_000);
    expect(
      getLiveBrowserStreamRefreshDelayMs(
        "2026-03-12T10:10:00.000Z",
        Date.parse("2026-03-12T10:09:45.000Z"),
      ),
    ).toBe(5_000);
  });

  it("merges refreshed viewer and controller tokens without discarding the sibling token", () => {
    const current = {
      viewerToken: "viewer-token",
      controllerToken: "controller-token",
      expiresAt: "2026-03-12T10:10:00.000Z",
      leaseExpiresAt: "2026-03-12T10:12:00.000Z",
    };

    expect(
      mergeLiveBrowserStream(current, {
        sessionId: "lbs_123",
        scope: "viewer",
        token: "viewer-token-2",
        expiresAt: "2026-03-12T10:14:00.000Z",
        leaseExpiresAt: null,
      }),
    ).toEqual({
      viewerToken: "viewer-token-2",
      controllerToken: "controller-token",
      expiresAt: "2026-03-12T10:14:00.000Z",
      leaseExpiresAt: "2026-03-12T10:12:00.000Z",
    });

    expect(
      mergeLiveBrowserStream(current, {
        sessionId: "lbs_123",
        scope: "controller",
        token: "controller-token-2",
        expiresAt: "2026-03-12T10:11:00.000Z",
        leaseExpiresAt: "2026-03-12T10:15:00.000Z",
      }),
    ).toEqual({
      viewerToken: "viewer-token",
      controllerToken: "controller-token-2",
      expiresAt: "2026-03-12T10:11:00.000Z",
      leaseExpiresAt: "2026-03-12T10:15:00.000Z",
    });
  });
});
