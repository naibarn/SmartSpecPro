import { expect, it } from "vitest";
import { createRecordingClock } from "../../src/screens/media-workspace/recordingClock";
it("tracks real elapsed time without stale render state or paused time", () => {
  let now = 0;
  const clock = createRecordingClock(() => now);
  now = 4500; expect(clock.elapsedMs()).toBe(4500);
  clock.pause(); now = 14500; expect(clock.elapsedMs()).toBe(4500);
  clock.resume(); now = 17000; clock.pause();
  expect(clock.elapsedMs()).toBe(7000);
  now = 30000; expect(clock.elapsedMs()).toBe(7000);
});
