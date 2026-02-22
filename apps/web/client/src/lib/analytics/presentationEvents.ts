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

type EventEmitter = (event: PresentationAnalyticsEvent, payload: Record<string, unknown>) => void;

let testEmitter: EventEmitter | null = null;

function emitEvent(event: PresentationAnalyticsEvent, payload: Record<string, unknown>): void {
  if (testEmitter) {
    testEmitter(event, payload);
  }

  const posthog = getPostHog();
  posthog?.capture(event, payload);
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
