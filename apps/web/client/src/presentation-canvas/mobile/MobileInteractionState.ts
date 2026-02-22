export type MobileInteractionMode = "pan_mode" | "edit_mode";

export interface MobileViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface MobileInteractionState {
  mode: MobileInteractionMode;
  viewport: MobileViewportState;
  lastGestureAt: number | null;
}

export interface PinchPanGesture {
  startDistance: number;
  currentDistance: number;
  deltaX: number;
  deltaY: number;
}

export const MOBILE_MIN_TOUCH_TARGET_PX = 40;

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;

export function createMobileInteractionState(): MobileInteractionState {
  return {
    mode: "pan_mode",
    viewport: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    },
    lastGestureAt: null,
  };
}

export function setMobileInteractionMode(
  state: MobileInteractionState,
  mode: MobileInteractionMode,
): MobileInteractionState {
  if (state.mode === mode) {
    return state;
  }

  return {
    ...state,
    mode,
  };
}

export function applyPinchPanGesture(
  state: MobileInteractionState,
  gesture: PinchPanGesture,
  now = Date.now(),
): MobileInteractionState {
  const startDistance = Math.max(1, gesture.startDistance);
  const ratio = gesture.currentDistance / startDistance;
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.viewport.scale * ratio));

  return {
    ...state,
    viewport: {
      scale,
      offsetX: state.viewport.offsetX + gesture.deltaX,
      offsetY: state.viewport.offsetY + gesture.deltaY,
    },
    lastGestureAt: now,
  };
}

export function isTouchTargetSafe(sizePx: number): boolean {
  return sizePx >= MOBILE_MIN_TOUCH_TARGET_PX;
}
