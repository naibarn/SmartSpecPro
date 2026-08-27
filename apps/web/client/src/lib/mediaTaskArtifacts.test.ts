import { describe, expect, it } from "vitest";
import {
  getMediaTaskArtifactStatus,
  selectMediaTaskPlaybackUrl,
} from "./mediaTaskArtifacts";

describe("media task artifact projection", () => {
  it("does not crash when a legacy or incomplete task response is undefined", () => {
    expect(selectMediaTaskPlaybackUrl(undefined)).toBeNull();
    expect(getMediaTaskArtifactStatus(undefined, true)).toBeNull();
  });

  it("always prefers a ready R2 object over the provider URL", () => {
    expect(
      selectMediaTaskPlaybackUrl({
        resultUrl: "https://provider.example/temporary.png",
        artifacts: [
          {
            outputIndex: 0,
            r2Status: "ready",
            r2Url: "/api/storage/files/media-studio/a.png",
            providerOriginalUrl: "https://provider.example/temporary.png",
            providerStatus: "available",
          },
        ],
      })
    ).toBe("/api/storage/files/media-studio/a.png");
  });

  it("does not revive an expired provider URL when no R2 object exists", () => {
    const task = {
      resultUrl: "https://provider.example/expired.png",
      artifacts: [
        {
          outputIndex: 0,
          r2Status: "failed",
          providerStatus: "expired",
          availabilityStatus: "provider_expired",
        },
      ],
    };
    expect(selectMediaTaskPlaybackUrl(task)).toBeNull();
    expect(getMediaTaskArtifactStatus(task, true)).toMatchObject({
      tone: "expired",
      label: "ลิงก์ Provider หมดอายุ",
    });
  });

  it("labels a temporary provider fallback while R2 copy is pending", () => {
    expect(
      getMediaTaskArtifactStatus(
        {
          artifacts: [
            {
              outputIndex: 0,
              r2Status: "failed",
              providerStatus: "available",
              availabilityStatus: "provider_fallback",
              playbackUrl: "https://provider.example/temporary.mp4",
            },
          ],
        },
        false
      )
    ).toMatchObject({ tone: "fallback", label: "Provider fallback" });
  });

  it("keeps an unclassified provider URL available while storage recovery is pending", () => {
    expect(
      selectMediaTaskPlaybackUrl({
        artifacts: [
          {
            outputIndex: 0,
            r2Status: "failed",
            providerStatus: "unknown",
            availabilityStatus: "provider_fallback",
            providerOriginalUrl: "https://provider.example/temporary.png",
          },
        ],
      }),
    ).toBe("https://provider.example/temporary.png");
  });

  it("can explicitly disable provider playback for durable-only surfaces", () => {
    expect(
      selectMediaTaskPlaybackUrl(
        {
          artifacts: [
            {
              outputIndex: 0,
              r2Status: "failed",
              providerStatus: "available",
              availabilityStatus: "provider_fallback",
              providerOriginalUrl: "https://provider.example/temporary.mp4",
            },
          ],
        },
        { allowProviderFallback: false }
      )
    ).toBeNull();
  });
});
