import type { AuthorizedNotificationSignal } from "@/lib/notificationAttention";

export const OPEN_GLOBAL_NOTIFICATION_BELL_EVENT =
  "smartspec:open-global-notification-bell";
export const SHOW_ASSISTANT_MASCOT_DEMO_EVENT =
  "smartspec:show-assistant-mascot-demo";
export const ASSISTANT_NOTIFICATION_BASELINE_EVENT =
  "smartspec:assistant-notification-baseline";
export const ASSISTANT_NOTIFICATION_BASELINE_REQUEST_EVENT =
  "smartspec:assistant-notification-baseline-request";
export const ASSISTANT_NOTIFICATION_ARRIVAL_EVENT =
  "smartspec:assistant-notification-arrival";
export const ASSISTANT_MASCOT_PREFERENCES_CHANGED_EVENT =
  "smartspec:assistant-mascot-preferences-changed";

export interface AssistantNotificationProjection {
  readonly scopeKey: string;
  readonly signals: readonly AuthorizedNotificationSignal[];
}

export function requestAssistantMascotDemo(): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(SHOW_ASSISTANT_MASCOT_DEMO_EVENT));
}

export function requestOpenGlobalNotificationBell(): void {
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event(OPEN_GLOBAL_NOTIFICATION_BELL_EVENT));
}
