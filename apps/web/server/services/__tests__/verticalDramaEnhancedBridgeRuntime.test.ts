import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock("node:child_process", () => ({
  execFile: (
    command: string,
    args: string[],
    options: unknown,
    callback: (error: Error | null, stdout: string, stderr: string) => void
  ) => {
    mocks.sync(command, args, options).then(
      () => callback(null, "", ""),
      (error: Error) => callback(error, "", "")
    );
  },
}));

let root: string;
let skillRoot: string;
describe("Enhanced immutable-release runtime", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.sync.mockReset().mockResolvedValue(undefined);
    root = mkdtempSync(resolve(tmpdir(), "enhanced-runtime-test-"));
    skillRoot = resolve(root, "release/skill");
    mkdirSync(skillRoot, { recursive: true });
    writeFileSync(resolve(skillRoot, "pyproject.toml"), "project");
    writeFileSync(resolve(skillRoot, "uv.lock"), "lock-v1");
    vi.stubEnv("HOME", resolve(root, "home"));
    vi.stubEnv("OPENAI_API_KEY", "test-must-not-inherit");
    vi.stubEnv("PYTHONPATH", "/untrusted");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it("installs locked dependencies outside the release without building the source or inheriting secrets", async () => {
    const { prepareEnhancedBridgeRuntime } =
      await import("../verticalDramaEnhancedBridgeRuntime");
    const [first, second] = await Promise.all([
      prepareEnhancedBridgeRuntime(skillRoot),
      prepareEnhancedBridgeRuntime(skillRoot),
    ]);
    expect(mocks.sync).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
    expect(
      first.command.startsWith(
        resolve(root, "home/.cache/smartaihub/enhanced-video-director")
      )
    ).toBe(true);
    expect(first.env.PYTHONPATH).toBe(resolve(skillRoot, "src"));
    expect(first.env.OPENAI_API_KEY).toBeUndefined();
    expect(first.env.PYTHONDONTWRITEBYTECODE).toBe("1");
    expect(mocks.sync).toHaveBeenCalledWith(
      expect.any(String),
      ["sync", "--frozen", "--no-install-project", "--project", skillRoot],
      expect.objectContaining({
        env: first.env,
        timeout: 60_000,
        killSignal: "SIGKILL",
      })
    );
  });

  it("uses a separate dependency environment when the lock changes", async () => {
    const { prepareEnhancedBridgeRuntime } =
      await import("../verticalDramaEnhancedBridgeRuntime");
    const first = await prepareEnhancedBridgeRuntime(skillRoot);
    writeFileSync(resolve(skillRoot, "uv.lock"), "lock-v2");
    const second = await prepareEnhancedBridgeRuntime(skillRoot);
    expect(second.command).not.toBe(first.command);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });

  it("retries a failed preparation and keeps subprocess credentials out of errors", async () => {
    mocks.sync.mockRejectedValueOnce(
      new Error("https://user:credential@example.invalid")
    );
    const { prepareEnhancedBridgeRuntime } =
      await import("../verticalDramaEnhancedBridgeRuntime");
    await expect(prepareEnhancedBridgeRuntime(skillRoot)).rejects.toThrow(
      /^Enhanced bridge dependency preparation failed$/
    );
    await expect(
      prepareEnhancedBridgeRuntime(skillRoot)
    ).resolves.toHaveProperty("command");
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  });
});
