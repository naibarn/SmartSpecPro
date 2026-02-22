import { useMemo, useState } from "react";

import {
  applyPinchPanGesture,
  createMobileInteractionState,
  isTouchTargetSafe,
  setMobileInteractionMode,
  type MobileInteractionMode,
  type MobileInteractionState,
  type PinchPanGesture,
} from "./MobileInteractionState";
import {
  trackMobileAccidentalTransformCancelled,
  trackMobileModeSwitch,
} from "@/lib/analytics/presentationEvents";

export interface UseMobileGesturesResult {
  state: MobileInteractionState;
  setMode: (mode: MobileInteractionMode) => void;
  applyGesture: (gesture: PinchPanGesture) => void;
  canUseTouchTarget: (sizePx: number) => boolean;
}

export function useMobileGestures(): UseMobileGesturesResult {
  const [state, setState] = useState<MobileInteractionState>(() => createMobileInteractionState());

  const api = useMemo<UseMobileGesturesResult>(() => ({
    state,
    setMode: (mode) => {
      setState((current) => {
        if (current.mode === mode) {
          return current;
        }
        trackMobileModeSwitch({
          fromMode: current.mode,
          toMode: mode,
        });
        return setMobileInteractionMode(current, mode);
      });
    },
    applyGesture: (gesture) => {
      setState((current) => applyPinchPanGesture(current, gesture));
    },
    canUseTouchTarget: (sizePx) => {
      const safe = isTouchTargetSafe(sizePx);
      if (!safe) {
        trackMobileAccidentalTransformCancelled({
          mode: state.mode,
          touchTargetPx: sizePx,
        });
      }
      return safe;
    },
  }), [state]);

  return api;
}
