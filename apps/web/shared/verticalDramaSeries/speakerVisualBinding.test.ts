import { describe, expect, it } from "vitest";
import {
  hasCompleteDetectedVerticalDramaSpeakerVisualBindings,
  findVerticalDramaSpeakerVisualBinding,
  getCurrentVerticalDramaSpeakerVisualBindings,
  normalizeVerticalDramaSpeakerVisualBindings,
  renderVerticalDramaSpeakerVisualBindings,
} from "./speakerVisualBinding";

describe("shot-local speaker visual bindings", () => {
  it("normalizes shot-local entries and matches labels case and whitespace insensitively", () => {
    const bindings = normalizeVerticalDramaSpeakerVisualBindings([
      {
        id: "local-1",
        speakerLabel: " นักตรวจผนึก ",
        visualCue: "ชายชุดเข้มด้านขวา",
      },
      { id: "duplicate", speakerLabel: "นักตรวจผนึก", visualCue: "duplicate" },
      { speakerLabel: "ยาม", visualCue: "" },
    ]);

    expect(bindings).toHaveLength(1);
    expect(
      findVerticalDramaSpeakerVisualBinding(bindings, "  นักตรวจผนึก ")?.id
    ).toBe("local-1");
    expect(renderVerticalDramaSpeakerVisualBindings(bindings)).toContain(
      "animate only this person's mouth while they speak"
    );
    expect(renderVerticalDramaSpeakerVisualBindings(bindings)).toContain(
      "Do not turn these speakers into off-screen voices"
    );
  });

  it("anchors a selected person to its normalized region and drops mappings from replaced frames", () => {
    const bindings = normalizeVerticalDramaSpeakerVisualBindings([
      {
        id: "local-1",
        speakerLabel: "นักตรวจผนึก",
        visualCue: "ชายชุดเกราะสีเข้มด้านหลังทางซ้าย",
        personId: "person-4",
        boundingBox: { x: 0.62, y: 0.1, width: 0.24, height: 0.72 },
        sourceMediaAssetId: "asset-10",
      },
    ]);

    expect(
      getCurrentVerticalDramaSpeakerVisualBindings(bindings, "asset-11")
    ).toEqual([]);
    const promptBlock = renderVerticalDramaSpeakerVisualBindings(
      getCurrentVerticalDramaSpeakerVisualBindings(bindings, "asset-10")
    );
    expect(promptBlock).toContain("selected person person-4");
    expect(promptBlock).toContain(
      "x=0.620, y=0.100, width=0.240, height=0.720"
    );
    expect(promptBlock).toContain("stronger than left-to-right ordering");
  });

  it("drops manually described speakers when their approved frame is replaced", () => {
    const bindings = normalizeVerticalDramaSpeakerVisualBindings([
      {
        id: "local-manual",
        speakerLabel: "นักตรวจผนึก",
        visualCue: "ชายชุดเกราะสีเข้มที่ยืนอยู่ด้านหลังทางซ้าย",
        sourceMediaAssetId: "asset-20",
      },
    ]);

    expect(bindings).toHaveLength(1);
    expect(
      getCurrentVerticalDramaSpeakerVisualBindings(bindings, "asset-21")
    ).toEqual([]);
    expect(
      getCurrentVerticalDramaSpeakerVisualBindings(bindings, "asset-20")
    ).toHaveLength(1);
  });

  it("allows detected person mappings to replace cast ordering only when every speaker is anchored to the current frame", () => {
    const detected = normalizeVerticalDramaSpeakerVisualBindings([
      {
        id: "local-1",
        speakerLabel: "นักตรวจผนึก",
        visualCue: "ชายชุดเข้มด้านหลังทางซ้าย",
        personId: "person-2",
        boundingBox: { x: 0.4, y: 0.1, width: 0.2, height: 0.8 },
        sourceMediaAssetId: "asset-10",
      },
      {
        id: "local-2",
        speakerLabel: "เลขานุการ",
        visualCue: "หญิงเสื้อสีอ่อน",
        personId: "person-3",
        boundingBox: { x: 0.65, y: 0.1, width: 0.2, height: 0.8 },
        sourceMediaAssetId: "asset-10",
      },
    ]);

    expect(
      hasCompleteDetectedVerticalDramaSpeakerVisualBindings(
        detected,
        [["นักตรวจผนึก"], ["เลขานุการ"]],
        "asset-10"
      )
    ).toBe(true);
    expect(
      hasCompleteDetectedVerticalDramaSpeakerVisualBindings(
        detected,
        [["นักตรวจผนึก"], ["เลขานุการ"], ["ยาม"]],
        "asset-10"
      )
    ).toBe(false);
    expect(
      hasCompleteDetectedVerticalDramaSpeakerVisualBindings(
        detected,
        [["นักตรวจผนึก"], ["เลขานุการ"]],
        "asset-11"
      )
    ).toBe(false);
  });
});
