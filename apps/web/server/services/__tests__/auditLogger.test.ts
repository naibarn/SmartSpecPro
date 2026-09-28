import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { auditLogger } from "../auditLogger";
import { sanitizePayload } from "../auditLogger";

describe("auditLogger.readEntries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sorts before pagination when descending order is requested", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "audit-logger-test-"));
    const targetDate = new Date("2026-03-20T00:00:00.000Z");
    const filePath = path.join(tempDir, "audit-2026-03-20.jsonl");

    await fs.writeFile(filePath, [
      JSON.stringify({ timestamp: "2026-03-20T01:00:00.000Z", eventType: "team_created", traceId: "trace-1", userId: 1 }),
      JSON.stringify({ timestamp: "2026-03-20T02:00:00.000Z", eventType: "team_created", traceId: "trace-2", userId: 1 }),
      JSON.stringify({ timestamp: "2026-03-20T03:00:00.000Z", eventType: "team_created", traceId: "trace-3", userId: 1 }),
      "",
    ].join("\n"), "utf8");

    vi.spyOn(auditLogger, "flush").mockResolvedValue(undefined);
    (auditLogger as any).logDir = tempDir;

    const rows = await auditLogger.readEntries({
      date: targetDate,
      eventType: "team_created",
      limit: 2,
      sortOrder: "desc",
    });

    expect(rows.map((row) => row.traceId)).toEqual(["trace-3", "trace-2"]);
  });
});

describe("auditLogger.sanitizePayload", () => {
  it("redacts OmniVoice reference audio payloads", () => {
    const result = sanitizePayload({
      reference_audio_base64: "YWJjMTIz",
      reference_audio_url: "https://example.com/audio.wav?sig=secret",
      reference_audio_name: "voice-sample.wav",
      nested: {
        referenceAudioBase64: "ZWY0NTY=",
      },
    }) as Record<string, unknown>;

    expect(result.reference_audio_base64).toBe("[REDACTED]");
    expect(result.reference_audio_url).toBe("[REDACTED]");
    expect(result.reference_audio_name).toBe("voice-sample.wav");
    expect((result.nested as Record<string, unknown>).referenceAudioBase64).toBe("[REDACTED]");
  });

  it("redacts image prompts, negative prompts, and reference URLs", () => {
    const result = sanitizePayload({
      prompt: "natural human portrait with visible pores",
      negative_prompt: "plastic skin",
      negativePrompt: "airbrushed face",
      reference_image_urls: ["https://example.com/face.png"],
      referenceImageUrls: ["https://example.com/style.png"],
      safeModel: "gpt-image-2",
    }) as Record<string, unknown>;

    expect(result.prompt).toBe("[REDACTED]");
    expect(result.negative_prompt).toBe("[REDACTED]");
    expect(result.negativePrompt).toBe("[REDACTED]");
    expect(result.reference_image_urls).toBe("[REDACTED]");
    expect(result.referenceImageUrls).toBe("[REDACTED]");
    expect(result.safeModel).toBe("gpt-image-2");
  });
});
