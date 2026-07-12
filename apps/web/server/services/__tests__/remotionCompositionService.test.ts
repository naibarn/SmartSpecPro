import { describe, expect, it } from "vitest";

import { HyperframesFinalCompositeConfigSchema } from "../../../shared/hyperframes/runtimeApiSchemas";
import {
  UnsupportedPresetError,
  assertRemotionPresetSupport,
  buildRemotionInputProps,
} from "../remotionCompositionService";

function buildConfig(overrides: Record<string, unknown> = {}) {
  return HyperframesFinalCompositeConfigSchema.parse({
    finalVideoLengthSec: 16,
    fps: 30,
    hookText: "จอใหญ่",
    supportingText: "แบตอึด",
    shots: [
      {
        id: "shot_1",
        index: 0,
        title: "Shot 1",
        sourceVideoUrl: "/api/storage/files/shot-1.mp4",
        sourceVideoRef: "storage://shot-1",
        mediaStartSec: 1.5,
        startSec: 0,
        durationSec: 8,
        onScreenText: ["11.2 นิ้ว", "9200mAh"],
        subtitleCues: [{ startSec: 0, endSec: 2, text: "เปิด Hook" }],
      },
      {
        id: "shot_2",
        index: 1,
        title: "Shot 2",
        sourceVideoUrl: "/api/storage/files/shot-2.mp4",
        sourceVideoRef: "storage://shot-2",
        startSec: 8,
        durationSec: 8,
        onScreenText: ["โปรแรง"],
        subtitleCues: [{ startSec: 8, endSec: 12, text: "ต่อด้วยโปร" }],
      },
    ],
    ...overrides,
  });
}

describe("remotionCompositionService", () => {
  describe("assertRemotionPresetSupport", () => {
    it("does not throw for the pure-default config", () => {
      const config = buildConfig();
      expect(() => assertRemotionPresetSupport(config)).not.toThrow();
    });

    it("throws UnsupportedPresetError for a non-default subtitlePreset", () => {
      const config = buildConfig({ subtitlePreset: "karaoke_word" });
      expect(() => assertRemotionPresetSupport(config)).toThrow(
        UnsupportedPresetError
      );
    });

    it("throws UnsupportedPresetError for overlayPreset combined with a non-default animationPreset", () => {
      const config = buildConfig({
        overlayPreset: "hook_sequence",
        shots: [
          {
            id: "shot_1",
            index: 0,
            sourceVideoUrl: "/api/storage/files/shot-1.mp4",
            startSec: 0,
            durationSec: 8,
            animationPreset: "bounce_price",
          },
        ],
      });
      expect(() => assertRemotionPresetSupport(config)).toThrow(
        UnsupportedPresetError
      );
    });

    it("throws UnsupportedPresetError for unsupported shot transitions", () => {
      const config = buildConfig({
        shots: [
          {
            id: "shot_1",
            index: 0,
            sourceVideoUrl: "/api/storage/files/shot-1.mp4",
            startSec: 0,
            durationSec: 8,
            transition: "slide",
          },
        ],
      });
      expect(() => assertRemotionPresetSupport(config)).toThrow(
        UnsupportedPresetError
      );
    });

    it("does not throw for a shot with transition='none'", () => {
      const config = buildConfig({
        shots: [
          {
            id: "shot_1",
            index: 0,
            sourceVideoUrl: "/api/storage/files/shot-1.mp4",
            startSec: 0,
            durationSec: 8,
            transition: "none",
          },
        ],
      });
      expect(() => assertRemotionPresetSupport(config)).not.toThrow();
    });

    it("throws UnsupportedPresetError for a non-default shot textMotionPreset", () => {
      const config = buildConfig({
        shots: [
          {
            id: "shot_1",
            index: 0,
            sourceVideoUrl: "/api/storage/files/shot-1.mp4",
            startSec: 0,
            durationSec: 8,
            textMotionPreset: "pop_scale",
          },
        ],
      });
      expect(() => assertRemotionPresetSupport(config)).toThrow(
        UnsupportedPresetError
      );
    });
  });

  describe("buildRemotionInputProps", () => {
    it("maps global config fields to frame-based inputProps", () => {
      const config = buildConfig();
      const props = buildRemotionInputProps(config);

      expect(props.width).toBe(1080);
      expect(props.height).toBe(1920);
      expect(props.fps).toBe(30);
      expect(props.durationInFrames).toBe(16 * 30);
      expect(props.fontFamily).toBe("Prompt");
      expect(props.subtitleFontSizePx).toBe(34);
      expect(props.subtitlePlacement).toBe("bottom");
      expect(props.burnInSubtitles).toBe(true);
      expect(props.preserveNativeAudio).toBe(true);
    });

    it("maps per-shot seconds to frames, including mediaStartSec trim", () => {
      const config = buildConfig();
      const props = buildRemotionInputProps(config);

      expect(props.shots).toHaveLength(2);
      const [shot1, shot2] = props.shots;

      expect(shot1.id).toBe("shot_1");
      expect(shot1.src).toBe("/api/storage/files/shot-1.mp4");
      expect(shot1.startFrame).toBe(0);
      expect(shot1.durationFrames).toBe(8 * 30);
      expect(shot1.trimBeforeFrames).toBe(Math.round(1.5 * 30));
      expect(shot1.trimAfterFrames).toBe(
        Math.round(1.5 * 30) + 8 * 30
      );
      expect(shot1.transitionIn).toBe("fade");
      expect(shot1.onScreenText).toEqual(["11.2 นิ้ว", "9200mAh"]);

      expect(shot2.startFrame).toBe(8 * 30);
      expect(shot2.trimBeforeFrames).toBe(0);
    });

    it("flattens subtitle cues across shots into absolute-frame cues", () => {
      const config = buildConfig();
      const props = buildRemotionInputProps(config);

      expect(props.subtitleCues).toEqual([
        { startFrame: 0, endFrame: 60, text: "เปิด Hook" },
        { startFrame: 240, endFrame: 360, text: "ต่อด้วยโปร" },
      ]);
    });

    it("omits subtitle cues entirely when burnInSubtitles is false", () => {
      const config = buildConfig({ burnInSubtitles: false });
      const props = buildRemotionInputProps(config);

      expect(props.subtitleCues).toEqual([]);
    });
  });
});
