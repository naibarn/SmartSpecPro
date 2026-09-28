const getSafeNow = (): number => {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
      return performance.now();
    }
  } catch {}
  return Date.now();
};

export function createRecordingClock(now: () => number = getSafeNow) {
  let elapsed = 0;
  let started: number | null = null;

  try {
    started = now();
  } catch {
    started = Date.now();
  }

  return {
    elapsedMs: (): number => {
      let currentNow = 0;
      try {
        currentNow = now();
      } catch {
        currentNow = Date.now();
      }
      const delta = started === null || !Number.isFinite(started) || !Number.isFinite(currentNow) ? 0 : Math.max(0, currentNow - started);
      const total = elapsed + delta;
      return Number.isFinite(total) && total >= 0 ? total : 0;
    },
    pause() {
      if (started !== null) {
        let currentNow = 0;
        try {
          currentNow = now();
        } catch {
          currentNow = Date.now();
        }
        if (Number.isFinite(started) && Number.isFinite(currentNow)) {
          elapsed += Math.max(0, currentNow - started);
        }
        started = null;
      }
    },
    resume() {
      if (started === null) {
        try {
          started = now();
        } catch {
          started = Date.now();
        }
      }
    },
    reset() {
      elapsed = 0;
      try {
        started = now();
      } catch {
        started = Date.now();
      }
    },
    isPaused() {
      return started === null;
    },
    getSnapshot() {
      let currentNow = 0;
      try {
        currentNow = now();
      } catch {
        currentNow = Date.now();
      }
      const delta = started === null || !Number.isFinite(started) || !Number.isFinite(currentNow) ? 0 : Math.max(0, currentNow - started);
      const total = elapsed + delta;
      return {
        elapsedMs: Number.isFinite(total) && total >= 0 ? total : 0,
        isRunning: started !== null,
      };
    },
  };
}

