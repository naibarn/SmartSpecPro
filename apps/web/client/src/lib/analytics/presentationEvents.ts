import { getPostHog } from "@/lib/posthog";
import type { MobileInteractionMode } from "@/presentation-canvas/mobile/MobileInteractionState";

export type PresentationAnalyticsEvent =
  | "presentation_mobile_mode_switch"
  | "presentation_mobile_accidental_transform_cancelled"
  | "presentation_autosave_result";

export interface MobileModeSwitchPayload {
  fromMode: MobileInteractionMode;
  toMode: MobileInteractionMode;
}

export interface MobileAccidentalTransformPayload {
  mode: MobileInteractionMode;
  touchTargetPx: number;
}

export interface AutosaveResultPayload {
  result: "saved" | "conflict" | "error" | "cooldown" | "stale_blocked";
  deckId: number;
  slideId: number;
  mode: "manual" | "autosave";
}

type PresentationAnalyticsEventPayloadMap = {
  "presentation_mobile_mode_switch": MobileModeSwitchPayload;
  "presentation_mobile_accidental_transform_cancelled": MobileAccidentalTransformPayload;
  "presentation_autosave_result": AutosaveResultPayload;
};

type EventEmitter = <E extends PresentationAnalyticsEvent>(
  event: E,
  payload: PresentationAnalyticsEventPayloadMap[E],
) => void;

let testEmitter: EventEmitter | null = null;

function emitEvent<E extends PresentationAnalyticsEvent>(
  event: E,
  payload: PresentationAnalyticsEventPayloadMap[E],
): void {
  if (testEmitter) {
    testEmitter(event, payload);
  }

  const posthog = getPostHog();
  posthog?.capture(event, payload as unknown as Record<string, unknown>);
}

export function setPresentationEventEmitterForTests(emitter: EventEmitter | null): void {
  testEmitter = emitter;
}

export function trackMobileModeSwitch(payload: MobileModeSwitchPayload): void {
  emitEvent("presentation_mobile_mode_switch", payload);
}

export function trackMobileAccidentalTransformCancelled(
  payload: MobileAccidentalTransformPayload,
): void {
  emitEvent("presentation_mobile_accidental_transform_cancelled", payload);
}

export function trackAutosaveResult(payload: AutosaveResultPayload): void {
  emitEvent("presentation_autosave_result", payload);
}
