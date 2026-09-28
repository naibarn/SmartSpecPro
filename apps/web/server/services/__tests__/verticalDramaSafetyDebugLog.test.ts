import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockMkdir, mockAppendFile, mockDebugError } = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockAppendFile: vi.fn(),
  mockDebugError: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mockMkdir,
  appendFile: mockAppendFile,
}));

vi.mock("../../_core/logger", () => ({
  debugError: mockDebugError,
}));

import { writeVerticalDramaSafetyDebugEvent } from "../verticalDramaSafetyDebugLog";

describe("vertical drama safety debug log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.VERTICAL_DRAMA_SAFETY_DEBUG_LOG_PATH;
    mockMkdir.mockResolvedValue(undefined);
    mockAppendFile.mockResolvedValue(undefined);
  });

  it("appends one redacted JSONL diagnostic event", async () => {
    process.env.VERTICAL_DRAMA_SAFETY_DEBUG_LOG_PATH = "/tmp/vd-safety.jsonl";

    await writeVerticalDramaSafetyDebugEvent({
      event: "vertical_drama_safety",
      seriesId: 53,
      episodeId: 270,
      stage: "plan_episode_script",
      sourceSafety: {
        level: "high",
        textLength: 42,
        textHash: "a".repeat(64),
        findings: [
          {
            code: "minor_threat_or_surveillance",
            level: "high",
            fieldPath: "$.hook",
            matchedRule: "minor_threat_or_surveillance",
            confidence: "high",
          },
        ],
      },
      outputSafety: null,
      rewriteChanged: true,
      prompt: "A full prompt must never be written to this file",
      token: "sk-secret-token",
    });

    expect(mockMkdir).toHaveBeenCalledWith("/tmp", { recursive: true });
    expect(mockAppendFile).toHaveBeenCalledTimes(1);
    const [path, line] = mockAppendFile.mock.calls[0];
    expect(path).toBe("/tmp/vd-safety.jsonl");
    expect(line.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(line);
    expect(parsed).toMatchObject({
      event: "vertical_drama_safety",
      seriesId: 53,
      episodeId: 270,
      sourceSafety: {
        level: "high",
        findings: [{ fieldPath: "$.hook" }],
      },
      rewriteChanged: true,
    });
    expect(line).not.toContain("A full prompt must never be written");
    expect(line).not.toContain("sk-secret-token");
  });

  it("swallows filesystem failures so diagnostics cannot fail generation", async () => {
    mockAppendFile.mockRejectedValue(new Error("read-only filesystem"));

    await expect(
      writeVerticalDramaSafetyDebugEvent({
        event: "vertical_drama_safety",
        stage: "plan_episode_script",
        sourceSafety: null,
        outputSafety: null,
        rewriteChanged: false,
      }),
    ).resolves.toBeUndefined();

    expect(mockDebugError).toHaveBeenCalledWith(
      "verticalDramaSafetyDebugLog",
      expect.stringContaining("read-only filesystem"),
      expect.any(Error),
    );
  });
});
