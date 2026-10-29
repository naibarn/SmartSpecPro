import { describe, expect, it } from "vitest";
import {
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
});
