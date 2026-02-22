import { useCallback, useEffect, useMemo, useRef } from "react";

export type AutosaveAttemptResult = "saved" | "skipped";

interface UseAutosaveControllerOptions {
  enabled: boolean;
  draftSignature: string | null;
  debounceMs?: number;
  onAutosave: () => Promise<AutosaveAttemptResult>;
}

interface AutosaveControllerHandle {
  markPersisted: (signature: string | null) => void;
  clear: () => void;
}

const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 800;

export function useAutosaveController(
  options: UseAutosaveControllerOptions,
): AutosaveControllerHandle {
  const {
    enabled,
    draftSignature,
    debounceMs = DEFAULT_AUTOSAVE_DEBOUNCE_MS,
    onAutosave,
  } = options;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const persistedSignatureRef = useRef<string | null>(null);
  const autosaveRef = useRef(onAutosave);

  useEffect(() => {
    autosaveRef.current = onAutosave;
  }, [onAutosave]);

  const clearTimer = useCallback(() => {
    if (!timerRef.current) {
      return;
    }
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled || !draftSignature) {
      clearTimer();
      return;
    }

    if (draftSignature === persistedSignatureRef.current) {
      clearTimer();
      return;
    }

    clearTimer();
    timerRef.current = setTimeout(() => {
      if (inFlightRef.current) {
        return;
      }

      inFlightRef.current = true;
      void autosaveRef.current()
        .then((result) => {
          if (result === "saved") {
            persistedSignatureRef.current = draftSignature;
          }
        })
        .finally(() => {
          inFlightRef.current = false;
        });
    }, debounceMs);

    return () => {
      clearTimer();
    };
  }, [clearTimer, debounceMs, draftSignature, enabled]);

  const markPersisted = useCallback((signature: string | null) => {
    persistedSignatureRef.current = signature;
  }, []);

  const clear = useCallback(() => {
    clearTimer();
    persistedSignatureRef.current = null;
  }, [clearTimer]);

  return useMemo(() => ({
    markPersisted,
    clear,
  }), [clear, markPersisted]);
}
