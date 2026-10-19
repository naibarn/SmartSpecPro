import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), prepare: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../verticalDramaEnhancedBridgeRuntime", () => ({
  prepareEnhancedBridgeRuntime: mocks.prepare,
}));

function childProcess() {
  return Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(),
  });
}

describe("Enhanced runtime probe recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    mocks.spawn.mockReset();
    mocks.prepare
      .mockReset()
      .mockResolvedValue({
        command: "/runtime/bin/python",
        args: ["-m", "bridge"],
        env: {},
      });
  });
  afterEach(() => vi.useRealTimers());

  it("shares a probe across shots and caches a healthy runtime", async () => {
    const child = childProcess();
    mocks.spawn.mockReturnValue(child);
    const { probeEnhancedRuntime } =
      await import("../verticalDramaEnhancedVideoPrompt");
    const first = probeEnhancedRuntime();
    const second = probeEnhancedRuntime();
    await vi.advanceTimersByTimeAsync(0);
    child.stdout.write(
      '{"ok":true,"sdkVersion":"0.22.2","adapterVersion":"1.0.0"}'
    );
    child.emit("close", 0);
    expect(await first).toEqual(await second);
    expect(await probeEnhancedRuntime()).toMatchObject({
      bridgeAvailable: true,
      sdkVersion: "0.22.2",
    });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    expect(mocks.spawn).toHaveBeenCalledWith(
      "/runtime/bin/python",
      ["-m", "bridge", "--health"],
      expect.any(Object)
    );
  });

  it("reprobes after a short failure cache instead of retaining a temporary outage", async () => {
    const failed = childProcess();
    const healthy = childProcess();
    mocks.spawn.mockReturnValueOnce(failed).mockReturnValueOnce(healthy);
    const { probeEnhancedRuntime } =
      await import("../verticalDramaEnhancedVideoPrompt");
    const first = probeEnhancedRuntime();
    await vi.advanceTimersByTimeAsync(0);
    failed.emit("close", 1);
    expect(await first).toMatchObject({ bridgeAvailable: false });
    await vi.advanceTimersByTimeAsync(4_999);
    expect(await probeEnhancedRuntime()).toMatchObject({
      bridgeAvailable: false,
    });
    expect(mocks.spawn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    const recovery = probeEnhancedRuntime();
    await vi.advanceTimersByTimeAsync(0);
    healthy.stdout.write(
      '{"ok":true,"sdkVersion":"0.22.2","adapterVersion":"1.0.0"}'
    );
    healthy.emit("close", 0);
    expect(await recovery).toMatchObject({ bridgeAvailable: true });
  });

  it("settles a timed out probe even when the child never emits close", async () => {
    const child = childProcess();
    mocks.spawn.mockReturnValue(child);
    const { probeEnhancedRuntime } =
      await import("../verticalDramaEnhancedVideoPrompt");
    const result = probeEnhancedRuntime();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toMatchObject({ bridgeAvailable: false });
    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("can retry dependency preparation after a failed cold start", async () => {
    mocks.prepare.mockRejectedValueOnce(new Error("unavailable"));
    const { probeEnhancedRuntime } =
      await import("../verticalDramaEnhancedVideoPrompt");
    expect(await probeEnhancedRuntime()).toMatchObject({
      bridgeAvailable: false,
    });
    await vi.advanceTimersByTimeAsync(5_000);
    const child = childProcess();
    mocks.spawn.mockReturnValue(child);
    const recovery = probeEnhancedRuntime();
    await vi.advanceTimersByTimeAsync(0);
    child.stdout.write(
      '{"ok":true,"sdkVersion":"0.22.2","adapterVersion":"1.0.0"}'
    );
    child.emit("close", 0);
    expect(await recovery).toMatchObject({ bridgeAvailable: true });
  });
});
