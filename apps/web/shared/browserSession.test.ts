import { describe, expect, it } from "vitest";

import type { LiveBrowserSession } from "./liveBrowser";
import {
  BROWSER_SESSION_COPY,
  buildBrowserSessionSummary,
  browserSessionLaunchContextSchema,
  parseBrowserSessionArtifact,
  mapBrowserSessionState,
} from "./browserSession";

function makeSession(overrides: Partial<LiveBrowserSession> = {}): LiveBrowserSession {
  return {
    sessionId: "lbs_demo_123",
    tenantId: "tenant-demo",
    userId: 42,
    sourceType: "automation",
    sourceId: "auto-1",
    status: "agent_running",
    controlMode: "agent_control",
    sessionVersion: 4,
    controllerActorType: null,
    controllerActorId: null,
    controllerConnectionId: null,
    controllerLeaseExpiresAt: null,
    pauseReason: null,
    pendingAssistRequestId: null,
    pendingApprovalRequestId: null,
    policyContext: {},
    browserContextRef: {
      pageTitle: "Dashboard",
      url: "https://example.com/dashboard",
    },
    activeTabCount: 1,
    startedAt: "2026-03-12T10:00:00.000Z",
    lastActivityAt: "2026-03-12T10:05:00.000Z",
    endedAt: null,
    endReason: null,
    ...overrides,
  };
}

describe("browser session presentation contract", () => {
  it("maps review-required sessions to shared product copy", () => {
    const state = mapBrowserSessionState(
      makeSession({
        status: "waiting_for_human",
        pendingApprovalRequestId: "apr_123",
      }),
    );

    expect(state).toEqual({
      state: "review_required",
      badgeLabel: BROWSER_SESSION_COPY.reviewRequired,
      statusLine: "Review Required before AI can continue.",
      primaryActionLabel: BROWSER_SESSION_COPY.continue,
    });
  });

  it("maps commitment gates to barrier-specific review copy", () => {
    const state = mapBrowserSessionState(
      makeSession({
        status: "waiting_for_human",
        pendingApprovalRequestId: "apr_payment_1",
        barrierType: "payment_review_required",
      }),
    );

    expect(state).toEqual({
      state: "review_required",
      badgeLabel: BROWSER_SESSION_COPY.paymentReviewRequired,
      statusLine: "Payment Review Required before AI can continue.",
      primaryActionLabel: BROWSER_SESSION_COPY.reviewPayment,
    });
  });

  it("maps login and captcha barriers to takeover-first copy", () => {
    const loginState = mapBrowserSessionState(
      makeSession({
        status: "waiting_for_human",
        pendingAssistRequestId: "assist_login_1",
        barrierType: "login_required",
      }),
    );
    const captchaState = mapBrowserSessionState(
      makeSession({
        status: "waiting_for_human",
        pendingAssistRequestId: "assist_captcha_1",
        barrierType: "captcha_required",
      }),
    );

    expect(loginState).toEqual({
      state: "needs_user_input",
      badgeLabel: BROWSER_SESSION_COPY.loginRequired,
      statusLine: "Login Required before AI can continue.",
      primaryActionLabel: BROWSER_SESSION_COPY.takeControl,
    });
    expect(captchaState).toEqual({
      state: "needs_user_input",
      badgeLabel: BROWSER_SESSION_COPY.captchaRequired,
      statusLine: "Captcha Required before AI can continue.",
      primaryActionLabel: BROWSER_SESSION_COPY.takeControl,
    });
  });

  it("builds a compact summary with launch metadata", () => {
    const launchContext = browserSessionLaunchContextSchema.parse({
      originSurface: "chat",
      originLabel: "Chat",
      sourceId: "91",
      returnContext: {
        path: "/chat?c=91",
        label: "Return to Chat",
      },
    });

    const summary = buildBrowserSessionSummary(makeSession(), {
      launchContext,
      compactViewport: true,
    });

    expect(summary).toMatchObject({
      sessionId: "lbs_demo_123",
      originSurface: "chat",
      sourceLabel: "Chat",
      statusLine: "AI is controlling this Browser Session.",
      compactNotice: BROWSER_SESSION_COPY.manualControlUnavailable,
      primaryActionLabel: BROWSER_SESSION_COPY.continue,
    });
  });

  it("treats completed sessions as reopenable ended sessions", () => {
    const summary = buildBrowserSessionSummary(
      makeSession({
        status: "completed",
        controlMode: "observe",
      }),
    );

    expect(summary).toMatchObject({
      state: "session_ended",
      badgeLabel: BROWSER_SESSION_COPY.sessionEnded,
      statusLine: "This Browser Session has ended.",
      primaryActionLabel: BROWSER_SESSION_COPY.reopen,
    });
  });

  it("parses structured browser-session artifacts for thread cards", () => {
    const artifact = parseBrowserSessionArtifact({
      sessionId: "lbs_demo_123",
      summary: buildBrowserSessionSummary(makeSession()),
      updatedAt: "2026-03-12T10:05:00.000Z",
    });

    expect(artifact).toMatchObject({
      sessionId: "lbs_demo_123",
      summary: {
        sessionId: "lbs_demo_123",
        primaryActionLabel: BROWSER_SESSION_COPY.continue,
      },
    });
  });
});
