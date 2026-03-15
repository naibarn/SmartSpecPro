import { getPostHog } from "@/lib/posthog";
import type { MobileInteractionMode } from "@/presentation-canvas/mobile/MobileInteractionState";

export type PresentationAnalyticsEvent =
  | "presentation_mobile_mode_switch"
  | "presentation_mobile_accidental_transform_cancelled"
  | "presentation_autosave_result"
  | "presentation_ai_recipe_override_applied"
  | "presentation_ai_mode_override_set"
  | "presentation_ai_mode_lock_toggled"
  | "presentation_custom_block_saved";

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

export interface AIRecipeOverrideAppliedPayload {
  deckId: number;
  slideId: number;
  previousRecipeId: string | null;
  nextRecipeId: string;
  source: "editor";
}

export interface AIModeOverrideSetPayload {
  deckId: number;
  slideId: number;
  previousMode: string | null;
  nextMode: string | null;
  source: "editor";
}

export interface AIModeLockToggledPayload {
  deckId: number;
  slideId: number;
  mode: string | null;
  locked: boolean;
  source: "editor";
}

export interface PresentationCustomBlockSavedPayload {
  componentId: string;
  visibility: "private" | "team";
  source: "ai-layout" | "editor";
}

type PresentationAnalyticsEventPayloadMap = {
  "presentation_mobile_mode_switch": MobileModeSwitchPayload;
  "presentation_mobile_accidental_transform_cancelled": MobileAccidentalTransformPayload;
  "presentation_autosave_result": AutosaveResultPayload;
  "presentation_ai_recipe_override_applied": AIRecipeOverrideAppliedPayload;
  "presentation_ai_mode_override_set": AIModeOverrideSetPayload;
  "presentation_ai_mode_lock_toggled": AIModeLockToggledPayload;
  "presentation_custom_block_saved": PresentationCustomBlockSavedPayload;
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

export function trackAIRecipeOverrideApplied(
  payload: AIRecipeOverrideAppliedPayload,
): void {
  emitEvent("presentation_ai_recipe_override_applied", payload);
}

export function trackAIModeOverrideSet(
  payload: AIModeOverrideSetPayload,
): void {
  emitEvent("presentation_ai_mode_override_set", payload);
}

export function trackAIModeLockToggled(
  payload: AIModeLockToggledPayload,
): void {
  emitEvent("presentation_ai_mode_lock_toggled", payload);
}

export function trackPresentationCustomBlockSaved(
  payload: PresentationCustomBlockSavedPayload,
): void {
  emitEvent("presentation_custom_block_saved", payload);
}
