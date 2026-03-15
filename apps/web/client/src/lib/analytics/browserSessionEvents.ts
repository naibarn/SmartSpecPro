import { getPostHog } from "@/lib/posthog";

export type BrowserSessionOriginSurface =
  | "automation"
  | "chat"
  | "agency"
  | "workflow";

export type BrowserSessionReasonCategory =
  | "policy"
  | "step_up"
  | "state"
  | "navigation"
  | "render"
  | "legacy_fallback"
  | "unknown";

type BrowserSessionAnalyticsEvent =
  | "browser_session_opened"
  | "browser_session_reopened"
  | "browser_session_return_navigation_failed"
  | "browser_session_take_control_blocked"
  | "browser_session_mobile_observe_only_seen";

type BrowserSessionBasePayload = {
  origin_surface: BrowserSessionOriginSurface;
  compact_layout: boolean;
  launch_path?: "direct" | "suggested";
  launch_intent?: string;
};

type BrowserSessionEventPayloadMap = {
  browser_session_opened: BrowserSessionBasePayload & { session_kind: "created" | "resumed" };
  browser_session_reopened: BrowserSessionBasePayload & { session_kind: "resumed" };
  browser_session_return_navigation_failed: BrowserSessionBasePayload & { reason_category: BrowserSessionReasonCategory };
  browser_session_take_control_blocked: BrowserSessionBasePayload & { reason_category: BrowserSessionReasonCategory };
  browser_session_mobile_observe_only_seen: BrowserSessionBasePayload;
};

type EventEmitter = <E extends BrowserSessionAnalyticsEvent>(
  event: E,
  payload: BrowserSessionEventPayloadMap[E],
) => void;

let testEmitter: EventEmitter | null = null;

function emitEvent<E extends BrowserSessionAnalyticsEvent>(
  event: E,
  payload: BrowserSessionEventPayloadMap[E],
): void {
  testEmitter?.(event, payload);
  getPostHog()?.capture(event, payload as unknown as Record<string, unknown>);
}

export function setBrowserSessionEventEmitterForTests(emitter: EventEmitter | null): void {
  testEmitter = emitter;
}

export function trackBrowserSessionOpened(payload: BrowserSessionEventPayloadMap["browser_session_opened"]): void {
  emitEvent("browser_session_opened", payload);
}

export function trackBrowserSessionReopened(payload: BrowserSessionEventPayloadMap["browser_session_reopened"]): void {
  emitEvent("browser_session_reopened", payload);
}

export function trackBrowserSessionReturnNavigationFailed(
  payload: BrowserSessionEventPayloadMap["browser_session_return_navigation_failed"],
): void {
  emitEvent("browser_session_return_navigation_failed", payload);
}

export function trackBrowserSessionTakeControlBlocked(
  payload: BrowserSessionEventPayloadMap["browser_session_take_control_blocked"],
): void {
  emitEvent("browser_session_take_control_blocked", payload);
}

export function trackBrowserSessionMobileObserveOnlySeen(
  payload: BrowserSessionEventPayloadMap["browser_session_mobile_observe_only_seen"],
): void {
  emitEvent("browser_session_mobile_observe_only_seen", payload);
}
