export function createRecordingClock(now: () => number = () => performance.now()) {
  let elapsed = 0;
  let started: number | null = now();
  return {
    elapsedMs: () => Math.max(0, elapsed + (started === null ? 0 : now() - started)),
    pause() { if (started !== null) { elapsed += now() - started; started = null; } },
    resume() { if (started === null) started = now(); },
  };
}
