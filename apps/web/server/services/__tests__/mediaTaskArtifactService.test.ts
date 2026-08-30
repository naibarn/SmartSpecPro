import { describe, expect, it } from "vitest";
import {
  applyMediaArtifactProjection,
  ensureMediaTaskArtifactsDurable,
  extractMediaTaskOutputUrls,
  redactMediaTaskWithoutTenant,
} from "../mediaTaskArtifactService";

const completedTask = {
  id: "provider-task-1",
  userId: "42",
  mediaType: "audio",
  status: "completed",
  model: "test-tts",
  prompt: "hello",
  resultUrl: "https://provider.example/audio.mp3",
  resultData: {
      outputUrls: ["https://provider.example/audio.mp3"],
      thumbnailUrl: "https://provider.example/thumbnail.jpg",
      sourceUrl: "https://provider.example/reference.jpg",
  },
  createdAt: new Date(0).toISOString(),
} as any;

describe("mediaTaskArtifactService", () => {
  it("extracts provider output URLs without exposing unrelated values", () => {
    expect(extractMediaTaskOutputUrls(completedTask)).toEqual([
      "https://provider.example/audio.mp3",
    ]);
  });

  it("fails closed without tenant or user identity", async () => {
    const result = await ensureMediaTaskArtifactsDurable({
      task: completedTask,
      tenantId: "",
      userId: 0,
    });
    expect(result).toBe(completedTask);
  });

  it("removes the expired provider playback URL while retaining provenance state", () => {
    const projected = applyMediaArtifactProjection(completedTask, [
      {
        artifactId: "1",
        outputIndex: 0,
        r2Status: "failed",
        providerOriginalUrl: "https://provider.example/audio.mp3",
        providerStatus: "expired",
        availabilityStatus: "provider_expired",
        availabilityReason: "The provider result URL has expired.",
      },
    ]);
    expect(projected.resultUrl).toBeUndefined();
    expect(projected.artifacts?.[0]).toMatchObject({
      providerOriginalUrl: "https://provider.example/audio.mp3",
      providerStatus: "expired",
    });
  });

  it("blocks raw provider playback when the durable projection is unavailable", () => {
    const projected = applyMediaArtifactProjection(completedTask, []);
    expect(projected.resultUrl).toBeUndefined();
    expect(projected.artifacts?.[0]).toMatchObject({
      r2Status: "pending",
      availabilityStatus: "provider_fallback",
    });
  });

  it("blocks legacy completed tasks that have no tenant scope", () => {
    const projected = redactMediaTaskWithoutTenant(completedTask);
    expect(projected.resultUrl).toBeUndefined();
    expect(projected.artifacts?.[0]).toMatchObject({
      availabilityStatus: "tenant_scope_missing",
      r2Status: "failed",
    });
  });
});
