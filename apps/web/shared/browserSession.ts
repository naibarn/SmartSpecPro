import { z } from "zod";

import type { LiveBrowserSession } from "./liveBrowser";
import { liveBrowserBarrierTypeSchema } from "./liveBrowser";

export const browserSessionSurfaceValues = [
  "automation",
  "chat",
  "agency",
  "workflow",
  "direct",
] as const;

export const browserSessionPresentationStateValues = [
  "running",
  "review_required",
  "needs_user_input",
  "person_in_control",
  "ai_in_control",
  "reconnecting",
  "session_ended",
] as const;

export const browserSessionSurfaceSchema = z.enum(browserSessionSurfaceValues);
export const browserSessionPresentationStateSchema = z.enum(
  browserSessionPresentationStateValues,
);

export const browserSessionReturnContextSchema = z.object({
  path: z.string().min(1).startsWith("/"),
  label: z.string().min(1).optional(),
}).strict();

export const browserSessionLaunchContextSchema = z.object({
  originSurface: browserSessionSurfaceSchema,
  originLabel: z.string().min(1).optional(),
  sourceId: z.string().min(1).optional(),
  returnContext: browserSessionReturnContextSchema.optional(),
  newlyCreated: z.boolean().optional(),
}).strict();

export const browserSessionSummarySchema = z.object({
  sessionId: z.string().min(1),
  originSurface: browserSessionSurfaceSchema.optional(),
  state: browserSessionPresentationStateSchema,
  barrierType: liveBrowserBarrierTypeSchema.optional(),
  badgeLabel: z.string().min(1),
  statusLine: z.string().min(1),
  primaryActionLabel: z.string().min(1),
  pageTitle: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  compactNotice: z.string().nullable().optional(),
  sourceLabel: z.string().min(1),
}).strict();

export const browserSessionArtifactSchema = z.object({
  sessionId: z.string().min(1),
  summary: browserSessionSummarySchema,
  launchContext: browserSessionLaunchContextSchema.optional(),
  updatedAt: z.string().min(1).optional(),
}).strict();

export type BrowserSessionSurface = z.infer<typeof browserSessionSurfaceSchema>;
export type BrowserSessionPresentationState = z.infer<typeof browserSessionPresentationStateSchema>;
export type BrowserSessionReturnContext = z.infer<typeof browserSessionReturnContextSchema>;
export type BrowserSessionLaunchContext = z.infer<typeof browserSessionLaunchContextSchema>;
export type BrowserSessionSummary = z.infer<typeof browserSessionSummarySchema>;
export type BrowserSessionArtifact = z.infer<typeof browserSessionArtifactSchema>;

export const BROWSER_SESSION_COPY = {
  open: "Open Browser Session",
  continue: "Continue in Browser",
  reopen: "Reopen Browser Session",
  takeControl: "Take Control",
  reviewPayment: "Review Payment",
  reviewBooking: "Review Booking",
  returnToAi: "Return to AI",
  needsYourInput: "Needs Your Input",
  reviewRequired: "Review Required",
  loginRequired: "Login Required",
  captchaRequired: "Captcha Required",
  paymentReviewRequired: "Payment Review Required",
  bookingConfirmationRequired: "Booking Confirmation Required",
  browserInstruction: "Browser Instruction",
  sessionEnded: "Session Ended",
  manualControlUnavailable: "Manual control is unavailable on this screen size.",
} as const;

type ReconnectState = "connected" | "reconnecting" | "stream_unavailable";

interface BrowserSessionSummaryOptions {
  launchContext?: BrowserSessionLaunchContext | null;
  reconnectState?: ReconnectState;
  compactViewport?: boolean;
}

function getBrowserSessionSourceLabel(
  sourceType: LiveBrowserSession["sourceType"] | BrowserSessionSurface,
): string {
  switch (sourceType) {
    case "chat":
      return "Chat";
    case "agency":
      return "Agency";
    case "workflow":
      return "Workflow";
    case "automation":
      return "Automation";
    default:
      return "Browser Session";
  }
}

function getBrowserSessionBarrierType(
  session: LiveBrowserSession,
): LiveBrowserSession["barrierType"] | null {
  if (session.barrierType) {
    return session.barrierType;
  }

  const activeBarrier = session.policyContext?.activeBarrier;
  if (!activeBarrier || typeof activeBarrier !== "object") {
    return null;
  }

  const parsed = liveBrowserBarrierTypeSchema.safeParse(
    (activeBarrier as { type?: unknown }).type,
  );
  return parsed.success ? parsed.data : null;
}

