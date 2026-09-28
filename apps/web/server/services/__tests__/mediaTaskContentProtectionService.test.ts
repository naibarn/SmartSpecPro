import { describe, expect, it } from "vitest";
import {
  buildMediaTaskProtectionIdempotencyKey,
  normalizeMediaTaskProtectionIntent,
  projectMediaTaskProtectionStatus,
} from "../mediaTaskContentProtectionService";

describe("Media Studio content-protection handoff", () => {
  it("accepts only the bounded user choice contract", () => {
    expect(normalizeMediaTaskProtectionIntent({
      choice: "on",
      choiceSource: "per_export",
      requireBeforePublish: true,
    })).toEqual({
      choice: "on",
      choiceSource: "per_export",
      requireBeforePublish: true,
    });
    expect(normalizeMediaTaskProtectionIntent({ choice: "on", secret: "x" })).toBeNull();
    expect(normalizeMediaTaskProtectionIntent({ choice: "maybe" })).toBeNull();
  });

  it("uses task/output/hash identity so retries cannot protect a different version", () => {
    expect(buildMediaTaskProtectionIdempotencyKey("task-1", 0, "a".repeat(64)))
      .toBe("content-protection:media-task:task-1:0:" + "a".repeat(64));
  });

  it("does not expose an original playback URL while ON protection is pending", () => {
    expect(projectMediaTaskProtectionStatus({
      status: "QUEUED",
      originalPlaybackUrl: "/api/storage/files/source.mp4",
    })).toEqual({
      status: "QUEUED",
      playbackUrl: undefined,
      availabilityStatus: "content_protection_processing",
    });
    expect(projectMediaTaskProtectionStatus({
      status: "PROTECTED",
      protectedPlaybackUrl: "/api/storage/files/protected.mp4",
      originalPlaybackUrl: "/api/storage/files/source.mp4",
    })).toEqual({
      status: "PROTECTED",
      playbackUrl: "/api/storage/files/protected.mp4",
      availabilityStatus: "ready",
    });
    expect(projectMediaTaskProtectionStatus({
      status: "PROTECTED",
      protectedPlaybackUrl: "tenant/content-protection/asset.mp4",
    })).toEqual({
      status: "PROTECTED",
      availabilityStatus: "storage_pending",
    });
  });
});
