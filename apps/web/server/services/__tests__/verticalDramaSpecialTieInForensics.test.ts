import { describe, expect, it, vi } from "vitest";
import {
  createSpecialTieInForensicRecorder,
  redactForensicValue,
  serializeForensicPayload,
} from "../verticalDramaSpecialTieInForensics";

describe("special tie-in forensic logging", () => {
  it("keeps prompts and reference IDs but redacts secrets and signed URL queries", () => {
    const result = redactForensicValue({
      prompt: "Use the selected shampoo product",
      reference_ids: ["product:42"],
      Authorization: "Bearer very-secret-token",
      image_url: "https://cdn.example.test/a.png?X-Amz-Signature=secret&foo=bar",
      prompt_with_url: "Use this image https://cdn.example.test/a.png?X-Amz-Signature=embedded-secret",
    });
    expect(result.changed).toBe(true);
    expect(result.value).toMatchObject({ prompt: "Use the selected shampoo product", reference_ids: ["product:42"], Authorization: "[REDACTED_SECRET]" });
    expect(JSON.stringify(result.value)).not.toContain("X-Amz-Signature");
    expect(JSON.stringify(result.value)).not.toContain("secret");
  });

  it("stores full redacted payload with a stable hash and count", () => {
    const payload = serializeForensicPayload({ prompt: "a".repeat(1000), apiKey: "hidden" });
    expect(payload.charCount).toBe(payload.text.length);
    expect(payload.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(payload.redacted).toBe(true);
    expect(payload.text).toContain("prompt");
    expect(payload.text).not.toContain("hidden");
  });

  it("keeps numeric token usage available for cost and retry diagnosis", () => {
    const payload = serializeForensicPayload({
      inputTokens: 1234,
      outputTokens: 567,
      accessToken: "secret-value",
    });
    expect(payload.text).toContain('"inputTokens":1234');
    expect(payload.text).toContain('"outputTokens":567');
    expect(payload.text).not.toContain("secret-value");
  });

  it("continues when durable persistence fails and preserves sequence", async () => {
    const persist = vi.fn().mockRejectedValue(new Error("db down"));
    const audit = vi.fn();
    const recorder = createSpecialTieInForensicRecorder({ tenantId: "t", userId: 1, seriesId: 53, episodeId: 247, jobId: "job", traceId: "trace" }, { persist, audit });
    await expect(recorder.emit({ eventType: "job_started", outcome: "started" })).resolves.toEqual({ sequence: 1 });
    await expect(recorder.emit({ eventType: "retry_decided", retryCategory: "schema", retryReason: "missing image_prompt" })).resolves.toEqual({ sequence: 2 });
    expect(persist).toHaveBeenCalledTimes(2);
    expect(audit).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[1][0]).toMatchObject({ sequence: 2, retryCategory: "schema" });
  });
});