export function mapBrowserSessionState(
  session: LiveBrowserSession,
  options: Pick<BrowserSessionSummaryOptions, "reconnectState"> = {},
): {
  state: BrowserSessionPresentationState;
  badgeLabel: string;
  statusLine: string;
  primaryActionLabel: string;
} {
  if (options.reconnectState === "reconnecting" || options.reconnectState === "stream_unavailable") {
    return {
      state: "reconnecting",
      badgeLabel: "Reconnecting",
      statusLine: "Reconnecting to this Browser Session.",
      primaryActionLabel: BROWSER_SESSION_COPY.continue,
    };
  }

  if (
    session.status === "completed"
    || session.status === "cancelled"
    || session.status === "expired"
    || session.status === "failed"
    || session.status === "failed_recovery_required"
  ) {
    return {
      state: "session_ended",
      badgeLabel: BROWSER_SESSION_COPY.sessionEnded,
      statusLine: "This Browser Session has ended.",
      primaryActionLabel: BROWSER_SESSION_COPY.reopen,
    };
  }

  const barrierType = getBrowserSessionBarrierType(session);

  if (session.pendingApprovalRequestId) {
    if (barrierType === "payment_review_required") {
      return {
        state: "review_required",
        badgeLabel: BROWSER_SESSION_COPY.paymentReviewRequired,
        statusLine: "Payment Review Required before AI can continue.",
        primaryActionLabel: BROWSER_SESSION_COPY.reviewPayment,
      };
    }
    if (barrierType === "booking_confirmation_required") {
      return {
        state: "review_required",
        badgeLabel: BROWSER_SESSION_COPY.bookingConfirmationRequired,
        statusLine: "Booking Confirmation Required before AI can continue.",
        primaryActionLabel: BROWSER_SESSION_COPY.reviewBooking,
      };
    }
  }

  if (
    barrierType === "captcha_required"
    && (session.pendingAssistRequestId || session.status === "waiting_for_human")
  ) {
    return {
      state: "needs_user_input",
      badgeLabel: BROWSER_SESSION_COPY.captchaRequired,
      statusLine: "Captcha Required before AI can continue.",
      primaryActionLabel: BROWSER_SESSION_COPY.takeControl,
    };
  }

  if (
    barrierType === "login_required"
    && (session.pendingAssistRequestId || session.status === "waiting_for_human")
  ) {
    return {
      state: "needs_user_input",
      badgeLabel: BROWSER_SESSION_COPY.loginRequired,
      statusLine: "Login Required before AI can continue.",
      primaryActionLabel: BROWSER_SESSION_COPY.takeControl,
    };
  }

  if (session.pendingApprovalRequestId) {
    return {
      state: "review_required",
      badgeLabel: BROWSER_SESSION_COPY.reviewRequired,
      statusLine: "Review Required before AI can continue.",
      primaryActionLabel: BROWSER_SESSION_COPY.continue,
    };
  }

  if (session.pendingAssistRequestId || session.status === "waiting_for_human") {
    return {
      state: "needs_user_input",
      badgeLabel: BROWSER_SESSION_COPY.needsYourInput,
      statusLine: "Needs Your Input before AI can continue.",
      primaryActionLabel: BROWSER_SESSION_COPY.continue,
    };
  }

  if (session.status === "human_controlling") {
    return {
      state: "person_in_control",
      badgeLabel: "You Are In Control",
      statusLine: "You are controlling this Browser Session.",
      primaryActionLabel: BROWSER_SESSION_COPY.continue,
    };
  }

  if (session.controlMode === "agent_control" || session.status === "agent_running") {
    return {
      state: "ai_in_control",
      badgeLabel: "AI In Control",
      statusLine: "AI is controlling this Browser Session.",
      primaryActionLabel: BROWSER_SESSION_COPY.continue,
    };
  }

  return {
    state: "running",
    badgeLabel: "In Progress",
    statusLine: "AI is working in this Browser Session.",
    primaryActionLabel: BROWSER_SESSION_COPY.continue,
  };
}

export function buildBrowserSessionSummary(
  session: LiveBrowserSession,
  options: BrowserSessionSummaryOptions = {},
): BrowserSessionSummary {
  const mapped = mapBrowserSessionState(session, options);
  return browserSessionSummarySchema.parse({
    sessionId: session.sessionId,
    originSurface: options.launchContext?.originSurface,
    state: mapped.state,
    barrierType: getBrowserSessionBarrierType(session) ?? undefined,
    badgeLabel: mapped.badgeLabel,
    statusLine: mapped.statusLine,
    primaryActionLabel: mapped.primaryActionLabel,
    pageTitle: typeof session.browserContextRef?.pageTitle === "string"
      ? session.browserContextRef.pageTitle
      : null,
    url: typeof session.browserContextRef?.url === "string"
      ? session.browserContextRef.url
      : null,
    compactNotice: options.compactViewport ? BROWSER_SESSION_COPY.manualControlUnavailable : null,
    sourceLabel: options.launchContext?.originLabel
      ?? getBrowserSessionSourceLabel(options.launchContext?.originSurface ?? session.sourceType),
  });
}

export function getBrowserSessionAnnouncement(
  session: LiveBrowserSession,
  options: BrowserSessionSummaryOptions = {},
): string {
  return buildBrowserSessionSummary(session, options).statusLine;
}

export function parseBrowserSessionArtifact(
  value: unknown,
): BrowserSessionArtifact | null {
  const parsed = browserSessionArtifactSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
